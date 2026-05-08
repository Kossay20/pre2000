import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';

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
}

export interface ContractionTimerState {
    activeStartedAt: number | null;
    history: Contraction[];
}

const DEFAULT_STATE: ContractionTimerState = {
    activeStartedAt: null,
    history: [],
};

const newId = (): string =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const loadState = async (): Promise<ContractionTimerState> => {
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

export const startContraction = async (): Promise<ContractionTimerState> => {
    const state = await loadState();
    if (state.activeStartedAt !== null) return state;
    const next: ContractionTimerState = { ...state, activeStartedAt: Date.now() };
    await saveState(next);
    return next;
};

export const stopContraction = async (): Promise<ContractionTimerState> => {
    const state = await loadState();
    if (state.activeStartedAt === null) return state;
    const ended = Date.now();
    const contraction: Contraction = {
        id: newId(),
        startedAt: state.activeStartedAt,
        endedAt: ended,
    };
    const next: ContractionTimerState = {
        activeStartedAt: null,
        history: [contraction, ...state.history].slice(0, MAX_HISTORY),
    };
    await saveState(next);
    return next;
};

export const clearAll = async (): Promise<ContractionTimerState> => {
    await saveState(DEFAULT_STATE);
    return DEFAULT_STATE;
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
