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

  describe('halal lens on the foods-to-avoid screen', () => {
    // Same exposure as the Ramadan screen, and easier to miss: it is a card inside
    // an otherwise-reviewed screen, shown only in ar/tn — to exactly the audience
    // most likely to act on it. Gating one and shipping the other would make the
    // decision arbitrary rather than principled.
    const HALAL_FLAG = 'HALAL_GUIDANCE_REVIEWED';

    it('keeps its pending-review note in all four locales', () => {
      const missing = LOCALES.filter((locale) => {
        const bundle = JSON.parse(read(`src/i18n/locales/${locale}/cycle8.json`));
        return !bundle?.forbiddenFoodsHalal?.draftNote;
      });
      expect(missing).toEqual([]);
    });

    it('is off until an imam and a dietitian sign it off', () => {
      expect(flags[HALAL_FLAG]).toBe(false);
    });

    it('gates the card, not just the language check', () => {
      const screen = read('src/screens/ForbiddenFoodsScreen.tsx');
      const match = screen.match(/const showHalalLens\s*=([\s\S]{0,200}?);/);
      expect(match).not.toBeNull();
      expect(match?.[1]).toContain(HALAL_FLAG);
    });

    it('is a separate flag — the two approvals come from different people', () => {
      expect(flags[HALAL_FLAG]).not.toBe(undefined);
      expect(read('src/config/featureFlags.ts')).toMatch(
        new RegExp(`export const ${HALAL_FLAG}\\s*=\\s*(true|false);`),
      );
    });
  });

  it('the flag is a plain constant, not remote config', () => {
    // A surface that can be switched on after review is precisely what both
    // stores forbid.
    const source = read('src/config/featureFlags.ts');
    expect(source).toMatch(new RegExp(`export const ${FLAG}\\s*=\\s*(true|false);`));
    expect(source).not.toMatch(/process\.env|remoteConfig|fetch\(/);
  });
});

/**
 * Hiding the screen was not enough. Article art_003, "Ramadan Fasting: What you need
 * to know", gives fasting and hydration advice and a religious ruling — the subject of
 * the hidden screen — and it stayed in the article list, the search, the chatbot and
 * the Firestore-backed lists, while the store keywords advertised "ramadan". One
 * predicate (src/config/unreviewedContent.ts) now sits on every path that hands an
 * article to the user, and these tests hold each path to it.
 */
describe('content on an unreviewed topic is unreachable while its flag is off', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const gate = require('../src/config/unreviewedContent') as typeof import('../src/config/unreviewedContent');
  const articles = require('../src/data/articles_db.json') as Array<Record<string, unknown>>;
  /* eslint-enable @typescript-eslint/no-var-requires */

  it('the predicate catches art_003 and nothing else in the bundled library', () => {
    const gated = articles.filter((a) => gate.isUnreviewedContent(a)).map((a) => a.article_id);
    expect(gated).toEqual(['art_003']);
    // art_002 (dates) mentions breaking the fast in passing; it is about dates.
    expect(gate.withoutUnreviewedContent(articles).map((a) => a.article_id)).toContain('art_002');
  });

  it('reads the topic in every script the content is written in', () => {
    expect(gate.isUnreviewedContent({ title_ar: 'صوم رمضان' })).toBe(true);
    expect(gate.isUnreviewedContent({ slug: 'le_je_ne_du_ramadan' })).toBe(true);
    expect(gate.isUnreviewedContent({ title_en: 'Fasting in Ramaḍān' })).toBe(true);
    expect(gate.isUnreviewedContent({ tags: ['halal'] })).toBe(true);
    expect(gate.isUnreviewedContent({ title_ar: 'أطعمة حلال' })).toBe(true);
    expect(gate.isUnreviewedContent({ title_fr: 'Les dattes et l’énergie' })).toBe(false);
    expect(gate.isUnreviewedContent(null)).toBe(false);
  });

  it('is the flag that hides it, not a deletion — signing off brings it back', () => {
    jest.isolateModules(() => {
      jest.doMock('../src/config/featureFlags', () => ({
        RAMADAN_GUIDANCE_CLINICALLY_REVIEWED: true,
        HALAL_GUIDANCE_REVIEWED: false,
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const signed = require('../src/config/unreviewedContent') as typeof gate;
      expect(signed.withoutUnreviewedContent(articles)).toHaveLength(articles.length);
      // The two approvals are independent.
      expect(signed.isUnreviewedContent({ title_fr: 'Viande halal' })).toBe(true);
    });
    jest.dontMock('../src/config/featureFlags');
  });

  it('the bundled fallback (list, search, related links, detail) does not serve it', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const local = require('../src/services/localContentFallback') as typeof import('../src/services/localContentFallback');
    expect(local.getLocalArticle('art_003')).toBeUndefined();
    expect(local.getLocalAntigravityArticle('art_003')).toBeNull();
    expect(local.getAllLocalArticles().filter((a) => gate.isUnreviewedContent(a))).toEqual([]);
    expect(local.getAllLocalArticles()).toHaveLength(articles.length - 1);
  });

  it('the chatbot never links it', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ARTICLES } = require('../src/data/chatbot_data') as typeof import('../src/data/chatbot_data');
    expect(ARTICLES.filter((a) => gate.isUnreviewedContent(a))).toEqual([]);
  });

  it('every file that reads articles goes through the predicate', () => {
    // Firestore holds the same rows (`npm run import-data` pushes articles_db.json),
    // so a screen that reads the collection directly would bring art_003 back.
    const READS_ARTICLES = [
      /(?:collection|doc)\(db,\s*'articles(?:Antigravity)?'/,
      /from '[./]*(?:data\/)?articles_db\.json'/,
    ];
    // Dev-only screen, gated out of production builds: it counts documents.
    const EXEMPT = new Set(['src/screens/DiagnosticScreen.tsx']);

    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(APP_DIR, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(rel);
        return /\.tsx?$/.test(entry.name) ? [rel] : [];
      });

    const readers = walk('src').filter((file) => READS_ARTICLES.some((re) => re.test(read(file))));
    expect(readers.length).toBeGreaterThanOrEqual(6);

    const unguarded = readers
      .filter((file) => !EXEMPT.has(file))
      .filter((file) => !/withoutUnreviewedContent|isUnreviewedContent/.test(read(file)));
    expect(unguarded).toEqual([]);
  });

  it('the Ramadan reminder schedule waits for the same sign-off', () => {
    // During the Ramadan window the hydration reminder moved to 21:30 / 23:30 / 03:30
    // for every user — fasting guidance applied by calendar, to women who may well not
    // be fasting, and the subject of the hidden screen.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildContextProfile } = require('../src/utils/contextMatcher') as typeof import('../src/utils/contextMatcher');
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
    try {
      expect(buildContextProfile(20).is_ramadan).toBe(false);
      expect(buildContextProfile(20, { is_ramadan: true }).is_ramadan).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the store listing does not advertise a topic the app hides', () => {
    const listing = JSON.parse(read('store/listing.json'));
    const advertised = Object.entries(listing.locales as Record<string, object>)
      .map(([locale, entry]) => ({ locale, topics: gate.unreviewedTopicsIn(JSON.stringify(entry)) }))
      .filter((row) => row.topics.length > 0);
    expect(advertised).toEqual([]);
  });

  it('neither does the marketing site', () => {
    for (const file of ['index.html', 'index-en.html']) {
      const page = fs.readFileSync(path.join(APP_DIR, '..', 'website', file), 'utf8');
      expect({ file, topics: gate.unreviewedTopicsIn(page) }).toEqual({ file, topics: [] });
    }
  });
});

describe('the clinical-review packet names all the medical content', () => {
  // The dossiers covered supplements, triage, foods, the medical profile, Ramadan and
  // halal. A reviewer who signed every one of them would never have seen the 80
  // articles, the 40 weeks or the fetal growth figures.
  const readme = read('docs/clinical-review/README.md');
  const generator = read('scripts/generate-clinical-dossier.ts');
  /* eslint-disable @typescript-eslint/no-var-requires */
  const articleCount = (require('../src/data/articles_db.json') as unknown[]).length;
  const weekCount = (require('../src/data/weeks_db.json') as unknown[]).length;
  /* eslint-enable @typescript-eslint/no-var-requires */

  it.each(['src/data/articles_db.json', 'src/data/weeks_db.json', 'src/utils/fetalGrowth.ts'])(
    'lists %s, in the README and in the generator that rewrites it',
    (source) => {
      expect(readme).toContain(source);
      expect(generator).toContain(source);
    },
  );

  it('counts what is actually bundled', () => {
    expect(readme).toContain(`${articleCount} articles`);
    expect(readme).toContain(`${weekCount} semaines`);
  });

  it('says art_003 waits on the Ramadan sign-off', () => {
    expect(readme).toContain('art_003');
  });
});
