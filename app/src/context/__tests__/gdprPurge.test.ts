/**
 * G-B — BEHAVIORAL GDPR purge test (RGPD Art. 17).
 *
 * Prior coverage was a static source-regex guard that never ran the code. This executes
 * purgeUserFirestoreData against a mocked Firestore and asserts:
 *  - the userProfiles/{uid} doc is deleted,
 *  - every one of the 9 top-level collections is queried by user_id and its docs deleted,
 *  - legacy subcollections are cleaned,
 *  - deletes are committed in fresh 400-doc batches (Firestore writeBatch limit),
 *  - a failed collection does not stop the others from being swept, but the purge then
 *    REJECTS with PURGE_INCOMPLETE and leaves the profile doc in place, so the caller never
 *    goes on to delete the Auth user over data it could not erase.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));

let DOC_COUNTS: Record<string, number> = {};
let SUB_COUNTS: Record<string, number> = {};
const queriedByUserId: Record<string, any> = {};
let totalDeletes = 0;
let batchCommits = 0;

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: any, ...p: string[]) => ({ path: p.join('/') })),
  deleteDoc: jest.fn(),
  collection: jest.fn((_db: any, ...p: string[]) => ({ path: p.join('/') })),
  where: jest.fn((field: string, op: string, val: any) => ({ field, op, val })),
  query: jest.fn((coll: any, clause: any) => ({ coll, clause })),
  getDocsFromServer: jest.fn((q: any) => {
    if (q.coll) {
      // top-level: query(collection, where('user_id','==',uid))
      const name = q.coll.path;
      queriedByUserId[name] = q.clause?.val;
      const n = DOC_COUNTS[name] ?? 0;
      return { size: n, docs: Array.from({ length: n }, (_, i) => ({ ref: { path: `${name}/${i}` } })) };
    }
    // subcollection: getDocsFromServer(collection(db,'userProfiles',uid,sub))
    const n = SUB_COUNTS[q.path] ?? 0;
    return { size: n, docs: Array.from({ length: n }, (_, i) => ({ ref: { path: `${q.path}/${i}` } })) };
  }),
  writeBatch: jest.fn(() => ({
    delete: () => { totalDeletes++; },
    commit: jest.fn(async () => { batchCommits++; }),
  })),
}));

import { purgeUserFirestoreData, topLevelCollectionsToDelete, legacySubCollections, legacyParentCollections } from '../gdprPurge';
import { deleteDoc, getDocsFromServer } from 'firebase/firestore';

const UID = 'user-xyz';
const defaultGetDocs = (getDocsFromServer as jest.Mock).getMockImplementation()!;

beforeEach(() => {
  jest.clearAllMocks();
  (getDocsFromServer as jest.Mock).mockImplementation(defaultGetDocs);
  DOC_COUNTS = {}; SUB_COUNTS = {};
  for (const k of Object.keys(queriedByUserId)) delete queriedByUserId[k];
  totalDeletes = 0; batchCommits = 0;
});

describe('purgeUserFirestoreData (GDPR Art. 17)', () => {
  it('deletes the userProfiles/{uid} document', async () => {
    await purgeUserFirestoreData({}, UID);
    expect(deleteDoc).toHaveBeenCalledWith({ path: `userProfiles/${UID}` });
  });

  it('queries EVERY one of the 9 top-level collections by user_id === uid', async () => {
    await purgeUserFirestoreData({}, UID);
    for (const col of topLevelCollectionsToDelete) {
      expect(queriedByUserId[col]).toBe(UID);
    }
    expect(Object.keys(queriedByUserId).sort()).toEqual([...topLevelCollectionsToDelete].sort());
  });

  it('deletes documents found in the owned collections', async () => {
    DOC_COUNTS = { userTasks: 3, healthMetrics: 2 };
    SUB_COUNTS = { [`userProfiles/${UID}/weights`]: 1 };
    await purgeUserFirestoreData({}, UID);
    expect(totalDeletes).toBe(6); // 3 + 2 + 1
  });

  it('commits in fresh batches past the 400-doc Firestore limit', async () => {
    DOC_COUNTS = { userEvents: 450 }; // 400 + 50 → 2 commits for this collection
    await purgeUserFirestoreData({}, UID);
    expect(totalDeletes).toBe(450);
    expect(batchCommits).toBe(2);
  });

  it('cleans legacy subcollections under userProfiles/{uid}', async () => {
    SUB_COUNTS = {
      [`userProfiles/${UID}/journal`]: 2,
      [`userProfiles/${UID}/chatbot_history`]: 1,
    };
    await purgeUserFirestoreData({}, UID);
    expect(totalDeletes).toBe(3);
    expect(legacySubCollections).toContain('journal');
  });

  // REGRESSION GUARD. Before the rules fix, `match /userProfiles/{userId}` covered
  // only the document, so every subcollection read was permission-denied, swallowed
  // by the per-collection catch and downgraded to a warn — the purge reported success
  // while legacy health data survived. `users/{uid}` was not swept at all even though
  // DemoDataService writes users/{uid}/{weights,events}.
  it('sweeps legacy subcollections under BOTH userProfiles/{uid} and users/{uid}', async () => {
    SUB_COUNTS = {
      [`userProfiles/${UID}/weights`]: 2,
      [`users/${UID}/weights`]: 3,
      [`users/${UID}/events`]: 1,
    };
    await purgeUserFirestoreData({}, UID);
    expect(totalDeletes).toBe(6);
    expect(legacyParentCollections).toEqual(['userProfiles', 'users']);
  });

  it('deletes the legacy users/{uid} document as well as userProfiles/{uid}', async () => {
    await purgeUserFirestoreData({}, UID);
    expect(deleteDoc).toHaveBeenCalledWith({ path: `userProfiles/${UID}` });
    expect(deleteDoc).toHaveBeenCalledWith({ path: `users/${UID}` });
  });

  it('keeps sweeping after one collection fails, then rejects with PURGE_INCOMPLETE', async () => {
    DOC_COUNTS = { userTasks: 2 };
    (getDocsFromServer as jest.Mock).mockImplementationOnce(() => { throw new Error('unavailable'); });
    const err: any = await purgeUserFirestoreData({}, UID).then(() => null, (e) => e);
    expect(err?.code).toBe('PURGE_INCOMPLETE');
    // The first collection in the list failed; the rest were still queried and swept.
    expect(err.failed).toEqual([topLevelCollectionsToDelete[0]]);
    expect(queriedByUserId[topLevelCollectionsToDelete[1]]).toBe(UID);
  });

  // F-018. A partial purge must not look like a finished one: the profile is what keeps the
  // account usable and the deletion retryable, so it is only removed once everything else is.
  it('leaves the profile and legacy users/ docs in place when any sweep failed', async () => {
    (getDocsFromServer as jest.Mock).mockImplementation((q: any) => {
      if (!q.coll && q.path === `users/${UID}/events`) throw new Error('permission-denied');
      return { size: 0, docs: [] };
    });
    await expect(purgeUserFirestoreData({}, UID)).rejects.toMatchObject({
      code: 'PURGE_INCOMPLETE',
      failed: [`users/events`],
    });
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('reports a failed profile delete as PURGE_INCOMPLETE too', async () => {
    (deleteDoc as jest.Mock).mockImplementationOnce(() => { throw new Error('unavailable'); });
    await expect(purgeUserFirestoreData({}, UID)).rejects.toMatchObject({ code: 'PURGE_INCOMPLETE' });
  });

  // With the persistent local cache, a plain getDocs() offline answers from the cache and
  // would list only what this device happens to hold — the purge would "succeed" over
  // documents it never saw. Reading from the server fails loudly instead.
  it('lists documents from the server, never from the local cache', async () => {
    await purgeUserFirestoreData({}, UID);
    expect(getDocsFromServer).toHaveBeenCalled();
    expect(jest.requireMock('firebase/firestore').getDocs).toBeUndefined();
  });
});
