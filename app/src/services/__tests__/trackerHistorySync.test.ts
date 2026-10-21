/**
 * Kick sessions, contractions and the hospital bag used to live on the device only: a
 * logout wiped them and a new phone started empty. For a signed-in account they now go to
 * Firestore too, written on the device first (offline-first) and sent when possible.
 *
 * "A new phone" and "after a logout" are both an emptied AsyncStorage with the server
 * copy intact, which is what these simulate.
 */
jest.mock('../../config/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'alice' } } }));
jest.mock('firebase/firestore', () => require('../../testing/fakeFirestore').fakeFirestoreModule);
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => {
        mockStore[k] = v;
        return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
        delete mockStore[k];
        return Promise.resolve();
    }),
}));

import { fakeFirestore, fakeFirestoreModule } from '../../testing/fakeFirestore';
import * as kicks from '../kickCounterService';
import * as contractions from '../contractionTimerService';
import * as bag from '../hospitalBagService';

const UID = 'alice';
const firebaseMock = jest.requireMock('../../config/firebase') as { auth: { currentUser: { uid: string } | null } };

/** Let the background sends (fire-and-forget) run to completion. */
const flush = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/** A logout (localWipe) or a new phone: nothing on the device, the account intact. */
const wipeDevice = () => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
};

beforeEach(() => {
    wipeDevice();
    fakeFirestore.reset();
    firebaseMock.auth.currentUser = { uid: UID };
});

describe('kick sessions', () => {
    const recordSession = async (uid: string | null, taps = 3) => {
        await kicks.startSession();
        for (let i = 0; i < taps; i++) await kicks.recordKick();
        return kicks.endSession(uid);
    };

    it('an ended session reaches the account and comes back on a new device', async () => {
        const ended = await recordSession(UID, 3);
        await flush();
        const id = ended.history[0].id;
        expect(fakeFirestore.store.get(`kickSessions/${UID}_${id}`)).toMatchObject({
            user_id: UID,
            id,
            kicks: expect.any(Array),
        });
        expect((await kicks.loadState()).history[0].synced).toBe(true);

        wipeDevice();
        const fresh = await kicks.loadState(UID);
        expect(fresh.history).toHaveLength(1);
        expect(fresh.history[0].kicks).toHaveLength(3);
    });

    it('offline, the session is kept on the device and sent on the next open', async () => {
        fakeFirestore.offline = true;
        await recordSession(UID, 2);
        await flush();
        const offlineView = await kicks.loadState(UID);
        expect(offlineView.history).toHaveLength(1);
        expect(offlineView.history[0].synced).toBeFalsy();
        expect(fakeFirestore.docsIn('kickSessions')).toHaveLength(0);

        fakeFirestore.offline = false;
        await kicks.loadState(UID);
        await flush();
        expect(fakeFirestore.docsIn('kickSessions')).toHaveLength(1);
    });

    it('a guest keeps her history on the device, and it goes up when she creates an account', async () => {
        await recordSession(null, 4);
        await flush();
        expect(fakeFirestore.docsIn('kickSessions')).toHaveLength(0);

        await kicks.pushPendingSessions(UID);
        const docs = fakeFirestore.docsIn('kickSessions');
        expect(docs).toHaveLength(1);
        expect(docs[0].user_id).toBe(UID);
    });

    it('an offline (cached) listing never drops what the device holds', async () => {
        await recordSession(UID, 1);
        await flush();
        fakeFirestore.store.clear();
        fakeFirestore.fromCache = true;
        expect((await kicks.loadState(UID)).history).toHaveLength(1);
    });

    it('a sync that ends after the logout does not put her history back on the device', async () => {
        await recordSession(UID, 1);
        await flush();
        wipeDevice();
        firebaseMock.auth.currentUser = null;
        await kicks.loadState(UID);
        await flush();
        expect(mockStore.kick_counter_v1).toBeUndefined();
    });
});

describe('contractions', () => {
    const recordContraction = async (uid: string | null) => {
        await contractions.startContraction();
        return contractions.stopContraction(uid);
    };

    it('a contraction reaches the account and comes back on a new device', async () => {
        await recordContraction(UID);
        await flush();
        expect(fakeFirestore.docsIn('contractions')).toHaveLength(1);

        wipeDevice();
        expect((await contractions.loadState(UID)).history).toHaveLength(1);
    });

    it('"clear all" clears the account too', async () => {
        await recordContraction(UID);
        await recordContraction(UID);
        await flush();
        await contractions.clearAll(UID);
        await flush();
        expect(fakeFirestore.docsIn('contractions')).toHaveLength(0);

        wipeDevice();
        expect((await contractions.loadState(UID)).history).toHaveLength(0);
    });

    it('"clear all" offline stays cleared and is finished on the server later', async () => {
        await recordContraction(UID);
        await flush();
        fakeFirestore.offline = true;
        await contractions.clearAll(UID);
        await flush();
        expect(fakeFirestore.docsIn('contractions')).toHaveLength(1);

        fakeFirestore.offline = false;
        expect((await contractions.loadState(UID)).history).toHaveLength(0);
        await flush();
        expect(fakeFirestore.docsIn('contractions')).toHaveLength(0);
        expect((await contractions.loadState()).pendingClearBefore).toBeNull();
    });

    it('a contraction cleared on another phone disappears here as well', async () => {
        await recordContraction(UID);
        await flush();
        fakeFirestore.store.clear();
        expect((await contractions.loadState(UID)).history).toHaveLength(0);
    });

    it('a guest keeps contractions on the device only', async () => {
        await recordContraction(null);
        await flush();
        expect(fakeFirestore.docsIn('contractions')).toHaveLength(0);
        expect((await contractions.loadState()).history).toHaveLength(1);
    });
});

describe('hospital bag', () => {
    it('ticks and her own items reach the account and come back on a new device', async () => {
        const initial = await bag.loadState(UID);
        const first = initial.items[0].id;
        await bag.toggleItem(first, UID);
        await bag.addCustomItem('mom', 'Chargeur', UID);
        await flush();
        const server = fakeFirestore.store.get(`hospitalBags/${UID}`) as any;
        expect(server.checked).toEqual({ [first]: true });
        expect(server.customItems).toEqual([expect.objectContaining({ section: 'mom', label: 'Chargeur' })]);

        wipeDevice();
        const fresh = await bag.loadState(UID);
        expect(fresh.checked[first]).toBe(true);
        expect(fresh.items.some((i) => i.custom && i.label_fr === 'Chargeur')).toBe(true);
        expect(bag.computeProgress(fresh)).toEqual({ done: 1, total: initial.items.length + 1 });
    });

    it('an edit made offline is sent on the next open', async () => {
        const initial = await bag.loadState(UID);
        fakeFirestore.offline = true;
        await bag.toggleItem(initial.items[1].id, UID);
        await flush();
        expect(fakeFirestore.store.has(`hospitalBags/${UID}`)).toBe(false);

        fakeFirestore.offline = false;
        const reopened = await bag.loadState(UID);
        await flush();
        expect(reopened.checked[initial.items[1].id]).toBe(true);
        expect((fakeFirestore.store.get(`hospitalBags/${UID}`) as any).checked).toEqual({ [initial.items[1].id]: true });
    });

    it('a guest keeps the list on the device, and it goes up when she creates an account', async () => {
        const initial = await bag.loadState();
        await bag.toggleItem(initial.items[0].id, null);
        await flush();
        expect(fakeFirestore.store.has(`hospitalBags/${UID}`)).toBe(false);

        await bag.pushPendingBag(UID);
        expect((fakeFirestore.store.get(`hospitalBags/${UID}`) as any).checked).toEqual({ [initial.items[0].id]: true });
    });
});

/**
 * Round 4, state 52: a kick session recorded without signal was marked synced on the
 * device while the server had no such document. The real SDK, with its offline cache, does
 * not fail without signal: the write waits in the cache and a listing resolves from that
 * cache, the unsent write included. That listing was read as the server's.
 * `fakeFirestore.store` is what the server holds; `disconnect()` is the cache without signal.
 */
describe('without signal, what the cache lists is not what the server holds', () => {
    const unsent = <T extends { synced?: boolean }>(records: T[]) => records.filter((r) => !r.synced).length;

    it('kick session: unsent after the offline write, still unsent after a cached listing, synced once the server has it', async () => {
        fakeFirestore.disconnect();
        await kicks.startSession();
        await kicks.recordKick();
        await kicks.endSession(UID);
        await flush();
        expect(fakeFirestore.docsIn('kickSessions')).toHaveLength(0);
        expect(unsent((await kicks.loadState()).history)).toBe(1);

        // She leaves the screen and comes back: the listing is answered from the cache
        // and contains her own pending write.
        const reopened = await kicks.loadState(UID);
        await flush();
        expect(reopened.history).toHaveLength(1);
        expect(unsent(reopened.history)).toBe(1);
        expect(unsent((await kicks.loadState()).history)).toBe(1);
        expect(await kicks.countPendingSessions()).toBe(1);

        fakeFirestore.reconnect();
        await flush();
        expect(fakeFirestore.docsIn('kickSessions')).toHaveLength(1);
        expect(await kicks.countPendingSessions()).toBe(0);
        const online = await kicks.loadState(UID);
        expect(online.history).toHaveLength(1);
        expect(online.history[0].synced).toBe(true);
    });

    it('kick session: a listing asked before the session ended and answered from the cache after does not mark it synced', async () => {
        // What the screen does: it lists on focus, and without signal that listing only
        // resolves — from the cache — after she has already recorded and ended a session.
        fakeFirestore.disconnect();
        const realGetDocs = fakeFirestoreModule.getDocs;
        let release: () => void = () => {};
        const gate = new Promise<void>((r) => { release = r; });
        jest.spyOn(fakeFirestoreModule, 'getDocs').mockImplementationOnce(async (q) => {
            await gate;
            return realGetDocs(q);
        });
        const onFocus = kicks.loadState(UID);
        await kicks.startSession();
        await kicks.recordKick();
        await kicks.endSession(UID);
        await flush();
        release();
        expect(unsent((await onFocus).history)).toBe(1);
        expect(await kicks.countPendingSessions()).toBe(1);
        jest.restoreAllMocks();
    });

    it('online, a listing that still carries a pending write does not mark that record synced', async () => {
        await kicks.startSession();
        await kicks.recordKick();
        const ended = await kicks.endSession(null);
        const id = ended.history[0].id;
        // The write is on its way (not acknowledged) when the server's listing comes back.
        fakeFirestore.pending.push({
            path: `kickSessions/${UID}_${id}`,
            data: { user_id: UID, id, startedAt: 1, endedAt: 2, kicks: [1] },
            ack: () => {},
        });
        jest.spyOn(fakeFirestoreModule, 'setDoc').mockImplementation(() => new Promise(() => {}));
        const listed = await kicks.loadState(UID);
        await flush();
        expect(unsent(listed.history)).toBe(1);
        expect(await kicks.countPendingSessions()).toBe(1);
        jest.restoreAllMocks();
    });

    it('contraction: same rule', async () => {
        fakeFirestore.disconnect();
        await contractions.startContraction();
        await contractions.stopContraction(UID);
        await flush();
        expect(fakeFirestore.docsIn('contractions')).toHaveLength(0);

        const reopened = await contractions.loadState(UID);
        await flush();
        expect(reopened.history).toHaveLength(1);
        expect(unsent(reopened.history)).toBe(1);
        expect(await contractions.countPendingContractions()).toBe(1);

        fakeFirestore.reconnect();
        await flush();
        expect(fakeFirestore.docsIn('contractions')).toHaveLength(1);
        expect(await contractions.countPendingContractions()).toBe(0);
    });

    it('hospital bag: same rule', async () => {
        const initial = await bag.loadState(UID);
        fakeFirestore.disconnect();
        await bag.toggleItem(initial.items[0].id, UID);
        await flush();
        expect(fakeFirestore.store.has(`hospitalBags/${UID}`)).toBe(false);

        const reopened = await bag.loadState(UID);
        await flush();
        expect(reopened.checked[initial.items[0].id]).toBe(true);
        expect(reopened.synced).toBeFalsy();
        expect(await bag.countPendingBag()).toBe(1);

        fakeFirestore.reconnect();
        await flush();
        expect((fakeFirestore.store.get(`hospitalBags/${UID}`) as any).checked).toEqual({ [initial.items[0].id]: true });
        expect(await bag.countPendingBag()).toBe(0);
    });

    it('hospital bag: online, a document still carrying her unsent edit does not mark the list synced', async () => {
        const initial = await bag.loadState(UID);
        const edited = await bag.toggleItem(initial.items[0].id, null);
        fakeFirestore.pending.push({
            path: `hospitalBags/${UID}`,
            data: { user_id: UID, checked: { [initial.items[0].id]: true }, customItems: [], updatedAt: edited.updatedAt as number },
            ack: () => {},
        });
        jest.spyOn(fakeFirestoreModule, 'setDoc').mockImplementation(() => new Promise(() => {}));
        await bag.loadState(UID);
        await flush();
        expect(await bag.countPendingBag()).toBe(1);
        jest.restoreAllMocks();
    });

    it('history already on the server is still shown from the cache on a device that has none of it', async () => {
        await kicks.startSession();
        await kicks.recordKick();
        await kicks.endSession(UID);
        await flush();
        wipeDevice();
        fakeFirestore.disconnect();
        const cached = await kicks.loadState(UID);
        expect(cached.history).toHaveLength(1);
        // The server acknowledged it long ago: nothing here for a logout to lose.
        expect(await kicks.countPendingSessions()).toBe(0);
    });
});
