/**
 * Account deletion ordering (RGPD Art. 17, App Store 5.1.1(v)).
 *
 * The Firestore purge must run while the Auth user still exists (the owner rules check
 * its uid), and the Auth user must only be deleted after a clean purge. Firebase also
 * refuses auth.delete() when the last sign-in is too old. Checking that up front means a
 * stale session asks for the password before anything is erased, instead of purging
 * first and then leaving an emptied account behind if the user cancels the prompt.
 *
 * The up-front check narrows that window but cannot close it: user.delete() is one more
 * network call after the purge, and it can still fail. So a clean purge leaves a marker
 * on the device (DELETION_PENDING_KEY) until the Auth user is gone. A failed delete is
 * reported as "not finished" with a retry, and the next launch finishes it
 * (resumePendingDeletion) instead of opening the emptied account as if nothing happened.
 *
 * Kept free of React so the ordering is behaviourally tested (accountDeletion.test.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { purgeUserFirestoreData } from './gdprPurge';
import { DELETION_PENDING_KEY } from './storageKeys';
import { createLogger } from '../utils/logger';

const log = createLogger('accountDeletion');

// Firebase treats a sign-in older than five minutes as too old for auth.delete(). One
// minute of margin covers device clock skew and the time the purge itself takes.
export const RECENT_LOGIN_WINDOW_MS = 4 * 60 * 1000;

export interface DeletableUser {
    uid: string;
    isAnonymous?: boolean;
    delete(): Promise<void>;
    getIdTokenResult(forceRefresh?: boolean): Promise<{ authTime: string; issuedAtTime?: string }>;
}

const reauthRequired = (): Error => {
    const e = new Error('REAUTH_REQUIRED');
    (e as any).code = 'REAUTH_REQUIRED';
    return e;
};

// A purge finished but the Auth user still exists: retrying (or the next launch) only has
// to delete the Auth user. Classified as 'incomplete', like a partial purge.
const authDeletePending = (cause: unknown): Error => {
    const e = new Error('AUTH_DELETE_PENDING');
    (e as any).code = 'AUTH_DELETE_PENDING';
    (e as any).cause = cause;
    return e;
};

const isRecentLogin = async (user: DeletableUser, now: number): Promise<boolean> => {
    try {
        // Force a refresh: the cached token can be an hour old, and a fresh one carries
        // the server's own clock (issuedAtTime), so the sign-in age is measured on one
        // clock and a phone whose time is off cannot make an old sign-in look recent.
        const { authTime, issuedAtTime } = await user.getIdTokenResult(true);
        const signedInAt = Date.parse(authTime);
        if (!Number.isFinite(signedInAt)) return true;
        const serverNow = issuedAtTime ? Date.parse(issuedAtTime) : NaN;
        const reference = Number.isFinite(serverNow) ? serverNow : now;
        return reference - signedInAt < RECENT_LOGIN_WINDOW_MS;
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
    // From here the account is empty. Remember that until the Auth user is gone.
    try {
        await AsyncStorage.setItem(DELETION_PENDING_KEY, user.uid);
    } catch (err) {
        log.warn('Could not record the pending deletion', err);
    }
    try {
        await user.delete();
    } catch (err: any) {
        if (err?.code === 'auth/requires-recent-login') throw reauthRequired();
        throw authDeletePending(err);
    }
    try {
        await AsyncStorage.removeItem(DELETION_PENDING_KEY);
    } catch {
        // Harmless: resumePendingDeletion only acts on the uid that is signed in.
    }
};

/**
 * Purge the user's Firestore data, then delete the Auth user.
 * @throws REAUTH_REQUIRED (code) when the session is too old — nothing has been purged.
 * @throws PURGE_INCOMPLETE (code) when some data could not be erased — the account remains.
 * @throws AUTH_DELETE_PENDING (code) when everything was erased but the Auth user could not
 * be deleted — a retry (or the next launch) finishes it.
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

/**
 * Called at start-up for a signed-in user whose profile document is missing. If this
 * device recorded a finished purge for that uid, the user had asked for the account to
 * be deleted and only the Auth delete failed: finish it rather than bootstrapping an
 * empty account. Returns true when the account is now deleted.
 */
export const resumePendingDeletion = async (db: any, user: DeletableUser): Promise<boolean> => {
    let pendingUid: string | null = null;
    try {
        pendingUid = await AsyncStorage.getItem(DELETION_PENDING_KEY);
    } catch {
        return false;
    }
    if (!pendingUid || pendingUid !== user.uid) return false;
    try {
        await deleteUserAccount(db, user);
        return true;
    } catch (err) {
        log.error('Could not finish a pending account deletion', err);
        return false;
    }
};

/**
 * "Reset profile", and a guest's "Erase my data". Everything the uid holds in Firestore is
 * erased, not just the profile document: with Anonymous Auth enabled a guest's uid is a real
 * Firebase uid and her health entries, appointments and reminders are stored under it, and
 * signing out afterwards loses the only key that can reach them.
 *
 * A permanent account is kept (that is what "reset" means, as opposed to deleting the
 * account). An anonymous one has nothing left to identify, so it is deleted; if Firebase
 * refuses (an old anonymous session), the record left behind holds no data and the caller
 * still signs out.
 *
 * @throws PURGE_INCOMPLETE when some data could not be erased — the caller must keep the
 * session so the reset can be retried.
 */
export const eraseAccountData = async (db: any, user: DeletableUser): Promise<void> => {
    await purgeUserFirestoreData(db, user.uid);
    if (!user.isAnonymous) return;
    try {
        await user.delete();
    } catch (err) {
        log.warn('Anonymous user left after its data was erased', err);
    }
};

export type DeletionFailure = 'reauth' | 'incomplete' | 'blocked' | 'failed';

// What the UI should do with a rejected deleteAccount / reauthenticateAndDelete / resetProfile:
// ask for the password, offer a retry (the account still exists, some data is left), send the
// user to support (the server refused and a retry would fail the same way), or report a failure.
export const classifyDeletionFailure = (err: any): DeletionFailure => {
    if (err?.code === 'REAUTH_REQUIRED' || err?.message === 'REAUTH_REQUIRED') return 'reauth';
    if (err?.code === 'PURGE_INCOMPLETE') return err.blockedByRules ? 'blocked' : 'incomplete';
    if (err?.code === 'AUTH_DELETE_PENDING') return 'incomplete';
    return 'failed';
};
