/**
 * Account deletion ordering (F-018, F-031).
 *
 * Two ways the old deleteAccount could leave a user worse off than before they tapped it:
 *  - a collection failed to purge, the failure was logged and swallowed, and the Auth user
 *    was deleted anyway — orphaning health data nobody could reach or delete any more;
 *  - the session was too old for auth.delete(), so the purge ran, the delete was refused,
 *    and a user who then cancelled the password prompt kept an emptied account.
 * These tests drive the real orchestration against a mocked purge and a fake Firebase user.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));

const mockPurge = jest.fn();
jest.mock('../gdprPurge', () => {
  const actual = jest.requireActual('../gdprPurge');
  return { ...actual, purgeUserFirestoreData: (...a: any[]) => mockPurge(...a) };
});
// deletionRequests/{uid} on a fake server: path → data. `mockServerFail` makes the next
// write of that kind reject, to drive the failure paths.
const mockServer = new Map<string, any>();
const mockServerFail: { set?: any; delete?: any } = {};
const mockServerLog: string[] = [];
jest.mock('firebase/firestore', () => ({
  doc: (_db: any, ...p: string[]) => ({ path: p.join('/') }),
  serverTimestamp: () => 'SERVER_TS',
  getDoc: jest.fn(async (ref: any) => ({ exists: () => mockServer.has(ref.path) })),
  setDoc: jest.fn(async (ref: any, data: any) => {
    if (mockServerFail.set) { const e = mockServerFail.set; mockServerFail.set = undefined; throw e; }
    mockServerLog.push(`set ${ref.path}`);
    mockServer.set(ref.path, data);
  }),
  deleteDoc: jest.fn(async (ref: any) => {
    if (mockServerFail.delete) { const e = mockServerFail.delete; mockServerFail.delete = undefined; throw e; }
    mockServerLog.push(`delete ${ref.path}`);
    mockServer.delete(ref.path);
  }),
}));

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

import {
  deleteUserAccount,
  finishDeletionAfterReauth,
  classifyDeletionFailure,
  eraseAccountData,
  resumePendingDeletion,
  hasPendingDeletion,
  pendingDeletionAtSignIn,
  isErasedButNotDeleted,
  RECENT_LOGIN_WINDOW_MS,
} from '../accountDeletion';
import { PurgeIncompleteError } from '../gdprPurge';
import { DELETION_PENDING_KEY } from '../storageKeys';

const NOW = Date.parse('2026-09-30T12:00:00Z');

const fakeUser = (authAgeMs: number) => ({
  uid: 'u1',
  delete: jest.fn(async () => undefined),
  // A refreshed token: issuedAtTime is the server's "now".
  getIdTokenResult: jest.fn(async (_force?: boolean): Promise<{ authTime: string; issuedAtTime?: string }> => ({
    authTime: new Date(NOW - authAgeMs).toUTCString(),
    issuedAtTime: new Date(NOW).toUTCString(),
  })),
});

beforeEach(() => {
  mockPurge.mockReset();
  mockPurge.mockResolvedValue(undefined);
  mockStore.clear();
  mockServer.clear();
  mockServerLog.length = 0;
  mockServerFail.set = undefined;
  mockServerFail.delete = undefined;
});

const REQUEST = 'deletionRequests/u1';

describe('deleteUserAccount', () => {
  it('purges, then deletes the Auth user, on a recent session', async () => {
    const user = fakeUser(60_000);
    await deleteUserAccount({}, user, NOW);
    expect(mockPurge).toHaveBeenCalledWith({}, 'u1');
    expect(user.delete).toHaveBeenCalledTimes(1);
    expect(mockPurge.mock.invocationCallOrder[0]).toBeLessThan(user.delete.mock.invocationCallOrder[0]);
  });

  it('does NOT delete the Auth user when one collection failed to purge', async () => {
    const user = fakeUser(60_000);
    mockPurge.mockRejectedValue(new PurgeIncompleteError(['glucoseMetrics']));
    await expect(deleteUserAccount({}, user, NOW)).rejects.toMatchObject({
      code: 'PURGE_INCOMPLETE',
      failed: ['glucoseMetrics'],
    });
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('asks for the password BEFORE purging anything when the session is too old', async () => {
    const user = fakeUser(RECENT_LOGIN_WINDOW_MS + 1);
    await expect(deleteUserAccount({}, user, NOW)).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(mockPurge).not.toHaveBeenCalled();
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('still maps a late auth/requires-recent-login to REAUTH_REQUIRED', async () => {
    const user = fakeUser(60_000);
    user.delete.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/requires-recent-login' }));
    await expect(deleteUserAccount({}, user, NOW)).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
  });

  // R-005. The cached token and the phone's clock both lie: the first can be an hour old,
  // the second can be off by minutes. Either made an old sign-in look recent, so the purge
  // ran and the Auth delete was then refused, leaving an emptied account.
  it('refreshes the token and measures the sign-in age on the server clock', async () => {
    const user = fakeUser(0);
    const signedIn = NOW - (RECENT_LOGIN_WINDOW_MS + 60_000);
    user.getIdTokenResult.mockResolvedValueOnce({
      authTime: new Date(signedIn).toUTCString(),
      issuedAtTime: new Date(NOW).toUTCString(),
    });
    // The device clock is ten minutes behind: on its own it would call this sign-in recent.
    await expect(deleteUserAccount({}, user, NOW - 10 * 60_000)).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(user.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('reports a failed Auth delete after a clean purge as retryable, and remembers it', async () => {
    const user = fakeUser(60_000);
    user.delete.mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'auth/network-request-failed' }));
    const err = await deleteUserAccount({}, user, NOW).then(() => null, (e) => e);
    expect(err).toMatchObject({ code: 'AUTH_DELETE_PENDING' });
    expect(classifyDeletionFailure(err)).toBe('incomplete');
    expect(mockStore.get(DELETION_PENDING_KEY)).toBe('u1');
  });

  it('clears the pending marker once the Auth user is deleted', async () => {
    await deleteUserAccount({}, fakeUser(60_000), NOW);
    expect(mockStore.has(DELETION_PENDING_KEY)).toBe(false);
  });

  it('sets no pending marker when the purge itself is incomplete (the account is intact)', async () => {
    mockPurge.mockRejectedValue(new PurgeIncompleteError(['userTasks']));
    await expect(deleteUserAccount({}, fakeUser(60_000), NOW)).rejects.toMatchObject({ code: 'PURGE_INCOMPLETE' });
    expect(mockStore.has(DELETION_PENDING_KEY)).toBe(false);
  });

  it('lets the server decide when the token cannot be read', async () => {
    const user = fakeUser(0);
    user.getIdTokenResult.mockRejectedValueOnce(new Error('network'));
    await deleteUserAccount({}, user, NOW);
    expect(user.delete).toHaveBeenCalled();
  });
});

describe('finishDeletionAfterReauth', () => {
  it('reauthenticates first, then purges, then deletes', async () => {
    const user = fakeUser(RECENT_LOGIN_WINDOW_MS * 10);
    const reauth = jest.fn(async () => undefined);
    await finishDeletionAfterReauth({}, user, reauth);
    expect(reauth.mock.invocationCallOrder[0]).toBeLessThan(mockPurge.mock.invocationCallOrder[0]);
    expect(user.delete).toHaveBeenCalled();
  });

  it('purges nothing when reauthentication fails (wrong password, cancelled)', async () => {
    const user = fakeUser(RECENT_LOGIN_WINDOW_MS * 10);
    const reauth = jest.fn(async () => { throw Object.assign(new Error('bad'), { code: 'auth/wrong-password' }); });
    await expect(finishDeletionAfterReauth({}, user, reauth)).rejects.toMatchObject({ code: 'auth/wrong-password' });
    expect(mockPurge).not.toHaveBeenCalled();
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('does NOT delete the Auth user when the purge is incomplete after reauth', async () => {
    const user = fakeUser(0);
    mockPurge.mockRejectedValue(new PurgeIncompleteError(['symptomsLog']));
    await expect(finishDeletionAfterReauth({}, user, async () => undefined)).rejects.toMatchObject({
      code: 'PURGE_INCOMPLETE',
    });
    expect(user.delete).not.toHaveBeenCalled();
  });
});

describe('resumePendingDeletion', () => {
  it('finishes the deletion the user asked for when this uid was left purged', async () => {
    mockStore.set(DELETION_PENDING_KEY, 'u1');
    const user = fakeUser(60_000);
    await expect(resumePendingDeletion({}, user)).resolves.toBe('deleted');
    expect(user.delete).toHaveBeenCalled();
    expect(mockStore.has(DELETION_PENDING_KEY)).toBe(false);
  });

  it('does nothing for another uid, or with no marker', async () => {
    const user = fakeUser(60_000);
    await expect(resumePendingDeletion({}, user)).resolves.toBe('none');
    mockStore.set(DELETION_PENDING_KEY, 'someone-else');
    await expect(resumePendingDeletion({}, user)).resolves.toBe('none');
    expect(mockPurge).not.toHaveBeenCalled();
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('reports failed (and keeps the marker) when it still cannot finish', async () => {
    mockStore.set(DELETION_PENDING_KEY, 'u1');
    const user = fakeUser(60_000);
    user.delete.mockRejectedValueOnce(new Error('offline'));
    await expect(resumePendingDeletion({}, user)).resolves.toBe('failed');
    expect(mockStore.get(DELETION_PENDING_KEY)).toBe('u1');
  });

  // D-011. At a cold start the sign-in is usually minutes old, so the retry was refused
  // before it began, returned "false", and the emptied account opened as if nothing happened.
  it('reports needs-password (never "nothing pending") when the sign-in is too old to finish', async () => {
    mockStore.set(DELETION_PENDING_KEY, 'u1');
    const user = fakeUser(RECENT_LOGIN_WINDOW_MS + 60_000);
    await expect(resumePendingDeletion({}, user)).resolves.toBe('needs-password');
    expect(user.delete).not.toHaveBeenCalled();
    expect(mockStore.get(DELETION_PENDING_KEY)).toBe('u1');
    await expect(hasPendingDeletion('u1')).resolves.toBe(true);
  });

  it('runs once when login() and the auth listener both ask for the same uid', async () => {
    mockStore.set(DELETION_PENDING_KEY, 'u1');
    const user = fakeUser(60_000);
    const [a, b] = await Promise.all([resumePendingDeletion({}, user), resumePendingDeletion({}, user)]);
    expect(a).toBe('deleted');
    expect(b).toBe('deleted');
    expect(user.delete).toHaveBeenCalledTimes(1);
  });
});

describe('a refusal after the purge is told apart from one before it', () => {
  it('flags a late requires-recent-login as afterPurge', async () => {
    const user = fakeUser(60_000);
    user.delete.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/requires-recent-login' }));
    const err = await deleteUserAccount({}, user, NOW).then(() => null, (e) => e);
    expect(classifyDeletionFailure(err)).toBe('reauth');
    expect(isErasedButNotDeleted(err)).toBe(true);
    expect(mockStore.get(DELETION_PENDING_KEY)).toBe('u1');
  });

  it('an up-front REAUTH_REQUIRED (nothing erased) is not', async () => {
    const user = fakeUser(RECENT_LOGIN_WINDOW_MS + 1);
    const err = await deleteUserAccount({}, user, NOW).then(() => null, (e) => e);
    expect(isErasedButNotDeleted(err)).toBe(false);
  });

  it('the pending marker is a device key that a logout does not wipe', () => {
    const { PRIVATE_STORAGE_KEYS } = jest.requireActual('../storageKeys');
    expect(PRIVATE_STORAGE_KEYS).not.toContain(DELETION_PENDING_KEY);
  });
});

// R-003. "Reset profile" / guest "Erase my data" used to delete only userProfiles/{uid} and
// sign out. With Anonymous Auth on, a guest's health entries live under her anonymous uid,
// and signing out loses the only key to them.
describe('eraseAccountData', () => {
  it('purges everything, then deletes an anonymous user', async () => {
    const user = { ...fakeUser(0), isAnonymous: true };
    await eraseAccountData({}, user);
    expect(mockPurge).toHaveBeenCalledWith({}, 'u1');
    expect(mockPurge.mock.invocationCallOrder[0]).toBeLessThan(user.delete.mock.invocationCallOrder[0]);
  });

  it('purges but keeps a permanent account (reset, not delete)', async () => {
    const user = { ...fakeUser(0), isAnonymous: false };
    await eraseAccountData({}, user);
    expect(mockPurge).toHaveBeenCalledWith({}, 'u1');
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('rejects, and deletes nothing, when the purge is incomplete', async () => {
    const user = { ...fakeUser(0), isAnonymous: true };
    mockPurge.mockRejectedValue(new PurgeIncompleteError(['healthMetrics']));
    await expect(eraseAccountData({}, user)).rejects.toMatchObject({ code: 'PURGE_INCOMPLETE' });
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('still resolves when Firebase refuses to delete an emptied anonymous user', async () => {
    const user = { ...fakeUser(0), isAnonymous: true };
    user.delete.mockRejectedValueOnce(Object.assign(new Error('old'), { code: 'auth/requires-recent-login' }));
    await expect(eraseAccountData({}, user)).resolves.toBeUndefined();
  });
});

describe('classifyDeletionFailure', () => {
  it('routes each rejection to what the UI must do next', () => {
    expect(classifyDeletionFailure(Object.assign(new Error('REAUTH_REQUIRED'), { code: 'REAUTH_REQUIRED' }))).toBe('reauth');
    expect(classifyDeletionFailure(new PurgeIncompleteError(['userTasks']))).toBe('incomplete');
    expect(classifyDeletionFailure(new PurgeIncompleteError(['users/journal'], ['users/journal']))).toBe('blocked');
    expect(classifyDeletionFailure(new Error('boom'))).toBe('failed');
    expect(classifyDeletionFailure(undefined)).toBe('failed');
  });
});

// D-031. The device marker only helps on the phone where the deletion ran. If she never
// signs in there again, her login survived; on another phone she landed in Onboarding inside
// the account she had asked to delete. The request now lives on the server too.
describe('the deletion request on the server (deletionRequests/{uid})', () => {
  it('is recorded before anything is erased, and removed just before the login is deleted', async () => {
    const user = fakeUser(60_000);
    mockPurge.mockImplementation(async () => { expect(mockServer.has(REQUEST)).toBe(true); });
    await deleteUserAccount({}, user, NOW);
    expect(mockPurge).toHaveBeenCalled();
    expect(mockServerLog).toEqual([`set ${REQUEST}`, `delete ${REQUEST}`]);
    expect(mockServer.has(REQUEST)).toBe(false);
  });

  it('stays on the server when the login could not be deleted after a clean purge', async () => {
    const user = fakeUser(60_000);
    user.delete.mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'auth/network-request-failed' }));
    await expect(deleteUserAccount({}, user, NOW)).rejects.toMatchObject({ code: 'AUTH_DELETE_PENDING' });
    expect(mockServer.has(REQUEST)).toBe(true);
  });

  it('stays on the server when it could not be removed (the login is then not deleted either way)', async () => {
    const user = fakeUser(60_000);
    user.delete.mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'auth/network-request-failed' }));
    mockServerFail.delete = new Error('timeout');
    await expect(deleteUserAccount({}, user, NOW)).rejects.toMatchObject({ code: 'AUTH_DELETE_PENDING' });
    expect(mockServer.has(REQUEST)).toBe(true);
    // Offline that removal is only queued and reaches the server later, so the request is
    // written again behind it rather than trusted to still be there.
    expect(mockServerLog).toEqual([`set ${REQUEST}`, `set ${REQUEST}`]);
  });

  it('finishes the deletion when she signs in on ANOTHER phone (no device marker there)', async () => {
    mockServer.set(REQUEST, { requestedAt: 'SERVER_TS' });
    expect(mockStore.has(DELETION_PENDING_KEY)).toBe(false);
    await expect(hasPendingDeletion('u1', {})).resolves.toBe(true);
    const user = fakeUser(60_000);
    await expect(resumePendingDeletion({}, user)).resolves.toBe('deleted');
    expect(user.delete).toHaveBeenCalledTimes(1);
  });

  it('erases nothing when the request cannot be recorded (offline): a retry starts over', async () => {
    const user = fakeUser(60_000);
    mockServerFail.set = Object.assign(new Error('offline'), { code: 'unavailable' });
    const err = await deleteUserAccount({}, user, NOW).then(() => null, (e) => e);
    expect(classifyDeletionFailure(err)).toBe('incomplete');
    expect(mockPurge).not.toHaveBeenCalled();
    expect(user.delete).not.toHaveBeenCalled();
    // The timed-out write is still queued: its removal is queued behind it.
    expect(mockServerLog).toEqual([`delete ${REQUEST}`]);
  });

  it('still deletes, with the device marker alone, when deployed rules predate the collection', async () => {
    const user = fakeUser(60_000);
    mockServerFail.set = Object.assign(new Error('denied'), { code: 'permission-denied' });
    await deleteUserAccount({}, user, NOW);
    expect(mockPurge).toHaveBeenCalled();
    expect(user.delete).toHaveBeenCalled();
  });

  it('is withdrawn when the purge is incomplete — the account is still usable', async () => {
    mockPurge.mockRejectedValue(new PurgeIncompleteError(['userTasks']));
    await expect(deleteUserAccount({}, fakeUser(60_000), NOW)).rejects.toMatchObject({ code: 'PURGE_INCOMPLETE' });
    expect(mockServer.has(REQUEST)).toBe(false);
  });

  it('an old request is cleared by a reset, so the profile-less account she kept is not deleted', async () => {
    mockServer.set(REQUEST, { requestedAt: 'SERVER_TS' });
    await eraseAccountData({}, { ...fakeUser(0), isAnonymous: false });
    expect(mockServer.has(REQUEST)).toBe(false);
    await expect(hasPendingDeletion('u1', {})).resolves.toBe(false);
  });

  // login() and the auth listener both run for one sign-in. Once the listener is finishing
  // the deletion it removes the markers, so login() must take the listener's word for it
  // rather than read them and conclude this is an ordinary empty account.
  it('login() gets the outcome of a deletion the listener is already finishing', async () => {
    mockServer.set(REQUEST, { requestedAt: 'SERVER_TS' });
    const user = fakeUser(60_000);
    const listener = resumePendingDeletion({}, user);
    const login = pendingDeletionAtSignIn('u1', {});
    await expect(listener).resolves.toBe('deleted');
    expect(mockServer.has(REQUEST)).toBe(false);
    expect(mockStore.has(DELETION_PENDING_KEY)).toBe(false);
    await expect(login).resolves.toBe(true);
  });

  it('login() reads the server itself when no deletion is being finished', async () => {
    await expect(pendingDeletionAtSignIn('u1', {})).resolves.toBe(false);
    mockServer.set(REQUEST, { requestedAt: 'SERVER_TS' });
    await expect(pendingDeletionAtSignIn('u1', {})).resolves.toBe(true);
  });
});
