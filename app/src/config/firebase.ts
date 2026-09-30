import { initializeApp } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { createFirebaseAuth } from './createFirebaseAuth';
import { bridgeAppCheck } from './appCheck';
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

// 0. App Check — before Auth and Firestore exist, so their very first request
// already carries a token. Native only; fails open. See ./appCheck.native.ts.
bridgeAppCheck(app);

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

// 3. Analytics
// NOTE: firebase/analytics is the Web SDK and is NOT supported on React Native /
// Hermes — `isSupported()` resolves to `false`, so this promise always resolves
// to `null` in the app. All analyticsService methods are intentionally no-ops as
// a result. See src/services/analyticsService.ts for the migration path to
// @react-native-firebase/analytics when telemetry becomes a priority.
export const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);

export default app;
