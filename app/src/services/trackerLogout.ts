/**
 * What happens to the kick sessions, contractions and hospital bag at logout.
 *
 * They are written to the device first and sent afterwards (see trackerSync), and a logout
 * wipes the device. Without signal the send never completes, so logging out erased the
 * unsent history with nothing said — the confirmation only asked "are you sure you want
 * to log out?". Now the logout tries to send first, and if records are still unsent it
 * says how many would be lost and lets her stay signed in.
 */
import { createLogger } from '../utils/logger';
import { countPendingSessions, pushPendingSessions } from './kickCounterService';
import { countPendingContractions, pushPendingContractions } from './contractionTimerService';
import { countPendingBag, pushPendingBag } from './hospitalBagService';
import { settleWithin } from './trackerSync';

const log = createLogger('TrackerLogout');

/** Long enough for a send on a working connection, short enough not to stall a logout. */
export const LOGOUT_FLUSH_TIMEOUT_MS = 3000;

/** Asked when records are still unsent: resolves true to log out anyway, false to stay. */
export type ConfirmUnsyncedLoss = (count: number) => Promise<boolean>;

/** Records on this device the server has not received. */
export const countUnsyncedTrackerRecords = async (): Promise<number> => {
    const counts = await Promise.all([countPendingSessions(), countPendingContractions(), countPendingBag()]);
    return counts.reduce((sum, n) => sum + n, 0);
};

/**
 * Try to send what is pending — bounded, a phone without signal must not hold the logout
 * hostage — then report whether the logout may wipe the device: true when everything is
 * on the server, or when she was told how many records would be lost and chose to go on.
 * Without a `confirm` (a logout nobody is there to answer, e.g. after an unfinished
 * account deletion) it goes ahead as before.
 */
export const settleTrackersBeforeLogout = async (
    uid: string,
    confirm?: ConfirmUnsyncedLoss,
    timeoutMs: number = LOGOUT_FLUSH_TIMEOUT_MS,
): Promise<boolean> => {
    await settleWithin(
        Promise.allSettled([pushPendingSessions(uid), pushPendingContractions(uid), pushPendingBag(uid)]),
        timeoutMs,
    );
    const unsynced = await countUnsyncedTrackerRecords().catch(() => 0);
    if (unsynced === 0) return true;
    log.warn(`Tracker records still unsent at logout: ${unsynced}`);
    return confirm ? confirm(unsynced) : true;
};
