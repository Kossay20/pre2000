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

/** Collect leaf key-path → value pairs (for value-level assertions). */
function flattenValues(obj: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenValues(v as Dict, path));
    } else if (typeof v === 'string') {
      out[path.replace(/_(zero|one|two|few|many|other)$/, '')] = v;
    }
  }
  return out;
}

// Keys whose values are INTENTIONALLY Latin-script across all locales:
const VALUE_ALLOWLIST = new Set([
  // Email input placeholder — always shows a canonical email format (Latin, all locales):
  'emailPlaceholder', 'common.emailPlaceholder',
  // Language-picker subtitle shows ALL 4 languages side by side (multilingual by design):
  'chooseLanguageSubtitle', 'common.chooseLanguageSubtitle',
  // Brand names are always English regardless of locale:
  'legalTerms.cookies.firebase_title', 'common.legalTerms.cookies.firebase_title',
  // Privacy-policy processor labels are the providers' own names:
  'privacy.processors.firebase', 'common.privacy.processors.firebase',
  'privacy.processors.fonts', 'common.privacy.processors.fonts',
]);

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

// VALUE-LEVEL parity guard (P2 — massive audit 2026-05-30).
// The key-parity test above only checks that keys EXIST — it cannot detect a value that is still
// in French inside an AR or TN file (e.g. "dashboard": "Tableau de bord" shipping to Arabic users).
// This supplement catches: (a) empty/whitespace-only values, (b) Latin-script strings in AR
// (heuristic: >50% Latin chars in a value that's keyed in the AR locale where siblings are Arabic).
describe('i18n VALUE-level parity — no empty strings, no obvious FR/EN text in AR', () => {
  const AR_VALUES = flattenValues(ar as Dict);

  it('ar: no empty or whitespace-only values', () => {
    const empty = Object.entries(AR_VALUES)
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    expect({ empty: empty.slice(0, 10), emptyCount: empty.length })
      .toEqual({ empty: [], emptyCount: 0 });
  });

  it('ar: no values that are predominantly Latin script (likely untranslated FR/EN)', () => {
    // Heuristic: if a value has > 60% Latin characters (a-z/A-Z, excluding digits, spaces,
    // punctuation, i18n interpolation markers {{...}}), it is probably an untranslated FR/EN
    // string. Skip values ≤ 6 chars (short codes, numbers, shared brand names are common).
    const latinRatio = (s: string) => {
      const cleaned = s.replace(/\{\{[^}]+\}\}/g, '').replace(/[0-9\s.,;:!?'"()\-•\n\t→←]/g, '');
      if (cleaned.length <= 6) return 0;
      const latinCount = (cleaned.match(/[a-zA-Z]/g) || []).length;
      return latinCount / cleaned.length;
    };
    const suspicious = Object.entries(AR_VALUES)
      .filter(([k, v]) => !VALUE_ALLOWLIST.has(k) && latinRatio(v) > 0.6)
      .map(([k, v]) => `${k}: "${v.slice(0, 60)}"`);
    expect({ suspicious: suspicious.slice(0, 10), suspiciousCount: suspicious.length })
      .toEqual({ suspicious: [], suspiciousCount: 0 });
  });

  const TN_VALUES = flattenValues(tn as Dict);

  it('tn: no empty or whitespace-only values', () => {
    const empty = Object.entries(TN_VALUES)
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    expect({ empty: empty.slice(0, 10), emptyCount: empty.length })
      .toEqual({ empty: [], emptyCount: 0 });
  });

  it('tn: written in Arabic script like the rest of the locale, not Latin Arabizi or French', () => {
    // tn renders right-to-left in Arabic script. A Latin value in the middle of it
    // ('Support w 9anoun', 'Zonèt danger' once headed Settings sections) reads as an
    // untranslated leftover, and a Latin word inside an Arabic sentence breaks the
    // RTL run. Only names, units and multilingual-by-design strings may be Latin.
    const TN_LATIN_OK = new Set([
      ...VALUE_ALLOWLIST,
      // Units printed after a number, kept in the form Tunisian lab reports use:
      'dashboard.mmolL', 'dashboard.mmHg',
      // Section header deliberately bilingual so a lost user can find the language switch:
      'profile.languageSection',
    ]);
    // Product and file-format names that have no Arabic form:
    // The privacy policy must name its processors, their services and the publisher as they
    // are registered (Firebase Authentication, App Check, Apple App Attest, Kossay El Benna…).
    const LATIN_NAMES = /\b(Firebase|Google|Cloud|Sentry|PDF|JSON|IOM|mmol|Authentication|Expo|Fonts|App Check|Apple App Attest|Play Integrity|HTTPS|TLS|IP|Kossay El Benna|Sawssen Jemaiel)\b|Mama & Bébé/g;
    const stripped = (v: string) => v
      .replace(/\{\{[^}]+\}\}/g, '')
      .replace(/https?:\/\/\S+|\S+@\S+/g, '')
      .replace(LATIN_NAMES, '');
    const latin = Object.entries(TN_VALUES)
      .filter(([k]) => !TN_LATIN_OK.has(k))
      .filter(([, v]) => /[A-Za-zÀ-ÿ]{3,}/.test(stripped(v)))
      .map(([k, v]) => `${k}: "${v.slice(0, 60)}"`);
    expect({ latin: latin.slice(0, 10), latinCount: latin.length })
      .toEqual({ latin: [], latinCount: 0 });
  });
});
