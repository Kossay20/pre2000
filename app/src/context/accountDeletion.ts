/**
 * Account deletion ordering (RGPD Art. 17, App Store 5.1.1(v)).
 *
 * The Firestore purge must run while the Auth user still exists (the owner rules check
 * its uid), and the Auth user must only be deleted after a clean purge. Firebase also
 * refuses auth.delete() when the last sign-in is too old. Checking that up front means a
 * stale session asks for the password before anything is erased, instead of purging
 * first and then leaving an emptied account behind if the user cancels the prompt.
 *
 * Kept free of React so the ordering is behaviourally tested (accountDeletion.test.ts).
 */
import { purgeUserFirestoreData } from './gdprPurge';
import { createLogger } from '../utils/logger';

const log = createLogger('accountDeletion');

// Firebase treats a sign-in older than five minutes as too old for auth.delete(). One
// minute of margin covers device clock skew and the time the purge itself takes.
export const RECENT_LOGIN_WINDOW_MS = 4 * 60 * 1000;

export interface DeletableUser {
    uid: string;
    delete(): Promise<void>;
    getIdTokenResult(): Promise<{ authTime: string }>;
}

const reauthRequired = (): Error => {
    const e = new Error('REAUTH_REQUIRED');
    (e as any).code = 'REAUTH_REQUIRED';
    return e;
};

const isRecentLogin = async (user: DeletableUser, now: number): Promise<boolean> => {
    try {
        const { authTime } = await user.getIdTokenResult();
        const signedInAt = Date.parse(authTime);
        if (!Number.isFinite(signedInAt)) return true;
        return now - signedInAt < RECENT_LOGIN_WINDOW_MS;
    } catch (err) {
        // Unknown is not "too old": let the server decide. If it refuses, the purge
        // has run but the fallback below still routes the user to the password prompt.
        log.warn('Could not read the sign-in time, deferring to the server', err);
        return true;
    }
};

const purgeThenDeleteAuthUser = async (db: any, user: DeletableUser): Promise<void> => {
    // Throws PurgeIncompleteError — the Auth user is then deliberately left in place.
    await purgeUserFirestoreData(db, user.uid);
    try {
        await user.delete();
    } catch (err: any) {
        if (err?.code === 'auth/requires-recent-login') throw reauthRequired();
        throw err;
    }
};

/**
 * Purge the user's Firestore data, then delete the Auth user.
 * @throws REAUTH_REQUIRED (code) when the session is too old — nothing has been purged.
 * @throws PURGE_INCOMPLETE (code) when some data could not be erased — the account remains.
 */
export const deleteUserAccount = async (db: any, user: DeletableUser, now: number = Date.now()): Promise<void> => {
    if (!(await isRecentLogin(user, now))) throw reauthRequired();
    await purgeThenDeleteAuthUser(db, user);
};

/**
 * The REAUTH_REQUIRED continuation: reauthenticate, and only then purge and delete, so a
 * wrong or cancelled password leaves the account exactly as it was.
 */
export const finishDeletionAfterReauth = async (
    db: any,
    user: DeletableUser,
    reauthenticate: () => Promise<unknown>,
): Promise<void> => {
    await reauthenticate();
    await purgeThenDeleteAuthUser(db, user);
};

export type DeletionFailure = 'reauth' | 'incomplete' | 'failed';

// What the UI should do with a rejected deleteAccount / reauthenticateAndDelete: ask for the
// password, offer a retry (the account still exists, some data is left), or report a failure.
export const classifyDeletionFailure = (err: any): DeletionFailure => {
    if (err?.code === 'REAUTH_REQUIRED' || err?.message === 'REAUTH_REQUIRED') return 'reauth';
    if (err?.code === 'PURGE_INCOMPLETE') return 'incomplete';
    return 'failed';
};
