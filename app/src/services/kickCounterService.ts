import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSameDay } from 'date-fns';
import { createLogger } from '../utils/logger';

const log = createLogger('KickCounterService');
const STORAGE_KEY = 'kick_counter_v1';
const SESSION_WINDOW_MS = 60 * 60 * 1000;

export interface KickEvent {
    timestamp: number;
}

export interface KickSession {
    id: string;
    startedAt: number;
    endedAt: number | null;
    kicks: KickEvent[];
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

export const loadState = async (): Promise<KickCounterState> => {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        return json ? (JSON.parse(json) as KickCounterState) : DEFAULT_STATE;
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

export const startSession = async (): Promise<KickSession> => {
    const state = await loadState();
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
};

export const recordKick = async (): Promise<KickSession> => {
    const state = await loadState();
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
};

export const endSession = async (): Promise<KickCounterState> => {
    const state = await loadState();
    if (!state.activeSession) return state;
    const ended: KickSession = {
        ...state.activeSession,
        endedAt: Date.now(),
    };
    const next: KickCounterState = {
        activeSession: null,
        history: [ended, ...state.history].slice(0, 100),
    };
    await saveState(next);
    return next;
};

export const cancelSession = async (): Promise<KickCounterState> => {
    const state = await loadState();
    if (!state.activeSession) return state;
    const next: KickCounterState = { ...state, activeSession: null };
    await saveState(next);
    return next;
};

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
