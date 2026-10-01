/**
 * What the public copy may claim about the app.
 *
 * The marketing site is the listing's `marketingUrl`, so reviewers read it next to
 * the store page. It said "des centaines d'articles validés" / "hundreds of validated
 * articles" (there are 80, and docs/clinical-review/README.md says none has been
 * reviewed) and "Assistant IA" / "AI Assistant" (the assistant is a keyword and fuzzy
 * matcher running on the phone). A health app that claims validated content is what
 * App Store 1.4.1 / 2.3.1 and Play's health-misrepresentation policy target.
 *
 * This scans every public surface we write — the website, the store listing, the
 * screenshot captions and the feature-graphic tagline — for the claims the app cannot
 * back. A word that is fine in context goes in ADVICE below, never as a blanket skip.
 */
import fs from 'fs';
import path from 'path';

const APP = path.resolve(__dirname, '..');
const SITE = path.resolve(APP, '..', 'website');

/** Visible text plus the attributes a crawler or a screen reader shows. */
const htmlText = (html: string) => {
  const noCode = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const attrs = [...noCode.matchAll(/\b(?:content|alt|title|aria-label)="([^"]*)"/gi)].map((m) => m[1]);
  const text = noCode.replace(/<[^>]+>/g, ' ');
  return [text, ...attrs]
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
};

/** String literals inside the `{ … }` blocks `block` captures (group 1), comments skipped. */
const literalsIn = (source: string, block: RegExp) =>
  [...source.matchAll(block)]
    .map((m) => m[1].replace(/\/\/.*$/gm, ''))
    .flatMap((body) => [...body.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((s) => s[1].replace(/\\n/g, ' ')));

const surfaces = (): Array<{ where: string; text: string }> => {
  const out: Array<{ where: string; text: string }> = [];
  for (const file of fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
    out.push({ where: `website/${file}`, text: htmlText(fs.readFileSync(path.join(SITE, file), 'utf8')) });
  }
  const listing = JSON.parse(fs.readFileSync(path.join(APP, 'store', 'listing.json'), 'utf8'));
  for (const [locale, entry] of Object.entries(listing.locales as Record<string, Record<string, unknown>>)) {
    for (const [field, value] of Object.entries(entry)) {
      if (typeof value === 'string') out.push({ where: `store/listing.json ${locale}.${field}`, text: value });
    }
  }
  out.push({ where: 'store/listing.json reviewNotes.en', text: listing.reviewNotes.en });

  const shots = fs.readFileSync(path.join(APP, 'scripts', 'capture-store-screenshots.ts'), 'utf8');
  out.push({ where: 'screenshot captions', text: literalsIn(shots, /caption:\s*\{([^}]*)\}/g).join(' | ') });
  const graphic = fs.readFileSync(path.join(APP, 'scripts', 'generate-feature-graphic.ts'), 'utf8');
  out.push({ where: 'feature graphic tagline', text: literalsIn(graphic, /const TAGLINE[^=]*=\s*\{([^}]*)\}/g).join(' | ') });
  return out;
};

// `\b` is ASCII-only in JS, so "validé" or an Arabic word never gets one: letter
// boundaries are spelled out with \p{L}.
const W = (body: string, flags = 'iu') => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, flags);

const BANNED: Record<string, RegExp> = {
  validated: W('valid(?:é|ée|és|ées|ated|ation)|معتمدة?|مُعتمدة?'),
  'AI (IA)': W('IA|AI', 'u'),
  'artificial intelligence': W('intelligence artificielle|artificial intelligence|(?:ال)?ذكاء ال?اصطناعي'),
  'smart / intelligent': W('intelligente?s?|smart|ذكية?'),
  'hundreds / thousands': W('centaines|milliers|hundreds|thousands|مئات|آلاف'),
  'trusted / reliable': W('fiables?|trusted|reliable|موثوقة?'),
  'clinical endorsement': W(
    'cliniquement|clinically|médicalement (?:validée?s?|approuvée?s?|prouvée?s?)|medically (?:approved|validated|proven|reviewed)|certifiée?s?|certified|approuvée?s? par|approved by|recommandée?s? par|recommended by|relue?s? par|reviewed by',
  ),
  'safe to eat': W('safe to eat|sans risque|آمن لتناوله'),
  'doctor as endorsement': W('médecins?|doctors?|physicians?|gynécologues?|sages?-femmes?|midwi(?:fe|ves)|أطباء|طبيب\\p{L}*'),
};

/**
 * A doctor may be named as the person to ask — never as the one who vouches. These
 * are the advice phrasings the copy uses; the match must sit inside one of them.
 */
const ADVICE: RegExp[] = [
  /consult(?:ez|er)? (?:toujours )?(?:un|une|votre)? ?(?:médecin|sage-femme)/i,
  /always consult a doctor, midwife/i,
  /avec votre médecin|parlez-en à votre|à votre soignant|with your doctor|ask your doctor|your caregiver/i,
  /أن تذكريها لطبيبتك/, // "worth raising with your doctor" (ar listing)
  /un médecin, une sage-femme ou un professionnel de santé qualifié/i,
  /a doctor, midwife or qualified healthcare/i,
  /remplace-t-elle mon médecin|replace my doctor/i, // support FAQ, answered "No"
];

describe('public copy makes no claim the app cannot back', () => {
  it('scans every surface it is meant to', () => {
    const where = surfaces().map((s) => s.where);
    expect(where).toEqual(expect.arrayContaining([
      'website/index.html', 'website/index-en.html', 'website/privacy.html',
      'store/listing.json fr.description', 'store/listing.json ar.keywords',
      'screenshot captions', 'feature graphic tagline',
    ]));
    const captions = surfaces().find((s) => s.where === 'screenshot captions')!.text;
    expect(captions).toMatch(/semaine après semaine/); // the extractor really reads them
  });

  it.each(Object.entries(BANNED))('no "%s" claim', (_label, pattern) => {
    const hits: Array<{ where: string; excerpt: string }> = [];
    for (const { where, text } of surfaces()) {
      for (const m of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
        const start = Math.max(0, m.index! - 80);
        const window = text.slice(start, m.index! + m[0].length + 80);
        const advice = ADVICE.some((re) => {
          const a = window.match(re);
          if (!a) return false;
          // The banned word must be inside the advice phrase, not merely near one.
          const aStart = start + a.index!;
          return m.index! >= aStart && m.index! + m[0].length <= aStart + a[0].length;
        });
        if (!advice) hits.push({ where, excerpt: window.trim() });
      }
    }
    expect(hits).toEqual([]);
  });

  it('never claims more articles than the app serves', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAllLocalArticles } = require('../src/services/localContentFallback');
    const served: number = getAllLocalArticles().length;
    const claims = surfaces().flatMap(({ where, text }) =>
      [...text.matchAll(/(\d+)\s+(?:articles|مقالا?ت?)/giu)].map((m) => ({ where, n: Number(m[1]) })),
    );
    expect(claims.filter((c) => c.n > served)).toEqual([]);
  });

  it.each([
    ['index.html', ['français', 'anglais', 'arabe', 'tunisien']],
    ['index-en.html', ['French', 'English', 'Arabic', 'Tunisian']],
  ] as const)('%s names all four languages the app ships', (file, languages) => {
    const text = htmlText(fs.readFileSync(path.join(SITE, file), 'utf8'));
    for (const lang of languages) expect({ file, lang, found: text.includes(lang) }).toEqual({ file, lang, found: true });
  });

  it('a seeded claim is caught — the scan is not vacuous', () => {
    const seeded = htmlText('<p>Des centaines d\'articles validés par des médecins, avec notre Assistant IA.</p>');
    const caught = Object.entries(BANNED).filter(([, re]) => re.test(seeded)).map(([label]) => label);
    expect(caught).toEqual(expect.arrayContaining([
      'validated', 'AI (IA)', 'hundreds / thousands', 'doctor as endorsement',
    ]));
  });
});
