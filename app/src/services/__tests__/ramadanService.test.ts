import {
    __resetForTests,
    computeFidyaRemaining,
    computeMissedCount,
    decrementFidyaPaid,
    incrementFidyaPaid,
    loadState,
    logDay,
    removeDay,
    setConsultedDoctor,
} from '../ramadanService';

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

describe('ramadanService', () => {
    beforeEach(async () => {
        await __resetForTests();
    });

    it('logDay broken/skipped adds to daysToMakeUp', async () => {
        const after1 = await logDay('broken', '2026-03-15');
        expect(after1.daysToMakeUp.length).toBe(1);
        const after2 = await logDay('skipped', '2026-03-16');
        expect(after2.daysToMakeUp.length).toBe(2);
    });

    it("logDay 'fasted' is a no-op", async () => {
        const after = await logDay('fasted', '2026-03-15');
        expect(after.daysToMakeUp.length).toBe(0);
    });

    it('removeDay removes by id', async () => {
        const after = await logDay('broken', '2026-03-15');
        const id = after.daysToMakeUp[0].id;
        const after2 = await removeDay(id);
        expect(after2.daysToMakeUp.length).toBe(0);
    });

    it('Fidya counters never go below zero', async () => {
        const after = await decrementFidyaPaid();
        expect(after.fidyaPaidCount).toBe(0);
        await incrementFidyaPaid();
        await incrementFidyaPaid();
        const after2 = await decrementFidyaPaid();
        expect(after2.fidyaPaidCount).toBe(1);
    });

    it('computeFidyaRemaining = missed - paid, floored at 0', async () => {
        await logDay('broken', '2026-03-15');
        await logDay('broken', '2026-03-16');
        await incrementFidyaPaid();
        const state = await loadState();
        expect(computeMissedCount(state)).toBe(2);
        expect(computeFidyaRemaining(state)).toBe(1);
    });

    it('setConsultedDoctor toggles persistently', async () => {
        const after = await setConsultedDoctor(true);
        expect(after.consultedDoctor).toBe(true);
        const after2 = await setConsultedDoctor(false);
        expect(after2.consultedDoctor).toBe(false);
    });
});
