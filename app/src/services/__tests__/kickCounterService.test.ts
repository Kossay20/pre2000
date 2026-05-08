import {
    __resetForTests,
    cancelSession,
    countInLastHour,
    countToday,
    endSession,
    loadState,
    recordKick,
    startSession,
} from '../kickCounterService';

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
});
