/**
 * GDPR purge (RGPD Art. 17 — droit à l'effacement).
 *
 * Extracted from AuthContext.deleteAccount so the purge can be BEHAVIORALLY tested
 * (the prior coverage was a static source-regex guard that never executed the code).
 * Behavior is identical to the previous inline block: delete the profile doc, then every
 * top-level collection queried by user_id, then legacy subcollections — batched at 400
 * (Firestore writeBatch limit), per-collection failures logged and skipped.
 */
import { doc, deleteDoc, collection, getDocs, writeBatch, query, where } from 'firebase/firestore';
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

/**
 * Purge every user-owned Firestore document for `uid`.
 * Order matters: this runs BEFORE the Firebase Auth user is deleted so Firestore rules
 * (owner check) still authorize the deletes.
 */
export const purgeUserFirestoreData = async (db: any, uid: string): Promise<void> => {
    // 1. User profile document
    await deleteDoc(doc(db, 'userProfiles', uid));
    log.debug('Firestore profile deleted');

    // 2. Top-level collections (queried by user_id for data isolation)
    for (const colName of topLevelCollectionsToDelete) {
        try {
            const q = query(collection(db, colName), where('user_id', '==', uid));
            const snap = await getDocs(q);
            log.debug(`Deleting ${snap.size} docs from ${colName}`);
            await deleteDocsInBatches(db, snap.docs);
        } catch (err) {
            log.warn(`Failed to cleanup collection ${colName}`, err);
        }
    }

    // 3. Legacy subcollections under userProfiles/{uid} AND users/{uid}.
    // `users/{uid}` was missing: DemoDataService writes users/{uid}/{weights,events},
    // so those documents were never in the purge set at all. Both parents are now
    // covered by an owner-scoped nested wildcard in firestore.rules — before that,
    // every read here was permission-denied and silently skipped.
    for (const parentCol of legacyParentCollections) {
        for (const subColName of legacySubCollections) {
            try {
                const subSnap = await getDocs(collection(db, parentCol, uid, subColName));
                if (subSnap.size > 0) await deleteDocsInBatches(db, subSnap.docs);
            } catch (err) {
                log.warn(`Failed to cleanup subcollection ${parentCol}/${subColName}`, err);
            }
        }
    }

    // 4. The legacy `users/{uid}` document itself (pre-userProfiles schema).
    try {
        await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
        log.warn('Failed to delete legacy users/ document', err);
    }
};
