/**
 * Everything this device holds for the signed-in (or guest) user: scheduled notifications,
 * every private AsyncStorage key (localStorage on web) and the in-memory content cache.
 *
 * Logout, "Reset profile" / guest "Erase my data" and account deletion used to repeat these
 * steps inline in AuthContext. One function means an erase cannot quietly skip a step that
 * the others take, and it can be tested without loading the Provider (localWipe.test.ts).
 *
 * Deliberately left alone: 'app_locale' (a device preference) and the other device-level
 * keys listed in storageKeys.test.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRIVATE_STORAGE_KEYS, PRIVATE_STORAGE_KEY_PREFIXES } from './storageKeys';
import { cancelAllNotifications } from '../services/notificationService';
import { clearContentCache } from '../services/contentService';
import { sweepExportFiles } from '../services/exportFileSweep';
import { createLogger } from '../utils/logger';

const log = createLogger('localWipe');

// Keys with a dynamic suffix (e.g. `@weight_entries_${uid}`) cannot be listed statically,
// so they are found by prefix.
const purgeDynamicPrivateKeys = async () => {
    try {
        const all = await AsyncStorage.getAllKeys();
        const toRemove = all.filter(k =>
            PRIVATE_STORAGE_KEY_PREFIXES.some(prefix => k.startsWith(prefix))
        );
        if (toRemove.length > 0) {
            await AsyncStorage.multiRemove(toRemove);
            log.debug(`Purged ${toRemove.length} dynamic private keys`);
        }
    } catch (e) {
        log.warn('Failed to purge dynamic private keys:', e);
    }
};

export const wipeLocalUserData = async (): Promise<void> => {
    // Reminders already scheduled would otherwise keep firing for the erased profile.
    try {
        await cancelAllNotifications();
    } catch (err) {
        log.warn('Failed to cancel notifications:', err);
    }
    await AsyncStorage.multiRemove([...PRIVATE_STORAGE_KEYS]);
    await purgeDynamicPrivateKeys();
    clearContentCache();
    // A JSON export left in the cache by a crash is her whole record in plain text.
    try {
        await sweepExportFiles();
    } catch (err) {
        log.warn('Failed to sweep export files:', err);
    }
};
