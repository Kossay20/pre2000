/**
 * A small in-memory stand-in for the parts of 'firebase/firestore' the tracker services
 * use, for unit tests only:
 *
 *   jest.mock('firebase/firestore', () => require('../../testing/fakeFirestore').fakeFirestoreModule);
 *
 * Paths are plain strings, queries support `where(field, '==', value)`, and the whole
 * store can be taken offline (every call rejects) or made to answer from "cache".
 */
type Data = Record<string, unknown>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const fakeFirestore = {
    store: new Map<string, Data>(),
    offline: false,
    fromCache: false,
    reset() {
        this.store.clear();
        this.offline = false;
        this.fromCache = false;
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

const snapshotOf = (path: string, data: Data) => ({
    id: path.split('/').pop(),
    ref: { path, id: path.split('/').pop() },
    data: () => clone(data),
});

export const fakeFirestoreModule = {
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    doc: (_db: unknown, ...segments: string[]): Ref => ({ path: segments.join('/'), id: segments[segments.length - 1] }),
    where: (field: string, op: string, value: unknown): Clause => ({ field, op, value }),
    query: (col: { path: string }, ...clauses: Clause[]) => ({ path: col.path, clauses }),
    getDocs: (q: { path: string; clauses?: Clause[] }) => {
        const failed = guard();
        if (failed) return failed;
        const docs = [...fakeFirestore.store.entries()]
            .filter(([p]) => p.startsWith(`${q.path}/`) && !p.slice(q.path.length + 1).includes('/'))
            .filter(([, d]) => (q.clauses ?? []).every((c) => c.op === '==' && d[c.field] === c.value))
            .map(([p, d]) => snapshotOf(p, d));
        return Promise.resolve({ docs, size: docs.length, empty: docs.length === 0, metadata: { fromCache: fakeFirestore.fromCache } });
    },
    getDoc: (ref: Ref) => {
        const failed = guard();
        if (failed) return failed;
        const data = fakeFirestore.store.get(ref.path);
        return Promise.resolve({
            id: ref.id,
            exists: () => data !== undefined,
            data: () => (data ? clone(data) : undefined),
            metadata: { fromCache: fakeFirestore.fromCache },
        });
    },
    setDoc: (ref: Ref, data: Data) => {
        const failed = guard();
        if (failed) return failed;
        fakeFirestore.store.set(ref.path, clone(data));
        return Promise.resolve();
    },
    deleteDoc: (ref: Ref) => {
        const failed = guard();
        if (failed) return failed;
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
                deletes.forEach((r) => fakeFirestore.store.delete(r.path));
                return Promise.resolve();
            },
        };
    },
};
