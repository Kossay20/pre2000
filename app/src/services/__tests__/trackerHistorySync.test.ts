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

import { fakeFirestore } from '../../testing/fakeFirestore';
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
