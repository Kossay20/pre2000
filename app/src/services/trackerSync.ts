/**
 * Shared plumbing for the kick counter, contraction timer and hospital bag, which keep
 * their history on the device and, for a signed-in account, copy it to Firestore.
 *
 * They used to be device-only: logging out wiped them, and a new phone started empty, with
 * nothing telling her so. The device copy is still written first — these screens are used
 * in the moment, often without signal — and each record carries `synced` until the server
 * has it. A guest has no server copy; her records stay unsynced and go up on the first
 * sync after she creates an account.
 */

export interface SyncedRecord {
    id: string;
    // true once the server holds this record. Absent on anything written before sync
    // existed or by a guest, which is exactly what still has to be sent.
    synced?: boolean;
}

/** Server document id: owner-prefixed, so no user can create ids in another's namespace. */
export const ownedDocId = (uid: string, id: string): string => `${uid}_${id}`;

/** The metadata Firestore puts on a query snapshot and on each document in it. */
export interface ListingMetadata {
    fromCache?: boolean;
    hasPendingWrites?: boolean;
}

/**
 * Whether a listing is the server's answer. With the offline cache on, a listing made
 * without signal still resolves — from the cache — and anything else than an explicit
 * "not from cache" is treated as such.
 */
export const isServerListing = (snapshot?: ListingMetadata | null): boolean => snapshot?.fromCache === false;

/**
 * Whether a listed document is one the server has acknowledged. A write made here that has
 * not gone out yet is listed too, flagged `hasPendingWrites`: that is this device's own
 * record handed back, not the server's.
 */
export const isAcknowledged = (document?: ListingMetadata | null): boolean => document?.hasPendingWrites === false;

/**
 * Merge a listing into the device's records. Each listed record says in `synced` whether
 * the server has acknowledged it (see isAcknowledged).
 *
 * The server is the reference for everything it has acknowledged: a synced record missing
 * from it was deleted elsewhere (cleared on another phone) and goes. Unsynced records are
 * kept — the server has not seen them yet. A listing answered from the offline cache is not
 * a reference for anything, so then nothing local is dropped.
 *
 * Nor does it prove anything about a record this device holds: the cache contains the
 * device's own unsent writes. A session recorded without signal came back in the cached
 * listing and was marked synced, so the logout warning did not count it. A record held
 * here is marked synced only by the server's own listing, for a document without a
 * pending write; otherwise the device's copy stays as it is.
 */
export const mergeSyncedList = <T extends SyncedRecord>(
    local: T[],
    listed: T[],
    authoritative: boolean,
): T[] => {
    const localById = new Map(local.map((l) => [l.id, l]));
    const listedIds = new Set(listed.map((s) => s.id));
    const fromListing = listed.map((s) => {
        const acknowledged = s.synced === true;
        const mine = localById.get(s.id);
        if (mine && !(authoritative && acknowledged)) return mine;
        return { ...s, synced: acknowledged };
    });
    const localOnly = local.filter((l) => !listedIds.has(l.id) && (!authoritative || !l.synced));
    return [...fromListing, ...localOnly];
};

/** Mark the given ids as held by the server. */
export const markSynced = <T extends SyncedRecord>(records: T[], ids: Set<string>): T[] =>
    records.map((r) => (ids.has(r.id) ? { ...r, synced: true } : r));

/**
 * Runs read-modify-write steps on one AsyncStorage key one at a time. A sync merges the
 * server listing into the device copy after a network round trip; without this a kick
 * recorded during that round trip was overwritten by the merge.
 */
export const createSerialQueue = () => {
    let tail: Promise<unknown> = Promise.resolve();
    return <T>(fn: () => Promise<T>): Promise<T> => {
        const run = tail.then(fn, fn);
        tail = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    };
};

/**
 * Resolves when `work` settles or after `ms`, whichever comes first — never rejects. Logout
 * flushes the pending tracker syncs through this: the wipe that follows erases whatever the
 * server has not received, but a phone without signal must not hold the logout hostage.
 */
export const settleWithin = (work: Promise<unknown>, ms: number): Promise<'settled' | 'timeout'> =>
    new Promise((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), ms);
        work.then(
            () => { clearTimeout(timer); resolve('settled'); },
            () => { clearTimeout(timer); resolve('settled'); },
        );
    });
