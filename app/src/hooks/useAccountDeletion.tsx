import React, { useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { classifyDeletionFailure, isErasedButNotDeleted } from '../context/accountDeletion';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { showAlert } from '../utils/alert';
import { confirmAction } from '../utils/uiUtils';
import { getFirebaseErrorMessage, isExpectedAuthError } from '../utils/firebaseErrors';
import { ReauthDeleteModal } from '../components/profile/ReauthDeleteModal';
import { createLogger } from '../utils/logger';
import { SUPPORT_EMAIL } from '../config/contact';

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
    const { user, deleteAccount, reauthenticateAndDelete, resetProfile, logout, firebaseUser } = useAuth();
    // The confirmations name what is erased and where to export it first.
    const copyParams = {
        settings: t('common.settings'),
        exportLabel: t('common.privacyData.export'),
        deleteLabel: t('profile.deleteAccount'),
    };
    const [busy, setBusy] = useState(false);
    const [reauthVisible, setReauthVisible] = useState(false);
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthLoading, setReauthLoading] = useState(false);
    // Set when Firebase refused the Auth delete AFTER her data was erased. The account is
    // then an empty shell: the prompt says so, and cancelling signs her out instead of
    // leaving her in it (the next sign-in finishes the deletion — see accountDeletion.ts).
    const [erasedPending, setErasedPending] = useState(false);

    const leaveErasedAccount = () => {
        setErasedPending(false);
        logout().catch((e) => log.warn('Sign-out after an unfinished deletion failed:', e));
    };

    const closeReauth = () => {
        setReauthVisible(false);
        setReauthPassword('');
        if (erasedPending) leaveErasedAccount();
    };

    const showDeleted = () => {
        // A deletion used to end on the same language screen as a plain logout, so she could
        // not tell that her account and data were actually gone.
        showAlert(t('profile.deleteDoneTitle'), t('profile.deleteDoneMsg'));
    };

    const showIncomplete = () => {
        // The account still exists and part of its data is left: offer to run it again.
        showAlert(t('profile.deleteIncompleteTitle'), t('profile.deleteIncompleteMsg'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.retry'), onPress: () => { runDelete(); } },
        ]);
    };

    const showErasedRetry = () => {
        // Everything is erased; only the Auth user is left. Retry now, or sign out and let
        // the next sign-in finish it — never stay in the emptied account.
        showAlert(t('profile.deletePendingTitle'), t('profile.deletePendingRetryMsg'), [
            { text: t('profile.logout'), style: 'cancel', onPress: leaveErasedAccount },
            { text: t('common.retry'), onPress: () => { runDelete(); } },
        ]);
    };

    const showBlocked = () => {
        // The server's rules refused part of the erase: a retry fails the same way, so send
        // her to a person instead. gdprPurge has already reported it to Sentry.
        showAlert(t('profile.deleteBlockedTitle'), t('profile.deleteBlockedMsg', { email: SUPPORT_EMAIL }), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('profile.writeToSupport'),
                onPress: () => { Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}); },
            },
        ]);
    };

    const promptPassword = (afterErase: boolean) => {
        setErasedPending(afterErase);
        const message = afterErase ? t('profile.reauthFinishMessage') : t('profile.reauthMessage');
        if (Platform.OS === 'ios') {
            Alert.prompt(
                t('profile.reauthTitle'),
                message,
                [
                    {
                        text: t('common.cancel'),
                        style: 'cancel',
                        onPress: () => { if (afterErase) leaveErasedAccount(); },
                    },
                    {
                        text: t('common.deleteForever'),
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

    // "Mot de passe oublié ?" from the password prompt: without it, a user who no longer
    // knows her password could not delete her account from the app.
    const sendPasswordReset = async () => {
        const email = firebaseUser?.email;
        if (!email) return;
        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error) {
            (isExpectedAuthError(error) ? log.warn : log.error)('Password reset from the delete prompt failed:', error);
        }
        // Same answer whatever happened, as on the Login screen.
        showAlert(t('forgotPassword'), t('resetEmailSent'));
    };

    const runDelete = async () => {
        try {
            setBusy(true);
            await deleteAccount();
            setErasedPending(false);
            showDeleted();
        } catch (error: any) {
            const kind = classifyDeletionFailure(error);
            // A too-old session is normally caught before anything is erased: ask for the
            // password. If Firebase refused only after the erase, the prompt says so.
            if (kind === 'reauth') promptPassword(isErasedButNotDeleted(error));
            else if (isErasedButNotDeleted(error)) showErasedRetry();
            else if (kind === 'incomplete') showIncomplete();
            else if (kind === 'blocked') showBlocked();
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
            setErasedPending(false);
            setReauthVisible(false);
            setReauthPassword('');
            showDeleted();
        } catch (error: any) {
            // A mistyped password is answered on screen below; only a real fault is an error.
            (isExpectedAuthError(error) ? log.warn : log.error)('Reauthenticate-and-delete error:', error);
            const kind = classifyDeletionFailure(error);
            if (isErasedButNotDeleted(error)) {
                setReauthVisible(false);
                setReauthPassword('');
                showErasedRetry();
            } else if (kind === 'incomplete') {
                // Reauth succeeded, so a retry through deleteAccount no longer needs the password.
                closeReauth();
                showIncomplete();
            } else if (kind === 'blocked') {
                closeReauth();
                showBlocked();
            } else if (isExpectedAuthError(error)) {
                // Wrong password, too many attempts, no connection: each has its own message.
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
            t('profile.deleteAccountMsg', copyParams),
            () => { runDelete(); },
            undefined,
            t('common.cancel'),
            t('common.deleteForever'),
        );
    };

    const runReset = async () => {
        try {
            setBusy(true);
            await resetProfile();
            showAlert(t('profile.resetDoneTitle'), t('profile.resetDoneMsg'));
        } catch (error) {
            log.error('Reset profile error:', error);
            // resetProfile erases the server copy before signing out, and keeps the session
            // when that fails, so a retry can finish it.
            const kind = classifyDeletionFailure(error);
            if (kind === 'blocked') showBlocked();
            else if (kind === 'incomplete') {
                showAlert(t('profile.errorReset'), t('profile.resetIncompleteMsg'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.retry'), onPress: () => { runReset(); } },
                ]);
            } else showAlert(t('common.error'), t('profile.errorReset'));
        } finally {
            setBusy(false);
        }
    };

    const requestResetProfile = () => {
        confirmAction(
            t('profile.resetConfirmTitle'),
            // A guest has no account to keep: her reset erases the only copy.
            t(user?.isGuest ? 'profile.resetConfirmMsgGuest' : 'profile.resetConfirmMsg', copyParams),
            () => { runReset(); },
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
            message={erasedPending ? t('profile.reauthFinishMessage') : t('profile.reauthMessage')}
            onCancel={closeReauth}
            onConfirm={() => { runReauthAndDelete(reauthPassword); }}
            onForgotPassword={firebaseUser?.email ? () => { sendPasswordReset(); } : undefined}
        />
    );

    return { requestDeleteAccount, requestResetProfile, busy, reauthModal };
};
