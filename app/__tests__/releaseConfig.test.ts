/**
 * Release-configuration invariants that only surface at build or submit time.
 *
 * Everything here failed, or would have failed, on a real EAS run — the slowest
 * possible place to learn about a two-character mistake.
 */
import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(APP_DIR, relative), 'utf8');

const easJson = JSON.parse(read('eas.json'));
const appJson = JSON.parse(read('app.json')).expo;

describe('eas.json', () => {
  it('uses remote version source, because the config is dynamic', () => {
    // `autoIncrement` with `appVersionSource: "local"` makes EAS CLI write the
    // bumped build number back into app.json — and it cannot write to a dynamic
    // config. Since app.config.ts exists (it gates the native Firebase files),
    // the local source would fail the production build outright.
    expect(fs.existsSync(path.join(APP_DIR, 'app.config.ts'))).toBe(true);
    expect(easJson.cli.appVersionSource).toBe('remote');
  });

  it('auto-increments the production build number', () => {
    // Both stores reject a build number that has already been uploaded, and
    // hand-bumping is exactly the step that gets skipped under pressure.
    expect(easJson.build.production.autoIncrement).toBe(true);
  });

  it('routes every profile to its own update channel', () => {
    // The app ships expo-updates and declares an update URL. Without a channel
    // per profile there is no way to push a hotfix to production after release.
    const profiles = Object.entries(easJson.build) as [string, { channel?: string }][];
    const unrouted = profiles.filter(([, config]) => !config.channel).map(([name]) => name);
    expect(unrouted).toEqual([]);

    const channels = profiles.map(([, config]) => config.channel);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('pins the Node version the toolchain needs on every profile', () => {
    const profiles = Object.values(easJson.build) as { node?: string }[];
    const unpinned = profiles.filter((config) => !config.node);
    expect(unpinned).toEqual([]);
  });

  it('builds an app bundle for Play, not an APK', () => {
    // Play has required AAB for new apps since 2021.
    expect(easJson.build.production.android.buildType).toBe('app-bundle');
    expect(easJson.build.production.distribution).toBe('store');
  });

  it('names the iOS submit credentials instead of leaving an empty object', () => {
    const ios = easJson.submit.production.ios;
    expect(Object.keys(ios).sort()).toEqual(['appleId', 'appleTeamId', 'ascAppId']);
  });

  it('never inlines a credential — they come from the environment', () => {
    const ios = easJson.submit.production.ios as Record<string, string>;
    for (const value of Object.values(ios)) {
      expect(value.startsWith('$')).toBe(true);
    }
  });
});

describe('secrets are not committable', () => {
  const gitignore = read('.gitignore');

  it.each([
    ['.env', /^\.env$/m],
    ['the Play upload key', /google-service-account\.json/],
    ['the Firebase Android config', /google-services\.json/],
    ['the Firebase iOS config', /GoogleService-Info\.plist/],
    ['signing keystores', /\*\.jks/],
    ['Apple auth keys', /\*\.p8/],
  ])('%s is gitignored', (_label, pattern) => {
    expect(gitignore).toMatch(pattern);
  });
});

describe('app.json store metadata', () => {
  it('declares the same identifier on both platforms', () => {
    expect(appJson.ios.bundleIdentifier).toBe(appJson.android.package);
  });

  it('answers the export-compliance question up front', () => {
    // Left undeclared, App Store Connect blocks every single build on a manual
    // encryption questionnaire.
    expect(appJson.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('ships a privacy manifest, which Apple requires for this SDK set', () => {
    expect(Array.isArray(appJson.ios.privacyManifests?.NSPrivacyCollectedDataTypes)).toBe(true);
    expect(appJson.ios.privacyManifests.NSPrivacyCollectedDataTypes.length).toBeGreaterThan(0);
  });

  describe('privacy manifest matches what the binary sends', () => {
    type Entry = {
      NSPrivacyCollectedDataType: string;
      NSPrivacyCollectedDataTypeLinked: boolean;
      NSPrivacyCollectedDataTypePurposes: string[];
    };
    const entries = (): Entry[] => appJson.ios.privacyManifests.NSPrivacyCollectedDataTypes;
    const byType = (type: string) =>
      entries().find((e) => e.NSPrivacyCollectedDataType === `NSPrivacyCollectedDataType${type}`);
    const appSource = read('App.tsx');

    it('claims no analytics purpose — analytics is a no-op on native', () => {
      // firebase/analytics' isSupported() resolves false on React Native, so every
      // analyticsService call does nothing (src/config/firebase.ts).
      const analytics = entries().filter((e) =>
        e.NSPrivacyCollectedDataTypePurposes.includes('NSPrivacyCollectedDataTypePurposeAnalytics'),
      );
      expect(analytics).toEqual([]);
    });

    it('declares what Sentry collects in production', () => {
      expect(appSource).toMatch(/Sentry\.init\(/);
      expect(byType('CrashData')).toBeDefined();
      expect(byType('OtherDiagnosticData')).toBeDefined(); // device/OS context on every event
      const tracesSampleRate = Number(appSource.match(/tracesSampleRate:\s*([\d.]+)/)?.[1] ?? 0);
      if (tracesSampleRate > 0) expect(byType('PerformanceData')).toBeDefined();
      // Sentry.wrap adds a TouchEventBoundary: taps become breadcrumbs.
      if (/Sentry\.wrap\(/.test(appSource)) expect(byType('ProductInteraction')).toBeDefined();
    });

    it('marks everything stored under the account as linked (F-040)', () => {
      // AuthContext writes the UserProfile to userProfiles/{uid}, so each personal field on
      // it is data linked to the user in Apple's definition. The country was declared
      // "not linked" while it sat in that document.
      expect(read('src/context/AuthContext.tsx')).toMatch(/doc\(db, 'userProfiles', /);
      const profileType = read('src/types/index.ts').match(/export interface UserProfile \{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(profileType).not.toBe('');
      const storedUnderAccount: [string, string][] = [
        ['firstName', 'Name'],
        ['email', 'EmailAddress'],
        ['country', 'CoarseLocation'],
        ['emergencyContacts', 'OtherContactInfo'],
      ];
      for (const [field, type] of storedUnderAccount) {
        expect({ field, declared: profileType.includes(`${field}`) }).toEqual({ field, declared: true });
        expect({ type, linked: byType(type)?.NSPrivacyCollectedDataTypeLinked }).toEqual({ type, linked: true });
      }
    });

    it('names the onboarding age range and first-pregnancy flag in the health/sensitive answers (F-043)', () => {
      // Onboarding collects both and AuthContext writes them to userProfiles/{uid}: data the
      // account is linked to. No manifest type exists for them, so they are declared inside
      // the Health and Sensitive Info rows (both linked) and in the Play "Other info" row.
      const onboarding = read('src/screens/OnboardingScreen.tsx');
      const authSource = read('src/context/AuthContext.tsx');
      expect(onboarding).toMatch(/setAgeRange\(/);
      expect(onboarding).toMatch(/ageRange \|\| undefined/);
      expect(onboarding).toMatch(/isFirstPregnancy \?\? undefined/);
      expect(authSource).toMatch(/profileData\.ageRange = ageRange/);
      expect(authSource).toMatch(/profileData\.isFirstPregnancy = isFirstPregnancy/);
      const profileType = read('src/types/index.ts').match(/export interface UserProfile \{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(profileType).toMatch(/ageRange\?:/);
      expect(profileType).toMatch(/isFirstPregnancy\?:/);

      const store = JSON.parse(read('store/app-privacy.json')) as {
        dataTypes: { manifestType: string; linkedToUser: boolean; what: string }[];
      };
      const rowFor = (type: string) => store.dataTypes.find((d) => d.manifestType === `NSPrivacyCollectedDataType${type}`)!;
      expect(rowFor('Health').what).toMatch(/first-pregnancy/i);
      expect(rowFor('SensitiveInfo').what).toMatch(/age range/i);
      expect(rowFor('SensitiveInfo').what).toMatch(/first-pregnancy/i);
      for (const type of ['Health', 'SensitiveInfo']) {
        expect({ type, linked: rowFor(type).linkedToUser }).toEqual({ type, linked: true });
        expect({ type, linked: byType(type)?.NSPrivacyCollectedDataTypeLinked }).toEqual({ type, linked: true });
      }

      const safety = JSON.parse(read('store/data-safety.json')) as {
        dataCollected: { appleEquivalent: string; note?: string }[];
      };
      const sensitive = safety.dataCollected.find((d) => d.appleEquivalent === 'NSPrivacyCollectedDataTypeSensitiveInfo')!;
      expect(sensitive.note).toMatch(/age range/i);
      expect(sensitive.note).toMatch(/first-pregnancy/i);
    });

    it('does not claim a city: onboarding never collects one (F-043)', () => {
      expect(read('src/screens/OnboardingScreen.tsx')).toMatch(/undefined, \/\/ city/);
      for (const file of ['store/app-privacy.json', 'store/data-safety.json']) {
        expect(read(file)).not.toMatch(/country\/city/i);
      }
      for (const page of ['privacy.html', 'privacy-en.html']) {
        const text = fs.readFileSync(path.resolve(__dirname, '..', '..', 'website', page), 'utf8');
        expect(text).not.toMatch(/\b(ville|city)\b/i);
      }
    });

    it('declares no data type as not linked while the app stores it under the uid', () => {
      const notLinked = entries()
        .filter((e) => e.NSPrivacyCollectedDataTypeLinked === false)
        .map((e) => e.NSPrivacyCollectedDataType);
      expect(notLinked).toEqual([]);
    });

    it('keeps store/app-privacy.json linked flags equal to the manifest', () => {
      const store = JSON.parse(read('store/app-privacy.json')) as {
        dataTypes: { manifestType: string; linkedToUser: boolean }[];
      };
      for (const row of store.dataTypes) {
        const manifest = entries().find((e) => e.NSPrivacyCollectedDataType === row.manifestType);
        expect({ type: row.manifestType, linked: row.linkedToUser }).toEqual({
          type: row.manifestType,
          linked: manifest?.NSPrivacyCollectedDataTypeLinked,
        });
      }
    });

    it('does not claim journal or chatbot history is stored (F-041)', () => {
      for (const file of ['store/app-privacy.json', 'store/data-safety.json']) {
        const text = read(file);
        expect(text).not.toMatch(/journal notes/i);
        expect(text).not.toMatch(/chatbot history (stored|\.)/i);
      }
    });

    it('scrubs transactions and breadcrumbs, and flags the pre-login Device ID (F-042)', () => {
      expect(appSource).toMatch(/beforeSendTransaction:/);
      expect(appSource).toMatch(/beforeBreadcrumb:/);
      for (const file of ['store/app-privacy.json', 'store/data-safety.json']) {
        expect(JSON.parse(read(file)).ownerChecklist.join(' ')).toMatch(/Device ID/);
      }
    });

    it('marks Sentry data as linked, because every event carries the user id hash', () => {
      // logger.setUser sends SHA-256(uid) — a stable identifier, which Apple
      // counts as linking the data to the user.
      expect(read('src/utils/logger.ts')).toMatch(/setUser/);
      for (const type of ['CrashData', 'PerformanceData', 'OtherDiagnosticData', 'ProductInteraction']) {
        expect({ type, linked: byType(type)?.NSPrivacyCollectedDataTypeLinked }).toEqual({
          type,
          linked: true,
        });
      }
    });
  });

  it('declares no data type as used for tracking', () => {
    // The listing (store/listing.json) and App Privacy answers both say the app
    // does not track. The manifest has to agree, or the submission contradicts
    // itself.
    const tracking = appJson.ios.privacyManifests.NSPrivacyCollectedDataTypes.filter(
      (entry: { NSPrivacyCollectedDataTypeTracking: boolean }) =>
        entry.NSPrivacyCollectedDataTypeTracking === true,
    );
    expect(tracking).toEqual([]);
  });

  it('carries no fake notification usage string', () => {
    // iOS has no usage-description key for notifications — the system dialog
    // text is fixed — so NSUserNotificationsUsageDescription was a French-only
    // string nobody ever saw. The context is given in-app, before the request
    // (Reminders tab banner).
    expect(appJson.ios.infoPlist.NSUserNotificationsUsageDescription).toBeUndefined();
  });

  it('declares the App Attest environment App Check needs on iOS', () => {
    // src/config/appCheck.native.ts uses appAttestWithDeviceCheckFallback in
    // release. Without this entitlement attestation fails on every iOS 14+
    // device, and enforcing App Check would lock out every iPhone user.
    expect(appJson.ios.entitlements['com.apple.developer.devicecheck.appattest-environment']).toBe(
      'production',
    );
  });

  it('declares its iOS localizations, so the store and the system UI list them', () => {
    // expo-localization writes these to CFBundleLocalizations. Without it the App
    // Store shows "English" only and system chrome (alerts, share sheet, pickers)
    // stays English for fr and ar users. Tunisian (tn) is deliberately absent:
    // iOS ships no Tunisian Arabic localization, so declaring it would change
    // nothing — a tn user's device is in Arabic or French, both declared.
    const entry = appJson.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-localization',
    ) as [string, { supportedLocales: { ios: string[] }; allowDynamicLocaleChangesAndroid: boolean }];
    expect(entry).toBeDefined();
    expect([...entry[1].supportedLocales.ios].sort()).toEqual(['ar', 'en', 'fr']);
    // Passing options replaces the plugin's default of `true` here; losing it would
    // make Android restart the activity on a locale change.
    expect(entry[1].allowDynamicLocaleChangesAndroid).toBe(true);
  });

  it('requests only the Android permissions it uses, and blocks the rest', () => {
    expect(appJson.android.permissions.sort()).toEqual([
      'POST_NOTIFICATIONS',
      'RECEIVE_BOOT_COMPLETED',
      'VIBRATE',
    ]);
    // Play's Data Safety form is answered against the manifest; a permission
    // pulled in by a transitive dependency would silently contradict it.
    expect(appJson.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.CAMERA',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.READ_CONTACTS',
      ]),
    );
  });

  it('keeps the store-facing URLs in the binary and the listing in step', () => {
    const listing = JSON.parse(read('store/listing.json'));
    expect(appJson.extra.privacyPolicyUrl).toBe(listing.shared.privacyPolicyUrl);
    expect(appJson.extra.marketingUrl).toBe(listing.shared.marketingUrl);
  });
});

describe('Android target SDK', () => {
  it('stays at or above the Play minimum (35) through the React Native default', () => {
    // No expo-build-properties override exists, so targetSdk is whatever
    // react-native ships. An RN or Expo downgrade would otherwise slip under the
    // Play requirement unnoticed until the upload is rejected.
    expect(appJson.plugins.some((p: unknown) => (Array.isArray(p) ? p[0] : p) === 'expo-build-properties')).toBe(
      false,
    );
    const toml = read('node_modules/react-native/gradle/libs.versions.toml');
    const targetSdk = Number(toml.match(/^targetSdk\s*=\s*"(\d+)"/m)?.[1]);
    expect(Number.isInteger(targetSdk)).toBe(true);
    expect(targetSdk).toBeGreaterThanOrEqual(35);
  });
});

describe('store privacy answers (store/app-privacy.json, store/data-safety.json)', () => {
  type ManifestEntry = {
    NSPrivacyCollectedDataType: string;
    NSPrivacyCollectedDataTypeLinked: boolean;
    NSPrivacyCollectedDataTypeTracking: boolean;
  };
  const manifest = appJson.ios.privacyManifests;
  const entries: ManifestEntry[] = manifest.NSPrivacyCollectedDataTypes;
  const appPrivacy = JSON.parse(read('store/app-privacy.json'));
  const dataSafety = JSON.parse(read('store/data-safety.json'));

  it('flags both files as drafts the owner must confirm in the consoles', () => {
    expect(appPrivacy._status).toMatch(/owner MUST confirm/);
    expect(dataSafety._status).toMatch(/owner MUST confirm/);
  });

  it('App Privacy lists exactly the data types of the iOS privacy manifest, with the same linking', () => {
    const answered = appPrivacy.dataTypes.map((d: { manifestType: string }) => d.manifestType).sort();
    expect(answered).toEqual(entries.map((e) => e.NSPrivacyCollectedDataType).sort());
    for (const d of appPrivacy.dataTypes) {
      const entry = entries.find((e) => e.NSPrivacyCollectedDataType === d.manifestType)!;
      expect({ type: d.manifestType, linked: d.linkedToUser }).toEqual({
        type: d.manifestType,
        linked: entry.NSPrivacyCollectedDataTypeLinked,
      });
      expect(d.usedForTracking).toBe(entry.NSPrivacyCollectedDataTypeTracking);
    }
  });

  it('declares no tracking and no advertising anywhere', () => {
    expect(appPrivacy.tracking).toBe(manifest.NSPrivacyTracking);
    expect(appPrivacy.trackingDomains).toEqual(manifest.NSPrivacyTrackingDomains);
    expect(appPrivacy.advertising).toBe(false);
    expect(dataSafety.advertising).toBe(false);
    expect(dataSafety.sellsData).toBe(false);
    expect(dataSafety.dataShared).toEqual([]);
  });

  it('Data safety covers every manifest data type through appleEquivalent', () => {
    const covered = new Set(dataSafety.dataCollected.map((d: { appleEquivalent: string }) => d.appleEquivalent));
    for (const e of entries) expect(covered).toContain(e.NSPrivacyCollectedDataType);
    for (const c of covered) expect(entries.map((e) => e.NSPrivacyCollectedDataType)).toContain(c);
  });

  it('Data safety names health data, crash logs and the deletion URL the binary ships', () => {
    const types = dataSafety.dataCollected.map((d: { playType: string }) => d.playType);
    expect(types).toEqual(expect.arrayContaining(['Health info', 'Crash logs', 'Email address', 'User IDs']));
    expect(dataSafety.encryptedInTransit).toBe(true);
    expect(dataSafety.userCanRequestDeletion).toBe(true);
    expect(dataSafety.accountDeletionUrl).toBe(appJson.extra.accountDeletionUrl);
  });

  it('keeps Data safety honest about permissions: no location or contacts collection beyond typed input', () => {
    expect(appJson.android.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.ACCESS_FINE_LOCATION', 'android.permission.READ_CONTACTS']),
    );
    const location = dataSafety.dataCollected.filter((d: { playCategory: string }) => d.playCategory === 'Location');
    for (const d of location) expect(d.playType).toBe('Approximate location');
  });
});
