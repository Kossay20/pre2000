/**
 * No surface may ship while it labels its own content as unreviewed.
 *
 * `RamadanPregnancyScreen` renders `cycle8.ramadan.draftBanner` — "Content pending
 * clinical review. Validate with your doctor and an imam." — in all four
 * languages. It was reachable from the Home tools grid AND deep-linkable at
 * `/ramadan`, so an App Store reviewer would land on content the app itself
 * declares unvalidated. That is App Review guideline 2.1, and the subject
 * (fasting during pregnancy) is not one to be casual about.
 *
 * The screen is gated rather than deleted: the tracker, the fidya counter and the
 * translations are finished work waiting on a signature. This test holds the gate
 * closed on all three fronts at once, because a screen hidden from a menu but
 * still registered stays reachable by URL — the exact hole DiagnosticScreen had.
 *
 * When the clinical sign-off lands: flip the flag, drop the draft banner and its
 * four translations, and update this file to assert the opposite.
 */
import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(APP_DIR, relative), 'utf8');

const FLAG = 'RAMADAN_GUIDANCE_CLINICALLY_REVIEWED';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const flags = require('../src/config/featureFlags') as Record<string, boolean>;

const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;

describe('unreviewed clinical content stays unreachable', () => {
  it('the draft banner still exists — this test is about gating, not deletion', () => {
    // If someone removes the banner without a sign-off, the content becomes
    // *silently* unreviewed, which is worse than visibly unreviewed.
    const missing = LOCALES.filter((locale) => {
      const bundle = JSON.parse(read(`src/i18n/locales/${locale}/cycle8.json`));
      return !bundle?.ramadan?.draftBanner;
    });
    expect(missing).toEqual([]);
  });

  it('the flag is off until a clinician signs the content off', () => {
    expect(flags[FLAG]).toBe(false);
  });

  it('the Home entry point is behind the flag', () => {
    const home = read('src/screens/HomeScreen.tsx');
    const navigateIndex = home.indexOf("navigation.navigate('RamadanPregnancy')");
    expect(navigateIndex).toBeGreaterThan(-1);

    // The guard must sit above the entry, close enough to actually wrap it.
    const preceding = home.slice(Math.max(0, navigateIndex - 900), navigateIndex);
    expect(preceding).toContain(`{${FLAG} && (`);
  });

  it('the route registration is behind the flag, not just the menu item', () => {
    const app = read('App.tsx');
    const registration = app.indexOf('<Stack.Screen name="RamadanPregnancy"');
    expect(registration).toBeGreaterThan(-1);

    const preceding = app.slice(Math.max(0, registration - 500), registration);
    expect(preceding).toContain(`{${FLAG} && (`);
  });

  it('the deep link is behind the flag — a URL must not reach it either', () => {
    const app = read('App.tsx');
    const linkIndex = app.indexOf("RamadanPregnancy: 'ramadan'");
    expect(linkIndex).toBeGreaterThan(-1);

    const preceding = app.slice(Math.max(0, linkIndex - 300), linkIndex);
    expect(preceding).toContain(`...(${FLAG} ?`);
  });

  it('the flag is a plain constant, not remote config', () => {
    // A surface that can be switched on after review is precisely what both
    // stores forbid.
    const source = read('src/config/featureFlags.ts');
    expect(source).toMatch(new RegExp(`export const ${FLAG}\\s*=\\s*(true|false);`));
    expect(source).not.toMatch(/process\.env|remoteConfig|fetch\(/);
  });
});
