/**
 * The App Check bridge (appCheck.native.ts).
 *
 * The bug it exists for: App Check was initialised on the native
 * @react-native-firebase app only, while every Firestore and Auth request goes
 * through the Firebase JS SDK. No token ever reached a request, so enforcing App
 * Check in the console would have rejected every user. These tests pin the three
 * things that matter: the JS SDK gets an App Check instance, its token comes from
 * the native SDK, and a binary without the native module still starts.
 */
import type { FirebaseApp } from 'firebase/app';

const mockInitializeAppCheck = jest.fn((_app: unknown, options: unknown) => ({ options }));
const mockCustomProvider = jest.fn(function (this: any, opts: { getToken: () => Promise<unknown> }) {
    this.getToken = opts.getToken;
});
jest.mock('firebase/app-check', () => ({
    initializeAppCheck: (app: unknown, options: unknown) => mockInitializeAppCheck(app, options),
    CustomProvider: function (this: any, opts: any) {
        return mockCustomProvider.call(this, opts);
    },
}));

const APP = { name: '[DEFAULT]' } as FirebaseApp;

/** A JWT whose payload carries `exp` (seconds). The signature is irrelevant here. */
const jwt = (payload: object) =>
    `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

type Native = {
    configure: jest.Mock;
    newReactNativeFirebaseAppCheckProvider: jest.Mock;
    initializeAppCheck: jest.Mock;
    getToken: jest.Mock;
};

const nativeModule = (): Native => {
    const configure = jest.fn();
    return {
        configure,
        newReactNativeFirebaseAppCheckProvider: jest.fn(() => ({ configure })),
        initializeAppCheck: jest.fn().mockResolvedValue(undefined),
        getToken: jest.fn(),
    };
};

/**
 * What the two @react-native-firebase modules look like in the binary under test.
 * Read by the module factories below at require time; `load` resets the registry
 * so every test requires them afresh.
 */
let mockNative: Native | 'absent' | 'no-default-app' = 'absent';
jest.mock('@react-native-firebase/app', () => {
    if (mockNative === 'absent') throw new Error('Native module RNFBAppModule not found');
    return {
        __esModule: true,
        default: { apps: mockNative === 'no-default-app' ? [] : [{ name: '[DEFAULT]' }] },
    };
});
jest.mock('@react-native-firebase/app-check', () => ({
    __esModule: true,
    default: () => mockNative,
}));

/** Load appCheck.native with the native modules either present or absent. */
const load = (native: typeof mockNative): typeof import('../appCheck.native') => {
    mockNative = native;
    jest.resetModules();
    return require('../appCheck.native');
};

describe('bridgeAppCheck', () => {
    beforeEach(() => {
        mockInitializeAppCheck.mockClear();
        mockCustomProvider.mockClear();
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        (console.log as jest.Mock).mockRestore();
        (console.warn as jest.Mock).mockRestore();
    });

    it('gives the JS SDK app an App Check instance with auto-refresh', () => {
        const native = nativeModule();
        const { bridgeAppCheck } = load(native);

        const instance = bridgeAppCheck(APP);

        expect(instance).not.toBeNull();
        expect(mockInitializeAppCheck).toHaveBeenCalledTimes(1);
        const [app, options] = mockInitializeAppCheck.mock.calls[0] as [unknown, any];
        expect(app).toBe(APP);
        expect(options.isTokenAutoRefreshEnabled).toBe(true);
        expect(mockCustomProvider).toHaveBeenCalledTimes(1);
    });

    it('serves the native token, with the expiry read from the token itself', async () => {
        const native = nativeModule();
        const exp = Math.floor(Date.now() / 1000) + 3600;
        native.getToken.mockResolvedValue({ token: jwt({ exp }) });
        const { bridgeAppCheck } = load(native);

        bridgeAppCheck(APP);
        const options = mockInitializeAppCheck.mock.calls[0][1] as any;
        const result = await options.provider.getToken();

        expect(result).toEqual({ token: jwt({ exp }), expireTimeMillis: exp * 1000 });
        // Cached token, not a forced round-trip to the attestation service.
        expect(native.getToken).toHaveBeenCalledWith(false);
    });

    it('initialises native App Check with the store providers before the first token', async () => {
        const native = nativeModule();
        native.getToken.mockResolvedValue({ token: jwt({ exp: 9999999999 }) });
        const { bridgeAppCheck } = load(native);

        bridgeAppCheck(APP);
        await (mockInitializeAppCheck.mock.calls[0][1] as any).provider.getToken();

        expect(native.initializeAppCheck).toHaveBeenCalledWith(
            expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
        );
        expect(native.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
            native.getToken.mock.invocationCallOrder[0],
        );
        // __DEV__ is true under Jest, so the debug provider; the release branch is
        // App Attest (with DeviceCheck fallback) and Play Integrity.
        const config = native.configure.mock.calls[0][0];
        expect(config.apple.provider).toBe('debug');
        expect(config.android.provider).toBe('debug');
    });

    it('surfaces a native failure to the JS SDK instead of inventing a token', async () => {
        const native = nativeModule();
        native.initializeAppCheck.mockRejectedValue(new Error('App Attest unsupported'));
        const { bridgeAppCheck } = load(native);

        bridgeAppCheck(APP);
        const provider = (mockInitializeAppCheck.mock.calls[0][1] as any).provider;

        await expect(provider.getToken()).rejects.toThrow('App Attest unsupported');
        expect(native.getToken).not.toHaveBeenCalled();
    });

    it.each([
        ['the native module is not in the binary (Expo Go, no prebuild)', 'absent' as const],
        ['the binary was built without the Firebase config files', 'no-default-app' as const],
    ])('fails open when %s', (_label, native) => {
        const { bridgeAppCheck } = load(native);

        expect(() => bridgeAppCheck(APP)).not.toThrow();
        expect(bridgeAppCheck(APP)).toBeNull();
        // No JS App Check either: a provider that can never produce a token would
        // only add a failing exchange to every request.
        expect(mockInitializeAppCheck).not.toHaveBeenCalled();
    });
});

describe('tokenExpiryMillis', () => {
    const { tokenExpiryMillis, FALLBACK_TOKEN_TTL_MS } = load(nativeModule());
    const NOW = 1_700_000_000_000;

    it('reads exp from the JWT payload', () => {
        expect(tokenExpiryMillis(jwt({ exp: NOW / 1000 + 1800 }), NOW)).toBe(NOW + 1_800_000);
    });

    it.each([
        ['not a JWT', 'opaque-token'],
        ['a payload that is not JSON', 'h.%%%.s'],
        ['no exp claim', jwt({ iat: 1 })],
        ['an exp already in the past', jwt({ exp: NOW / 1000 - 10 })],
    ])('falls back to a short TTL for %s', (_label, token) => {
        expect(tokenExpiryMillis(token, NOW)).toBe(NOW + FALLBACK_TOKEN_TTL_MS);
    });
});

describe('web', () => {
    it('never initialises App Check on the web preview', () => {
        mockInitializeAppCheck.mockClear();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { bridgeAppCheck } = require('../appCheck.web');
        expect(bridgeAppCheck(APP)).toBeNull();
        expect(mockInitializeAppCheck).not.toHaveBeenCalled();
    });
});
