import { initializeApp } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import type { Analytics } from 'firebase/analytics';
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

// 3. Analytics — deliberately off.
// The privacy policy and the iOS privacy manifest both say no analytics is
// collected. On native the Web SDK was inert anyway (`isSupported()` is false on
// Hermes), but on web `getAnalytics` sent page views and onboarding/login
// events to Google Analytics. Enabling telemetry is a privacy-policy change
// first; see src/services/analyticsService.ts for the migration path.
export const analytics: Promise<Analytics | null> = Promise.resolve(null);

export default app;
