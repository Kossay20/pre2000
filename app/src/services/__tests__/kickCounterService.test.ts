import {
    __resetForTests,
    cancelSession,
    countInLastHour,
    countToday,
    endSession,
    idleSessionPrompt,
    loadState,
    recordKick,
    startSession,
} from '../kickCounterService';

// The service syncs signed-in history to Firestore; these tests cover the device side
// (no uid), and trackerHistorySync.test.ts the server side.
jest.mock('../../config/firebase', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => require('../../testing/fakeFirestore').fakeFirestoreModule);

jest.mock('@react-native-async-storage/async-storage', () => {
    const store: Record<string, string> = {};
    return {
        getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
        setItem: jest.fn((k: string, v: string) => {
            store[k] = v;
            return Promise.resolve();
        }),
        removeItem: jest.fn((k: string) => {
            delete store[k];
            return Promise.resolve();
        }),
    };
});

describe('kickCounterService', () => {
    beforeEach(async () => {
        await __resetForTests();
    });

    it('starts a session and records kicks', async () => {
        await startSession();
        await recordKick();
        await recordKick();
        const state = await loadState();
        expect(state.activeSession).not.toBeNull();
        expect(state.activeSession?.kicks.length).toBe(2);
    });

    it('endSession moves the active session to history', async () => {
        await startSession();
        await recordKick();
        const after = await endSession();
        expect(after.activeSession).toBeNull();
        expect(after.history.length).toBe(1);
        expect(after.history[0].kicks.length).toBe(1);
    });

    it('cancelSession discards the active session without saving to history', async () => {
        await startSession();
        await recordKick();
        const after = await cancelSession();
        expect(after.activeSession).toBeNull();
        expect(after.history.length).toBe(0);
    });

    it('countInLastHour ignores kicks older than 1h', () => {
        const now = Date.now();
        const session = {
            id: 's',
            startedAt: now - 7200_000,
            endedAt: null,
            kicks: [
                { timestamp: now - 7200_000 }, // 2h ago
                { timestamp: now - 5400_000 }, // 1.5h ago
                { timestamp: now - 1800_000 }, // 30 min ago
                { timestamp: now - 60_000 }, // 1 min ago
            ],
        };
        expect(countInLastHour(session)).toBe(2);
    });

    it('loadState drops a stale active session (>4h old)', async () => {
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        const AsyncStorage = require('@react-native-async-storage/async-storage');
        await AsyncStorage.setItem(
            'kick_counter_v1',
            JSON.stringify({
                activeSession: {
                    id: 'stale',
                    startedAt: fiveHoursAgo,
                    endedAt: null,
                    kicks: [{ timestamp: fiveHoursAgo }],
                },
                history: [],
            }),
        );
        const reloaded = await loadState();
        expect(reloaded.activeSession).toBeNull();
    });

    it('countToday sums history + active for today only', async () => {
        const today = Date.now();
        const yesterday = today - 24 * 3600_000;
        const history = [
            { id: 'h1', startedAt: yesterday, endedAt: yesterday + 1000, kicks: [{ timestamp: yesterday }] },
            { id: 'h2', startedAt: today, endedAt: today + 1000, kicks: [{ timestamp: today }, { timestamp: today }] },
        ];
        const active = { id: 'a', startedAt: today, endedAt: null, kicks: [{ timestamp: today }] };
        expect(countToday(history, active)).toBe(3);
        expect(countToday(history, null)).toBe(2);
    });

    it('says "no session yet" only before the first session', () => {
        expect(idleSessionPrompt(0).title).toBe('cycle8.kickCounter.noSessionYet');
        const afterOne = idleSessionPrompt(1);
        expect(afterOne.title).toBe('cycle8.kickCounter.nextSessionTitle');
        expect(afterOne.action).toBe('cycle8.kickCounter.newSession');
        for (const lang of ['fr', 'en', 'ar', 'tn']) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const kick = require(`../../i18n/locales/${lang}/cycle8.json`).kickCounter;
            for (const key of Object.values(afterOne)) {
                expect(kick[key.split('.').pop() as string]).toBeTruthy();
            }
        }
    });
});
