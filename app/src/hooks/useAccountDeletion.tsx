import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { classifyDeletionFailure } from '../context/accountDeletion';
import { showAlert } from '../utils/alert';
import { confirmAction } from '../utils/uiUtils';
import { getFirebaseErrorMessage, isUserInputError } from '../utils/firebaseErrors';
import { ReauthDeleteModal } from '../components/profile/ReauthDeleteModal';
import { createLogger } from '../utils/logger';

const log = createLogger('useAccountDeletion');

/**
 * The confirm → deleteAccount → reauthenticate flow, and the guest "erase my data" reset,
 * shared by Profile (danger zone) and Settings (Data & Privacy) so the two entry points
 * the privacy policy names can never drift apart.
 *
 * No navigation on success: clearing the user in AuthContext swaps the navigator to
 * AuthStack. A navigation.reset to 'AuthChoice' from inside MainTabs targets a route that
 * only exists in AuthStack, so it was never handled.
 *
 * Callers render `reauthModal` once, anywhere in their tree.
 */
export const useAccountDeletion = () => {
    const { t } = useTranslation();
    const { deleteAccount, reauthenticateAndDelete, resetProfile } = useAuth();
    const [busy, setBusy] = useState(false);
    const [reauthVisible, setReauthVisible] = useState(false);
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthLoading, setReauthLoading] = useState(false);

    const closeReauth = () => {
        setReauthVisible(false);
        setReauthPassword('');
    };

    const showIncomplete = () => {
        // The account still exists and part of its data is left: offer to run it again.
        showAlert(t('profile.deleteIncompleteTitle'), t('profile.deleteIncompleteMsg'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.retry'), onPress: () => { runDelete(); } },
        ]);
    };

    const promptPassword = () => {
        if (Platform.OS === 'ios') {
            Alert.prompt(
                t('profile.reauthTitle'),
                t('profile.reauthMessage'),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                        text: t('common.confirm'),
                        style: 'destructive',
                        onPress: (password?: string) => { runReauthAndDelete(password ?? ''); },
                    },
                ],
                'secure-text',
            );
        } else {
            setReauthPassword('');
            setReauthVisible(true);
        }
    };

    const runDelete = async () => {
        try {
            setBusy(true);
            await deleteAccount();
        } catch (error: any) {
            const kind = classifyDeletionFailure(error);
            // A too-old session is caught before anything is erased: ask for the password.
            if (kind === 'reauth') promptPassword();
            else if (kind === 'incomplete') showIncomplete();
            else {
                log.error('Delete account error:', error);
                showAlert(t('common.error'), t('profile.deleteAccountError'));
            }
        } finally {
            setBusy(false);
        }
    };

    const runReauthAndDelete = async (password: string) => {
        if (!password) {
            showAlert(t('common.error'), t('profile.reauthMissingPassword'));
            return;
        }
        try {
            setReauthLoading(true);
            setBusy(true);
            await reauthenticateAndDelete(password);
            closeReauth();
        } catch (error: any) {
            log.error('Reauthenticate-and-delete error:', error);
            if (classifyDeletionFailure(error) === 'incomplete') {
                // Reauth succeeded, so a retry through deleteAccount no longer needs the password.
                closeReauth();
                showIncomplete();
            } else if (isUserInputError(error)) {
                showAlert(t('common.error'), t(getFirebaseErrorMessage(error)));
            } else {
                showAlert(t('common.error'), t('profile.deleteAccountError'));
            }
        } finally {
            setReauthLoading(false);
            setBusy(false);
        }
    };

    const requestDeleteAccount = () => {
        confirmAction(
            t('profile.deleteAccountTitle'),
            t('profile.deleteAccountMsg'),
            () => { runDelete(); },
            undefined,
            t('common.cancel'),
            t('common.delete'),
        );
    };

    const requestResetProfile = () => {
        confirmAction(
            t('profile.resetConfirmTitle'),
            t('profile.resetConfirmMsg'),
            async () => {
                try {
                    setBusy(true);
                    await resetProfile();
                    showAlert(t('profile.resetDoneTitle'), t('profile.resetDoneMsg'));
                } catch (error) {
                    log.error('Reset profile error:', error);
                    showAlert(t('common.error'), t('profile.errorReset'));
                } finally {
                    setBusy(false);
                }
            },
            undefined,
            t('common.cancel'),
            t('profile.reset'),
        );
    };

    const reauthModal = (
        <ReauthDeleteModal
            visible={reauthVisible}
            password={reauthPassword}
            loading={reauthLoading}
            onChangePassword={setReauthPassword}
            onCancel={closeReauth}
            onConfirm={() => { runReauthAndDelete(reauthPassword); }}
        />
    );

    return { requestDeleteAccount, requestResetProfile, busy, reauthModal };
};
