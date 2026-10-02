/**
 * A small in-memory stand-in for the parts of 'firebase/firestore' the tracker services
 * use, for unit tests only:
 *
 *   jest.mock('firebase/firestore', () => require('../../testing/fakeFirestore').fakeFirestoreModule);
 *
 * Paths are plain strings, queries support `where(field, '==', value)`, and the whole
 * store can be taken offline (every call rejects) or made to answer from "cache".
 *
 * `store` is what the SERVER holds. `disconnect()` models the real SDK with its offline
 * cache and no signal, which is not a rejection: a write is kept in the cache and its
 * promise stays pending until the server acknowledges it, and a read still resolves — from
 * the cache, the unsent writes included, with `fromCache` / `hasPendingWrites` set as
 * Firestore sets them. `reconnect()` delivers the unsent writes and resolves them.
 */
type Data = Record<string, unknown>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

type PendingWrite = { path: string; data: Data | null; ack: () => void };

export const fakeFirestore = {
    store: new Map<string, Data>(),
    offline: false,
    fromCache: false,
    disconnected: false,
    // Writes made while disconnected, oldest first; `data: null` is a delete.
    pending: [] as PendingWrite[],
    reset() {
        this.store.clear();
        this.offline = false;
        this.fromCache = false;
        this.disconnected = false;
        this.pending = [];
    },
    disconnect() {
        this.disconnected = true;
    },
    reconnect() {
        this.disconnected = false;
        const queued = this.pending;
        this.pending = [];
        for (const w of queued) {
            if (w.data === null) this.store.delete(w.path);
            else this.store.set(w.path, w.data);
            w.ack();
        }
    },
    docsIn(collectionPath: string): Data[] {
        return [...this.store.entries()]
            .filter(([p]) => p.startsWith(`${collectionPath}/`) && !p.slice(collectionPath.length + 1).includes('/'))
            .map(([, d]) => clone(d));
    },
};

const guard = () => {
    if (fakeFirestore.offline) return Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }));
    return null;
};

type Ref = { path: string; id: string };
type Clause = { field: string; op: string; value: unknown };

const snapshotOf = (path: string, data: Data, hasPendingWrites: boolean) => ({
    id: path.split('/').pop(),
    ref: { path, id: path.split('/').pop() },
    data: () => clone(data),
    metadata: { fromCache: fakeFirestore.fromCache || fakeFirestore.disconnected, hasPendingWrites },
});

// What a read sees: the server's documents with this device's unsent writes on top.
const view = (): Map<string, { data: Data; hasPendingWrites: boolean }> => {
    const seen = new Map<string, { data: Data; hasPendingWrites: boolean }>();
    fakeFirestore.store.forEach((data, path) => seen.set(path, { data, hasPendingWrites: false }));
    for (const w of fakeFirestore.pending) {
        if (w.data === null) seen.delete(w.path);
        else seen.set(w.path, { data: w.data, hasPendingWrites: true });
    }
    return seen;
};

// Disconnected: the write waits in the cache and resolves only once the server has it.
const queueWrite = (path: string, data: Data | null): Promise<void> =>
    new Promise((ack) => {
        fakeFirestore.pending.push({ path, data, ack });
    });

export const fakeFirestoreModule = {
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    doc: (_db: unknown, ...segments: string[]): Ref => ({ path: segments.join('/'), id: segments[segments.length - 1] }),
    where: (field: string, op: string, value: unknown): Clause => ({ field, op, value }),
    query: (col: { path: string }, ...clauses: Clause[]) => ({ path: col.path, clauses }),
    getDocs: (q: { path: string; clauses?: Clause[] }) => {
        const failed = guard();
        if (failed) return failed;
        const docs = [...view().entries()]
            .filter(([p]) => p.startsWith(`${q.path}/`) && !p.slice(q.path.length + 1).includes('/'))
            .filter(([, d]) => (q.clauses ?? []).every((c) => c.op === '==' && d.data[c.field] === c.value))
            .map(([p, d]) => snapshotOf(p, d.data, d.hasPendingWrites));
        return Promise.resolve({
            docs,
            size: docs.length,
            empty: docs.length === 0,
            metadata: {
                fromCache: fakeFirestore.fromCache || fakeFirestore.disconnected,
                hasPendingWrites: docs.some((d) => d.metadata.hasPendingWrites),
            },
        });
    },
    getDoc: (ref: Ref) => {
        const failed = guard();
        if (failed) return failed;
        const seen = view().get(ref.path);
        const data = seen?.data;
        return Promise.resolve({
            id: ref.id,
            exists: () => data !== undefined,
            data: () => (data ? clone(data) : undefined),
            metadata: {
                fromCache: fakeFirestore.fromCache || fakeFirestore.disconnected,
                hasPendingWrites: seen?.hasPendingWrites ?? false,
            },
        });
    },
    setDoc: (ref: Ref, data: Data) => {
        const failed = guard();
        if (failed) return failed;
        if (fakeFirestore.disconnected) return queueWrite(ref.path, clone(data));
        fakeFirestore.store.set(ref.path, clone(data));
        return Promise.resolve();
    },
    deleteDoc: (ref: Ref) => {
        const failed = guard();
        if (failed) return failed;
        if (fakeFirestore.disconnected) return queueWrite(ref.path, null);
        fakeFirestore.store.delete(ref.path);
        return Promise.resolve();
    },
    writeBatch: () => {
        const deletes: Ref[] = [];
        return {
            delete: (ref: Ref) => {
                deletes.push(ref);
            },
            commit: () => {
                const failed = guard();
                if (failed) return failed;
                if (fakeFirestore.disconnected) return Promise.all(deletes.map((r) => queueWrite(r.path, null))).then(() => undefined);
                deletes.forEach((r) => fakeFirestore.store.delete(r.path));
                return Promise.resolve();
            },
        };
    },
};
