import type { FirebaseApp } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';

/**
 * The web preview has no device to attest: App Check on web would need a
 * reCAPTCHA provider, and the product ships on iOS and Android only. The native
 * bridge lives in `appCheck.native.ts`.
 */
export const bridgeAppCheck = (_app: FirebaseApp): AppCheck | null => null;
