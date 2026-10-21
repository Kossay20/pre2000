import { Linking, Alert, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { openSupportEmail } from '../supportService';

// --- Mutable mock state --------------------------------------------------
// supportService reads Device.modelName / Constants.expoConfig / Platform.*
// at call time. Back the mocked properties with mutable holders (prefixed
// `mock` so jest factory hoisting allows referencing them) and expose them
// via getters so tests can change values per-case.
const mockState = {
    deviceModelName: 'iPhone 15' as string | null,
    expoConfig: { version: '2.3.4' } as { version?: string } | undefined,
    platformOS: 'ios' as string,
    platformVersion: '17.0' as string | number,
};

// --- Mocks ---------------------------------------------------------------

// react-native maps to react-native-web via jest.config moduleNameMapper.
// Fully mock the symbols supportService uses so no real RNW native code loads.
jest.mock('react-native', () => ({
    Linking: {
        canOpenURL: jest.fn(),
        openURL: jest.fn(),
    },
    Alert: {
        alert: jest.fn(),
    },
    Platform: {
        get OS() {
            return mockState.platformOS;
        },
        get Version() {
            return mockState.platformVersion;
        },
    },
}));

jest.mock('expo-device', () => ({
    get modelName() {
        return mockState.deviceModelName;
    },
}));

jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        get expoConfig() {
            return mockState.expoConfig;
        },
    },
}));

jest.mock('expo-clipboard', () => ({
    setStringAsync: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));

// The address the website publishes. support@mamabebe.app bounced: mamabebe.app has no MX.
const SUPPORT_EMAIL = 'contact@mama-et-bebe.com';

// Typed handles to the mocked functions.
const mockedCanOpenURL = Linking.canOpenURL as jest.Mock;
const mockedOpenURL = Linking.openURL as jest.Mock;
const mockedAlert = Alert.alert as jest.Mock;
const mockedSetStringAsync = Clipboard.setStringAsync as jest.Mock;

/** Default identity translator: returns the key (and ignores options). */
const makeT = () => jest.fn((key: string, _opts?: any) => key);

beforeEach(() => {
    jest.clearAllMocks();
    // Restore mutable mock module state that clearAllMocks does NOT reset.
    mockState.deviceModelName = 'iPhone 15';
    mockState.expoConfig = { version: '2.3.4' };
    mockState.platformOS = 'ios';
    mockState.platformVersion = '17.0';
    // Sensible default: a mail client is available.
    mockedCanOpenURL.mockResolvedValue(true);
    mockedOpenURL.mockResolvedValue(undefined);
    mockedSetStringAsync.mockResolvedValue(undefined);
});

describe('supportService — react-native mock sanity', () => {
    test('react-native mock factory is applied (Linking/Alert/Platform are jest mocks)', async () => {
        const t = makeT();
        await openSupportEmail(t);
        // If the factory did not take, real RNW would load and canOpenURL
        // would not be a recorded jest.fn with this call.
        expect(mockedCanOpenURL).toHaveBeenCalledTimes(1);
    });
});

describe('supportService — happy path (mail client available)', () => {
    test('opens the mailto URL when canOpenURL returns true', async () => {
        const t = makeT();
        await openSupportEmail(t);

        expect(mockedCanOpenURL).toHaveBeenCalledTimes(1);
        // canOpenURL is probed with the bare mailto (no query string).
        expect(mockedCanOpenURL).toHaveBeenCalledWith(`mailto:${SUPPORT_EMAIL}`);

        expect(mockedOpenURL).toHaveBeenCalledTimes(1);
        const openedUrl = mockedOpenURL.mock.calls[0][0] as string;
        expect(openedUrl.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
        expect(openedUrl).toContain('subject=');
        expect(openedUrl).toContain('body=');
    });

    test('does not fall back to clipboard/Alert on the happy path', async () => {
        const t = makeT();
        await openSupportEmail(t);

        expect(mockedSetStringAsync).not.toHaveBeenCalled();
        expect(mockedAlert).not.toHaveBeenCalled();
    });

    test('builds subject from common.common.appName + support.reportProblemSubject', async () => {
        const t = makeT();
        await openSupportEmail(t);

        expect(t).toHaveBeenCalledWith('common.common.appName');
        expect(t).toHaveBeenCalledWith('support.reportProblemSubject');

        const openedUrl = mockedOpenURL.mock.calls[0][0] as string;
        // subject = `[common.common.appName] support.reportProblemSubject`
        const expectedSubject = `[common.common.appName] support.reportProblemSubject`;
        expect(openedUrl).toContain(`subject=${encodeURIComponent(expectedSubject)}`);
    });

    test('builds body from i18n keys + device/version/platform info', async () => {
        const t = makeT();
        await openSupportEmail(t);

        expect(t).toHaveBeenCalledWith('support.emailBodyIntro');
        expect(t).toHaveBeenCalledWith('support.deviceInfo');

        const openedUrl = mockedOpenURL.mock.calls[0][0] as string;
        const queryBody = openedUrl.split('&body=')[1];
        const decodedBody = decodeURIComponent(queryBody);

        expect(decodedBody).toContain('support.emailBodyIntro');
        expect(decodedBody).toContain('support.deviceInfo');
        expect(decodedBody).toContain('App Version: 2.3.4');
        expect(decodedBody).toContain('Device: iPhone 15');
        expect(decodedBody).toContain('OS: ios 17.0');
    });

    test('writes to the published address (contact@mama-et-bebe.com)', async () => {
        const t = makeT();
        await openSupportEmail(t);

        const openedUrl = mockedOpenURL.mock.calls[0][0] as string;
        expect(openedUrl.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
        expect(openedUrl).not.toContain('mamabebe.app'); // no MX record: every message bounced
        expect(openedUrl).not.toContain('mama-bebe.app'); // old diverging domain (F104)
    });
});

describe('supportService — body fallbacks (version / device)', () => {
    test('falls back to App Version 1.0.0 when expoConfig is undefined', async () => {
        mockState.expoConfig = undefined;
        const t = makeT();
        await openSupportEmail(t);

        const decodedBody = decodeURIComponent(
            mockedOpenURL.mock.calls[0][0].split('&body=')[1]
        );
        expect(decodedBody).toContain('App Version: 1.0.0');
    });

    test('falls back to App Version 1.0.0 when version is missing', async () => {
        mockState.expoConfig = {};
        const t = makeT();
        await openSupportEmail(t);

        const decodedBody = decodeURIComponent(
            mockedOpenURL.mock.calls[0][0].split('&body=')[1]
        );
        expect(decodedBody).toContain('App Version: 1.0.0');
    });

    test('falls back to Device "Unknown" when Device.modelName is null', async () => {
        mockState.deviceModelName = null;
        const t = makeT();
        await openSupportEmail(t);

        const decodedBody = decodeURIComponent(
            mockedOpenURL.mock.calls[0][0].split('&body=')[1]
        );
        expect(decodedBody).toContain('Device: Unknown');
    });

    test('reflects a different platform (android + numeric version)', async () => {
        mockState.platformOS = 'android';
        mockState.platformVersion = 34;
        const t = makeT();
        await openSupportEmail(t);

        const decodedBody = decodeURIComponent(
            mockedOpenURL.mock.calls[0][0].split('&body=')[1]
        );
        expect(decodedBody).toContain('OS: android 34');
    });
});

describe('supportService — fallback path: canOpenURL returns false', () => {
    test('copies SUPPORT_EMAIL to clipboard and alerts the user', async () => {
        mockedCanOpenURL.mockResolvedValue(false);
        const t = makeT();
        await openSupportEmail(t);

        expect(mockedOpenURL).not.toHaveBeenCalled();
        expect(mockedSetStringAsync).toHaveBeenCalledTimes(1);
        expect(mockedSetStringAsync).toHaveBeenCalledWith(SUPPORT_EMAIL);

        expect(mockedAlert).toHaveBeenCalledTimes(1);
        expect(mockedAlert).toHaveBeenCalledWith(
            'support.reportProblem',
            'support.mailUnavailableCopied'
        );
    });

    test('passes the email option to the mailUnavailableCopied translation', async () => {
        mockedCanOpenURL.mockResolvedValue(false);
        const t = makeT();
        await openSupportEmail(t);

        expect(t).toHaveBeenCalledWith('support.mailUnavailableCopied', {
            email: SUPPORT_EMAIL,
        });
        expect(t).toHaveBeenCalledWith('support.reportProblem');
    });
});

describe('supportService — fallback path: canOpenURL rejects', () => {
    test('falls back to clipboard + alert when canOpenURL throws', async () => {
        mockedCanOpenURL.mockRejectedValue(new Error('boom'));
        const t = makeT();
        await openSupportEmail(t);

        expect(mockedOpenURL).not.toHaveBeenCalled();
        expect(mockedSetStringAsync).toHaveBeenCalledWith(SUPPORT_EMAIL);
        expect(mockedAlert).toHaveBeenCalledWith(
            'support.reportProblem',
            'support.mailUnavailableCopied'
        );
    });
});

describe('supportService — fallback path: openURL rejects after canOpen=true', () => {
    test('falls back to clipboard + alert when openURL throws', async () => {
        mockedCanOpenURL.mockResolvedValue(true);
        mockedOpenURL.mockRejectedValue(new Error('cannot open'));
        const t = makeT();
        await openSupportEmail(t);

        expect(mockedOpenURL).toHaveBeenCalledTimes(1);
        expect(mockedSetStringAsync).toHaveBeenCalledWith(SUPPORT_EMAIL);
        expect(mockedAlert).toHaveBeenCalledWith(
            'support.reportProblem',
            'support.mailUnavailableCopied'
        );
    });
});

describe('supportService — clipboard failure (inner catch)', () => {
    test('shows pleaseWriteUs alert when clipboard write also fails', async () => {
        mockedCanOpenURL.mockResolvedValue(false);
        mockedSetStringAsync.mockRejectedValue(new Error('clipboard denied'));
        const t = makeT();
        await openSupportEmail(t);

        expect(mockedSetStringAsync).toHaveBeenCalledTimes(1);
        expect(mockedAlert).toHaveBeenCalledTimes(1);
        expect(mockedAlert).toHaveBeenCalledWith(
            'common.error',
            'support.pleaseWriteUs'
        );
        expect(t).toHaveBeenCalledWith('support.pleaseWriteUs', {
            email: SUPPORT_EMAIL,
        });
    });

    test('does NOT show the mailUnavailableCopied alert when clipboard fails', async () => {
        mockedCanOpenURL.mockResolvedValue(false);
        mockedSetStringAsync.mockRejectedValue(new Error('clipboard denied'));
        const t = makeT();
        await openSupportEmail(t);

        // Only the pleaseWriteUs alert should fire (the copied alert is inside
        // the try that threw, before alert is reached).
        expect(mockedAlert).not.toHaveBeenCalledWith(
            'support.reportProblem',
            'support.mailUnavailableCopied'
        );
    });
});

describe('supportService — outer catch (unexpected error)', () => {
    test('shows genericError alert when subject/body building throws', async () => {
        // Make t throw only while building the subject/body, but succeed in
        // the outer catch (so the catch Alert itself does not throw).
        const t = jest.fn((key: string, _opts?: any) => {
            if (key === 'common.common.appName') {
                throw new Error('translation explosion');
            }
            return key;
        });

        await openSupportEmail(t);

        // Linking should never have been reached.
        expect(mockedCanOpenURL).not.toHaveBeenCalled();
        expect(mockedOpenURL).not.toHaveBeenCalled();

        expect(mockedAlert).toHaveBeenCalledTimes(1);
        expect(mockedAlert).toHaveBeenCalledWith(
            'common.error',
            'support.genericError'
        );
    });

    test('does not throw out of openSupportEmail even on internal failure', async () => {
        const t = jest.fn((key: string) => {
            if (key === 'common.common.appName') {
                throw new Error('boom');
            }
            return key;
        });
        await expect(openSupportEmail(t)).resolves.toBeUndefined();
    });
});

describe('supportService — return contract', () => {
    test('resolves (returns a promise) on the happy path', async () => {
        const t = makeT();
        await expect(openSupportEmail(t)).resolves.toBeUndefined();
    });
});
