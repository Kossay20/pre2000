import * as Localization from 'expo-localization';

/**
 * The device's region setting (ISO 3166-1 alpha-2, e.g. 'FR', 'US'), or null
 * when the platform does not expose one. Read locally from the OS — no IP
 * lookup (see the C2 audit). It is what the user chose in her phone settings,
 * not where she is, so callers use it only when the profile has no country.
 */
export const getDeviceRegionCode = (): string | null => {
    try {
        return Localization.getLocales?.()[0]?.regionCode || null;
    } catch {
        return null;
    }
};
