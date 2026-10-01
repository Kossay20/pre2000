import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { createLogger } from '../utils/logger';
import defaultData from '../data/hospital_bag_default.json';
import { createSerialQueue } from './trackerSync';

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
    // Administrative papers are not the same everywhere: the wording for a profile
    // country ('tunisia', 'france'), over the neutral labels above.
    labels_by_country?: Record<string, Partial<Record<BagLabelKey, string>>>;
}

type BagLabelKey = 'label_fr' | 'label_en' | 'label_ar' | 'label_tn';

export interface HospitalBagState {
    items: HospitalBagItem[];
    checked: Record<string, boolean>;
    // When she last changed the list on this device (ms); absent while it is untouched
    // defaults. The server copy is one document, and the newer of the two wins.
    updatedAt?: number;
    // The server holds this version (see trackerSync).
    synced?: boolean;
}

const seedDefaults = (): HospitalBagItem[] =>
    (defaultData as HospitalBagItem[]).map((item) => ({ ...item, custom: false }));

const serial = createSerialQueue();

const LABEL_KEY: Record<string, BagLabelKey> = { fr: 'label_fr', ar: 'label_ar', tn: 'label_tn', en: 'label_en' };

// The profile stores the onboarding value ('tunisia', 'france', … — COUNTRY_OPTIONS);
// older profiles may hold an ISO code or the French name.
const BAG_COUNTRY: Record<string, string> = {
    tunisia: 'tunisia', tunisie: 'tunisia', tn: 'tunisia',
    france: 'france', fr: 'france',
};

/**
 * The label to show for an item, in `lang`, for the profile's country.
 *
 * The papers section listed "Carte d'identité (CIN)" and "Carte CNAM" — Tunisian
 * documents — to everyone, a user in France included. Those items now carry a neutral
 * label ("Pièce d'identité", "Carte d'assurance maladie") and a wording per country
 * (Tunisia: CIN, CNAM; France: carte Vitale et mutuelle); any other country, or none,
 * reads the neutral one. A default item is read from the list shipped with the app, not
 * from the copy stored on the device, which still holds the wording it was seeded with.
 */
export const bagItemLabel = (item: HospitalBagItem, lang: string, country?: string | null): string => {
    const source = item.custom
        ? item
        : (defaultData as HospitalBagItem[]).find((d) => d.id === item.id) ?? item;
    const key = LABEL_KEY[(lang || '').split('-')[0]] ?? 'label_en';
    const forCountry = source.labels_by_country?.[BAG_COUNTRY[(country ?? '').trim().toLowerCase()] ?? ''];
    const pick = (k: BagLabelKey) => forCountry?.[k] || source[k];
    return pick(key) || (key === 'label_tn' ? pick('label_ar') : '') || pick('label_en') || '';
};

// The device copy only. Callers inside `serial` use this; loadState() is the public read.
const readState = async (): Promise<HospitalBagState> => {
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

const SECTIONS: HospitalBagSection[] = ['mom', 'baby', 'papers', 'partner'];

// Only what she chose goes to the server: the ticks and her own items. The default list
// ships with the app.
const toServer = (uid: string, state: HospitalBagState) => ({
    user_id: uid,
    checked: Object.fromEntries(Object.entries(state.checked).filter(([, v]) => v === true)),
    customItems: state.items
        .filter((i) => i.custom)
        .map((i) => ({ id: i.id, section: i.section, label: i.label_fr })),
    updatedAt: state.updatedAt ?? Date.now(),
});

const fromServer = (d: Record<string, unknown>): HospitalBagState | null => {
    if (typeof d.updatedAt !== 'number' || typeof d.checked !== 'object' || d.checked === null) return null;
    const custom: HospitalBagItem[] = (Array.isArray(d.customItems) ? d.customItems : [])
        .filter((c: any) => typeof c?.id === 'string' && typeof c?.label === 'string' && SECTIONS.includes(c?.section))
        .map((c: any) => ({
            id: c.id,
            section: c.section,
            label_fr: c.label,
            label_en: c.label,
            label_ar: c.label,
            label_tn: c.label,
            custom: true,
        }));
    const checked: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(d.checked as Record<string, unknown>)) if (v === true) checked[k] = true;
    return { items: [...seedDefaults(), ...custom], checked, updatedAt: d.updatedAt, synced: true };
};

// A sync that finishes after she signed out must not write her list back onto the
// device the logout just wiped.
const isSignedInAs = (uid: string) => auth.currentUser?.uid === uid;

const bagDoc = (uid: string) => doc(db, 'hospitalBags', uid);

/** 1 when this device holds a version of the list the server does not have yet, else 0. */
export const countPendingBag = async (): Promise<number> => {
    const state = await serial(readState);
    return !state.synced && state.updatedAt !== undefined ? 1 : 0;
};

/** Send this device's version if the server does not have it yet. */
export const pushPendingBag = async (uid: string): Promise<void> => {
    const state = await serial(readState);
    if (state.synced || state.updatedAt === undefined) return;
    const sentVersion = state.updatedAt;
    await setDoc(bagDoc(uid), toServer(uid, state));
    await serial(async () => {
        const latest = await readState();
        if (!isSignedInAs(uid) || latest.updatedAt !== sentVersion) return;
        await saveState({ ...latest, synced: true });
    });
};

/**
 * Bring the device copy in line with the account: the newer of the two versions wins, so
 * a new phone (or this one after a logout) gets her list back, and an edit made here
 * offline goes up. Offline, the device copy is returned as it is.
 */
const syncWithServer = async (uid: string): Promise<HospitalBagState> => {
    let server: HospitalBagState | null;
    try {
        const snap = await getDoc(bagDoc(uid));
        if (snap.metadata?.fromCache) return serial(readState);
        server = snap.exists() ? fromServer(snap.data() as Record<string, unknown>) : null;
    } catch (error) {
        log.warn('Hospital bag: server unreachable, showing the copy on this device', error);
        return serial(readState);
    }
    const next = await serial(async () => {
        const local = await readState();
        if (!isSignedInAs(uid) || !server) return local;
        const localIsNewer = !local.synced && local.updatedAt !== undefined && local.updatedAt > (server.updatedAt ?? 0);
        if (localIsNewer) return local;
        await saveState(server);
        return server;
    });
    void pushPendingBag(uid).catch((error) => log.warn('Hospital bag sync failed', error));
    return next;
};

/** `uid` is the signed-in account whose copy to sync with; null/undefined for a guest. */
export const loadState = async (uid?: string | null): Promise<HospitalBagState> => {
    if (uid) return syncWithServer(uid);
    return serial(readState);
};

// Every edit is stamped and marked unsynced on the device first, then sent when there is
// an account. A guest's edits stay stamped, so they go up once she has one.
const edit = async (
    uid: string | null | undefined,
    change: (state: HospitalBagState) => HospitalBagState | null,
): Promise<HospitalBagState> => {
    const next = await serial(async () => {
        const state = await readState();
        const changed = change(state);
        if (!changed) return state;
        // Strictly increasing, even for two edits in the same millisecond: the stamp is
        // also how a finished send recognises that no newer edit happened meanwhile.
        const updatedAt = Math.max(Date.now(), (state.updatedAt ?? 0) + 1);
        const stamped: HospitalBagState = { ...changed, updatedAt, synced: false };
        await saveState(stamped);
        return stamped;
    });
    if (uid) void pushPendingBag(uid).catch((error) => log.warn('Hospital bag sync failed', error));
    return next;
};

export const toggleItem = async (id: string, uid?: string | null): Promise<HospitalBagState> =>
    edit(uid, (state) => ({
        ...state,
        checked: { ...state.checked, [id]: !state.checked[id] },
    }));

export const addCustomItem = async (
    section: HospitalBagSection,
    label: string,
    uid?: string | null,
): Promise<HospitalBagState> => {
    const trimmed = label.trim().slice(0, 80);
    if (!trimmed) {
        return loadState();
    }
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
    return edit(uid, (state) => ({
        ...state,
        items: [...state.items, item],
    }));
};

export const removeCustomItem = async (id: string, uid?: string | null): Promise<HospitalBagState> =>
    edit(uid, (state) => {
        const target = state.items.find((i) => i.id === id);
        if (!target || !target.custom) return null;
        const items = state.items.filter((i) => i.id !== id);
        const checked = { ...state.checked };
        delete checked[id];
        return { ...state, items, checked };
    });

export const computeProgress = (state: HospitalBagState): { done: number; total: number } => {
    const total = state.items.length;
    const done = state.items.filter((i) => state.checked[i.id]).length;
    return { done, total };
};

export const __resetForTests = async (): Promise<void> => {
    await AsyncStorage.removeItem(STORAGE_KEY);
};
