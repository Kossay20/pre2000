import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { createLogger } from '../utils/logger';
import { createSerialQueue, markSynced, mergeSyncedList, ownedDocId } from './trackerSync';

const log = createLogger('ContractionTimerService');
const STORAGE_KEY = 'contraction_timer_v1';
const MAX_HISTORY = 200;
// Cycle 8.1 — guard: discard an "active" contraction older than 4h.
// A real contraction is < 2 min ; > 4h means the phone was locked, not labour.
const MAX_ACTIVE_AGE_MS = 4 * 60 * 60 * 1000;

export interface Contraction {
    id: string;
    startedAt: number;
    endedAt: number;
    // Set once the contraction is in Firestore (see trackerSync).
    synced?: boolean;
}

export interface ContractionTimerState {
    activeStartedAt: number | null;
    history: Contraction[];
    // "Tout effacer" pressed while the server could not be reached: everything that
    // started at or before this instant is still to be deleted there. Until it is, the
    // server's copies are ignored so a cleared list does not come back.
    pendingClearBefore?: number | null;
}

const DEFAULT_STATE: ContractionTimerState = {
    activeStartedAt: null,
    history: [],
};

const newId = (): string =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const serial = createSerialQueue();

// The device copy only. Callers inside `serial` use this; loadState() is the public read.
const readState = async (): Promise<ContractionTimerState> => {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = json ? (JSON.parse(json) as ContractionTimerState) : DEFAULT_STATE;
        if (parsed.activeStartedAt !== null && Date.now() - parsed.activeStartedAt > MAX_ACTIVE_AGE_MS) {
            const cleaned: ContractionTimerState = { ...parsed, activeStartedAt: null };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
            return cleaned;
        }
        return parsed;
    } catch (error) {
        log.error('Error loading contraction timer state:', error);
        return DEFAULT_STATE;
    }
};

const saveState = async (state: ContractionTimerState): Promise<void> => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        log.error('Error saving contraction timer state:', error);
    }
};

const toServer = (uid: string, c: Contraction) => ({
    user_id: uid,
    id: c.id,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
});

const fromServer = (d: Record<string, unknown>): Contraction | null => {
    if (typeof d.id !== 'string' || typeof d.startedAt !== 'number' || typeof d.endedAt !== 'number') return null;
    return { id: d.id, startedAt: d.startedAt, endedAt: d.endedAt, synced: true };
};

const newestFirst = (a: Contraction, b: Contraction) => b.startedAt - a.startedAt;

// A sync that finishes after she signed out must not write her history back onto the
// device the logout just wiped.
const isSignedInAs = (uid: string) => auth.currentUser?.uid === uid;

const listServer = async (uid: string) => {
    const snap = await getDocs(query(collection(db, 'contractions'), where('user_id', '==', uid)));
    return { snap, authoritative: !snap.metadata?.fromCache };
};

/** Delete on the server what a "clear all" removed here, then forget the pending clear. */
const flushPendingClear = async (uid: string, clearBefore: number): Promise<void> => {
    const { snap } = await listServer(uid);
    const stale = snap.docs.filter((d) => {
        const started = (d.data() as Record<string, unknown>).startedAt;
        return typeof started !== 'number' || started <= clearBefore;
    });
    for (let i = 0; i < stale.length; i += 400) {
        const batch = writeBatch(db);
        stale.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
    await serial(async () => {
        const state = await readState();
        if (!isSignedInAs(uid) || state.pendingClearBefore !== clearBefore) return;
        await saveState({ ...state, pendingClearBefore: null });
    });
};

/** Send every contraction the server does not have yet. Safe to repeat: ids are stable. */
export const pushPendingContractions = async (uid: string): Promise<void> => {
    const { history } = await serial(readState);
    const pending = history.filter((c) => !c.synced);
    if (pending.length === 0) return;
    const results = await Promise.allSettled(
        pending.map((c) => setDoc(doc(db, 'contractions', ownedDocId(uid, c.id)), toServer(uid, c))),
    );
    const sent = new Set(pending.filter((_, i) => results[i].status === 'fulfilled').map((c) => c.id));
    if (sent.size < pending.length) log.warn(`Contractions: ${pending.length - sent.size} not synced, retried on next open`);
    if (sent.size === 0) return;
    await serial(async () => {
        const state = await readState();
        if (!isSignedInAs(uid) || !state.history.some((c) => sent.has(c.id))) return;
        await saveState({ ...state, history: markSynced(state.history, sent) });
    });
};

const syncInBackground = (uid: string) => {
    void (async () => {
        const { pendingClearBefore } = await serial(readState);
        if (pendingClearBefore) await flushPendingClear(uid, pendingClearBefore);
        await pushPendingContractions(uid);
    })().catch((error) => log.warn('Contractions sync failed', error));
};

/**
 * Bring the device copy in line with the account (see trackerSync). Offline, the device
 * copy is returned as it is.
 */
const syncWithServer = async (uid: string): Promise<ContractionTimerState> => {
    let server: Contraction[];
    let authoritative: boolean;
    try {
        const listed = await listServer(uid);
        server = listed.snap.docs.map((d) => fromServer(d.data())).filter((c): c is Contraction => c !== null);
        authoritative = listed.authoritative;
    } catch (error) {
        log.warn('Contraction history: server unreachable, showing the copy on this device', error);
        return serial(readState);
    }
    const merged = await serial(async () => {
        const local = await readState();
        if (!isSignedInAs(uid)) return local;
        const clearBefore = local.pendingClearBefore;
        const visible = clearBefore ? server.filter((c) => c.startedAt > clearBefore) : server;
        const next: ContractionTimerState = {
            ...local,
            history: mergeSyncedList(local.history, visible, authoritative).sort(newestFirst).slice(0, MAX_HISTORY),
        };
        await saveState(next);
        return next;
    });
    syncInBackground(uid);
    return merged;
};

/** `uid` is the signed-in account whose copy to sync with; null/undefined for a guest. */
export const loadState = async (uid?: string | null): Promise<ContractionTimerState> => {
    if (uid) return syncWithServer(uid);
    return serial(readState);
};

export const startContraction = async (): Promise<ContractionTimerState> =>
    serial(async () => {
        const state = await readState();
        if (state.activeStartedAt !== null) return state;
        const next: ContractionTimerState = { ...state, activeStartedAt: Date.now() };
        await saveState(next);
        return next;
    });

/** Records the contraction on the device at once; with a `uid` it is then sent in the background. */
export const stopContraction = async (uid?: string | null): Promise<ContractionTimerState> => {
    const next = await serial(async () => {
        const state = await readState();
        if (state.activeStartedAt === null) return state;
        const ended = Date.now();
        const contraction: Contraction = {
            id: newId(),
            startedAt: state.activeStartedAt,
            endedAt: ended,
        };
        const updated: ContractionTimerState = {
            ...state,
            activeStartedAt: null,
            history: [contraction, ...state.history].slice(0, MAX_HISTORY),
        };
        await saveState(updated);
        return updated;
    });
    if (uid) syncInBackground(uid);
    return next;
};

/** Clears the device at once; with a `uid` the server copies are deleted in the background. */
export const clearAll = async (uid?: string | null): Promise<ContractionTimerState> => {
    const next: ContractionTimerState = uid
        ? { ...DEFAULT_STATE, pendingClearBefore: Date.now() }
        : DEFAULT_STATE;
    await serial(() => saveState(next));
    if (uid) syncInBackground(uid);
    return next;
};

export interface ContractionStats {
    count: number;
    avgDurationMs: number;
    avgFrequencyMs: number;
    lastDurationMs: number;
    lastFrequencyMs: number;
}

export const computeStats = (history: Contraction[]): ContractionStats => {
    if (history.length === 0) {
        return {
            count: 0,
            avgDurationMs: 0,
            avgFrequencyMs: 0,
            lastDurationMs: 0,
            lastFrequencyMs: 0,
        };
    }
    const ordered = [...history].sort((a, b) => a.startedAt - b.startedAt);
    const durations = ordered.map((c) => c.endedAt - c.startedAt);
    const totalDuration = durations.reduce((s, d) => s + d, 0);
    const avgDurationMs = totalDuration / durations.length;

    let avgFrequencyMs = 0;
    let lastFrequencyMs = 0;
    if (ordered.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < ordered.length; i++) {
            gaps.push(ordered[i].startedAt - ordered[i - 1].startedAt);
        }
        avgFrequencyMs = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        lastFrequencyMs = gaps[gaps.length - 1];
    }

    return {
        count: ordered.length,
        avgDurationMs,
        avgFrequencyMs,
        lastDurationMs: durations[durations.length - 1],
        lastFrequencyMs,
        };
};

export const formatDuration = (ms: number): string => {
    if (!ms || ms < 0) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export interface ShareSummaryLabels {
    contractionsLabel: string;
    avgDurationLabel: string;
    avgFrequencyLabel: string;
}

const DEFAULT_SHARE_LABELS: ShareSummaryLabels = {
    contractionsLabel: 'Contractions',
    avgDurationLabel: 'Avg duration',
    avgFrequencyLabel: 'Avg interval',
};

export const buildShareSummary = (
    stats: ContractionStats,
    history: Contraction[],
    labels: ShareSummaryLabels = DEFAULT_SHARE_LABELS,
): string => {
    const lines: string[] = [];
    lines.push(`${labels.contractionsLabel}: ${stats.count}`);
    lines.push(`${labels.avgDurationLabel}: ${formatDuration(stats.avgDurationMs)}`);
    lines.push(`${labels.avgFrequencyLabel}: ${formatDuration(stats.avgFrequencyMs)}`);
    lines.push('');
    const last10 = [...history].slice(0, 10);
    last10.forEach((c, i) => {
        const dur = formatDuration(c.endedAt - c.startedAt);
        lines.push(`#${i + 1}  start=${new Date(c.startedAt).toISOString()}  dur=${dur}`);
    });
    return lines.join('\n');
};

export const __resetForTests = async (): Promise<void> => {
    await AsyncStorage.removeItem(STORAGE_KEY);
};
