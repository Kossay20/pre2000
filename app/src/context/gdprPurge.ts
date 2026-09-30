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
] as const;

// Legacy nested data under userProfiles/{uid}/… and users/{uid}/… from earlier
// app versions. Both parents must be swept: `users/` predates the userProfiles
// schema and DemoDataService still writes users/{uid}/{weights,events}.
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
    constructor(readonly failed: string[]) {
        super(`PURGE_INCOMPLETE: ${failed.join(', ')}`);
        this.name = 'PurgeIncompleteError';
    }
}

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

    // 1. Top-level collections (queried by user_id for data isolation)
    for (const colName of topLevelCollectionsToDelete) {
        try {
            const q = query(collection(db, colName), where('user_id', '==', uid));
            const snap = await getDocsFromServer(q);
            log.debug(`Deleting ${snap.size} docs from ${colName}`);
            await deleteDocsInBatches(db, snap.docs);
        } catch (err) {
            log.warn(`Failed to cleanup collection ${colName}`, err);
            failed.push(colName);
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
                log.warn(`Failed to cleanup subcollection ${parentCol}/${subColName}`, err);
                failed.push(`${parentCol}/${subColName}`);
            }
        }
    }

    // The profile is what keeps a half-purged account usable and the deletion retryable,
    // so it stays until everything it owns is gone.
    if (failed.length > 0) throw new PurgeIncompleteError(failed);

    // 3. The legacy `users/{uid}` document (pre-userProfiles schema), then the profile.
    try {
        await deleteDoc(doc(db, 'users', uid));
        await deleteDoc(doc(db, 'userProfiles', uid));
        log.debug('Firestore profile deleted');
    } catch (err) {
        log.warn('Failed to delete profile documents', err);
        throw new PurgeIncompleteError(['userProfiles']);
    }
};
