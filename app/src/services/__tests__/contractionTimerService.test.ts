import {
    __resetForTests,
    buildShareSummary,
    clearAll,
    computeStats,
    formatDuration,
    loadState,
    startContraction,
    stopContraction,
} from '../contractionTimerService';

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

describe('contractionTimerService', () => {
    beforeEach(async () => {
        await __resetForTests();
    });

    it('start then stop produces one history entry', async () => {
        await startContraction();
        const after = await stopContraction();
        expect(after.activeStartedAt).toBeNull();
        expect(after.history.length).toBe(1);
    });

    it('stop without start is a no-op', async () => {
        const after = await stopContraction();
        expect(after.activeStartedAt).toBeNull();
        expect(after.history.length).toBe(0);
    });

    it('computeStats returns zeros on empty', () => {
        const stats = computeStats([]);
        expect(stats.count).toBe(0);
        expect(stats.avgDurationMs).toBe(0);
        expect(stats.avgFrequencyMs).toBe(0);
    });

    it('computeStats computes avg duration and frequency', () => {
        const c1 = { id: '1', startedAt: 1_000, endedAt: 61_000 }; // 60s
        const c2 = { id: '2', startedAt: 301_000, endedAt: 361_000 }; // 60s, gap 300s
        const c3 = { id: '3', startedAt: 601_000, endedAt: 661_000 }; // 60s, gap 300s
        const stats = computeStats([c3, c2, c1]);
        expect(stats.count).toBe(3);
        expect(stats.avgDurationMs).toBe(60_000);
        expect(stats.avgFrequencyMs).toBe(300_000);
        expect(stats.lastFrequencyMs).toBe(300_000);
    });

    it('formatDuration formats m:ss', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(60_000)).toBe('1:00');
        expect(formatDuration(125_000)).toBe('2:05');
    });

    it('buildShareSummary contains count and durations (default EN labels)', () => {
        const c1 = { id: '1', startedAt: 0, endedAt: 60_000 };
        const summary = buildShareSummary(computeStats([c1]), [c1]);
        expect(summary).toContain('Contractions: 1');
        expect(summary).toContain('Avg duration: 1:00');
    });

    it('buildShareSummary respects custom localized labels', () => {
        const c1 = { id: '1', startedAt: 0, endedAt: 60_000 };
        const summary = buildShareSummary(computeStats([c1]), [c1], {
            contractionsLabel: 'Nombre',
            avgDurationLabel: 'Durée moy.',
            avgFrequencyLabel: 'Fréq. moy.',
        });
        expect(summary).toContain('Nombre: 1');
        expect(summary).toContain('Durée moy.: 1:00');
        expect(summary).not.toContain('Contractions:');
    });

    it('loadState drops a stale active contraction (>4h old)', async () => {
        // Manually plant a stale state (5h ago).
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        const AsyncStorage = require('@react-native-async-storage/async-storage');
        await AsyncStorage.setItem(
            'contraction_timer_v1',
            JSON.stringify({ activeStartedAt: fiveHoursAgo, history: [] }),
        );
        const reloaded = await loadState();
        expect(reloaded.activeStartedAt).toBeNull();
    });

    it('clearAll empties everything', async () => {
        await startContraction();
        await stopContraction();
        const after = await clearAll();
        expect(after.history.length).toBe(0);
        const reloaded = await loadState();
        expect(reloaded.history.length).toBe(0);
    });
});
