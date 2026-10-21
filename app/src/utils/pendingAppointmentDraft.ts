import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from './logger';

const log = createLogger('pendingAppointmentDraft');

const KEY = '@pending_appointment_draft';

/**
 * Draft of an appointment a GUEST tried to save.
 *
 * A guest could previously fill the whole "new appointment" form and only be
 * told at the very end that an account is required — and the typed data was
 * then thrown away, so after signing up they had to type everything again.
 * We stash the draft here before sending them to the account screen, and
 * restore it once they come back authenticated.
 */
export interface PendingAppointmentDraft {
    title: string;
    type: 'medical' | 'other';
    /** ISO string — AsyncStorage only stores strings. */
    date: string;
    location: string;
    notes: string;
    reminderJ1: boolean;
    reminderJ: boolean;
    reminderH2: boolean;
    /** Epoch ms, used to expire stale drafts. */
    savedAt: number;
}

/** Drafts older than this are ignored — an abandoned form shouldn't resurface days later. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const savePendingAppointmentDraft = async (
    draft: Omit<PendingAppointmentDraft, 'savedAt'>
): Promise<void> => {
    try {
        await AsyncStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
    } catch (e) {
        log.warn('Could not persist appointment draft:', e);
    }
};

export const loadPendingAppointmentDraft = async (): Promise<PendingAppointmentDraft | null> => {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!raw) return null;
        const draft = JSON.parse(raw) as PendingAppointmentDraft;
        if (!draft?.title || typeof draft.savedAt !== 'number') return null;
        if (Date.now() - draft.savedAt > MAX_AGE_MS) {
            await clearPendingAppointmentDraft();
            return null;
        }
        return draft;
    } catch (e) {
        log.warn('Could not read appointment draft:', e);
        return null;
    }
};

export const hasPendingAppointmentDraft = async (): Promise<boolean> =>
    (await loadPendingAppointmentDraft()) !== null;

export const clearPendingAppointmentDraft = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(KEY);
    } catch (e) {
        log.warn('Could not clear appointment draft:', e);
    }
};
