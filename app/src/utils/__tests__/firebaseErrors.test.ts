/**
 * Tests for firebaseErrors — Firebase error code → friendly i18n-key mapping.
 *
 * The module exposes three helpers:
 *   - getFirebaseErrorMessage(error): maps a code (string OR firebase error object
 *     OR a message containing "(code)") to a translation key, falling back to
 *     'common.errors.default'.
 *   - isNetworkError(error): retriable network errors.
 *   - isUserInputError(error): non-retriable user input errors.
 *
 * The only dependency is createLogger from '../logger'. We mock it so we can both
 * silence output and assert the warn() call that fires on an unknown code. The mock
 * uses a hoist-safe `mock`-prefixed fn so the test reaches the exact instance the
 * module captured at import time (a fresh inline jest.fn() per call would not).
 */

const mockWarn = jest.fn();
jest.mock('../logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: mockWarn,
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));

import {
    getFirebaseErrorMessage,
    isExpectedAuthError,
    isNetworkError,
    isUserInputError,
} from '../firebaseErrors';

const DEFAULT = 'common.errors.default';

// Local copy of the (un-exported) map so we can assert every entry. Keeping this
// in the test is intentional: a divergence between this table and the source is
// a signal the source changed and the mapping should be reviewed.
const EXPECTED_MAP: Record<string, string> = {
    // Authentication
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
    // Firestore
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
    // Storage
    'storage/unauthorized': 'common.errors.storage.unauthorized',
    'storage/canceled': 'common.errors.storage.canceled',
    'storage/unknown': 'common.errors.storage.unknown',
};

beforeEach(() => {
    mockWarn.mockClear();
});

describe('firebaseErrors', () => {
    describe('getFirebaseErrorMessage — falsy inputs → default', () => {
        it('returns default for null', () => {
            expect(getFirebaseErrorMessage(null)).toBe(DEFAULT);
        });

        it('returns default for undefined', () => {
            expect(getFirebaseErrorMessage(undefined)).toBe(DEFAULT);
        });

        it('returns default for empty string (falsy → never enters string branch)', () => {
            expect(getFirebaseErrorMessage('')).toBe(DEFAULT);
        });

        it('returns default for 0', () => {
            expect(getFirebaseErrorMessage(0)).toBe(DEFAULT);
        });

        it('returns default for false', () => {
            expect(getFirebaseErrorMessage(false)).toBe(DEFAULT);
        });

        it('returns default for NaN', () => {
            expect(getFirebaseErrorMessage(NaN)).toBe(DEFAULT);
        });

        it('does NOT warn for the falsy short-circuit (returns before lookup)', () => {
            getFirebaseErrorMessage(null);
            getFirebaseErrorMessage(undefined);
            getFirebaseErrorMessage('');
            expect(mockWarn).not.toHaveBeenCalled();
        });
    });

    describe('getFirebaseErrorMessage — known code as a bare string', () => {
        it.each(Object.entries(EXPECTED_MAP))(
            'maps string code "%s" → "%s"',
            (code, expected) => {
                expect(getFirebaseErrorMessage(code)).toBe(expected);
            }
        );

        it('does not warn when the string code is known', () => {
            getFirebaseErrorMessage('auth/wrong-password');
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it('maps the full known set (sanity count: 33 entries)', () => {
            expect(Object.keys(EXPECTED_MAP)).toHaveLength(33);
        });
    });

    describe('getFirebaseErrorMessage — unknown code as a bare string', () => {
        it('returns default for an unrecognised string code', () => {
            expect(getFirebaseErrorMessage('auth/totally-made-up')).toBe(DEFAULT);
        });

        it('warns (with the code) on an unknown string code', () => {
            getFirebaseErrorMessage('auth/totally-made-up');
            expect(mockWarn).toHaveBeenCalledTimes(1);
            expect(mockWarn).toHaveBeenCalledWith(
                'Unknown error code:',
                'auth/totally-made-up',
                'auth/totally-made-up'
            );
        });

        it('is case-sensitive: an upper-cased known code is unknown', () => {
            expect(getFirebaseErrorMessage('AUTH/WRONG-PASSWORD')).toBe(DEFAULT);
        });

        it('does not trim whitespace: padded code is unknown', () => {
            expect(getFirebaseErrorMessage(' auth/wrong-password ')).toBe(DEFAULT);
        });
    });

    describe('getFirebaseErrorMessage — firebase error object with .code', () => {
        it.each(Object.entries(EXPECTED_MAP))(
            'maps { code: "%s" } → "%s"',
            (code, expected) => {
                expect(getFirebaseErrorMessage({ code })).toBe(expected);
            }
        );

        it('returns default for an object with an unknown code', () => {
            expect(getFirebaseErrorMessage({ code: 'auth/nope' })).toBe(DEFAULT);
        });

        it('warns with the object on an unknown object code', () => {
            const err = { code: 'auth/nope' };
            getFirebaseErrorMessage(err);
            expect(mockWarn).toHaveBeenCalledWith('Unknown error code:', 'auth/nope', err);
        });

        it('handles a real Error instance carrying a .code property', () => {
            const err: Error & { code?: string } = new Error('boom');
            err.code = 'permission-denied';
            expect(getFirebaseErrorMessage(err)).toBe('common.errors.permission_denied');
        });
    });

    describe('getFirebaseErrorMessage — code wins over message (precedence)', () => {
        it('uses .code even when .message points at a different code', () => {
            const err = {
                code: 'auth/wrong-password',
                message: 'Firebase: Error (auth/email-already-in-use).',
            };
            // code branch is checked first, so wrong-password mapping is returned
            expect(getFirebaseErrorMessage(err)).toBe(
                'common.errors.auth.wrong_password'
            );
        });
    });

    describe('getFirebaseErrorMessage — empty-string code falls through to message', () => {
        it('empty .code is falsy → message is consulted instead', () => {
            const err = {
                code: '',
                message: 'Firebase: Error (auth/invalid-email).',
            };
            expect(getFirebaseErrorMessage(err)).toBe('common.errors.auth.invalid_email');
        });

        it('empty .code and no usable message → default', () => {
            expect(getFirebaseErrorMessage({ code: '' })).toBe(DEFAULT);
        });
    });

    describe('getFirebaseErrorMessage — extract code from message', () => {
        it('extracts a known code from the canonical Firebase message format', () => {
            const err = { message: 'Firebase: Error (auth/email-already-in-use).' };
            expect(getFirebaseErrorMessage(err)).toBe(
                'common.errors.auth.email_already_in_use'
            );
        });

        it('extracts a firestore code wrapped in parens', () => {
            const err = { message: 'Something failed (permission-denied) somewhere' };
            expect(getFirebaseErrorMessage(err)).toBe('common.errors.permission_denied');
        });

        it('returns default when the parenthesised code is unknown', () => {
            const err = { message: 'Firebase: Error (auth/whatever).' };
            expect(getFirebaseErrorMessage(err)).toBe(DEFAULT);
        });

        it('warns with the extracted unknown code', () => {
            const err = { message: 'Firebase: Error (auth/whatever).' };
            getFirebaseErrorMessage(err);
            expect(mockWarn).toHaveBeenCalledWith('Unknown error code:', 'auth/whatever', err);
        });

        it('captures only the FIRST parenthesised group', () => {
            // regex /\(([^)]+)\)/ is greedy-left: matches first "(...)"
            const err = { message: '(permission-denied) then (unavailable)' };
            expect(getFirebaseErrorMessage(err)).toBe('common.errors.permission_denied');
        });

        it('returns default for a message with NO parentheses', () => {
            const err = { message: 'plain failure with no code' };
            expect(getFirebaseErrorMessage(err)).toBe(DEFAULT);
        });

        it('warns with errorCode undefined for a message with no parens', () => {
            const err = { message: 'plain failure with no code' };
            getFirebaseErrorMessage(err);
            expect(mockWarn).toHaveBeenCalledWith('Unknown error code:', undefined, err);
        });

        it('returns default when parens contain an empty group (no chars to match)', () => {
            // /\(([^)]+)\)/ requires at least one char inside → "()" does not match
            const err = { message: 'failure ()' };
            expect(getFirebaseErrorMessage(err)).toBe(DEFAULT);
        });
    });

    describe('getFirebaseErrorMessage — object with neither code nor message', () => {
        it('returns default for an empty object', () => {
            expect(getFirebaseErrorMessage({})).toBe(DEFAULT);
        });

        it('warns with errorCode undefined for an empty object', () => {
            const err = {};
            getFirebaseErrorMessage(err);
            expect(mockWarn).toHaveBeenCalledWith('Unknown error code:', undefined, err);
        });

        it('returns default for an object with unrelated props', () => {
            expect(getFirebaseErrorMessage({ status: 500, name: 'X' })).toBe(DEFAULT);
        });

        it('returns default for an array (typeof === object, no code/message)', () => {
            expect(getFirebaseErrorMessage(['auth/wrong-password'])).toBe(DEFAULT);
        });
    });

    describe('getFirebaseErrorMessage — non-string non-object inputs', () => {
        it('returns default for a truthy number', () => {
            expect(getFirebaseErrorMessage(42)).toBe(DEFAULT);
        });

        it('returns default for true', () => {
            expect(getFirebaseErrorMessage(true)).toBe(DEFAULT);
        });

        it('returns default for a function', () => {
            expect(getFirebaseErrorMessage(() => 'auth/wrong-password')).toBe(DEFAULT);
        });

        it('returns default for a bigint', () => {
            expect(getFirebaseErrorMessage(10n)).toBe(DEFAULT);
        });

        it('warns with errorCode undefined for a number (no code extracted)', () => {
            getFirebaseErrorMessage(42);
            expect(mockWarn).toHaveBeenCalledWith('Unknown error code:', undefined, 42);
        });
    });

    describe('isNetworkError', () => {
        it('is true for the bare string "auth/network-request-failed"', () => {
            expect(isNetworkError('auth/network-request-failed')).toBe(true);
        });

        it('is true for the bare string "unavailable"', () => {
            expect(isNetworkError('unavailable')).toBe(true);
        });

        it('is true for { code: "auth/network-request-failed" }', () => {
            expect(isNetworkError({ code: 'auth/network-request-failed' })).toBe(true);
        });

        it('is true for { code: "unavailable" }', () => {
            expect(isNetworkError({ code: 'unavailable' })).toBe(true);
        });

        it('is true for an Error instance with the network code', () => {
            const err: Error & { code?: string } = new Error('offline');
            err.code = 'unavailable';
            expect(isNetworkError(err)).toBe(true);
        });

        it('is false for an unrelated string code', () => {
            expect(isNetworkError('not-found')).toBe(false);
        });

        it('is false for a non-network object code', () => {
            expect(isNetworkError({ code: 'permission-denied' })).toBe(false);
        });

        it('is false for an object with no code property', () => {
            expect(isNetworkError({})).toBe(false);
        });

        it('is false for null (typeof object but guarded by !== null)', () => {
            expect(isNetworkError(null)).toBe(false);
        });

        it('is false for undefined', () => {
            expect(isNetworkError(undefined)).toBe(false);
        });

        it('is false for empty string', () => {
            expect(isNetworkError('')).toBe(false);
        });

        it('is false for a number', () => {
            expect(isNetworkError(503)).toBe(false);
        });
    });

    describe('isUserInputError', () => {
        const inputCodes = [
            'auth/invalid-email',
            'auth/weak-password',
            'auth/invalid-credential',
            'auth/user-not-found',
            'auth/wrong-password',
            'auth/email-already-in-use',
        ];

        it.each(inputCodes)('is true for the bare string "%s"', (code) => {
            expect(isUserInputError(code)).toBe(true);
        });

        it.each(inputCodes)('is true for { code: "%s" }', (code) => {
            expect(isUserInputError({ code })).toBe(true);
        });

        it('is true for an Error instance carrying a user-input code', () => {
            const err: Error & { code?: string } = new Error('bad email');
            err.code = 'auth/invalid-email';
            expect(isUserInputError(err)).toBe(true);
        });

        it('is false for "auth/too-many-requests" (an auth error NOT in the list)', () => {
            expect(isUserInputError('auth/too-many-requests')).toBe(false);
        });

        it('is false for "auth/network-request-failed" (network, not input)', () => {
            expect(isUserInputError('auth/network-request-failed')).toBe(false);
        });

        it('is false for a firestore code', () => {
            expect(isUserInputError({ code: 'permission-denied' })).toBe(false);
        });

        it('is false for an object with no code property', () => {
            expect(isUserInputError({})).toBe(false);
        });

        it('is false for null', () => {
            expect(isUserInputError(null)).toBe(false);
        });

        it('is false for undefined', () => {
            expect(isUserInputError(undefined)).toBe(false);
        });

        it('is false for empty string', () => {
            expect(isUserInputError('')).toBe(false);
        });
    });

    describe('cross-helper consistency', () => {
        it('a user-input code is not classified as a network error', () => {
            expect(isUserInputError('auth/wrong-password')).toBe(true);
            expect(isNetworkError('auth/wrong-password')).toBe(false);
        });

        it('a network code is not classified as a user-input error', () => {
            expect(isNetworkError('auth/network-request-failed')).toBe(true);
            expect(isUserInputError('auth/network-request-failed')).toBe(false);
        });

        it('every isUserInputError code also has a friendly message mapping', () => {
            const codes = [
                'auth/invalid-email',
                'auth/weak-password',
                'auth/invalid-credential',
                'auth/user-not-found',
                'auth/wrong-password',
                'auth/email-already-in-use',
            ];
            for (const code of codes) {
                expect(isUserInputError(code)).toBe(true);
                expect(getFirebaseErrorMessage(code)).not.toBe(DEFAULT);
            }
        });

        it('every isNetworkError code also has a friendly message mapping', () => {
            for (const code of ['auth/network-request-failed', 'unavailable']) {
                expect(isNetworkError(code)).toBe(true);
                expect(getFirebaseErrorMessage(code)).not.toBe(DEFAULT);
            }
        });
    });
});

// Auth failures the user or the network caused are logged at warn (silent in
// production), not error — logger.error forwards to Sentry, and wrong passwords
// were flooding it. Anything unexpected must still be an error.
describe('isExpectedAuthError', () => {
    it.each([
        'auth/wrong-password',
        'auth/invalid-credential',
        'auth/user-not-found',
        'auth/email-already-in-use',
        'auth/invalid-email',
        'auth/weak-password',
        'auth/too-many-requests',
        'auth/network-request-failed',
        'auth/user-disabled',
    ])('%s is expected (warn, no Sentry)', (code) => {
        expect(isExpectedAuthError({ code })).toBe(true);
    });

    it.each([
        'auth/operation-not-allowed',
        'auth/configuration-not-found',
        'auth/internal-error',
        'permission-denied',
    ])('%s is NOT expected (still logged as an error)', (code) => {
        expect(isExpectedAuthError({ code })).toBe(false);
    });

    it('treats a code-less error or nothing as unexpected', () => {
        expect(isExpectedAuthError(new Error('boom'))).toBe(false);
        expect(isExpectedAuthError(null)).toBe(false);
        expect(isExpectedAuthError(undefined)).toBe(false);
    });
});

describe('auth failure logging sites use isExpectedAuthError', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
    it.each([
        ['src/screens/LoginScreen.tsx', "'[LoginScreen] Login error:'"],
        ['src/screens/RegisterScreen.tsx', "'[RegisterScreen] Registration error:'"],
        ['src/context/AuthContext.tsx', "'[AuthContext] ❌ Login error:'"],
        ['src/context/AuthContext.tsx', "'[AuthContext] ❌ Registration error:'"],
        ['src/context/AuthContext.tsx', "'[AuthContext] ❌ Guest upgrade error:'"],
    ])('%s logs %s through the expected/unexpected split', (file, message) => {
        const src: string = read(file);
        expect(src).toContain(`(isExpectedAuthError(error) ? log.warn : log.error)(${message}`);
        expect(src).not.toContain(`log.error(${message}`);
    });
});
