/**
 * Store-listing limits.
 *
 * App Store Connect and Play Console both reject over-long metadata at submission
 * time, after the build is already uploaded — a slow way to find out that a
 * subtitle is 31 characters. `store/listing.json` is the single source for both
 * consoles and this pins every limit locally.
 *
 * Counting: characters are counted as Unicode code points (`[...s].length`), not
 * UTF-16 units, so the Arabic listing is measured the way a person would count
 * it. Emoji outside the BMP would count double in UTF-16; there are none in the
 * metadata, and a guard below keeps it that way.
 */
import fs from 'fs';
import path from 'path';

const listing = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'store', 'listing.json'), 'utf8'),
);

const LOCALES = ['fr', 'en', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

const count = (value: string) => [...value].length;

/** field -> [limit, which console enforces it] */
const LIMITS: Record<string, [number, string]> = {
  name: [30, 'App Store name + Play title'],
  subtitle: [30, 'App Store subtitle'],
  shortDescription: [80, 'Play short description'],
  keywords: [100, 'App Store keywords'],
  promotionalText: [170, 'App Store promotional text'],
  description: [4000, 'App Store description + Play full description'],
  whatsNew: [500, "Play release notes (App Store allows 4000; Play's 500 is the binding one)"],
};

describe('store listing', () => {
  it('covers exactly the three listing locales (tn folds into ar)', () => {
    expect(Object.keys(listing.locales).sort()).toEqual([...LOCALES].sort());
  });

  describe.each(LOCALES)('%s', (locale: Locale) => {
    const entry = () => listing.locales[locale];

    it.each(Object.entries(LIMITS))('%s is present and non-empty', (field) => {
      const value = entry()[field];
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    });

    it('has no field over its console limit', () => {
      // Reported as a list rather than one assertion per field so a failure names
      // every offender at once, with its actual length — which is the number you
      // need in order to trim the copy.
      const overLimit = Object.entries(LIMITS)
        .map(([field, [limit, console_]]) => ({
          field,
          length: count(entry()[field] ?? ''),
          limit,
          console: console_,
        }))
        .filter((row) => row.length > row.limit);

      expect(overLimit).toEqual([]);
    });

    it('declares both console locale codes', () => {
      expect(entry().storeLocale.apple).toBeTruthy();
      expect(entry().storeLocale.play).toBeTruthy();
    });

    it('keeps the medical disclaimer in the description', () => {
      // Both stores review health apps against the claims their listing makes.
      // The description must never read as diagnostic.
      const description: string = entry().description;
      const disclaimerMarkers: Record<Locale, RegExp> = {
        fr: /ne remplace ni une consultation/i,
        en: /does not replace a consultation/i,
        ar: /لا يغني عن الاستشارة/,
      };
      expect(description).toMatch(disclaimerMarkers[locale]);
    });

    it('labels the assistant as beta, matching the in-app badge', () => {
      const description: string = entry().description;
      expect(description).toMatch(/BÊTA|BETA|تجريبية/);
    });

    it('makes no diagnostic or curative claim', () => {
      const description: string = entry().description;
      const forbidden = [
        /\bdiagnostique(r|z)?\b/i,
        /\bdiagnoses\b/i,
        /\bcures?\b/i,
        /\btreats?\b/i,
        /\bguarantees?\b/i,
        /\bmedically (certified|approved)\b/i,
      ];
      const hits = forbidden.filter((re) => re.test(description)).map(String);
      expect(hits).toEqual([]);
    });

    it('uses no astral-plane characters, which both consoles count as two', () => {
      const withSurrogates = Object.keys(LIMITS)
        .map((field) => ({
          field,
          utf16: (entry()[field] as string).length,
          codePoints: count(entry()[field]),
        }))
        .filter((row) => row.utf16 !== row.codePoints);

      expect(withSurrogates).toEqual([]);
    });
  });

  describe('shared metadata', () => {
    it('points at URLs that are actually declared in app.json', () => {
      const appJson = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '..', 'app.json'), 'utf8'),
      ).expo;
      expect(listing.shared.privacyPolicyUrl).toBe(appJson.extra.privacyPolicyUrl);
      expect(listing.shared.marketingUrl).toBe(appJson.extra.marketingUrl);
      expect(listing.shared.accountDeletionUrl).toBe(appJson.extra.accountDeletionUrl);
    });

    it('publishes an account-deletion page, in both listing languages', () => {
      // Play requires a publicly reachable URL where a user can request account and
      // data deletion, and checks it. A declared URL with no page behind it is a
      // rejection, and the page is the last thing anyone thinks to deploy.
      const site = path.resolve(__dirname, '..', '..', 'website');
      for (const file of ['delete-account.html', 'delete-account-en.html']) {
        expect(fs.existsSync(path.join(site, file))).toBe(true);
      }
      expect(listing.shared.accountDeletionUrl).toMatch(/\/delete-account\.html$/);
    });

    it('the deletion page names what deletion actually erases', () => {
      // The page is a promise about health data. It must at least name the
      // declared conditions, which are the newest thing it covers and the easiest
      // to forget when the page is written once and never revisited.
      const fr = fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'website', 'delete-account.html'),
        'utf8',
      );
      expect(fr).toContain('Votre suivi médical déclaré');
      expect(fr).toMatch(/glyc[ée]mie/i);
      expect(fr).toMatch(/contact@mama-et-bebe\.com/);
    });

    it('uses the shipped bundle identifier', () => {
      const appJson = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '..', 'app.json'), 'utf8'),
      ).expo;
      expect(listing.shared.bundleId).toBe(appJson.ios.bundleIdentifier);
      expect(listing.shared.bundleId).toBe(appJson.android.package);
    });

    it('carries review notes that tell the reviewer how to get in', () => {
      // A sign-in wall with no way through is a standard rejection. Ours has a
      // guest path; the notes must say so explicitly.
      expect(listing.reviewNotes.en).toMatch(/Continue as guest/i);
      expect(listing.reviewNotes.en).toMatch(/DEMO ACCOUNT/i);
    });
  });
});
