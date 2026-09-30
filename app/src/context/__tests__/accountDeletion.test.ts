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
jest.mock('firebase/firestore', () => ({}));

import { deleteUserAccount, finishDeletionAfterReauth, classifyDeletionFailure, RECENT_LOGIN_WINDOW_MS } from '../accountDeletion';
import { PurgeIncompleteError } from '../gdprPurge';

const NOW = Date.parse('2026-09-30T12:00:00Z');

const fakeUser = (authAgeMs: number) => ({
  uid: 'u1',
  delete: jest.fn(async () => undefined),
  getIdTokenResult: jest.fn(async () => ({ authTime: new Date(NOW - authAgeMs).toUTCString() })),
});

beforeEach(() => {
  mockPurge.mockReset();
  mockPurge.mockResolvedValue(undefined);
});

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

describe('classifyDeletionFailure', () => {
  it('routes each rejection to what the UI must do next', () => {
    expect(classifyDeletionFailure(Object.assign(new Error('REAUTH_REQUIRED'), { code: 'REAUTH_REQUIRED' }))).toBe('reauth');
    expect(classifyDeletionFailure(new PurgeIncompleteError(['userTasks']))).toBe('incomplete');
    expect(classifyDeletionFailure(new Error('boom'))).toBe('failed');
    expect(classifyDeletionFailure(undefined)).toBe('failed');
  });
});
