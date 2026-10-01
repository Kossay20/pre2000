/**
 * What `npm run import-data` pushes to Firestore — and the emulator seeder with it.
 *
 * The supplement detail screen reads Firestore first and only falls back to the
 * bundled JSON when the document is missing. The seeder used to read a stale
 * repo-root copy with no en/ar/tn dose, notes or precautions, so once the backend
 * went live the i18n fallback chain (target → ar → en → fr) would have shown
 * Arabic and Tunisian users their supplement dosages in French. The web e2e could
 * not see it: it runs on the bundle.
 *
 * So: both seeders read one list (scripts/seedCollections.json), supplements and
 * articles come from the same files the app bundles, and every record carries
 * the four locales for every field a screen actually renders.
 */
import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(APP_DIR, relative), 'utf8');

type SeedCollection = { file: string; collection: string; idField: string };
const { collections } = JSON.parse(read('scripts/seedCollections.json')) as {
  collections: SeedCollection[];
};

const LOCALES = ['fr', 'en', 'ar', 'tn'];

/**
 * Localised fields the screens render. Supplements: SupplementDetailScreen,
 * SupplementsListScreen and the week recommendations; articles: ArticleDetail,
 * the resources list and the chatbot's article index.
 */
const RENDERED_FIELDS: Record<string, string[]> = {
  supplements: ['name', 'short_description', 'pregnancy_notes', 'typical_dose_text', 'precautions'],
  articles: ['title', 'summary', 'content_markdown'],
};

const seeded = (collection: string) => {
  const entry = collections.find((c) => c.collection === collection);
  if (!entry) throw new Error(`${collection} is not seeded`);
  return { entry, records: JSON.parse(read(entry.file)) as Record<string, unknown>[] };
};

describe('seed manifest', () => {
  it.each(collections.map((c) => [c.collection, c]))('%s: source file exists', (_name, c) => {
    expect(fs.existsSync(path.join(APP_DIR, (c as SeedCollection).file))).toBe(true);
  });

  it.each(collections.map((c) => [c.collection, c]))(
    '%s: every record has its document id',
    (_name, c) => {
      const { file, idField } = c as SeedCollection;
      const records = JSON.parse(read(file)) as Record<string, unknown>[];
      expect(records.length).toBeGreaterThan(0);
      expect(records.filter((r) => !r[idField])).toEqual([]);
    },
  );

  it.each([
    ['scripts/importData.ts'],
    ['e2e/helpers/seed-emulator.mjs'],
  ])('%s reads the shared manifest instead of its own list', (file) => {
    const source = read(file);
    expect(source).toContain('seedCollections.json');
    // The stale repo-root copy must not creep back in through either seeder.
    expect(source).not.toContain('supplements_pregnancy.json');
  });
});

describe.each(Object.keys(RENDERED_FIELDS))('%s seed', (collection) => {
  const { entry, records } = seeded(collection);

  it('comes from the file the app bundles as its offline fallback', () => {
    // Firestore and the fallback must say the same thing: a user must not see
    // different dosages depending on whether the read succeeded.
    const fallback = read('src/services/localContentFallback.ts');
    const bundled = path.basename(entry.file);
    expect(entry.file).toBe(`src/data/${bundled}`);
    expect(fallback).toContain(`from '../data/${bundled}'`);
  });

  it.each(RENDERED_FIELDS[collection])('every record has %s in fr, en, ar and tn', (field) => {
    const gaps = records.flatMap((record) =>
      LOCALES.filter((lang) => {
        const value = record[`${field}_${lang}`];
        return typeof value !== 'string' || value.trim() === '';
      }).map((lang) => `${String(record[entry.idField])}.${field}_${lang}`),
    );
    expect(gaps).toEqual([]);
  });
});

/**
 * The Calendar's "Suggestions" read `calendarTemplates` (calendarService.loadCalendarTemplates),
 * but nothing ever seeded it: the button opened an empty panel on every account. The seed
 * must carry what generateEventsForWeek and the suggestion list actually read.
 */
describe('calendarTemplates seed', () => {
  const { records } = seeded('calendarTemplates');

  it('is the collection the calendar reads, and signed-in users may read it', () => {
    expect(read('src/services/calendarService.ts')).toContain("collection(db, 'calendarTemplates')");
    expect(read('firestore.rules')).toMatch(
      /match \/calendarTemplates\/\{docId\} \{ allow read: if isAuthenticatedReader\(\); allow write: if false; \}/,
    );
  });

  it('has unique template ids', () => {
    const ids = records.map((r) => r.template_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has a usable week window and day', () => {
    const bad = records.filter((r) => {
      const { week_min: min, week_max: max, recommended_day: day } = r as Record<string, unknown>;
      return !Number.isInteger(min) || !Number.isInteger(max) || (min as number) < 1 || (min as number) > (max as number)
        || (day !== undefined && (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 7));
    });
    expect(bad.map((r) => r.template_id)).toEqual([]);
  });

  it('every template has a French title and description, and a title in ar and tn', () => {
    const gaps = records.flatMap((r) =>
      ['title_fr', 'description_fr', 'title_ar', 'title_tn']
        .filter((field) => typeof r[field] !== 'string' || (r[field] as string).trim() === '')
        .map((field) => `${String(r.template_id)}.${field}`),
    );
    expect(gaps).toEqual([]);
  });
});
