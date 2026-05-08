import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';
import defaultData from '../data/hospital_bag_default.json';

const log = createLogger('HospitalBagService');
const STORAGE_KEY = 'hospital_bag_v1';

export type HospitalBagSection = 'mom' | 'baby' | 'papers' | 'partner';

export interface HospitalBagItem {
    id: string;
    section: HospitalBagSection;
    label_fr: string;
    label_en: string;
    label_ar: string;
    label_tn: string;
    custom?: boolean;
    note?: string;
}

export interface HospitalBagState {
    items: HospitalBagItem[];
    checked: Record<string, boolean>;
}

const seedDefaults = (): HospitalBagItem[] =>
    (defaultData as HospitalBagItem[]).map((item) => ({ ...item, custom: false }));

export const loadState = async (): Promise<HospitalBagState> => {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (!json) {
            const seeded: HospitalBagState = { items: seedDefaults(), checked: {} };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
            return seeded;
        }
        const parsed = JSON.parse(json) as HospitalBagState;
        // Merge new defaults that may have shipped after first load.
        const known = new Set(parsed.items.map((i) => i.id));
        const additions = seedDefaults().filter((d) => !known.has(d.id));
        if (additions.length > 0) {
            const merged: HospitalBagState = {
                ...parsed,
                items: [...parsed.items, ...additions],
            };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            return merged;
        }
        return parsed;
    } catch (error) {
        log.error('Error loading hospital bag state:', error);
        return { items: seedDefaults(), checked: {} };
    }
};

const saveState = async (state: HospitalBagState): Promise<void> => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        log.error('Error saving hospital bag state:', error);
    }
};

export const toggleItem = async (id: string): Promise<HospitalBagState> => {
    const state = await loadState();
    const next: HospitalBagState = {
        ...state,
        checked: { ...state.checked, [id]: !state.checked[id] },
    };
    await saveState(next);
    return next;
};

export const addCustomItem = async (
    section: HospitalBagSection,
    label: string,
): Promise<HospitalBagState> => {
    const trimmed = label.trim().slice(0, 80);
    if (!trimmed) {
        return loadState();
    }
    const state = await loadState();
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const item: HospitalBagItem = {
        id,
        section,
        label_fr: trimmed,
        label_en: trimmed,
        label_ar: trimmed,
        label_tn: trimmed,
        custom: true,
    };
    const next: HospitalBagState = {
        items: [...state.items, item],
        checked: state.checked,
    };
    await saveState(next);
    return next;
};

export const removeCustomItem = async (id: string): Promise<HospitalBagState> => {
    const state = await loadState();
    const target = state.items.find((i) => i.id === id);
    if (!target || !target.custom) return state;
    const items = state.items.filter((i) => i.id !== id);
    const checked = { ...state.checked };
    delete checked[id];
    const next: HospitalBagState = { items, checked };
    await saveState(next);
    return next;
};

export const computeProgress = (state: HospitalBagState): { done: number; total: number } => {
    const total = state.items.length;
    const done = state.items.filter((i) => state.checked[i.id]).length;
    return { done, total };
};

export const __resetForTests = async (): Promise<void> => {
    await AsyncStorage.removeItem(STORAGE_KEY);
};
