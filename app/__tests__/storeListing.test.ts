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

    it('never calls the app or the assistant a beta', () => {
      // Guideline 2.2: betas belong on TestFlight, not the App Store, and "beta" in
      // store metadata is a routine rejection. The in-app badge is gone too; the
      // assistant is framed by its permanent "does not replace medical advice" notice.
      for (const field of ['description', 'whatsNew', 'promotionalText', 'shortDescription']) {
        const value: string = entry()[field];
        expect({ field, beta: /b[eê]ta|تجريبي/i.test(value) }).toEqual({ field, beta: false });
      }
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

    it('does not announce an update on what is the first public release', () => {
      // Promotional text sits above the description on the product page. Opening
      // with "New:" on version 1.0 tells a first-time visitor about a previous
      // version that never existed.
      const promo: string = entry().promotionalText;
      // No \b: JS word boundaries are ASCII-only and never fire after Arabic letters.
      expect(promo).not.toMatch(/^\s*(nouveau|nouvelle|new|جديد)(?![A-Za-z])/i);
      expect(promo).not.toMatch(/nouvelle version|new version|what'?s new|إصدار جديد/i);
    });

    it('spends no keyword on a word already indexed from the name or subtitle', () => {
      // The App Store indexes the name and subtitle on their own; repeating one of
      // their words in the 100-character keyword field buys nothing. Accents are
      // folded because the field is written without them ("bebe" vs "Bébé").
      const fold = (s: string) =>
        s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      const indexed = new Set(
        fold(`${entry().name} ${entry().subtitle}`).split(/[^\p{L}]+/u).filter(Boolean),
      );
      const repeated = (entry().keywords as string)
        .split(',')
        .map((k) => fold(k.trim()))
        .filter((k) => indexed.has(k));
      expect(repeated).toEqual([]);
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

    it('gives rating guidance for the current Apple tiers without pre-claiming one', () => {
      // Apple replaced 12+/17+ with 4+/9+/13+/16+/18+ in 2025, and the tier is
      // computed from the questionnaire. Guidance that names a retired tier sends
      // the owner looking for an answer that no longer exists.
      const rating = JSON.stringify(listing.shared.contentRating);
      expect(rating).not.toMatch(/"appleTarget"/);
      expect(listing.shared.contentRating.apple).toMatch(/4\+, 9\+, 13\+, 16\+ and 18\+/);
    });

    it('uses the same Arabic brand name in the app as on the store', () => {
      // Users search the store for the listing name and then see the in-app name
      // on every screen header and exported PDF; two different names read as two
      // different apps. ar and tn share the one Arabic listing.
      const arName: string = listing.locales.ar.name.split('—')[0].trim();
      for (const lang of ['ar', 'tn']) {
        const common = JSON.parse(
          fs.readFileSync(
            path.resolve(__dirname, '..', 'src', 'i18n', 'locales', lang, 'common.json'),
            'utf8',
          ),
        );
        expect({ lang, appName: common.common.appName }).toEqual({ lang, appName: arName });
        expect({ lang, pdfFooter: common.pdf.footer.includes(arName) }).toEqual({
          lang,
          pdfFooter: true,
        });
        // The in-app privacy policy names the publisher's app too.
        expect({
          lang,
          privacyIntro: common.privacy.intro.text.includes(arName),
          privacyFooter: common.privacy.footer.includes(arName),
          retiredName: JSON.stringify(common.privacy).includes('ماما وطفلي'),
        }).toEqual({ lang, privacyIntro: true, privacyFooter: true, retiredName: false });
      }
    });

    it('never drops the Latin brand into running Arabic text', () => {
      // A Latin name mid-sentence breaks the right-to-left reading order and reads
      // as untranslated. It may only appear in parentheses, glossing the Arabic name.
      const localesDir = path.resolve(__dirname, '..', 'src', 'i18n', 'locales');
      for (const lang of ['ar', 'tn']) {
        for (const file of fs.readdirSync(path.join(localesDir, lang))) {
          const text = fs.readFileSync(path.join(localesDir, lang, file), 'utf8');
          const bare = text.replace(/\(Mama & Bébé\)/g, '').match(/Mama & Bébé/g) ?? [];
          expect({ lang, file, latinBrand: bare.length }).toEqual({ lang, file, latinBrand: 0 });
        }
      }
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

    it('does not describe the app to the reviewer as a beta', () => {
      expect(listing.reviewNotes.en).not.toMatch(/\bbeta\b/i);
    });
  });
});
