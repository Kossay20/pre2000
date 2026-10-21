/**
 * Home content that reached users untranslated (final-release audit, wave C).
 *
 * - The daily "message from baby" is read from the seeded babyMessages collection; all
 *   280 records lacked message_en, so English users got the French text.
 * - The recommendation cards printed the article's raw category slug ("accouchement")
 *   as their badge, in every language.
 *
 * Jest runs in node with no component renderer, so the Home badge is pinned at source
 * level; the data is checked directly.
 */
import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(APP_DIR, relative), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const locale = (lng: string, file: string) => JSON.parse(read(`src/i18n/locales/${lng}/${file}.json`));

describe('baby messages carry all four locales', () => {
  const { collections } = JSON.parse(read('scripts/seedCollections.json')) as {
    collections: { file: string; collection: string }[];
  };
  const entry = collections.find((c) => c.collection === 'babyMessages');
  const messages: Record<string, unknown>[] = JSON.parse(read(entry!.file));

  it('seeds the full 40-week set', () => {
    expect(messages).toHaveLength(280);
  });

  it.each(LOCALES)('every message has a non-empty message_%s', (lng) => {
    const missing = messages
      .filter((m) => typeof m[`message_${lng}`] !== 'string' || !(m[`message_${lng}`] as string).trim())
      .map((m) => m.message_id);
    expect(missing).toEqual([]);
  });

  it('the English text is English, not a copy of the French', () => {
    const copies = messages.filter((m) => m.message_en === m.message_fr).map((m) => m.message_id);
    expect(copies).toEqual([]);
  });
});

describe('article categories are labelled in every locale', () => {
  const categories = new Set(
    (JSON.parse(read('src/data/articles_db.json')) as { category?: string }[])
      .map((a) => (a.category || '').toLowerCase())
      .filter(Boolean),
  );

  it.each(LOCALES)('%s has a categories.<slug> label for every category in the data', (lng) => {
    const labels = locale(lng, 'common').categories ?? {};
    const missing = [...categories].filter((c) => typeof labels[c] !== 'string' || !labels[c].trim());
    expect(missing).toEqual([]);
  });

  it('the Home recommendation badge shows the category label, not the slug', () => {
    const src = read('src/screens/HomeScreen.tsx');
    const subtitle = src.match(/const subtitle = isArticle \? ([^:]+):/);
    expect(subtitle).not.toBeNull();
    expect(subtitle![1]).toMatch(/t\(`categories\.\$\{/);
  });
});
