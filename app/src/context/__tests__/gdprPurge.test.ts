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
const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() };
jest.mock('../../utils/logger', () => ({
  createLogger: () => mockLog,
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

  it('covers every per-user collection firestore.rules declares, tracker history included', () => {
    // A collection the rules let a user write but the purge does not know about survives
    // "delete my account". Static content (write: if false) and the profile parents, which
    // are deleted by id, are the only exceptions.
    const fs = jest.requireActual('fs');
    const path = jest.requireActual('path');
    const rules: string = fs.readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8');
    const declared = [...rules.matchAll(/^\s*match \/([A-Za-z0-9_]+)\/\{[^}]+\}\s*\{(.*)$/gm)]
      .filter((m) => !/allow write: if false/.test(m[2]))
      .map((m) => m[1])
      .filter((name) => !(legacyParentCollections as readonly string[]).includes(name))
      // The deletion request itself: one document, id = uid, removed by accountDeletion
      // just before the Auth user (accountDeletion.test.ts), not swept by user_id.
      .filter((name) => name !== 'deletionRequests');
    expect(declared).toEqual(expect.arrayContaining(['kickSessions', 'contractions', 'hospitalBags']));
    expect([...topLevelCollectionsToDelete].sort()).toEqual(expect.arrayContaining(declared.sort()));
  });

  // The same guarantee one level down. A client cannot list the subcollections of a
  // document, so the purge can only sweep names it knows: the rules must accept exactly
  // those names under the two user parents, and the app must write no other.
  describe('subcollections under userProfiles/{uid} and users/{uid}', () => {
    const fs = jest.requireActual('fs');
    const path = jest.requireActual('path');
    const appRoot = path.resolve(__dirname, '../../..');
    const rules: string = fs.readFileSync(path.join(appRoot, 'firestore.rules'), 'utf8');

    it('the rules accept exactly the names the purge sweeps', () => {
      const list = rules.match(/function isPurgedSubcollection\(sub\) \{\s*return sub in \[([^\]]*)\];/);
      expect(list).not.toBeNull();
      const allowed = [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      expect(allowed.sort()).toEqual([...legacySubCollections].sort());
    });

    it('both user parents gate their subcollections on that list, with no open wildcard left', () => {
      const nested = [...rules.matchAll(/match \/\{sub\}\/\{doc=\*\*\} \{\s*allow ([^;]+);/g)].map((m) => m[1]);
      expect(nested).toHaveLength(legacyParentCollections.length);
      for (const allow of nested) expect(allow).toContain('isPurgedSubcollection(sub)');
      for (const parent of legacyParentCollections) {
        expect(rules).toMatch(new RegExp(`match /${parent}/\\{userId\\} \\{[\\s\\S]*?match /\\{sub\\}/\\{doc=\\*\\*\\}`));
      }
    });

    it('the app writes no subcollection the purge does not sweep (users/{uid}/weights included)', () => {
      const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e: any) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
      });
      const used = new Set<string>();
      // collection(db, 'users', uid, 'weights') / doc(db, 'userProfiles', uid, 'journal', id)
      const nestedPath = /\b(?:collection|doc)\(\s*db\s*,\s*['"](users|userProfiles)['"]\s*,\s*[^,)]+,\s*['"]([A-Za-z0-9_]+)['"]/g;
      // collection(db, `users/${uid}/weights`)
      const templatePath = /[`'"](users|userProfiles)\/\$\{[^}]+\}\/([A-Za-z0-9_]+)/g;
      for (const file of walk(path.join(appRoot, 'src'))) {
        const source: string = fs.readFileSync(file, 'utf8');
        for (const m of source.matchAll(nestedPath)) used.add(m[2]);
        for (const m of source.matchAll(templatePath)) used.add(m[2]);
      }
      // DemoDataService writes users/{uid}/weights and users/{uid}/events.
      expect([...used]).toEqual(expect.arrayContaining(['weights', 'events']));
      for (const name of used) expect(legacySubCollections as readonly string[]).toContain(name);
    });

    it('sweeps every listed name under both parents', async () => {
      await purgeUserFirestoreData({}, UID);
      const swept = (getDocsFromServer as jest.Mock).mock.calls.map(([q]) => q.path).filter(Boolean);
      const expected = legacyParentCollections.flatMap((p) => legacySubCollections.map((s) => `${p}/${UID}/${s}`));
      expect(swept.sort()).toEqual(expected.sort());
    });
  });

  it('queries EVERY one of the top-level collections by user_id === uid', async () => {
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

  // R-004. If the deployed rules lag the repo, every user hits permission-denied on the
  // same listings and a retry can never succeed. That must be told apart from a network
  // blip — for the UI (support, not retry) and for Sentry (an operator has to act).
  it('flags permission-denied separately and reports it as an error (Sentry)', async () => {
    (getDocsFromServer as jest.Mock).mockImplementation((q: any) => {
      if (!q.coll && q.path === `users/${UID}/journal`) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      if (q.coll?.path === 'userTasks') throw Object.assign(new Error('offline'), { code: 'unavailable' });
      return { size: 0, docs: [] };
    });
    const err: any = await purgeUserFirestoreData({}, UID).then(() => null, (e) => e);
    expect(err.code).toBe('PURGE_INCOMPLETE');
    expect(err.failed).toEqual(['userTasks', 'users/journal']);
    expect(err.permissionDenied).toEqual(['users/journal']);
    expect(err.blockedByRules).toBe(true);
    expect(mockLog.error).toHaveBeenCalledTimes(1);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('treats a transient failure as retryable and does not raise a Sentry error', async () => {
    (getDocsFromServer as jest.Mock).mockImplementationOnce(() => {
      throw Object.assign(new Error('offline'), { code: 'unavailable' });
    });
    const err: any = await purgeUserFirestoreData({}, UID).then(() => null, (e) => e);
    expect(err.blockedByRules).toBe(false);
    expect(mockLog.error).not.toHaveBeenCalled();
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
