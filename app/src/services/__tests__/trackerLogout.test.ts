/**
 * B-018 — logging out without signal erased the kick sessions, contractions and bag edits
 * that had not reached the server, and said nothing. The logout now tries to send them
 * (bounded) and, if some are still unsent, asks before wiping.
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

import * as fs from 'fs';
import * as path from 'path';
import { fakeFirestore, fakeFirestoreModule } from '../../testing/fakeFirestore';
import * as kicks from '../kickCounterService';
import * as contractions from '../contractionTimerService';
import * as bag from '../hospitalBagService';
import { countUnsyncedTrackerRecords, settleTrackersBeforeLogout } from '../trackerLogout';

const UID = 'alice';

/** Records made as a guest would make them: on the device, never sent. */
const recordOffline = async () => {
    await kicks.startSession();
    await kicks.recordKick();
    await kicks.endSession(null);
    await contractions.startContraction();
    await contractions.stopContraction(null);
    await contractions.startContraction();
    await contractions.stopContraction(null);
    const state = await bag.loadState();
    await bag.toggleItem(state.items[0].id, null);
};

beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    fakeFirestore.reset();
    jest.restoreAllMocks();
});

describe('countUnsyncedTrackerRecords', () => {
    it('is 0 on an untouched device', async () => {
        expect(await countUnsyncedTrackerRecords()).toBe(0);
    });

    it('counts the ended kick session, each contraction and the edited bag', async () => {
        await recordOffline();
        expect(await countUnsyncedTrackerRecords()).toBe(4);
    });

    it('a kick session still running is not counted (only ended sessions sync)', async () => {
        await kicks.startSession();
        await kicks.recordKick();
        expect(await countUnsyncedTrackerRecords()).toBe(0);
    });
});

describe('settleTrackersBeforeLogout', () => {
    it('online: everything is sent, nobody is asked, the logout goes on', async () => {
        await recordOffline();
        const confirm = jest.fn(() => Promise.resolve(false));
        await expect(settleTrackersBeforeLogout(UID, confirm, 1000)).resolves.toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        expect(await countUnsyncedTrackerRecords()).toBe(0);
        expect([...fakeFirestore.store.keys()].some((k) => k.startsWith('kickSessions/'))).toBe(true);
    });

    describe('offline (a Firestore write never resolves)', () => {
        beforeEach(async () => {
            await recordOffline();
            jest.spyOn(fakeFirestoreModule, 'setDoc').mockImplementation(() => new Promise(() => {}));
        });

        it('asks with the number of records that would be lost; "no" keeps her signed in', async () => {
            const confirm = jest.fn((_count: number) => Promise.resolve(false));
            await expect(settleTrackersBeforeLogout(UID, confirm, 20)).resolves.toBe(false);
            expect(confirm).toHaveBeenCalledTimes(1);
            expect(confirm).toHaveBeenCalledWith(4);
            // Nothing was dropped by asking.
            expect(await countUnsyncedTrackerRecords()).toBe(4);
        });

        it('"log out anyway" lets the logout go on', async () => {
            await expect(settleTrackersBeforeLogout(UID, () => Promise.resolve(true), 20)).resolves.toBe(true);
        });

        it('is bounded: it answers after the timeout instead of waiting for the network', async () => {
            const started = Date.now();
            await settleTrackersBeforeLogout(UID, () => Promise.resolve(true), 30);
            expect(Date.now() - started).toBeLessThan(1500);
        });

        it('with nobody to ask (logout after an unfinished deletion) it goes on, as before', async () => {
            await expect(settleTrackersBeforeLogout(UID, undefined, 20)).resolves.toBe(true);
        });
    });
});

/**
 * Round 4, states 55 and 57: without signal the warning said 1 record while the server
 * lacked 2 (a kick session and the bag), and said nothing at all for one unsent session.
 * The kick session had been marked synced by a listing answered from the cache. Here the
 * count is checked against what the server (`fakeFirestore.store`) really holds.
 */
describe('without signal, the warning counts every record the server does not have', () => {
    const firebaseMock = jest.requireMock('../../config/firebase') as { auth: { currentUser: { uid: string } | null } };
    const flush = async () => {
        for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    };
    const kickSession = async () => {
        await kicks.startSession();
        await kicks.recordKick();
        await kicks.endSession(UID);
    };
    /** Records on the device minus records on the server, the bag counting for one. */
    const serverLacks = async () => {
        const k = (await kicks.loadState()).history.length - fakeFirestore.docsIn('kickSessions').length;
        const c = (await contractions.loadState()).history.length - fakeFirestore.docsIn('contractions').length;
        const device = await bag.loadState();
        const ticks = Object.values(device.checked).filter(Boolean).length;
        const serverTicks = Object.keys(((fakeFirestore.store.get(`hospitalBags/${UID}`) as any)?.checked ?? {})).length;
        return k + c + (ticks !== serverTicks ? 1 : 0);
    };

    beforeEach(() => {
        firebaseMock.auth.currentUser = { uid: UID };
    });

    it('a kick session, two contractions and the bag, each screen reopened offline: 4 are announced', async () => {
        const initial = await bag.loadState(UID);
        fakeFirestore.disconnect();
        await kickSession();
        await contractions.startContraction();
        await contractions.stopContraction(UID);
        await contractions.startContraction();
        await contractions.stopContraction(UID);
        await bag.toggleItem(initial.items[0].id, UID);
        await flush();
        // Each screen lists again on focus; the cache answers with her own unsent writes.
        await kicks.loadState(UID);
        await contractions.loadState(UID);
        await bag.loadState(UID);
        await flush();

        expect(await serverLacks()).toBe(4);
        const confirm = jest.fn((_count: number) => Promise.resolve(false));
        await expect(settleTrackersBeforeLogout(UID, confirm, 20)).resolves.toBe(false);
        expect(confirm).toHaveBeenCalledWith(4);
    });

    it('one more session after everything else was synced: 1 is announced, not silence', async () => {
        await kickSession();
        await flush();
        expect(await countUnsyncedTrackerRecords()).toBe(0);

        fakeFirestore.disconnect();
        await kickSession();
        await flush();
        await kicks.loadState(UID);
        await flush();

        expect(await serverLacks()).toBe(1);
        const confirm = jest.fn((_count: number) => Promise.resolve(true));
        await expect(settleTrackersBeforeLogout(UID, confirm, 20)).resolves.toBe(true);
        expect(confirm).toHaveBeenCalledWith(1);
    });

    it('back online the same logout sends everything and asks nothing', async () => {
        fakeFirestore.disconnect();
        await kickSession();
        await flush();
        await kicks.loadState(UID);
        fakeFirestore.reconnect();
        const confirm = jest.fn((_count: number) => Promise.resolve(false));
        await expect(settleTrackersBeforeLogout(UID, confirm, 1000)).resolves.toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        expect(await serverLacks()).toBe(0);
    });
});

describe('wiring', () => {
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

    it('the shared logout passes the question, with the count, to logout()', () => {
        const hook = read('src/hooks/useConfirmedLogout.ts');
        expect(hook).toMatch(/await logout\(\{\s*confirmUnsyncedLoss:/);
        expect(hook).toMatch(/t\('profile\.logoutUnsyncedMsg', \{ n: count \}\)/);
        expect(hook).toMatch(/\(\) => resolve\(false\)/);
    });

    it('Profile and the onboarding header both sign out through that one hook (D-044)', () => {
        expect(read('src/screens/ProfileScreen.tsx')).toMatch(/const handleLogout = useConfirmedLogout\(\);/);
        const app = read('App.tsx');
        expect(app).toMatch(/const confirmedLogout = useConfirmedLogout\(\);/);
        expect(app).toMatch(/onPress=\{confirmedLogout\}/);
        expect(app).not.toMatch(/void logout\(\)/);
    });

    it('the question exists in the four languages and carries the count', () => {
        for (const lang of ['fr', 'en', 'ar', 'tn']) {
            const strings = JSON.parse(read(`src/i18n/locales/${lang}/profile.json`));
            expect(strings.logoutUnsyncedTitle).toBeTruthy();
            expect(strings.logoutAnyway).toBeTruthy();
            expect({ lang, hasCount: /\{\{n\}\}/.test(strings.logoutUnsyncedMsg) }).toEqual({ lang, hasCount: true });
        }
    });
});
