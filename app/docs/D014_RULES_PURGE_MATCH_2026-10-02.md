# D-014 — firestore.rules sub-collection allowlist vs purgeUserFirestoreData

Analysis only, at HEAD 3bfd0b3. `firestore.rules` was not edited.

## Conclusion

The rules and the purge already match; the audit's fix hint (restrict `{sub}` to `weights, events, journal, chatbot_history`) is already in the file.

- `firestore.rules` (`isPurgedSubcollection`, used by the nested `/{sub}/{doc=**}` match under both `users/{uid}` and `userProfiles/{uid}`) accepts exactly `['weights','events','journal','chatbot_history']`.
- `src/context/gdprPurge.ts` sweeps `legacySubCollections = ['weights','events','journal','chatbot_history']` under both `legacyParentCollections = ['userProfiles','users']`: 8 paths, read with `getDocsFromServer`.
- The 12 top-level per-user collections declared in the rules (`userEvents`, `userTasks`, `healthMetrics`, `weight_entries`, `userReminderSettings`, `userTaskStatuses`, `reminder_settings_v2`, `glucoseMetrics`, `symptomsLog`, `kickSessions`, `contractions`, `hospitalBags`) are the same 12 as `topLevelCollectionsToDelete`.
- `deletionRequests/{uid}` is deliberately not purged: it is the marker that lets a half-finished deletion be completed on another device (`accountDeletion.ts`).

The match is enforced by `src/context/__tests__/gdprPurge.test.ts` (parses the rules text, compares the allowlist with `legacySubCollections`, scans `src/` for any other sub-collection name). That suite passes (18 tests).

## What remains of D-014

Only the audit-integrity half, which is in the e2e specs and not in this lot:

1. `e2e/final-release-wave-D.spec.ts` still derives the local-wipe oracle from `PRIVATE_STORAGE_KEYS` (`privateKeysIn`, used twice). A localStorage allowlist assertion after delete (web) would make it independent of the constant it checks.
2. No capture inspects the web Firestore IndexedDB cache after deletion.
3. Seeding `users/{uid}/weights` before the deletion flow, to exercise the sub-collection branch on the emulator, is not done.

Operator dependency (G1): the deployed rules must be the repo's rules. If the deployed rules are older, every sub-collection read returns `permission-denied` and no deletion can finish (see RELEASE_READINESS row 5 bis).
