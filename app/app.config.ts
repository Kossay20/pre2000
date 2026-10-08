import fs from 'fs';
import path from 'path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic layer on top of `app.json`.
 *
 * The only thing this file does is decide whether the two native Firebase
 * config files are wired into the build:
 *
 *   - `google-services.json`      (Android)
 *   - `GoogleService-Info.plist`  (iOS)
 *
 * They are downloaded per-project from the Firebase Console and are gitignored
 * (see `.gitignore` "Firebase native config"), so they are absent on a fresh
 * clone and in CI. Referencing them unconditionally — which `app.json` used to
 * do for Android — makes `expo prebuild` (and therefore every EAS build) fail
 * with a file-not-found before a single line of app code runs.
 *
 * So: reference them when they exist, stay silent when they don't — EXCEPT in a
 * production build, where shipping without them would silently disable
 * `@react-native-firebase` and with it App Check (see `src/config/appCheck.native.ts`,
 * whose init deliberately fails open). A store binary with a dead anti-abuse layer
 * is worse than a build that refuses to start, so production fails loudly instead.
 *
 * It also refuses a production or preview build whose Firebase web config
 * (`EXPO_PUBLIC_FIREBASE_*`) is not in the environment — see REQUIRED_FIREBASE_ENV.
 */

/**
 * Both files are gitignored, and EAS uploads the project the way git sees it: a
 * copy in the owner's app/ folder satisfies this file when `eas build` resolves
 * the config locally, then is missing on the build worker. EAS file environment
 * variables (`eas env:create --type file`) are how they reach the worker; EAS
 * sets each variable to the absolute path of the uploaded file. A local copy is
 * still honoured for local builds and prebuilds.
 */
const ANDROID_FIREBASE_FILE = './google-services.json';
const IOS_FIREBASE_FILE = './GoogleService-Info.plist';
const ANDROID_FIREBASE_ENV = 'GOOGLE_SERVICES_JSON';
const IOS_FIREBASE_ENV = 'GOOGLE_SERVICE_INFO_PLIST';

const existsInProject = (relativePath: string): boolean =>
  fs.existsSync(path.resolve(__dirname, relativePath));

/**
 * Add the Sentry config plugin only when it can be configured.
 *
 * `App.tsx` calls `Sentry.init` in production, but without the config plugin the
 * native build never uploads source maps — so every production stack trace
 * arrives as minified Hermes bytecode offsets, which is barely better than no
 * crash reporting at all.
 *
 * The plugin is gated on the credentials being present rather than added
 * unconditionally: it injects Gradle and Xcode build steps, and a half-configured
 * upload step fails the build. With `SENTRY_ORG` / `SENTRY_PROJECT` absent (local
 * dev, CI, anyone cloning) the config is byte-identical to not having it.
 * Set both as EAS secrets, along with `SENTRY_AUTH_TOKEN`, to switch it on.
 */
type Plugins = NonNullable<ExpoConfig['plugins']>;

const withSentryPlugin = (plugins: Plugins): Plugins => {
  const organization = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!organization || !project) return plugins;
  if (plugins.some((p) => (Array.isArray(p) ? p[0] : p) === '@sentry/react-native/expo')) {
    return plugins;
  }
  // Annotated rather than inferred: a bare array literal widens to `(string |
  // object)[]`, which does not satisfy the `[string, any]` tuple in ExpoConfig.
  const entry: [string, Record<string, string>] = [
    '@sentry/react-native/expo',
    { organization, project, url: 'https://sentry.io/' },
  ];
  return [...plugins, entry];
};

/** Config plugins that abort prebuild outright when the Firebase files are absent. */
const FIREBASE_PLUGINS = ['@react-native-firebase/app', '@react-native-firebase/app-check'];

/**
 * Drop the React Native Firebase plugins when their config files are not there.
 *
 * Making `googleServicesFile` conditional is not enough on its own — which only a
 * real `expo prebuild` revealed. The `@react-native-firebase/app` plugin does not
 * treat the field as optional: with it unset it throws
 * "Path to google-services.json is not defined" and kills prebuild before a single
 * file is generated. So the intended behaviour — a clone without the per-project
 * Firebase files can still build — needs the plugins themselves gated, not just
 * the path.
 *
 * Dropping them is safe: `src/config/firebase.ts` already wraps the App Check
 * init in try/catch precisely because the native module is absent in Expo Go and
 * in any build made without prebuilding it. What changes is nothing at runtime,
 * and a build that can actually be produced.
 *
 * A production build never reaches this — it fails earlier, by design, naming the
 * missing file. Shipping a store binary with a silently disabled anti-abuse layer
 * is the one outcome worth refusing.
 */
const withFirebasePlugins = (plugins: Plugins, filesPresent: boolean): Plugins =>
  filesPresent
    ? plugins
    : plugins.filter((p) => !FIREBASE_PLUGINS.includes(Array.isArray(p) ? String(p[0]) : String(p)));

/**
 * The Firebase web config the JS SDK is initialised with (`src/config/firebase.ts`).
 *
 * Metro inlines `EXPO_PUBLIC_*` values into the bundle at build time, and locally
 * they come from `.env` — which is gitignored, so it never reaches an EAS worker.
 * A build made without them has `apiKey: undefined`, and Firebase Auth throws
 * `auth/invalid-api-key` while the module is evaluated: the binary dies on launch,
 * before any screen. That is a guaranteed store rejection, and on a preview APK it
 * is a tester's first impression.
 *
 * They must be set as EAS environment variables (plaintext or sensitive — a
 * `secret` one is not visible to EAS CLI when it resolves this file). See the owner
 * actions in docs/RELEASE_READINESS_2026-08-19.md §4.
 */
export const REQUIRED_FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

/**
 * The EAS profiles whose binary goes to someone else's phone. `development` is a
 * dev client pointed at a local Metro that reads `.env` itself; local
 * `expo start` / `expo export`, Jest and the e2e harness leave APP_ENV unset. None
 * of those are guarded.
 */
const DISTRIBUTED_PROFILES = ['production', 'preview'];

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = process.env.APP_ENV ?? '';
  const isProductionBuild = appEnv === 'production';

  if (DISTRIBUTED_PROFILES.includes(appEnv)) {
    const missingEnv = REQUIRED_FIREBASE_ENV.filter((name) => !process.env[name]?.trim());
    if (missingEnv.length > 0) {
      throw new Error(
        `[app.config] ${appEnv} build is missing ${missingEnv.join(', ')}.\n` +
          'These live only in the gitignored .env, which EAS never uploads. Without ' +
          'them the app crashes on launch (Firebase auth/invalid-api-key). Create each ' +
          `one on EAS: eas env:create --environment ${appEnv} --name <NAME> --value <value> ` +
          '--visibility plaintext (see docs/RELEASE_READINESS_2026-08-19.md §4).',
      );
    }
  }

  const androidFirebaseFile = process.env[ANDROID_FIREBASE_ENV]?.trim() || ANDROID_FIREBASE_FILE;
  const iosFirebaseFile = process.env[IOS_FIREBASE_ENV]?.trim() || IOS_FIREBASE_FILE;
  const hasAndroidFirebaseFile = existsInProject(androidFirebaseFile);
  const hasIosFirebaseFile = existsInProject(iosFirebaseFile);

  if (isProductionBuild && !(hasAndroidFirebaseFile && hasIosFirebaseFile)) {
    const missing = [
      hasAndroidFirebaseFile ? null : androidFirebaseFile,
      hasIosFirebaseFile ? null : iosFirebaseFile,
    ].filter(Boolean);

    throw new Error(
      `[app.config] Production build is missing ${missing.join(' and ')}.\n` +
        'Download them from Firebase Console → Project settings → Your apps ' +
        `(package/bundle id ${config.ios?.bundleIdentifier ?? 'com.mamabebe.app'}). ` +
        'They are gitignored, so EAS does not upload them: register each one as an ' +
        `EAS file variable — eas env:create --environment production --name ${ANDROID_FIREBASE_ENV} ` +
        `--type file --value ./google-services.json, and the same with ${IOS_FIREBASE_ENV} ` +
        'for ./GoogleService-Info.plist. Without them @react-native-firebase never ' +
        'initialises and App Check is inert in the shipped binary.',
    );
  }

  return {
    ...config,
    name: config.name ?? 'Mama & Bébé',
    slug: config.slug ?? 'mama-bebe',
    plugins: withSentryPlugin(
      withFirebasePlugins(config.plugins ?? [], hasAndroidFirebaseFile && hasIosFirebaseFile),
    ),
    ios: {
      ...config.ios,
      ...(hasIosFirebaseFile ? { googleServicesFile: iosFirebaseFile } : {}),
    },
    android: {
      ...config.android,
      // app.json no longer hardcodes this — the file is only referenced when present.
      ...(hasAndroidFirebaseFile ? { googleServicesFile: androidFirebaseFile } : {}),
    },
  };
};
