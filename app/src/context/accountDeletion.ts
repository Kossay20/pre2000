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
 * The device marker alone was not enough: if she never signs in on that phone again her
 * login survives, and on another phone she was taken to Onboarding inside the account she
 * had asked to delete. So the request is also recorded on the server, in
 * deletionRequests/{uid}, before anything is erased, and every device checks it at
 * sign-in. It goes last, just before the Auth user (once that is gone nobody can pass the
 * owner rule to remove it), and is put back if the Auth delete fails.
 *
 * Kept free of React so the ordering is behaviourally tested (accountDeletion.test.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { purgeUserFirestoreData, PurgeIncompleteError } from './gdprPurge';
import { DELETION_PENDING_KEY } from './storageKeys';
import { createLogger } from '../utils/logger';
import { withTimeout } from '../utils/withTimeout';

const log = createLogger('accountDeletion');

// Owner-only in firestore.rules: one document per uid, holding only when she asked.
export const DELETION_REQUESTS_COLLECTION = 'deletionRequests';

// A Firestore write offline neither resolves nor rejects; the marker must never leave the
// deletion spinning, so each server step is bounded.
const MARKER_TIMEOUT_MS = 8000;

const requestRef = (db: any, uid: string) => doc(db, DELETION_REQUESTS_COLLECTION, uid);

const recordServerRequest = (db: any, uid: string) =>
    withTimeout(setDoc(requestRef(db, uid), { requestedAt: serverTimestamp() }), MARKER_TIMEOUT_MS, 'deletion request timed out');

const removeServerRequest = (db: any, uid: string) =>
    withTimeout(deleteDoc(requestRef(db, uid)), MARKER_TIMEOUT_MS, 'deletion request timed out');

/** True when her deletion request is on the server — what another device sees at sign-in. */
const hasServerRequest = async (db: any, uid: string): Promise<boolean> => {
    try {
        return (await withTimeout(getDoc(requestRef(db, uid)), MARKER_TIMEOUT_MS)).exists();
    } catch (err) {
        log.warn('Could not read the deletion request', err);
        return false;
    }
};

// Firebase treats a sign-in older than five minutes as too old for auth.delete(). One
// minute of margin covers device clock skew and the time the purge itself takes.
export const RECENT_LOGIN_WINDOW_MS = 4 * 60 * 1000;

export interface DeletableUser {
    uid: string;
    isAnonymous?: boolean;
    delete(): Promise<void>;
    getIdTokenResult(forceRefresh?: boolean): Promise<{ authTime: string; issuedAtTime?: string }>;
}

// `afterPurge`: Firebase refused the Auth delete after the data was already erased. The UI
// must then say so, and must not leave her in the emptied account if she cancels.
const reauthRequired = (afterPurge = false): Error => {
    const e = new Error('REAUTH_REQUIRED');
    (e as any).code = 'REAUTH_REQUIRED';
    if (afterPurge) (e as any).afterPurge = true;
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
    // Recorded on the server before anything is erased. If that fails nothing is erased
    // either, and a retry starts over. Deployed rules that predate this collection refuse
    // it: then the deletion still goes ahead with the device marker alone (as before), and
    // Sentry is told, rather than blocking every deletion until the operator deploys.
    try {
        await recordServerRequest(db, user.uid);
    } catch (err: any) {
        if (err?.code !== 'permission-denied') {
            log.warn('Could not record the deletion request on the server', err);
            // Offline the write only timed out and is still queued. Queue its removal
            // behind it (not awaited), so no request appears later for a deletion that
            // never started.
            removeServerRequest(db, user.uid).catch(() => {});
            throw new PurgeIncompleteError([DELETION_REQUESTS_COLLECTION]);
        }
        log.error('Deletion request refused by Firestore rules — deploy firestore.rules', err);
    }
    try {
        // Throws PurgeIncompleteError — the Auth user is then deliberately left in place.
        await purgeUserFirestoreData(db, user.uid);
    } catch (err) {
        // The account is still usable (its profile is the last thing the purge removes), so
        // it is no longer "only the login is left". The request is withdrawn; a retry
        // records it again.
        await removeServerRequest(db, user.uid).catch((e) => log.warn('Could not withdraw the deletion request', e));
        throw err;
    }
    // From here the account is empty. Remember that until the Auth user is gone.
    try {
        await AsyncStorage.setItem(DELETION_PENDING_KEY, user.uid);
    } catch (err) {
        log.warn('Could not record the pending deletion', err);
    }
    // The last thing the uid can delete, so it goes just before the Auth user.
    await removeServerRequest(db, user.uid).catch((e) => {
        log.warn('Could not remove the deletion request before deleting the login', e);
    });
    try {
        await user.delete();
    } catch (err: any) {
        // Still signed in, so the owner rule still passes: put the request back for
        // whichever device she signs in on next. Also when the removal above "failed":
        // offline it only timed out and is still queued, and would otherwise reach the
        // server later and erase the request while the login survives.
        await recordServerRequest(db, user.uid).catch((e) => log.warn('Could not restore the deletion request', e));
        if (err?.code === 'auth/requires-recent-login') throw reauthRequired(true);
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
 * True when `uid` asked for its deletion and only the Auth user is left: recorded on this
 * device, or (with `db`) on the server, which is what a sign-in on another phone finds.
 * Callers only ask for an account whose profile is missing — the purge removes the profile
 * last, so a request next to an existing profile is an unfinished purge, not this.
 */
export const hasPendingDeletion = async (uid: string, db?: any): Promise<boolean> => {
    try {
        if ((await AsyncStorage.getItem(DELETION_PENDING_KEY)) === uid) return true;
    } catch {
        // Fall through to the server.
    }
    return db ? hasServerRequest(db, uid) : false;
};

/**
 * - 'none': nothing pending for this uid — open the account normally.
 * - 'deleted': the deletion she asked for is now finished.
 * - 'needs-password': still pending, and the sign-in is too old to finish it. A fresh
 *   sign-in finishes it (the password is what Firebase requires).
 * - 'failed': still pending for another reason (offline); the next attempt retries.
 * Anything but 'none' means the account is emptied and must not be opened as normal.
 */
export type ResumeResult = 'none' | 'deleted' | 'needs-password' | 'failed';

const resumesInFlight = new Map<string, Promise<ResumeResult>>();

/**
 * Called for a signed-in user whose profile document is missing. If this device recorded a
 * finished purge for that uid, the user had asked for the account to be deleted and only the
 * Auth delete failed: finish it rather than bootstrapping an empty account.
 *
 * Single-flight per uid: a sign-in runs both login() and the auth listener, and two
 * concurrent deletes of the same user would race each other.
 */
export const resumePendingDeletion = (db: any, user: DeletableUser): Promise<ResumeResult> => {
    const existing = resumesInFlight.get(user.uid);
    if (existing) return existing;
    const run = (async (): Promise<ResumeResult> => {
        if (!(await hasPendingDeletion(user.uid, db))) return 'none';
        try {
            await deleteUserAccount(db, user);
            return 'deleted';
        } catch (err) {
            if (classifyDeletionFailure(err) === 'reauth') {
                // Measured at start-up the sign-in is usually more than a few minutes old.
                log.warn('A pending account deletion needs a fresh sign-in to finish');
                return 'needs-password';
            }
            log.error('Could not finish a pending account deletion', err);
            return 'failed';
        }
    })().finally(() => resumesInFlight.delete(user.uid));
    resumesInFlight.set(user.uid, run);
    return run;
};

/**
 * login()'s question: is this sign-in one that finishes a deletion? If the auth listener
 * is already finishing it, its answer is the answer — by then it may have removed the
 * very markers hasPendingDeletion reads.
 */
export const pendingDeletionAtSignIn = async (uid: string, db: any): Promise<boolean> => {
    const inFlight = resumesInFlight.get(uid);
    if (inFlight) return (await inFlight) !== 'none';
    return hasPendingDeletion(uid, db);
};

/** The data is already erased and only the Auth user is left (see reauthRequired). */
export const isErasedButNotDeleted = (err: any): boolean =>
    err?.code === 'AUTH_DELETE_PENDING' || (err?.code === 'REAUTH_REQUIRED' && err?.afterPurge === true);

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
    // A reset leaves the account without a profile, which is what a pending deletion looks
    // like at sign-in. A request left over from an earlier, abandoned deletion would then
    // delete the account she chose to keep.
    await removeServerRequest(db, user.uid).catch((e) => log.warn('Could not clear an old deletion request', e));
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
