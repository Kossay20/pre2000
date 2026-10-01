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

/**
 * Merge a server listing into the device's records.
 *
 * The server is the reference for everything it has acknowledged: a synced record missing
 * from it was deleted elsewhere (cleared on another phone) and goes. Unsynced records are
 * kept — the server has not seen them yet. A listing answered from the offline cache is not
 * a reference for anything, so then nothing local is dropped.
 */
export const mergeSyncedList = <T extends SyncedRecord>(
    local: T[],
    server: T[],
    authoritative: boolean,
): T[] => {
    const serverIds = new Set(server.map((s) => s.id));
    const fromServer = server.map((s) => ({ ...s, synced: true }));
    const localOnly = local.filter((l) => !serverIds.has(l.id) && (!authoritative || !l.synced));
    return [...fromServer, ...localOnly];
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
