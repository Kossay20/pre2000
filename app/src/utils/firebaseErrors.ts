// src/utils/firebaseErrors.ts
/**
 * Firebase error code to user-friendly French message mapping
 */
import { createLogger } from './logger';
const log = createLogger('firebaseErrors');

const errorMessages: Record<string, string> = {
    // Authentication Errors
    'auth/invalid-credential': 'common.errors.auth.invalid_credential',
    'auth/user-not-found': 'common.errors.auth.user_not_found',
    'auth/wrong-password': 'common.errors.auth.wrong_password',
    'auth/email-already-in-use': 'common.errors.auth.email_already_in_use',
    'auth/weak-password': 'common.errors.auth.weak_password',
    'auth/invalid-email': 'common.errors.auth.invalid_email',
    'auth/user-disabled': 'common.errors.auth.user_disabled',
    'auth/too-many-requests': 'common.errors.auth.too_many_requests',
    'auth/network-request-failed': 'common.errors.auth.network_request_failed',
    'auth/operation-not-allowed': 'common.errors.auth.operation_not_allowed',
    'auth/configuration-not-found': 'common.errors.auth.configuration_not_found',
    'auth/invalid-action-code': 'common.errors.auth.invalid_action_code',
    'auth/expired-action-code': 'common.errors.auth.expired_action_code',
    'auth/requires-recent-login': 'common.errors.auth.requires_recent_login',
    'auth/credential-already-in-use': 'common.errors.auth.credential_already_in_use',
    'auth/account-exists-with-different-credential': 'common.errors.auth.account_exists_with_different_credential',
    'auth/popup-closed-by-user': 'common.errors.auth.popup_closed_by_user',
    'auth/cancelled-popup-request': 'common.errors.auth.cancelled_popup_request',
    'auth/popup-blocked': 'common.errors.auth.popup_blocked',

    // Firestore Errors
    'permission-denied': 'common.errors.permission_denied',
    'unavailable': 'common.errors.unavailable',
    'unauthenticated': 'common.errors.unauthenticated',
    'not-found': 'common.errors.not_found',
    'already-exists': 'common.errors.already_exists',
    'resource-exhausted': 'common.errors.resource_exhausted',
    'failed-precondition': 'common.errors.failed_precondition',
    'aborted': 'common.errors.aborted',
    'out-of-range': 'common.errors.out_of_range',
    'internal': 'common.errors.internal',
    'data-loss': 'common.errors.data_loss',

    // Storage Errors
    'storage/unauthorized': 'common.errors.storage.unauthorized',
    'storage/canceled': 'common.errors.storage.canceled',
    'storage/unknown': 'common.errors.storage.unknown',
};

/**
 * Get user-friendly error message from Firebase error
 * Accepts either an error code string or a Firebase error object
 */
export const getFirebaseErrorMessage = (error: unknown): string => {
    // Handle null/undefined
    if (!error) {
        return 'common.errors.default';
    }

    // Extract error code
    let errorCode: string | undefined;

    if (typeof error === 'string') {
        // Already a string code
        errorCode = error;
    } else if (typeof error === 'object') {
        const errorObj = error as { code?: string; message?: string };

        // Firebase errors have a 'code' property
        if (errorObj.code) {
            errorCode = errorObj.code;
        } else if (errorObj.message) {
            // Try to extract code from message like "Firebase: Error (auth/email-already-in-use)."
            const match = errorObj.message.match(/\(([^)]+)\)/);
            if (match) {
                errorCode = match[1];
            }
        }
    }

    // Look up the message
    if (errorCode && errorMessages[errorCode]) {
        return errorMessages[errorCode];
    }

    // Fallback
    log.warn('Unknown error code:', errorCode, error);
    return 'common.errors.default';
};

/**
 * Check if error is network-related (retriable)
 */
export const isNetworkError = (error: unknown): boolean => {
    const code = typeof error === 'object' && error !== null
        ? (error as { code?: string }).code
        : error;

    return [
        'auth/network-request-failed',
        'unavailable',
    ].includes(code as string);
};

/**
 * Check if error is a user input error (not retriable)
 */
export const isUserInputError = (error: unknown): boolean => {
    const code = typeof error === 'object' && error !== null
        ? (error as { code?: string }).code
        : error;

    return [
        'auth/invalid-email',
        'auth/weak-password',
        'auth/invalid-credential',
        'auth/user-not-found',
        'auth/wrong-password',
        'auth/email-already-in-use',
    ].includes(code as string);
};

/**
 * An auth failure the user or the network caused — a wrong password, an email
 * already taken, no connection, a throttled attempt. The screen already explains
 * each of these. Logging them at error level forwarded every routine typo to
 * Sentry (logger.error reports there), burying the failures that do need a look.
 * Anything not listed here — a misconfigured project, an SDK fault — still does.
 */
export const isExpectedAuthError = (error: unknown): boolean => {
    const code = typeof error === 'object' && error !== null
        ? (error as { code?: string }).code
        : error;

    return (
        isUserInputError(error) ||
        isNetworkError(error) ||
        ['auth/too-many-requests', 'auth/user-disabled', 'auth/missing-password'].includes(code as string)
    );
};
