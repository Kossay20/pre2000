import type { FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck, type AppCheck } from 'firebase/app-check';

// =========================================================
// App Check (anti-abuse / quota protection)
// =========================================================
//
// Two Firebase SDKs live in this app, and App Check has to reach both:
//
//   - @react-native-firebase/app-check is the only one that can attest the device
//     (App Attest / DeviceCheck on iOS, Play Integrity on Android — debug provider
//     in __DEV__). It needs the native modules, so it only exists in a prebuilt
//     binary made with the two Firebase config files (see app.config.ts).
//   - Every real request — Firestore and Auth — goes through the Firebase *JS*
//     SDK (`firebase/firestore`, `firebase/auth`), which knows nothing about the
//     native one.
//
// Initialising only the native side, as this file's predecessor did, attests the
// device and then attaches the token to nothing: the console would report 100 %
// unverified traffic, and switching on enforcement would reject every Firestore
// and Auth call from every user. So the JS SDK gets its own App Check instance
// whose CustomProvider simply asks the native SDK for the current token — the
// pattern React Native Firebase documents for mixing the two SDKs.
//
// Fails open, as before: in Expo Go, a dev build without prebuild, or a local
// build without the Firebase files the native module is absent, and the app runs
// without App Check rather than not at all. The production build refuses to be
// made without those files (app.config.ts), so a store binary always has it.
//
// Owner steps and the enforcement warning: docs/APPCHECK_DEPLOYMENT.md.

/**
 * How long to trust a token whose expiry cannot be read. Short on purpose: the
 * JS SDK comes back for a new one sooner, and the native SDK answers from its own
 * cache, so over-asking costs a bridge call while over-trusting sends an expired
 * token that an enforcing backend rejects.
 */
export const FALLBACK_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Expiry of an App Check token, in epoch milliseconds, read from its `exp` claim.
 *
 * The native SDK hands back only the token string, but the JS SDK schedules its
 * refresh from `expireTimeMillis`, so it has to be right. App Check tokens are
 * JWTs; the TTL itself is configurable in the console (30 min to 7 days), which
 * rules out a hard-coded guess.
 */
export const tokenExpiryMillis = (token: string, now: number = Date.now()): number => {
    try {
        const payload = token.split('.')[1];
        if (!payload || typeof globalThis.atob !== 'function') return now + FALLBACK_TOKEN_TTL_MS;
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const exp = JSON.parse(globalThis.atob(padded))?.exp;
        return typeof exp === 'number' && exp * 1000 > now ? exp * 1000 : now + FALLBACK_TOKEN_TTL_MS;
    } catch {
        return now + FALLBACK_TOKEN_TTL_MS;
    }
};

type NativeAppCheck = {
    newReactNativeFirebaseAppCheckProvider: () => {
        configure: (options: unknown) => void;
    };
    initializeAppCheck: (options: unknown) => Promise<void>;
    getToken: (forceRefresh?: boolean) => Promise<{ token: string }>;
};

/** The native App Check module, or null when this binary was built without it. */
const loadNativeAppCheck = (): NativeAppCheck | null => {
    try {
        const rnfbApp = require('@react-native-firebase/app').default;
        const rnfbAppCheck = require('@react-native-firebase/app-check').default;
        // No native default app means no GoogleService-Info.plist / google-services.json
        // was compiled in, so there is nothing to attest with.
        if (!rnfbApp?.apps?.length) return null;
        return rnfbAppCheck() as NativeAppCheck;
    } catch {
        return null;
    }
};

/**
 * Start native App Check and bridge its tokens into the JS SDK's `app`.
 *
 * Must run before the first Firestore/Auth request so that request already
 * carries a token. Returns the JS App Check instance, or null when the native
 * module is absent (fail-open).
 */
export const bridgeAppCheck = (app: FirebaseApp): AppCheck | null => {
    const nativeAppCheck = loadNativeAppCheck();
    if (!nativeAppCheck) {
        if (__DEV__) console.log('[Firebase] App Check skipped: native module not in this build');
        return null;
    }

    const nativeReady = (async () => {
        const provider = nativeAppCheck.newReactNativeFirebaseAppCheckProvider();
        provider.configure({
            android: {
                provider: __DEV__ ? 'debug' : 'playIntegrity',
                debugToken: process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined,
            },
            apple: {
                provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
                debugToken: process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined,
            },
            isTokenAutoRefreshEnabled: true,
        });
        await nativeAppCheck.initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });
    })();
    // Observed here so a failed native init is logged once instead of surfacing as
    // an unhandled rejection; getToken below still awaits it and rethrows, which
    // the JS SDK treats as "no token this time".
    nativeReady.catch((err) => {
        const message = (err as Error)?.message;
        if (__DEV__) console.log('[Firebase] Native App Check init failed:', message);
        else console.warn('[Firebase] Native App Check init failed in production:', message);
    });

    try {
        return initializeAppCheck(app, {
            provider: new CustomProvider({
                getToken: async () => {
                    await nativeReady;
                    // Not forced: the native SDK serves its cached token while valid and
                    // refreshes it itself.
                    const { token } = await nativeAppCheck.getToken(false);
                    return { token, expireTimeMillis: tokenExpiryMillis(token) };
                },
            }),
            isTokenAutoRefreshEnabled: true,
        });
    } catch (err) {
        console.warn('[Firebase] App Check bridge failed:', (err as Error)?.message);
        return null;
    }
};
