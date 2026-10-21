/**
 * GDPR purge (RGPD Art. 17 — droit à l'effacement).
 *
 * Extracted from AuthContext.deleteAccount so the purge can be BEHAVIORALLY tested
 * (the prior coverage was a static source-regex guard that never executed the code).
 * Sweeps every top-level collection queried by user_id, then legacy subcollections —
 * batched at 400 (Firestore writeBatch limit) — and only then the profile documents.
 *
 * A failed collection no longer disappears into a log line. The sweep carries on so a
 * retry has less left to do, but the purge then rejects with PURGE_INCOMPLETE: the caller
 * deletes the Auth user only after a clean purge, because once the uid is gone nobody can
 * pass the owner rules to delete what was left behind.
 *
 * Two kinds of failure are told apart. A network error clears up on a retry. A
 * permission-denied does not: it means the deployed firestore.rules are older than the
 * ones in this repo, so every user hits it and retrying is pointless. That case is
 * reported to Sentry as an error, because only the operator can fix it, and the user is
 * sent to support instead of being offered a retry that will fail the same way.
 */
import { doc, deleteDoc, collection, getDocsFromServer, writeBatch, query, where } from 'firebase/firestore';
import { createLogger } from '../utils/logger';

const log = createLogger('gdprPurge');

// INVARIANT: every top-level collection the client writes MUST appear here (so deleteAccount
// removes it) AND in firestore.rules. Guarded by gdprPurge.test.ts.
export const topLevelCollectionsToDelete = [
    'userTasks',
    'userEvents',
    'healthMetrics',
    'userReminderSettings',
    'userTaskStatuses',
    'weight_entries',       // weightService.ts
    'reminder_settings_v2', // remindersV2Service.ts
    'glucoseMetrics',       // healthService.saveGlucoseEntry
    'symptomsLog',          // healthService.saveSymptomEntry
    'kickSessions',         // kickCounterService (tracker history sync)
    'contractions',         // contractionTimerService (tracker history sync)
    'hospitalBags',         // hospitalBagService — one doc per user, id = uid
] as const;

// Legacy nested data under userProfiles/{uid}/… and users/{uid}/… from earlier
// app versions. Both parents must be swept: `users/` predates the userProfiles
// schema and DemoDataService still writes users/{uid}/{weights,events}.
//
// INVARIANT: firestore.rules accepts exactly these subcollection names under those two
// parents (isPurgedSubcollection). A client cannot list a document's subcollections, so a
// name the rules allowed but this list lacked could be written and never erased. Guarded
// by gdprPurge.test.ts, which also scans src/ for any other name.
export const legacyParentCollections = ['userProfiles', 'users'] as const;
export const legacySubCollections = ['weights', 'events', 'journal', 'chatbot_history'] as const;

const BATCH_LIMIT = 400;

async function deleteDocsInBatches(db: any, docs: Array<{ ref: any }>): Promise<void> {
    // writeBatch cannot be reused after commit() — create a fresh batch every 400 docs.
    let batch = writeBatch(db);
    let counter = 0;
    for (const d of docs) {
        batch.delete(d.ref);
        counter++;
        if (counter >= BATCH_LIMIT) {
            await batch.commit();
            batch = writeBatch(db);
            counter = 0;
        }
    }
    if (counter > 0) await batch.commit();
}

export class PurgeIncompleteError extends Error {
    readonly code = 'PURGE_INCOMPLETE';
    constructor(readonly failed: string[], readonly permissionDenied: string[] = []) {
        super(`PURGE_INCOMPLETE: ${failed.join(', ')}`);
        this.name = 'PurgeIncompleteError';
    }

    /** True when the server's rules refused part of the purge: a retry cannot succeed. */
    get blockedByRules(): boolean {
        return this.permissionDenied.length > 0;
    }
}

const isPermissionDenied = (err: any): boolean => err?.code === 'permission-denied';

/**
 * Purge every user-owned Firestore document for `uid`.
 * Order matters: this runs BEFORE the Firebase Auth user is deleted so Firestore rules
 * (owner check) still authorize the deletes.
 *
 * Listings come from the server, not getDocs(): the app runs Firestore with a persistent
 * local cache, and offline getDocs() answers from it — the purge would then "succeed"
 * over whatever this device happened to hold and orphan the rest.
 *
 * @throws PurgeIncompleteError naming every collection that could not be swept.
 */
export const purgeUserFirestoreData = async (db: any, uid: string): Promise<void> => {
    const failed: string[] = [];
    const permissionDenied: string[] = [];
    const recordFailure = (name: string, err: unknown) => {
        log.warn(`Failed to cleanup ${name}`, err);
        failed.push(name);
        if (isPermissionDenied(err)) permissionDenied.push(name);
    };

    // 1. Top-level collections (queried by user_id for data isolation)
    for (const colName of topLevelCollectionsToDelete) {
        try {
            const q = query(collection(db, colName), where('user_id', '==', uid));
            const snap = await getDocsFromServer(q);
            log.debug(`Deleting ${snap.size} docs from ${colName}`);
            await deleteDocsInBatches(db, snap.docs);
        } catch (err) {
            recordFailure(colName, err);
        }
    }

    // 2. Legacy subcollections under userProfiles/{uid} AND users/{uid}.
    // `users/{uid}` was missing: DemoDataService writes users/{uid}/{weights,events},
    // so those documents were never in the purge set at all. Both parents are now
    // covered by an owner-scoped nested wildcard in firestore.rules.
    for (const parentCol of legacyParentCollections) {
        for (const subColName of legacySubCollections) {
            try {
                const subSnap = await getDocsFromServer(collection(db, parentCol, uid, subColName));
                if (subSnap.size > 0) await deleteDocsInBatches(db, subSnap.docs);
            } catch (err) {
                recordFailure(`${parentCol}/${subColName}`, err);
            }
        }
    }

    // The profile is what keeps a half-purged account usable and the deletion retryable,
    // so it stays until everything it owns is gone.
    if (failed.length > 0) {
        if (permissionDenied.length > 0) {
            // An operator misconfiguration, not a user problem: surface it in Sentry.
            log.error(
                'Account data purge refused by Firestore rules — deploy firestore.rules',
                new Error(`permission-denied on ${permissionDenied.join(', ')}`),
            );
        }
        throw new PurgeIncompleteError(failed, permissionDenied);
    }

    // 3. The legacy `users/{uid}` document (pre-userProfiles schema), then the profile.
    try {
        await deleteDoc(doc(db, 'users', uid));
        await deleteDoc(doc(db, 'userProfiles', uid));
        log.debug('Firestore profile deleted');
    } catch (err) {
        log.warn('Failed to delete profile documents', err);
        const denied = isPermissionDenied(err) ? ['userProfiles'] : [];
        if (denied.length > 0) {
            log.error('Profile deletion refused by Firestore rules — deploy firestore.rules', err);
        }
        throw new PurgeIncompleteError(['userProfiles'], denied);
    }
};
