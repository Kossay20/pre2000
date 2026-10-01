import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSameDay } from 'date-fns';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { createLogger } from '../utils/logger';
import { createSerialQueue, markSynced, mergeSyncedList, ownedDocId } from './trackerSync';

const log = createLogger('KickCounterService');
const STORAGE_KEY = 'kick_counter_v1';
const MAX_HISTORY = 100;
const SESSION_WINDOW_MS = 60 * 60 * 1000;
// Cycle 8.1 — guard: discard active sessions older than 4h (phone-locked-overnight)
const MAX_ACTIVE_AGE_MS = 4 * 60 * 60 * 1000;

export interface KickEvent {
    timestamp: number;
}

export interface KickSession {
    id: string;
    startedAt: number;
    endedAt: number | null;
    kicks: KickEvent[];
    // Set once the session is in Firestore (see trackerSync). Only ended sessions sync.
    synced?: boolean;
}

export interface KickCounterState {
    activeSession: KickSession | null;
    history: KickSession[];
}

const DEFAULT_STATE: KickCounterState = {
    activeSession: null,
    history: [],
};

const newSessionId = (): string =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const serial = createSerialQueue();

// The device copy only. Callers inside `serial` use this; loadState() is the public read.
const readState = async (): Promise<KickCounterState> => {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = json ? (JSON.parse(json) as KickCounterState) : DEFAULT_STATE;
        // Cycle 8.1 — drop a stale active session (e.g. phone locked > 4h with session open).
        if (parsed.activeSession && Date.now() - parsed.activeSession.startedAt > MAX_ACTIVE_AGE_MS) {
            const cleaned: KickCounterState = { ...parsed, activeSession: null };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
            return cleaned;
        }
        return parsed;
    } catch (error) {
        log.error('Error loading kick counter state:', error);
        return DEFAULT_STATE;
    }
};

const saveState = async (state: KickCounterState): Promise<void> => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        log.error('Error saving kick counter state:', error);
    }
};

const toServer = (uid: string, s: KickSession) => ({
    user_id: uid,
    id: s.id,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? s.startedAt,
    kicks: s.kicks.map((k) => k.timestamp),
});

const fromServer = (d: Record<string, unknown>): KickSession | null => {
    if (typeof d.id !== 'string' || typeof d.startedAt !== 'number' || typeof d.endedAt !== 'number') return null;
    const kicks = Array.isArray(d.kicks) ? d.kicks.filter((k): k is number => typeof k === 'number') : [];
    return { id: d.id, startedAt: d.startedAt, endedAt: d.endedAt, kicks: kicks.map((timestamp) => ({ timestamp })), synced: true };
};

const newestFirst = (a: KickSession, b: KickSession) => b.startedAt - a.startedAt;

// A sync that finishes after she signed out must not write her history back onto the
// device the logout just wiped.
const isSignedInAs = (uid: string) => auth.currentUser?.uid === uid;

/** Send every ended session the server does not have yet. Safe to repeat: ids are stable. */
export const pushPendingSessions = async (uid: string): Promise<void> => {
    const { history } = await serial(readState);
    const pending = history.filter((s) => !s.synced && s.endedAt !== null);
    if (pending.length === 0) return;
    const results = await Promise.allSettled(
        pending.map((s) => setDoc(doc(db, 'kickSessions', ownedDocId(uid, s.id)), toServer(uid, s))),
    );
    const sent = new Set(pending.filter((_, i) => results[i].status === 'fulfilled').map((s) => s.id));
    if (sent.size < pending.length) log.warn(`Kick sessions: ${pending.length - sent.size} not synced, retried on next open`);
    if (sent.size === 0) return;
    await serial(async () => {
        const state = await readState();
        if (!isSignedInAs(uid) || !state.history.some((s) => sent.has(s.id))) return;
        await saveState({ ...state, history: markSynced(state.history, sent) });
    });
};

/**
 * Bring the device copy in line with the account: sessions from the server (another phone,
 * or this one before a logout) are added, then anything recorded here goes up. Offline,
 * the device copy is returned as it is.
 */
const syncWithServer = async (uid: string): Promise<KickCounterState> => {
    let server: KickSession[];
    let authoritative: boolean;
    try {
        const snap = await getDocs(query(collection(db, 'kickSessions'), where('user_id', '==', uid)));
        server = snap.docs.map((d) => fromServer(d.data())).filter((s): s is KickSession => s !== null);
        authoritative = !snap.metadata?.fromCache;
    } catch (error) {
        log.warn('Kick history: server unreachable, showing the copy on this device', error);
        return serial(readState);
    }
    const merged = await serial(async () => {
        const local = await readState();
        if (!isSignedInAs(uid)) return local;
        const next: KickCounterState = {
            ...local,
            history: mergeSyncedList(local.history, server, authoritative).sort(newestFirst).slice(0, MAX_HISTORY),
        };
        await saveState(next);
        return next;
    });
    void pushPendingSessions(uid).catch((error) => log.warn('Kick sessions sync failed', error));
    return merged;
};

/** `uid` is the signed-in account whose copy to sync with; null/undefined for a guest. */
export const loadState = async (uid?: string | null): Promise<KickCounterState> => {
    if (uid) return syncWithServer(uid);
    return serial(readState);
};

export const startSession = async (): Promise<KickSession> =>
    serial(async () => {
        const state = await readState();
        if (state.activeSession) {
            return state.activeSession;
        }
        const session: KickSession = {
            id: newSessionId(),
            startedAt: Date.now(),
            endedAt: null,
            kicks: [],
        };
        await saveState({ ...state, activeSession: session });
        return session;
    });

export const recordKick = async (): Promise<KickSession> =>
    serial(async () => {
        const state = await readState();
        const now = Date.now();
        const active: KickSession =
            state.activeSession ?? {
                id: newSessionId(),
                startedAt: now,
                endedAt: null,
                kicks: [],
            };
        const updated: KickSession = {
            ...active,
            kicks: [...active.kicks, { timestamp: now }],
        };
        await saveState({ ...state, activeSession: updated });
        return updated;
    });

/** Ends the session on the device at once; with a `uid` it is then sent in the background. */
export const endSession = async (uid?: string | null): Promise<KickCounterState> => {
    const next = await serial(async () => {
        const state = await readState();
        if (!state.activeSession) return state;
        const ended: KickSession = {
            ...state.activeSession,
            endedAt: Date.now(),
        };
        const updated: KickCounterState = {
            activeSession: null,
            history: [ended, ...state.history].slice(0, MAX_HISTORY),
        };
        await saveState(updated);
        return updated;
    });
    if (uid) void pushPendingSessions(uid).catch((error) => log.warn('Kick sessions sync failed', error));
    return next;
};

// An active session never leaves the device, so discarding one has nothing to sync.
export const cancelSession = async (): Promise<KickCounterState> =>
    serial(async () => {
        const state = await readState();
        if (!state.activeSession) return state;
        const next: KickCounterState = { ...state, activeSession: null };
        await saveState(next);
        return next;
    });

/** i18n keys of the "discard this session?" dialog. */
export const CANCEL_SESSION_PROMPT = {
    title: 'cycle8.kickCounter.cancelConfirmTitle',
    message: 'cycle8.kickCounter.cancelConfirmMsg',
    keep: 'cycle8.kickCounter.keepCounting',
    discard: 'cycle8.kickCounter.discardSession',
} as const;

export const countInLastHour = (session: KickSession | null): number => {
    if (!session) return 0;
    const cutoff = Date.now() - SESSION_WINDOW_MS;
    return session.kicks.filter((k) => k.timestamp >= cutoff).length;
};

export const countToday = (history: KickSession[], active: KickSession | null): number => {
    const today = new Date();
    const sessionsToday = history.filter((s) => isSameDay(new Date(s.startedAt), today));
    const fromHistory = sessionsToday.reduce((sum, s) => sum + s.kicks.length, 0);
    const fromActive = active && isSameDay(new Date(active.startedAt), today) ? active.kicks.length : 0;
    return fromHistory + fromActive;
};

export const __resetForTests = async (): Promise<void> => {
    await AsyncStorage.removeItem(STORAGE_KEY);
};
