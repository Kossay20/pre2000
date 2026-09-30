import { initializeApp } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { createFirebaseAuth } from './createFirebaseAuth';
import { emulatorTarget } from './firebaseEmulator';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

const app = initializeApp(firebaseConfig);

// 1. Auth — platform-specific module (`.web` / `.native`) so web never loads RN persistence.
const auth = createFirebaseAuth(app);

// 2. Firestore Persistence
// React Native usually enables persistence by default, but we can be explicit.
// Note: initializeFirestore should be called before getFirestore
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

const emulator = emulatorTarget(process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST);
if (emulator) {
  connectAuthEmulator(auth, emulator.authUrl, { disableWarnings: true });
  connectFirestoreEmulator(db, emulator.firestoreHost, emulator.firestorePort);
}

export { auth };

// =========================================================
// 4. App Check (anti-abuse / quota protection)
// =========================================================
//
// Initialisation NATIVE via @react-native-firebase/app-check.
// - DEV : DebugAppCheckProviderFactory (token enregistré dans Firebase Console)
// - PROD iOS : AppAttestProviderFactory (Apple App Attest)
// - PROD Android : PlayIntegrityProviderFactory (Google Play Integrity)
//
// PRÉ-REQUIS HUMAINS (voir docs/APPCHECK_DEPLOYMENT.md) :
//   1. Firebase Console > App Check > enregistrer iOS+Android avec App Attest / Play Integrity
//   2. Télécharger GoogleService-Info.plist (iOS) → app/ios/<projectName>/
//   3. Télécharger google-services.json (Android) → app/android/app/
//   4. expo prebuild --clean
//   5. EAS build (App Check ne fonctionne PAS en Expo Go)
//
// L'init est wrapped dans try/catch : si la lib native n'est pas chargée
// (ex: dev sans prebuild, Expo Go), l'app continue à fonctionner sans App Check.
const initAppCheck = async () => {
  try {
    const rnfbApp = require('@react-native-firebase/app').default;
    const rnfbAppCheck = require('@react-native-firebase/app-check').default;

    if (!rnfbApp.apps.length) {
      // Native init n'est pas encore disponible — sortie silencieuse
      return;
    }

    const provider = rnfbAppCheck().newReactNativeFirebaseAppCheckProvider();
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

    await rnfbAppCheck().initializeAppCheck({
      provider,
      isTokenAutoRefreshEnabled: true,
    });

    console.log('[Firebase] App Check initialized');
  } catch (err) {
    if (__DEV__) {
      console.log('[Firebase] App Check skipped (dev or native module not loaded):', (err as Error)?.message);
    } else {
      console.warn('[Firebase] App Check init failed in production:', (err as Error)?.message);
    }
  }
};

// Fire-and-forget — n'attend pas l'init pour démarrer l'app
initAppCheck();

// 3. Analytics
// NOTE: firebase/analytics is the Web SDK and is NOT supported on React Native /
// Hermes — `isSupported()` resolves to `false`, so this promise always resolves
// to `null` in the app. All analyticsService methods are intentionally no-ops as
// a result. See src/services/analyticsService.ts for the migration path to
// @react-native-firebase/analytics when telemetry becomes a priority.
export const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);

export default app;
