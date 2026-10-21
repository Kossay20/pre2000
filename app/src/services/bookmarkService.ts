/**
 * bookmarkService — task 10b (bookmark/save MVP).
 *
 * Lets users save articles & supplements (guest-safe, AsyncStorage-only — no
 * Firestore, so it works offline and for anonymous users). Mirrors the
 * AsyncStorage + in-memory-cache pattern used by hydrationService /
 * dailyChecklistService.
 *
 * A bookmark is identified by a (type, id) pair. The on-disk shape is a flat
 * array under '@bookmarks_v1'; the in-memory cache is a Set of composite keys
 * ("article::a01") for O(1) membership and sync-ish reads after first hydration.
 *
 * Screens subscribe via subscribeBookmarks(cb) and re-read on each toggle so the
 * bookmark icon and the "Favoris" filter chip stay live across the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';

const log = createLogger('BookmarkService');
const STORAGE_KEY = '@bookmarks_v1';

export type BookmarkType = 'article' | 'supplement';

export interface Bookmark {
    type: BookmarkType;
    id: string;
}

// ── In-memory cache (Set of composite keys) ─────────────────────────────────
// Hydrated on first read so subsequent reads/membership checks are synchronous.
let cache: Set<string> | null = null;
let hydrationPromise: Promise<Set<string>> | null = null;

// ── Listeners (module-level) ────────────────────────────────────────────────
const listeners = new Set<() => void>();

const compositeKey = (type: BookmarkType, id: string): string => `${type}::${id}`;

const parseKey = (key: string): Bookmark | null => {
    const idx = key.indexOf('::');
    if (idx === -1) return null;
    const type = key.slice(0, idx);
    const id = key.slice(idx + 2);
    if ((type !== 'article' && type !== 'supplement') || !id) return null;
    return { type, id };
};

/** Notify all subscribers that the bookmark set changed. */
const notify = (): void => {
    listeners.forEach(cb => {
        try {
            cb();
        } catch (err) {
            log.error('Bookmark listener threw:', err);
        }
    });
};

/**
 * Subscribe to bookmark changes. The callback fires after every successful
 * toggle. Returns an unsubscribe function (call it in a useEffect cleanup).
 */
export const subscribeBookmarks = (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
};

/** Hydrate the in-memory cache from AsyncStorage (once). */
const hydrate = async (): Promise<Set<string>> => {
    if (cache) return cache;
    if (hydrationPromise) return hydrationPromise;

    hydrationPromise = (async () => {
        try {
            const json = await AsyncStorage.getItem(STORAGE_KEY);
            const parsed: unknown = json ? JSON.parse(json) : [];
            const next = new Set<string>();
            if (Array.isArray(parsed)) {
                for (const entry of parsed) {
                    if (
                        entry &&
                        typeof entry === 'object' &&
                        (entry.type === 'article' || entry.type === 'supplement') &&
                        typeof entry.id === 'string' &&
                        entry.id
                    ) {
                        next.add(compositeKey(entry.type, entry.id));
                    }
                }
            }
            cache = next;
            return next;
        } catch (err) {
            log.error('Error loading bookmarks:', err);
            cache = new Set<string>();
            return cache;
        } finally {
            hydrationPromise = null;
        }
    })();

    return hydrationPromise;
};

/** Persist the current cache to AsyncStorage as a flat Bookmark[] array. */
const persist = async (set: Set<string>): Promise<void> => {
    try {
        const list: Bookmark[] = [];
        for (const key of set) {
            const bm = parseKey(key);
            if (bm) list.push(bm);
        }
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
        log.error('Error saving bookmarks:', err);
    }
};

/** Return all bookmarks (hydrates the cache on first call). */
export const getBookmarks = async (): Promise<Bookmark[]> => {
    const set = await hydrate();
    const list: Bookmark[] = [];
    for (const key of set) {
        const bm = parseKey(key);
        if (bm) list.push(bm);
    }
    return list;
};

/** Whether (type, id) is currently bookmarked. */
export const isBookmarked = async (type: BookmarkType, id: string): Promise<boolean> => {
    if (!id) return false;
    const set = await hydrate();
    return set.has(compositeKey(type, id));
};

/**
 * Toggle a bookmark. Returns the NEW state (true = now saved, false = removed).
 * Fires subscribers after persisting.
 */
export const toggleBookmark = async (type: BookmarkType, id: string): Promise<boolean> => {
    if (!id) return false;
    const set = await hydrate();
    const key = compositeKey(type, id);

    let nowSaved: boolean;
    if (set.has(key)) {
        set.delete(key);
        nowSaved = false;
    } else {
        set.add(key);
        nowSaved = true;
    }

    cache = set;
    await persist(set);
    notify();
    return nowSaved;
};
