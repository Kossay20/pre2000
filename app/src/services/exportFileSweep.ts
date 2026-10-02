import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { createLogger } from '../utils/logger';

const log = createLogger('ExportFileSweep');

/** Prefix of the temporary JSON export written to the cache (dataExportService). */
export const EXPORT_FILE_PREFIX = 'mama-bebe-export-';

/**
 * Remove any export file still in the cache — one left by a crash between the write and the
 * delete in exportUserData. The local wipe (logout / reset / deletion) calls it: the file is
 * her whole record in plain text and must not outlive her account on the device.
 * Kept apart from dataExportService so the wipe does not load every service the export reads.
 */
export const sweepExportFiles = async (): Promise<void> => {
    const dir = FileSystem.cacheDirectory;
    if (Platform.OS === 'web' || !dir) return;
    try {
        const names = await FileSystem.readDirectoryAsync(dir);
        await Promise.all(
            names
                .filter((name) => name.startsWith(EXPORT_FILE_PREFIX))
                .map((name) => FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true })),
        );
    } catch (e) {
        log.warn('Could not sweep the export cache', e);
    }
};
