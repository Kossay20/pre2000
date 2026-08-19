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
 * `@react-native-firebase` and with it App Check (see `src/config/firebase.ts`,
 * whose init is deliberately wrapped in try/catch). A store binary with a dead
 * anti-abuse layer is worse than a build that refuses to start, so production
 * fails loudly instead.
 */

const ANDROID_FIREBASE_FILE = './google-services.json';
const IOS_FIREBASE_FILE = './GoogleService-Info.plist';

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

export default ({ config }: ConfigContext): ExpoConfig => {
  const isProductionBuild = process.env.APP_ENV === 'production';
  const hasAndroidFirebaseFile = existsInProject(ANDROID_FIREBASE_FILE);
  const hasIosFirebaseFile = existsInProject(IOS_FIREBASE_FILE);

  if (isProductionBuild && !(hasAndroidFirebaseFile && hasIosFirebaseFile)) {
    const missing = [
      hasAndroidFirebaseFile ? null : ANDROID_FIREBASE_FILE,
      hasIosFirebaseFile ? null : IOS_FIREBASE_FILE,
    ].filter(Boolean);

    throw new Error(
      `[app.config] Production build is missing ${missing.join(' and ')}.\n` +
        'Download them from Firebase Console → Project settings → Your apps ' +
        `(package/bundle id ${config.ios?.bundleIdentifier ?? 'com.mamabebe.app'}) ` +
        'and place them at the root of app/. Without them @react-native-firebase ' +
        'never initialises and App Check is inert in the shipped binary.',
    );
  }

  return {
    ...config,
    name: config.name ?? 'Mama & Bébé',
    slug: config.slug ?? 'mama-bebe',
    plugins: withSentryPlugin(config.plugins ?? []),
    ios: {
      ...config.ios,
      ...(hasIosFirebaseFile ? { googleServicesFile: IOS_FIREBASE_FILE } : {}),
    },
    android: {
      ...config.android,
      // app.json no longer hardcodes this — the file is only referenced when present.
      ...(hasAndroidFirebaseFile ? { googleServicesFile: ANDROID_FIREBASE_FILE } : {}),
    },
  };
};
