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

  it('asks for notification permission with a reason the user can read', () => {
    expect(typeof appJson.ios.infoPlist.NSUserNotificationsUsageDescription).toBe('string');
    expect(appJson.ios.infoPlist.NSUserNotificationsUsageDescription.length).toBeGreaterThan(20);
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
