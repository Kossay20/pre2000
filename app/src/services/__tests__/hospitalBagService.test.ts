import {
    __resetForTests,
    addCustomItem,
    computeProgress,
    loadState,
    removeCustomItem,
    toggleItem,
} from '../hospitalBagService';

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

describe('hospitalBagService', () => {
    beforeEach(async () => {
        await __resetForTests();
    });

    it('seeds defaults on first load', async () => {
        const state = await loadState();
        expect(state.items.length).toBeGreaterThan(10);
        expect(state.checked).toEqual({});
    });

    it('toggles an item', async () => {
        const initial = await loadState();
        const id = initial.items[0].id;
        const after = await toggleItem(id);
        expect(after.checked[id]).toBe(true);
        const after2 = await toggleItem(id);
        expect(after2.checked[id]).toBe(false);
    });

    it('addCustomItem appends a custom item', async () => {
        const before = await loadState();
        const after = await addCustomItem('mom', 'Lunettes de lecture');
        expect(after.items.length).toBe(before.items.length + 1);
        const added = after.items[after.items.length - 1];
        expect(added.custom).toBe(true);
        expect(added.section).toBe('mom');
    });

    it('addCustomItem rejects empty labels', async () => {
        const before = await loadState();
        const after = await addCustomItem('mom', '   ');
        expect(after.items.length).toBe(before.items.length);
    });

    it('removeCustomItem deletes only custom items', async () => {
        const initial = await loadState();
        const defaultId = initial.items[0].id;
        const afterRemoveDefault = await removeCustomItem(defaultId);
        expect(afterRemoveDefault.items.find((i) => i.id === defaultId)).toBeDefined();

        const afterAdd = await addCustomItem('papers', 'Test custom');
        const customId = afterAdd.items[afterAdd.items.length - 1].id;
        const afterRemoveCustom = await removeCustomItem(customId);
        expect(afterRemoveCustom.items.find((i) => i.id === customId)).toBeUndefined();
    });

    it('computeProgress reports done/total', async () => {
        const initial = await loadState();
        const id = initial.items[0].id;
        await toggleItem(id);
        const after = await loadState();
        const { done, total } = computeProgress(after);
        expect(done).toBe(1);
        expect(total).toBe(after.items.length);
    });
});
