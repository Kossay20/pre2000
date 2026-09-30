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
  plugins: ['expo-sqlite', ['expo-notifications', { icon: './assets/notification-icon.png' }]],
} as unknown as ConfigContext['config'];

const pluginNames = (config: ExpoConfig): string[] =>
  (config.plugins ?? []).map((p) => (Array.isArray(p) ? String(p[0]) : String(p)));

const ANDROID_FILE = './google-services.json';

const FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

/** Put a plausible value in every Firebase web-config variable. */
const withFirebaseEnv = () => {
  FIREBASE_ENV.forEach((name) => {
    process.env[name] = `test-${name.toLowerCase()}`;
  });
};

const messageOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return '';
};
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
  const originalEnv = { ...process.env };

  // NB: no `jest.resetModules()` here. Resetting the registry would hand
  // app.config.ts a *fresh* `fs` mock instance, leaving the `existsSync` handle
  // held above wired to nothing — the mock would look configured and answer
  // `undefined`. The factory reads `process.env` and `fs` on every call, so
  // there is nothing module-level to reset anyway.
  beforeEach(() => {
    existsSync.mockReset();
    delete process.env.APP_ENV;
    delete process.env.SENTRY_ORG;
    delete process.env.SENTRY_PROJECT;
    FIREBASE_ENV.forEach((name) => delete process.env[name]);
  });

  afterAll(() => {
    process.env = originalEnv;
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

  describe('React Native Firebase plugins', () => {
    // Making `googleServicesFile` conditional was not enough, and only a real
    // `expo prebuild` showed why: the @react-native-firebase/app plugin does not
    // treat the field as optional. With it unset it throws "Path to
    // google-services.json is not defined" and kills prebuild before generating a
    // single file — so a clone without the per-project Firebase files could not
    // build at all, which was the exact opposite of the intent.
    const FIREBASE = ['@react-native-firebase/app', '@react-native-firebase/app-check'];
    const WITH_FIREBASE = {
      ...(BASE_CONFIG as object),
      plugins: ['expo-sqlite', ...FIREBASE, 'expo-font'],
    } as unknown as ConfigContext['config'];

    it('drops them when the config files are absent, so prebuild can run', () => {
      withFirebaseFiles({ android: false, ios: false });

      const config = loadConfigFactory()({ config: WITH_FIREBASE } as ConfigContext);

      expect(pluginNames(config)).not.toContain('@react-native-firebase/app');
      expect(pluginNames(config)).not.toContain('@react-native-firebase/app-check');
    });

    it('keeps every other plugin while doing so', () => {
      withFirebaseFiles({ android: false, ios: false });

      const config = loadConfigFactory()({ config: WITH_FIREBASE } as ConfigContext);

      expect(pluginNames(config)).toEqual(['expo-sqlite', 'expo-font']);
    });

    it('keeps them when both files are present', () => {
      withFirebaseFiles({ android: true, ios: true });

      const config = loadConfigFactory()({ config: WITH_FIREBASE } as ConfigContext);

      expect(pluginNames(config)).toEqual(expect.arrayContaining(FIREBASE));
    });

    it.each([
      ['android only', { android: true, ios: false }],
      ['ios only', { android: false, ios: true }],
    ])('drops them when only the %s file is there — a half-wired native layer is worse', (_l, presence) => {
      withFirebaseFiles(presence);

      const config = loadConfigFactory()({ config: WITH_FIREBASE } as ConfigContext);

      expect(pluginNames(config)).not.toEqual(expect.arrayContaining(FIREBASE));
    });
  });

  describe('Sentry config plugin', () => {
    // Sentry.init runs in production (App.tsx), but without the config plugin the
    // native build uploads no source maps, so every crash arrives as minified
    // Hermes offsets. The plugin injects Gradle/Xcode steps, though, and a
    // half-configured upload step fails the build — hence the gate.
    beforeEach(() => {
      withFirebaseFiles({ android: false, ios: false });
    });

    it('is absent when the credentials are not set', () => {
      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);
      expect(pluginNames(config)).not.toContain('@sentry/react-native/expo');
    });

    it('is added when both org and project are set', () => {
      process.env.SENTRY_ORG = 'mama-bebe';
      process.env.SENTRY_PROJECT = 'mobile';

      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);
      expect(pluginNames(config)).toContain('@sentry/react-native/expo');

      const entry = (config.plugins ?? []).find(
        (p) => Array.isArray(p) && p[0] === '@sentry/react-native/expo',
      ) as [string, Record<string, string>];
      expect(entry[1]).toMatchObject({ organization: 'mama-bebe', project: 'mobile' });
    });

    it.each([
      ['only org', { SENTRY_ORG: 'mama-bebe' }],
      ['only project', { SENTRY_PROJECT: 'mobile' }],
    ])('stays off with %s — a partial config breaks the build', (_label, env) => {
      Object.assign(process.env, env);
      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);
      expect(pluginNames(config)).not.toContain('@sentry/react-native/expo');
    });

    it('never drops the plugins declared in app.json', () => {
      process.env.SENTRY_ORG = 'mama-bebe';
      process.env.SENTRY_PROJECT = 'mobile';

      const config = loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext);
      expect(pluginNames(config)).toEqual(
        expect.arrayContaining(['expo-sqlite', 'expo-notifications']),
      );
    });

    it('does not add itself twice', () => {
      process.env.SENTRY_ORG = 'mama-bebe';
      process.env.SENTRY_PROJECT = 'mobile';
      const factory = loadConfigFactory();

      const once = factory({ config: BASE_CONFIG } as ConfigContext);
      const twice = factory({ config: once as unknown as ConfigContext['config'] } as ConfigContext);

      const occurrences = pluginNames(twice).filter((n) => n === '@sentry/react-native/expo');
      expect(occurrences).toHaveLength(1);
    });
  });

  describe('production build', () => {
    beforeEach(() => {
      process.env.APP_ENV = 'production';
      withFirebaseEnv();
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

  describe('Firebase web config in the environment (EXPO_PUBLIC_FIREBASE_*)', () => {
    // The six values live only in the gitignored .env, which EAS never uploads.
    // A build without them evaluates `initializeApp({ apiKey: undefined })` and
    // Firebase Auth throws auth/invalid-api-key at module load — the binary dies
    // on launch. The guard has to catch that before a 20-minute build does.
    beforeEach(() => {
      withFirebaseFiles({ android: true, ios: true });
    });

    it.each([['production'], ['preview']])(
      'refuses a %s build with none of them, naming all six',
      (profile) => {
        process.env.APP_ENV = profile;
        const factory = loadConfigFactory();

        const message = messageOf(() => factory({ config: BASE_CONFIG } as ConfigContext));

        expect(message).toContain(`[app.config] ${profile} build is missing`);
        FIREBASE_ENV.forEach((name) => expect(message).toContain(name));
        // Actionable: says where they go, with the environment already filled in.
        expect(message).toContain(`eas env:create --environment ${profile}`);
      },
    );

    it('names only the one that is missing — or blank', () => {
      process.env.APP_ENV = 'production';
      withFirebaseEnv();
      process.env.EXPO_PUBLIC_FIREBASE_APP_ID = '   ';
      const factory = loadConfigFactory();

      const message = messageOf(() => factory({ config: BASE_CONFIG } as ConfigContext));

      expect(message).toContain('EXPO_PUBLIC_FIREBASE_APP_ID');
      expect(message).not.toContain('EXPO_PUBLIC_FIREBASE_API_KEY');
    });

    it.each([['production'], ['preview']])('lets a %s build through when all six are set', (profile) => {
      process.env.APP_ENV = profile;
      withFirebaseEnv();

      expect(() => loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext)).not.toThrow();
    });

    it.each([
      ['a development client', 'development'],
      ['local expo start / export, Jest and the e2e harness', undefined],
    ])('does not guard %s, which read .env locally', (_label, appEnv) => {
      if (appEnv) process.env.APP_ENV = appEnv;

      expect(() => loadConfigFactory()({ config: BASE_CONFIG } as ConfigContext)).not.toThrow();
    });

    it('guards exactly the six keys src/config/firebase.ts initialises with', () => {
      // If firebase.ts grows a seventh key, the guard must grow with it.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { REQUIRED_FIREBASE_ENV } = require('../app.config');
      const firebaseSource = jest
        .requireActual<typeof import('fs')>('fs')
        .readFileSync(require('path').resolve(__dirname, '../src/config/firebase.ts'), 'utf8');
      const used = [...new Set(firebaseSource.match(/EXPO_PUBLIC_FIREBASE_[A-Z_]+(?=!)/g) ?? [])];

      expect([...REQUIRED_FIREBASE_ENV].sort()).toEqual(used.sort());
      expect([...REQUIRED_FIREBASE_ENV].sort()).toEqual([...FIREBASE_ENV].sort());
    });
  });
});
