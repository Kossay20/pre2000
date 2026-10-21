import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { confirmAction } from '../utils/uiUtils';
import { createLogger } from '../utils/logger';

const log = createLogger('useConfirmedLogout');

/**
 * The one logout every entry point goes through (Profile, the onboarding header): ask
 * "are you sure", then let logout() flush what is unsent and, when records would still
 * be erased (kick sessions, contractions, the bag, no signal), say how many and let her
 * stay signed in. A bare `logout()` skipped both questions.
 */
export const useConfirmedLogout = (): (() => void) => {
    const { logout } = useAuth();
    const { t } = useTranslation();

    return useCallback(() => {
        confirmAction(
            t('profile.logoutConfirmTitle'),
            t('profile.logoutConfirmMsg'),
            async () => {
                try {
                    await logout({
                        confirmUnsyncedLoss: (count) => new Promise<boolean>((resolve) => confirmAction(
                            t('profile.logoutUnsyncedTitle'),
                            t('profile.logoutUnsyncedMsg', { n: count }),
                            () => resolve(true),
                            () => resolve(false),
                            t('common.cancel'),
                            t('profile.logoutAnyway'),
                        )),
                    });
                } catch (error) {
                    log.error('Logout error:', error);
                }
            },
            undefined,
            t('common.cancel'),
            t('profile.logout'),
        );
    }, [logout, t]);
};
