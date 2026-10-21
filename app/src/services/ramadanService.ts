import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';

const log = createLogger('RamadanService');
const STORAGE_KEY = 'ramadan_pregnancy_v1';

export type DayStatus = 'fasted' | 'broken' | 'skipped';

export interface MissedFastDay {
    id: string;
    dateISO: string;
    status: DayStatus;
    note?: string;
}

export interface RamadanState {
    daysToMakeUp: MissedFastDay[];
    fidyaPaidCount: number;
    consultedDoctor: boolean;
}

const DEFAULT_STATE: RamadanState = {
    daysToMakeUp: [],
    fidyaPaidCount: 0,
    consultedDoctor: false,
};

const newId = (): string =>
    `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const loadState = async (): Promise<RamadanState> => {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        return json ? (JSON.parse(json) as RamadanState) : DEFAULT_STATE;
    } catch (error) {
        log.error('Error loading ramadan state:', error);
        return DEFAULT_STATE;
    }
};

const saveState = async (state: RamadanState): Promise<void> => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        log.error('Error saving ramadan state:', error);
    }
};

export const logDay = async (
    status: DayStatus,
    dateISO: string,
    note?: string,
): Promise<RamadanState> => {
    const state = await loadState();
    if (status === 'fasted') {
        return state;
    }
    const day: MissedFastDay = { id: newId(), dateISO, status, note };
    const next: RamadanState = {
        ...state,
        daysToMakeUp: [day, ...state.daysToMakeUp].slice(0, 365),
    };
    await saveState(next);
    return next;
};

export const removeDay = async (id: string): Promise<RamadanState> => {
    const state = await loadState();
    const next: RamadanState = {
        ...state,
        daysToMakeUp: state.daysToMakeUp.filter((d) => d.id !== id),
    };
    await saveState(next);
    return next;
};

export const setConsultedDoctor = async (consulted: boolean): Promise<RamadanState> => {
    const state = await loadState();
    const next: RamadanState = { ...state, consultedDoctor: consulted };
    await saveState(next);
    return next;
};

export const incrementFidyaPaid = async (): Promise<RamadanState> => {
    const state = await loadState();
    const next: RamadanState = { ...state, fidyaPaidCount: state.fidyaPaidCount + 1 };
    await saveState(next);
    return next;
};

export const decrementFidyaPaid = async (): Promise<RamadanState> => {
    const state = await loadState();
    const next: RamadanState = {
        ...state,
        fidyaPaidCount: Math.max(0, state.fidyaPaidCount - 1),
    };
    await saveState(next);
    return next;
};

export const computeMissedCount = (state: RamadanState): number =>
    state.daysToMakeUp.length;

export const computeFidyaRemaining = (state: RamadanState): number =>
    Math.max(0, state.daysToMakeUp.length - state.fidyaPaidCount);

export const __resetForTests = async (): Promise<void> => {
    await AsyncStorage.removeItem(STORAGE_KEY);
};
