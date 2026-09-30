/**
 * E2E-only switch: `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1` at export time
 * points Auth + Firestore at the local emulator suite, so the signed-in journeys
 * can be exercised without creating accounts in the real project.
 *
 * Only loopback hosts are accepted — a stray value must fail closed, not send
 * credentials somewhere else.
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost']);

export interface EmulatorTarget {
  authUrl: string;
  firestoreHost: string;
  firestorePort: number;
}

export function emulatorTarget(raw: string | undefined): EmulatorTarget | null {
  const host = raw?.trim();
  if (!host || !LOOPBACK.has(host)) return null;
  return { authUrl: `http://${host}:9099`, firestoreHost: host, firestorePort: 8080 };
}
