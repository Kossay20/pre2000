/**
 * Unit tests for bookmarkService (task 10b).
 *
 * Covers: toggleBookmark (add/remove + returned new-state + persistence),
 * isBookmarked (reflects toggles), getBookmarks (returns the saved set),
 * subscribeBookmarks (fires on toggle, unsubscribe stops it), hydration from a
 * pre-seeded store, and graceful handling of malformed stored JSON.
 *
 * Each test re-imports the module via jest.isolateModules so the module-level
 * in-memory cache starts empty, mirroring a fresh app launch.
 */

// ---- In-memory AsyncStorage mock -------------------------------------------
const store: Record<string, string> = {};
const asyncStorageClear = () => {
    for (const k of Object.keys(store)) delete store[k];
};
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn((key: string) =>
            Promise.resolve(Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        ),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value;
            return Promise.resolve();
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key];
            return Promise.resolve();
        }),
    },
}));

// ---- logger ----------------------------------------------------------------
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
};
jest.mock('../../utils/logger', () => ({
    createLogger: () => mockLogger,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@bookmarks_v1';

type BookmarkModule = typeof import('../bookmarkService');

/**
 * Load a fresh copy of the service so the module-level cache/listeners are
 * reset between tests (the cache hydrates once per module instance).
 */
const freshService = (): BookmarkModule => {
    let mod!: BookmarkModule;
    jest.isolateModules(() => {
        mod = require('../bookmarkService');
    });
    return mod;
};

beforeEach(() => {
    jest.clearAllMocks();
    asyncStorageClear();
});

describe('toggleBookmark', () => {
    it('adds a bookmark and returns true (new state = saved)', async () => {
        const svc = freshService();

        const result = await svc.toggleBookmark('article', 'a01');

        expect(result).toBe(true);
        expect(await svc.isBookmarked('article', 'a01')).toBe(true);
        // Persisted to storage as a flat Bookmark[] array
        const persisted = JSON.parse(store[STORAGE_KEY]);
        expect(persisted).toEqual([{ type: 'article', id: 'a01' }]);
    });

    it('removes a bookmark and returns false when toggled twice', async () => {
        const svc = freshService();

        await svc.toggleBookmark('supplement', 's01');
        const second = await svc.toggleBookmark('supplement', 's01');

        expect(second).toBe(false);
        expect(await svc.isBookmarked('supplement', 's01')).toBe(false);
        expect(JSON.parse(store[STORAGE_KEY])).toEqual([]);
    });

    it('keeps article and supplement of the same id independent', async () => {
        const svc = freshService();

        await svc.toggleBookmark('article', 'x1');
        await svc.toggleBookmark('supplement', 'x1');

        expect(await svc.isBookmarked('article', 'x1')).toBe(true);
        expect(await svc.isBookmarked('supplement', 'x1')).toBe(true);

        await svc.toggleBookmark('article', 'x1'); // remove only the article
        expect(await svc.isBookmarked('article', 'x1')).toBe(false);
        expect(await svc.isBookmarked('supplement', 'x1')).toBe(true);
    });

    it('returns false and does not persist for an empty id', async () => {
        const svc = freshService();

        const result = await svc.toggleBookmark('article', '');

        expect(result).toBe(false);
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
});

describe('isBookmarked', () => {
    it('returns false when nothing is saved', async () => {
        const svc = freshService();
        expect(await svc.isBookmarked('article', 'nope')).toBe(false);
    });

    it('reflects a pre-seeded store after hydration', async () => {
        store[STORAGE_KEY] = JSON.stringify([
            { type: 'article', id: 'seed-a' },
            { type: 'supplement', id: 'seed-s' },
        ]);
        const svc = freshService();

        expect(await svc.isBookmarked('article', 'seed-a')).toBe(true);
        expect(await svc.isBookmarked('supplement', 'seed-s')).toBe(true);
        expect(await svc.isBookmarked('article', 'seed-s')).toBe(false);
    });

    it('returns false for an empty id', async () => {
        const svc = freshService();
        expect(await svc.isBookmarked('article', '')).toBe(false);
    });
});

describe('getBookmarks', () => {
    it('returns the full set of saved bookmarks', async () => {
        const svc = freshService();

        await svc.toggleBookmark('article', 'a1');
        await svc.toggleBookmark('supplement', 's1');

        const all = await svc.getBookmarks();
        expect(all).toHaveLength(2);
        expect(all).toEqual(
            expect.arrayContaining([
                { type: 'article', id: 'a1' },
                { type: 'supplement', id: 's1' },
            ]),
        );
    });

    it('returns an empty array when storage is empty', async () => {
        const svc = freshService();
        expect(await svc.getBookmarks()).toEqual([]);
    });

    it('ignores malformed stored JSON and returns an empty set', async () => {
        store[STORAGE_KEY] = '{not valid json';
        const svc = freshService();

        expect(await svc.getBookmarks()).toEqual([]);
        expect(mockLogger.error).toHaveBeenCalledWith('Error loading bookmarks:', expect.any(Error));
    });
});

describe('subscribeBookmarks', () => {
    it('fires the listener after each toggle', async () => {
        const svc = freshService();
        const cb = jest.fn();
        svc.subscribeBookmarks(cb);

        await svc.toggleBookmark('article', 'a1');
        await svc.toggleBookmark('article', 'a1');

        expect(cb).toHaveBeenCalledTimes(2);
    });

    it('stops firing after unsubscribe', async () => {
        const svc = freshService();
        const cb = jest.fn();
        const unsubscribe = svc.subscribeBookmarks(cb);

        await svc.toggleBookmark('article', 'a1');
        unsubscribe();
        await svc.toggleBookmark('article', 'a1');

        expect(cb).toHaveBeenCalledTimes(1);
    });
});
