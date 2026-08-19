/**
 * Guard for `app.config.ts` — the layer that decides whether the two native
 * Firebase files are wired into a build.
 *
 * Why this test exists: `app.json` used to hardcode
 * `android.googleServicesFile: "./google-services.json"` for a file that is
 * gitignored and absent from the repo, so `expo prebuild` — and therefore every
 * EAS build — died before compiling anything. The replacement is conditional,
 * and a conditional is exactly the kind of thing that goes inert without anyone
 * noticing (cf. commit 323f699, where a Firestore rule silently stopped
 * matching). So both branches are pinned here:
 *
 *   - dev/CI, files absent      → resolves, no Firebase keys, no throw
 *   - production, files absent  → throws with an actionable message
 *   - production, files present → both keys wired
 */
import fs from 'fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

jest.mock('fs', () => ({ existsSync: jest.fn() }));

const existsSync = fs.existsSync as unknown as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadConfigFactory = () =>
  require('../app.config').default as (ctx: ConfigContext) => ExpoConfig;

const BASE_CONFIG = {
  name: 'Mama & Bébé',
  slug: 'mama-bebe',
  version: '1.0.0',
  ios: { bundleIdentifier: 'com.mamabebe.app', supportsTablet: true },
  android: { package: 'com.mamabebe.app', versionCode: 8 },
} as unknown as ConfigContext['config'];

const ANDROID_FILE = './google-services.json';
const IOS_FILE = './GoogleService-Info.plist';

/** Make `existsSync` answer for the two Firebase files only. */
const withFirebaseFiles = ({ android, ios }: { android: boolean; ios: boolean }) => {
  existsSync.mockImplementation((p: string) => {
    if (p.endsWith('google-services.json')) return android;
    if (p.endsWith('GoogleService-Info.plist')) return ios;
    return false;
  });
};

describe('app.config.ts — native Firebase file wiring', () => {
  const originalAppEnv = process.env.APP_ENV;

  // NB: no `jest.resetModules()` here. Resetting the registry would hand
  // app.config.ts a *fresh* `fs` mock instance, leaving the `existsSync` handle
  // held above wired to nothing — the mock would look configured and answer
  // `undefined`. The factory reads `process.env` and `fs` on every call, so
  // there is nothing module-level to reset anyway.
  beforeEach(() => {
    existsSync.mockReset();
    delete process.env.APP_ENV;
  });

  afterAll(() => {
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
  });

  describe('outside a production build', () => {
    it('resolves without the Firebase files instead of breaking prebuild', () => {
      withFirebaseFiles({ android: false, ios: false });

      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);

      expect(config.android?.googleServicesFile).toBeUndefined();
      expect(config.ios?.googleServicesFile).toBeUndefined();
    });

    it('keeps every other app.json field untouched', () => {
      withFirebaseFiles({ android: false, ios: false });

      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);

      expect(config.name).toBe('Mama & Bébé');
      expect(config.slug).toBe('mama-bebe');
      expect(config.version).toBe('1.0.0');
      expect(config.ios?.bundleIdentifier).toBe('com.mamabebe.app');
      expect(config.ios?.supportsTablet).toBe(true);
      expect(config.android?.package).toBe('com.mamabebe.app');
      expect(config.android?.versionCode).toBe(8);
    });

    it('wires the files when they happen to be present', () => {
      withFirebaseFiles({ android: true, ios: true });

      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);

      expect(config.android?.googleServicesFile).toBe(ANDROID_FILE);
      expect(config.ios?.googleServicesFile).toBe(IOS_FILE);
    });
  });

  describe('production build', () => {
    beforeEach(() => {
      process.env.APP_ENV = 'production';
    });

    it('wires both files when the owner has dropped them in (GT-5)', () => {
      withFirebaseFiles({ android: true, ios: true });

      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);

      expect(config.android?.googleServicesFile).toBe(ANDROID_FILE);
      expect(config.ios?.googleServicesFile).toBe(IOS_FILE);
    });

    it.each([
      ['both missing', { android: false, ios: false }, [ANDROID_FILE, IOS_FILE]],
      ['android missing', { android: false, ios: true }, [ANDROID_FILE]],
      ['ios missing', { android: true, ios: false }, [IOS_FILE]],
    ])(
      'refuses to build a store binary with a dead App Check — %s',
      (_label, presence, expectedInMessage) => {
        withFirebaseFiles(presence);
        const factory = loadConfigFactory();

        expect(() => factory({ config: BASE_CONFIG } as ConfigContext)).toThrow(
          /\[app\.config\] Production build is missing/,
        );

        // The message has to name the missing file(s) — a guard nobody can act
        // on is barely better than no guard.
        let message = '';
        try {
          factory({ config: BASE_CONFIG } as ConfigContext);
        } catch (err) {
          message = (err as Error).message;
        }
        expectedInMessage.forEach((file) => expect(message).toContain(file));
        expect(message).toContain('com.mamabebe.app');
      },
    );
  });
});
