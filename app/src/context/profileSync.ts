/**
 * Profile write contract shared by AuthContext, PregnancyContext and ProfileScreen, kept in a
 * plain .ts module so it can be unit-tested without loading the Providers (their JSX trips
 * ts-jest under the Expo tsconfig — see loginHelpers.ts).
 */
import { deleteField } from 'firebase/firestore';
import type { EmergencyContact, UserProfile } from '../types';

// Recomputed or derived on the device; never written to userProfiles.
const CLIENT_ONLY_FIELDS = new Set(['isGuest', 'uid', 'currentWeek']);

/**
 * Split a profile edit into the profile the device keeps and the payload the server gets.
 *
 * A key passed with `undefined` means the user emptied that field ("Nom" cleared on the
 * Profile screen). Firestore rejects `undefined` outright — the whole write failed while the
 * screen said "Succès" — so the server receives deleteField() for it and the local copy drops
 * the key, and both sides agree the field is gone.
 */
export const splitProfileUpdate = (
    current: UserProfile,
    data: Partial<UserProfile>,
    clearSentinel: () => unknown = deleteField,
): { local: UserProfile; server: Record<string, unknown> } => {
    const local: Record<string, unknown> = { ...current };
    const server: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) delete local[key];
        else local[key] = value;
        if (CLIENT_ONLY_FIELDS.has(key)) continue;
        server[key] = value === undefined ? clearSentinel() : value;
    }
    return { local: local as unknown as UserProfile, server };
};

export type ProfileUpdateResult = { ok: true; profile: UserProfile } | { ok: false; error: string };

/**
 * Server first, device second. The device used to be written first and kept even when the
 * server refused, so the app showed (and cached) an edit the account never received, and a
 * fresh sign-in brought the old value back. Now a refused write changes nothing locally.
 *
 * `writeServer` is null when there is no server copy (a guest). `isStillCurrent` is checked
 * after the server round trip: a logout that happened meanwhile has wiped the device, and
 * writing the profile back would resurrect the signed-out user on the next launch.
 */
export const commitProfileUpdate = async ({
    current,
    data,
    writeServer,
    writeLocal,
    isStillCurrent,
    clearSentinel,
}: {
    current: UserProfile;
    data: Partial<UserProfile>;
    writeServer: ((payload: Record<string, unknown>) => Promise<void>) | null;
    writeLocal: (profile: UserProfile) => Promise<void>;
    isStillCurrent: () => boolean;
    clearSentinel?: () => unknown;
}): Promise<ProfileUpdateResult> => {
    const { local, server } = splitProfileUpdate(current, data, clearSentinel);
    if (writeServer && Object.keys(server).length > 0) {
        try {
            await writeServer({ ...server, updatedAt: new Date().toISOString() });
        } catch (error: any) {
            const message = typeof error?.message === 'string' && error.message.length > 0
                ? error.message
                : 'Cloud sync failed';
            return { ok: false, error: message };
        }
    }
    if (!isStillCurrent()) return { ok: false, error: 'SESSION_ENDED' };
    try {
        await writeLocal(local);
    } catch (error: any) {
        // With a server copy the edit is saved and the next launch re-reads it; a guest has
        // nothing but this device, so for her the save failed.
        if (!writeServer) return { ok: false, error: error?.message || 'Local save failed' };
    }
    return { ok: true, profile: local };
};

/**
 * One counter per sign-in session. Logout, reset and deletion end the session before they
 * sign out and wipe the device; every async path that installs a profile (the auth listener's
 * Firestore read, login, a profile save) takes a token first and drops its result when the
 * session it started in has ended. Without it, a read still in flight when the user tapped
 * "Se déconnecter" landed after the wipe and put her back in the app.
 */
export const createSessionEpoch = () => {
    let epoch = 0;
    return {
        current: () => epoch,
        isCurrent: (token: number) => token === epoch,
        end: () => {
            epoch += 1;
        },
    };
};

export type SessionEpoch = ReturnType<typeof createSessionEpoch>;

/** Install a freshly loaded profile only if the session that asked for it is still open. */
export const installSessionProfile = async (
    isStillCurrent: () => boolean,
    profile: UserProfile,
    setUser: (p: UserProfile) => void,
    persist: (p: UserProfile) => Promise<void>,
): Promise<boolean> => {
    if (!isStillCurrent()) return false;
    setUser(profile);
    await persist(profile);
    return true;
};

type GuestLocalProfile = {
    height?: number;
    prePregnancyWeight?: number;
    emergencyContacts?: EmergencyContact[];
};

/**
 * Fields a guest keeps only in the 'guestProfile' entry (WeightTracker setup, emergency
 * contacts), returned where the auth-side profile lacks them. Used on reload (so a guest's
 * contacts do not vanish) and on upgrade (so they reach the new account's server profile).
 */
export const guestLocalFields = (
    base: Partial<UserProfile>,
    stored: GuestLocalProfile | null | undefined,
): GuestLocalProfile => {
    const out: GuestLocalProfile = {};
    if (!stored) return out;
    if (base.height === undefined && typeof stored.height === 'number') out.height = stored.height;
    if (base.prePregnancyWeight === undefined && typeof stored.prePregnancyWeight === 'number') {
        out.prePregnancyWeight = stored.prePregnancyWeight;
    }
    if (base.emergencyContacts === undefined && Array.isArray(stored.emergencyContacts)) {
        out.emergencyContacts = stored.emergencyContacts;
    }
    return out;
};

type ProfileFormFields = {
    firstName?: string;
    lastName?: string;
    country?: string;
    lmp?: string;
    height?: number;
    prePregnancyWeight?: number;
};

const FORM_FIELDS: (keyof ProfileFormFields)[] = ['firstName', 'lastName', 'country', 'lmp', 'height', 'prePregnancyWeight'];

/**
 * The Profile form fields whose stored value changed between two profile snapshots. The
 * form re-syncs only those: adding an emergency contact publishes a new profile object, and
 * re-syncing every field wiped the first name she was typing.
 */
export const changedFormFields = (
    prev: ProfileFormFields | null | undefined,
    next: ProfileFormFields,
): (keyof ProfileFormFields)[] => FORM_FIELDS.filter((key) => !prev || prev[key] !== next[key]);

export const SUPPORTED_LOCALES = ['fr', 'ar', 'tn', 'en'] as const;

/**
 * The language to switch to when an account signs in on this device: the one saved on the
 * account, if it is a language the app ships and differs from the current one.
 */
export const accountLocaleToApply = (serverLocale: unknown, currentLanguage: string | undefined): string | null => {
    if (typeof serverLocale !== 'string') return null;
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(serverLocale)) return null;
    return serverLocale === currentLanguage ? null : serverLocale;
};
