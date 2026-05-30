/**
 * I1 — i18n 4-language key-parity guard.
 *
 * The owner's HARD invariant: every UI string is translated in ALL of FR / EN / AR / TN,
 * always. Before this test nothing enforced it — a key added to fr/ only would silently
 * ship a raw key (or French fallback) to Arabic/Tunisian users the next time a feature shipped.
 *
 * We compare the MERGED resource objects that i18n actually serves (the default export of
 * each locales/<lang>/index.ts — i18n/index.ts:39-44), NOT the raw per-namespace JSON files.
 * This is deliberate: orphan standalone JSON files (article.json, ui.json, …) are NOT part of
 * the merged export and would otherwise produce false failures. We assert on the served shape.
 *
 * Runs inside `npm test` → therefore inside `npm run verify` (verify = lint:colors && tsc && jest).
 */
import fr from '../locales/fr';
import en from '../locales/en';
import ar from '../locales/ar';
import tn from '../locales/tn';

type Dict = Record<string, unknown>;

/** Recursively collect leaf key-paths (objects recurse; strings/numbers/arrays are leaves). */
function flattenKeys(obj: Dict, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v as Dict, path));
    } else {
      // CLDR plural variants (key_one/_two/_few/_many/_other/_zero) legitimately differ in
      // count ACROSS languages — Arabic has 6 categories, FR/EN only 2 — so comparing the raw
      // category keys would falsely fail parity. Normalize to the base logical key; the
      // pluralForms.test.ts proves each language renders the correct form.
      out.push(path.replace(/_(zero|one|two|few|many|other)$/, ''));
    }
  }
  return out;
}

const REFERENCE = 'fr';
const locales: Record<string, Dict> = { fr: fr as Dict, en: en as Dict, ar: ar as Dict, tn: tn as Dict };
const refKeys = new Set(flattenKeys(locales[REFERENCE]));

describe('i18n 4-language key parity (FR/EN/AR/TN)', () => {
  it('reference locale (fr) is substantial (sanity)', () => {
    expect(refKeys.size).toBeGreaterThan(800);
  });

  for (const lang of ['en', 'ar', 'tn']) {
    const langKeys = new Set(flattenKeys(locales[lang]));

    it(`${lang}: no MISSING keys vs fr (would leak a raw key / French fallback to ${lang} users)`, () => {
      const missing = [...refKeys].filter((k) => !langKeys.has(k));
      // Equality on the count+sample gives a readable failure listing the offending keys.
      expect({ lang, missing: missing.slice(0, 25), missingCount: missing.length })
        .toEqual({ lang, missing: [], missingCount: 0 });
    });

    it(`${lang}: no EXTRA keys vs fr (dead/divergent key drift)`, () => {
      const extra = [...langKeys].filter((k) => !refKeys.has(k));
      expect({ lang, extra: extra.slice(0, 25), extraCount: extra.length })
        .toEqual({ lang, extra: [], extraCount: 0 });
    });
  }
});
