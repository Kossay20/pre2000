/**
 * Wave C — content & assistant in 4 locales (AUDIT_PLAN final-release-2026-09-30 §4).
 *
 * Surfaces: Resources (articles list / search / filter / detail / bookmarks), Supplements
 * (list / caution filter / detail / bookmarks), Forbidden foods, Week recommendations,
 * Baby evolution, Chatbot (empty, normal answer, red-flag triage, negation, suggestion chip).
 *
 * Main run: one REST-created, week-32 signed-in reader per locale (fr/en: France, ar/tn:
 * Tunisia) — static reads need `isAuthenticatedReader`, so a session-less guest would only
 * exercise the bundled fallback. Plus:
 *   - C-G1: a REAL anonymous guest (AuthChoice → guest → onboarding → skip), fr.
 *   - C-G2: an en guest on a region-less device: country must be answered; "Other" → 112.
 *   - C-G3: a signed-in user whose profile has NO country, region-less device → 112 fallback.
 *   - C-X1: fr reader, chatbot mounted, language switched to ar via Profile (HYP-C6).
 *
 * Carried-over residuals: GJ-007 (chatbot chips clip), GJ-008 (duplicate back in
 * ArticleDetail / SupplementDetail inside ResourcesStack), GJ-011 (Baby Evolution "swipe").
 *
 * App-behaviour assertions are `expect.soft` (each failure = a finding candidate);
 * harness/navigation steps are hard. Requires the emulator stack (`e2e/emulator-stack.sh
 * status` → 3 up) and:
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-C \
 *   timeout 900 npx playwright test e2e/final-release-wave-C.spec.ts --reporter=list
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { attachConsoleStrict, RAW_KEY } from './helpers/audit-guards';
import { attachMegaAuditRecorder } from './helpers/mega-audit-snap';
import { attachDialogRecorder, type DialogRecorder } from './helpers/dialog-recorder';
import {
  E2E_PASSWORD,
  authAccountExists,
  createAccount,
  newAccountEmail,
  seedProfile,
  serverDoc,
  uiLogin,
  waveUse,
  type AppLocale,
} from './helpers/emulator-account';
import { lmpIsoForWeek } from './helpers/guest-profile';
import { tickHealthConsent } from './helpers/health-consent';
import { RED_FLAGS, SUGGESTIONS } from '../src/data/chatbot_data';
import { waitFrameClean } from './helpers/visual-settle';
import { babyEvolutionDots, greetingVsAvatar, placeholderEmojiCards } from './helpers/round11-guards';

// ── i18n (read from the tree the web export is built from) ────────────────────

const LOCALES_DIR = path.resolve(__dirname, '../src/i18n/locales');
const DICTS: Partial<Record<AppLocale, any>> = {};

/** Mirrors src/i18n/locales/<l>/index.ts: common spread at root + namespaced files. */
function dict(l: AppLocale): any {
  if (DICTS[l]) return DICTS[l];
  const r = (ns: string) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, l, `${ns}.json`), 'utf8'));
  const common = r('common');
  const auth = r('auth');
  const home = r('home');
  DICTS[l] = {
    ...auth,
    ...common,
    common,
    home: { ...(common.home || {}), ...home },
    onboarding: r('onboarding'),
    forbiddenFoods: r('forbiddenFoods'),
  };
  return DICTS[l];
}

function tr(l: AppLocale, key: string, vars: Record<string, string | number> = {}): string {
  let node: any = dict(l);
  for (const k of key.split('.')) {
    if (node == null || typeof node !== 'object' || !(k in node)) throw new Error(`i18n key missing: ${l}:${key}`);
    node = node[k];
  }
  if (typeof node !== 'string') throw new Error(`i18n key not a string: ${l}:${key}`);
  return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v) => String(vars[v] ?? `{{${v}}}`));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** French typography puts U+00A0 / U+202F before `: ; ? !` — compare on plain spaces. */
const norm = (s: string) => s.replace(/[\u00A0\u202F\s]+/g, ' ').trim();

// ── Bundled data the screens under test render (read, never edited) ───────────

const DATA_DIR = path.resolve(__dirname, '../src/data');
type Food = { id: string; severity: 'critical' | 'high' | 'medium' | 'low' } & Record<string, string>;
const FOODS: Food[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'forbidden_foods.json'), 'utf8'));
const ARTICLES_DB: Record<string, string>[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'articles_db.json'), 'utf8'));
const foodName = (id: string, L: AppLocale) => {
  const f = FOODS.find((x) => x.id === id);
  if (!f) throw new Error(`forbidden_foods.json: no item ${id}`);
  return f[`name_${L}`] || f.name_fr;
};
const articleTitle = (id: string, L: AppLocale) => {
  const a = ARTICLES_DB.find((x) => x.article_id === id);
  if (!a) throw new Error(`articles_db.json: no article ${id}`);
  return a[`title_${L}`] || a.title_fr;
};
const chipLabel = (id: string, L: AppLocale): string => {
  const c = SUGGESTIONS.find((x) => x.suggestion_id === id) as unknown as Record<string, string> | undefined;
  if (!c) throw new Error(`chatbot_data: no suggestion ${id}`);
  return c[`label_${L}`];
};

/**
 * C-018 — items the round-3 review found under-rated ("Limit") against their own text;
 * each must now carry the "Avoid" badge (severity high). Vitamin A is the C-017 twin of
 * the Supplements rating.
 */
const MUST_BE_AVOID = ['smoked_fish', 'high_mercury_fish', 'raw_milk_cheese', 'feta_goat', 'rillettes', 'vitamin_a_supplements'];
/** Wording that tells her to avoid / to limit, per locale (badge-vs-own-text check). */
const AVOID_WORDS: Record<AppLocale, RegExp> = {
  fr: /évit|interdit|proscri|déconseill/i,
  en: /avoid|forbidden|not recommended/i,
  ar: /تجن[ّ]?ب|ممنوع|غير موصى|لا يُوصى/,
  tn: /تجن[ّ]?ب|ممنوع|ما ينصحوش|إيّاك/,
};
const LIMIT_WORDS: Record<AppLocale, RegExp> = {
  fr: /limite[rz]|limitez-vous|avec modération/i,
  en: /\blimit\b/i,
  ar: /الحد من|لا تتجاوزي|تقليل/,
  tn: /ما تفوتيش|قلّلي|اقتصري|نقّصي/,
};
/** Chatbot red flag: complications tied to a gestational age / a generic softening close. */
const LATE_MISCARRIAGE = /fausse couche|miscarriage|إجهاض/i;
const SOFT_CLOSE = /n['’]hésitez pas|don['’]t hesitate|do not hesitate|لا تترددي|ما تترددش/i;
/** C-021: what a negated bleeding sentence must not retrieve. */
const BLEEDING_OR_BREASTFEEDING = /bleed|breastfeed|saign|allaite|نزيف|رضاعة/i;
/** C-022: the swelling chip names a swelling, in every language ("bloated" reported nothing). */
const SWOLLEN_WORDING: Record<AppLocale, RegExp> = { fr: /gonfl/i, en: /swollen|swelling/i, ar: /تور[ّ]?م/, tn: /منفوخ|تور[ّ]?م/ };
/** Raw markdown that must never reach a card excerpt. */
const RAW_MARKDOWN = /^#{1,6}(\s|$)|(^|\s)#{1,6}\s|\*\*/;
/** Any analytics beacon (C-011): GA4 / GTM / Firebase Analytics config + collect. */
const ANALYTICS = /google-analytics\.com|googletagmanager\.com|analytics\.google\.com|app-measurement\.com|\/g\/collect\b|firebase\.googleapis\.com\/v1alpha\/projects\/-\/apps|firebaselogging/;

// ── Per-locale scenario table (AUDIT_PLAN §4 query + triage tables) ───────────

type LocaleCfg = {
  L: AppLocale;
  dir: 'ltr' | 'rtl';
  country: string;
  emergency: string;
  articleQ: string;
  suppQ: string;
  foodQ: string[];
  normalMsg: string;
  redflag: string;
  negation?: string;
  /** A typed report of reduced baby movements (urgent_consult red flag "ne sens plus le bébé"). */
  movementTyped: string;
  /** chatbot_data.ts SUGGESTIONS labels (cs01 = first chip, cs06 = "Je saigne un peu"). */
  cs01: string;
  cs06: string;
};

const CFG: LocaleCfg[] = [
  {
    L: 'fr', dir: 'ltr', country: 'France', emergency: '15',
    articleQ: 'Nausées', suppQ: 'fer', foodQ: ['fromage', 'alcool'],
    normalMsg: 'Quels aliments éviter ?', redflag: "j'ai des saignements abondants", negation: 'je ne saigne pas',
    movementTyped: 'je ne sens plus mon bébé bouger',
    cs01: "J'ai des nausées matinales", cs06: 'Je saigne un peu',
  },
  {
    L: 'en', dir: 'ltr', country: 'France', emergency: '15',
    articleQ: 'morning', suppQ: 'iron', foodQ: ['cheese', 'sushi'],
    normalMsg: 'What foods to avoid?', redflag: 'I have heavy bleeding', negation: 'I am not bleeding',
    movementTyped: 'my baby has stopped moving',
    cs01: 'I have morning sickness', cs06: "I'm bleeding a little",
  },
  {
    L: 'ar', dir: 'rtl', country: 'Tunisia', emergency: '190',
    articleQ: 'غثيان', suppQ: 'الحديد', foodQ: ['الكحول', 'سوشي'],
    normalMsg: 'ما هي الأطعمة التي يجب تجنبها؟', redflag: 'عندي نزيف', negation: 'لا يوجد نزيف',
    movementTyped: 'لا أشعر بحركة الجنين',
    cs01: 'لدي غثيان صباحي', cs06: 'لدي نزيف خفيف',
  },
  {
    L: 'tn', dir: 'rtl', country: 'Tunisia', emergency: '190',
    articleQ: 'غثيان', suppQ: 'الحديد', foodQ: ['الحوت', 'الكحول'],
    normalMsg: 'شنوة ما ناكولش؟', redflag: '3andi nzif', negation: 'ما عنديش نزيف',
    movementTyped: 'bebe ma ybou3sh',
    cs01: 'عندي دوخة وغثيان', cs06: 'عندي شوية دم',
  },
];

// ── Language / script oracles ─────────────────────────────────────────────────

const ARABIC = /[؀-ۿ]/;
/**
 * Tokens legitimately Latin inside Arabic UI: units, brand, and acronyms with no usual Arabic
 * form. "OMS" / "WHO" are NOT here — the WHO has an Arabic name and the app must print it
 * (this list used to hide a French "OMS" in the ar/tn supplement source line).
 */
const LATIN_ALLOW = /\b(DHA|EPA|DNA|ARN|ADN|hCG|B12|B9|ACOG|HAS|NICE|NHS|NIH|ODS|EFSA|ANSES|ATA|WAO|WGO|IOM|NAM|CNGOF|CDC|mg|µg|mcg|UI|IU|SA|Mama|Bébé|OK|Sawssen|Jemaiel)\b/g;
/** `<html lang>` per app locale: the key `tn` is published as the BCP-47 tag ar-TN. */
const HTML_LANG: Record<AppLocale, string> = { fr: 'fr', en: 'en', ar: 'ar', tn: 'ar-TN' };
/** Week-32 Home weight, unit included ("1.7" alone would also pass for "1.7 g"). */
const W32_WEIGHT: Record<AppLocale, string> = { fr: '1,7 kg', en: '1.7 kg', ar: '1.7 كغ', tn: '1,7 كغ' };
const LATIN_WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/;
/** Distinctly French function words / domain words that never belong in English copy. */
const FRENCH_WORDS = /\b(les|des|pour|avec|pendant|grossesse|enceinte|votre|vous|dans|sont|être|peut|chez|lors|une|du|au|aux)\b/i;
/** Namespaced keys RAW_KEY (audit-guards) does not cover. */
const RAW_KEY_EXTRA = /(^|\s)(a11y|categories|supplementCategories|chatResponse|countries|supplementSafety|medicalProfile)\.[a-zA-Z_]+/;
const BACK_RE = '(^|\\b)(retour|back|go back)\\b|رجوع|عودة';

const splitLines = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);

/**
 * Lines of the wrong language/script. `ignore` = user-typed / user-owned substrings (chat
 * messages, the seeded first name, the query) stripped before testing. In Arabic lines a
 * parenthesised Latin gloss — "(Acupressure)" — is tolerated (medical term gloss).
 */
function scriptLeaks(L: AppLocale, lines: string[], ignore: string[] = []): string[] {
  const ign = ignore.map((s) => s.trim()).filter(Boolean);
  const strip = (l: string) => ign.reduce((acc, x) => acc.split(x).join(' '), l);
  if (L === 'ar' || L === 'tn') {
    return lines.filter((l) => {
      let t = strip(l).replace(LATIN_ALLOW, '');
      if (ARABIC.test(t)) t = t.replace(/\([^)]*\)/g, '');
      return LATIN_WORD.test(t);
    });
  }
  if (L === 'en') return lines.filter((l) => FRENCH_WORDS.test(strip(l)));
  return [];
}

/** Text of rendered, CSS-visible nodes outside aria-hidden subtrees (inactive tab screens). */
async function visibleLines(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = (node.textContent || '').trim();
      if (!t) continue;
      const el = node.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      // Inactive tab screens stay mounted behind the active one (z-index −1, aria-hidden).
      if (el.closest('[aria-hidden="true"]')) continue;
      const cv = (el as any).checkVisibility;
      if (cv && !cv.call(el, { visibilityProperty: true, opacityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.push(...t.split('\n').map((x) => x.trim()).filter(Boolean));
    }
    return out;
  });
}

// ── Quartet + strict console per page ─────────────────────────────────────────

/** Origin of the web export under test (static assets are not "foreign" traffic). */
const E2E_ORIGIN = new URL(process.env.E2E_BASE_URL || 'http://localhost:8090').origin;

const QUARTET_DIRS = [process.env.E2E_QUARTET_DIR, process.env.E2E_QUARTET_DIR2].filter((d): d is string => !!d);

type Obs = Record<string, unknown>;

class WaveCtx {
  readonly strict: string[];
  readonly rec: ReturnType<typeof attachMegaAuditRecorder>;
  readonly dialogs: DialogRecorder;
  readonly obs: Obs = {};
  /** Lines typed by the user (chat) — excluded from script checks. */
  readonly typed: string[] = [];
  readonly dirs: string[];
  /** Analytics requests since the previous state (C-011), and the per-state tally. */
  private analytics: string[] = [];
  private analyticsByState: Record<string, string[]> = {};

  constructor(readonly page: Page, public L: AppLocale, readonly prefix: string, testInfo: TestInfo) {
    this.strict = attachConsoleStrict(page);
    this.dirs = QUARTET_DIRS.length ? QUARTET_DIRS : [testInfo.outputPath('quartet')];
    this.rec = attachMegaAuditRecorder(page, this.dirs);
    this.dialogs = attachDialogRecorder(page, this.rec);
    page.on('request', (r) => {
      if (ANALYTICS.test(r.url())) this.analytics.push(`${r.method()} ${r.url().slice(0, 160)}`);
    });
  }

  note(key: string, value: unknown) {
    this.obs[key] = value;
    this.rec.recordEvent({ level: 'audit', text: `${key}: ${JSON.stringify(value)}` });
  }

  /**
   * One audited state: non-blank, no raw key, html dir/lang, script check of the visible
   * body (unless `script:false`), quartet, strict console since the previous state.
   */
  async state(name: string, opts: { script?: boolean; scriptLines?: string[] } = {}) {
    const { page, L } = this;
    const full = `${this.prefix}-${name}`;
    await page.waitForTimeout(400);
    // C-051: a state snapped while a screen is still fading in (G-00 caught the welcome card over a
    // half-transparent hero) is not a state. Wait until nothing visible is mid-fade, then assert it.
    const frame = await waitFrameClean(page, 8_000, { opacity: true });
    expect.soft(frame.problems.lowOpacity, `${full} (C-051): captured mid-fade`).toEqual([]);
    const lines = await visibleLines(page);
    expect.soft(lines.length, `${full}: screen must not be blank`).toBeGreaterThan(0);
    const raw = lines.filter((l) => RAW_KEY.test(l) || RAW_KEY_EXTRA.test(l));
    expect.soft(raw, `${full}: raw i18n key(s) visible`).toEqual([]);
    const wantDir = L === 'ar' || L === 'tn' ? 'rtl' : 'ltr';
    expect.soft(await page.locator('html').getAttribute('dir'), `${full}: html[dir]`).toBe(wantDir);
    expect.soft(await page.locator('html').getAttribute('lang'), `${full}: html[lang]`).toBe(HTML_LANG[L]);
    if (opts.script !== false) {
      const leaks = scriptLeaks(L, opts.scriptLines ?? lines, this.typed);
      if (leaks.length) this.note(`${full}.scriptLeaks`, leaks.slice(0, 25));
      expect.soft(leaks, `${full}: ${L === 'en' ? 'French' : 'Latin-script'} strings in a ${L} UI`).toEqual([]);
    }
    if (wantDir === 'rtl') {
      // C-032: RN-Web's LocaleProvider takes its direction from the locale tag. `tn` reads as
      // Setswana (LTR), which left every start/end margin on the LTR side of Tunisian screens.
      const wrappers = await page.evaluate(() =>
        [...document.querySelectorAll('[lang]')].map((e) => `${e.tagName.toLowerCase()}[lang=${e.getAttribute('lang')}][dir=${e.getAttribute('dir')}]`),
      );
      expect.soft(wrappers.filter((x) => /\[lang=tn\]|\[dir=ltr\]/.test(x)), `${full}: no lang="tn" / dir="ltr" locale wrapper`).toEqual([]);
    }
    await this.rec.snap(full);
    const errs = this.strict.splice(0);
    expect.soft(errs, `${full}: strict console errors`).toEqual([]);
    const beacons = this.analytics.splice(0);
    if (beacons.length) this.analyticsByState[full] = beacons;
    expect.soft(beacons, `${full} C-011: no Google Analytics / Tag Manager / Firebase Analytics request`).toEqual([]);
  }

  dispose() {
    const tail = this.analytics.splice(0);
    if (tail.length) this.analyticsByState[`${this.prefix}-after-last-state`] = tail;
    expect.soft(tail, `${this.prefix} C-011: no analytics request after the last state`).toEqual([]);
    this.obs['C-011.analyticsRequests'] = {
      count: Object.values(this.analyticsByState).reduce((n, a) => n + a.length, 0),
      byState: this.analyticsByState,
    };
    for (const dir of this.dirs) {
      fs.writeFileSync(path.join(dir, `${this.prefix}-observations.json`), JSON.stringify(this.obs, null, 2));
    }
    this.rec.dispose();
    this.dialogs.dispose();
  }
}

// ── DOM probes ────────────────────────────────────────────────────────────────

type Box = { name: string; x: number; y: number; w: number; h: number };

/** Visible, top-most back affordances in the top 160 px (GJ-008 counter). */
async function backAffordances(page: Page): Promise<Box[]> {
  return page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i');
    const nameOf = (el: Element) => (el.getAttribute('aria-label') || (el as HTMLElement).innerText || '').trim();
    const hits = [...document.querySelectorAll('[role="button"],button,a[href]')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > 160) return false;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return false;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || !(el === top || el.contains(top))) return false;
      return rx.test(nameOf(el));
    });
    const outer = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
    return outer.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: nameOf(el).slice(0, 60), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    });
  }, BACK_RE);
}

async function clickBox(page: Page, b: Box) {
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
}

/** For a card (TouchableOpacity > Card > [lead, content]): is the lead block on the start side? */
async function leadSide(card: Locator): Promise<{ leadLeft: number; contentLeft: number } | null> {
  return card.evaluate((el) => {
    const inner = el.firstElementChild;
    if (!inner || inner.children.length < 2) return null;
    const a = inner.children[0].getBoundingClientRect();
    const b = inner.children[1].getBoundingClientRect();
    return { leadLeft: Math.round(a.left), contentLeft: Math.round(b.left) };
  });
}

/** GJ-007 geometry of the chatbot suggestion row, at start and both scroll extremes. */
async function chipGeometry(page: Page, firstChipLabel: string) {
  return page.evaluate(async (label) => {
    const chip = [...document.querySelectorAll('[role="button"]')].find((e) => e.getAttribute('aria-label') === label);
    if (!chip) return { error: `chip "${label}" not found` } as any;
    let sc: HTMLElement | null = chip.parentElement;
    while (sc && !(sc.scrollWidth > sc.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowX))) {
      sc = sc.parentElement;
    }
    if (!sc) return { error: 'no horizontal scroll container' } as any;
    const vw = window.innerWidth;
    const rects = () => [...sc!.querySelectorAll('[role="button"]')].map((e) => e.getBoundingClientRect());
    // The list mounts only a window of chips at a time, so the chips are counted by the
    // distinct labels seen over the whole scroll, not by what is in the DOM at one moment.
    const seen = new Set<string>();
    const collect = () => sc!.querySelectorAll('[role="button"]').forEach((e) => seen.add(e.getAttribute('aria-label') || ''));
    const measure = () => {
      const rs = rects();
      const f = chip.getBoundingClientRect();
      return {
        scrollLeft: Math.round(sc!.scrollLeft),
        minLeft: Math.round(Math.min(...rs.map((r) => r.left))),
        maxRight: Math.round(Math.max(...rs.map((r) => r.right))),
        firstLeft: Math.round(f.left),
        firstRight: Math.round(f.right),
      };
    };
    const wait = () => new Promise((r) => setTimeout(r, 350));
    // The row is a virtualized FlatList: content grows while scrolling, so push to the
    // extreme until scrollLeft stops moving (true end), then measure.
    const pushTo = async (target: number) => {
      let last = NaN;
      for (let i = 0; i < 40; i++) {
        sc!.scrollLeft = target;
        await wait();
        collect();
        if (sc!.scrollLeft === last) break;
        last = sc!.scrollLeft;
      }
    };
    const initial = measure();
    collect();
    await pushTo(1e7);
    const atMax = measure();
    await pushTo(-1e7);
    const atMin = measure();
    sc.scrollLeft = initial.scrollLeft;
    const sr = sc.getBoundingClientRect();
    return {
      vw,
      dir: getComputedStyle(sc).direction,
      count: rects().length,
      distinct: seen.size,
      scrollWidth: sc.scrollWidth,
      clientWidth: sc.clientWidth,
      containerLeft: Math.round(sr.left),
      containerRight: Math.round(sr.right),
      initial,
      atMax,
      atMin,
    };
  }, firstChipLabel);
}

async function countOf(loc: Locator): Promise<number> {
  return loc.count();
}

/**
 * RN-Web 0.21 drops accessibilityState on role=button chips (no aria-selected /
 * aria-pressed — itself recorded as an a11y observation), so the selected state is read
 * from the active fill (theme.colors.accent #C2185B or a safety fill).
 */
async function chipActive(chip: Locator): Promise<boolean> {
  return chip.evaluate((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && !/^rgb\(2[3-5]\d, 2[3-5]\d, 2[3-5]\d\)$/.test(bg);
  });
}

/** The on/off state a chip exposes to assistive tech (RN-Web drops accessibilityState on role=button). */
async function chipAria(chip: Locator) {
  return { selected: await chip.getAttribute('aria-selected'), pressed: await chip.getAttribute('aria-pressed') };
}

/**
 * Rating tags on screen (outside buttons, i.e. not the filter chips nor the list cards):
 * text, colours and WCAG contrast of the label on the first opaque ancestor fill.
 */
async function ratingTags(page: Page, labels: string[], insideButtons = false) {
  return page.evaluate(([wanted, insideButtons]) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => Number(x));
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const out: { text: string; color: string; background: string; ratio: number }[] = [];
    document.querySelectorAll('div,span').forEach((el) => {
      if (el.children.length > 0) return;
      const t = (el.textContent || '').trim();
      if (!wanted.includes(t)) return;
      // The foods-to-avoid cards are buttons (C-078) and carry their badge: measure it there.
      if (el.closest('[aria-hidden="true"]') || (!insideButtons && el.closest('[role="button"],button,[role="tab"]'))) return;
      const cv = (el as any).checkVisibility;
      if (cv && !cv.call(el, { visibilityProperty: true, opacityProperty: true })) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const fg = parse(getComputedStyle(el).color);
      let node: Element | null = el;
      let bg: { r: number; g: number; b: number; a: number } | null = null;
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0) {
          // Translucent fill: composite over white (the card behind every tag here).
          bg = c.a >= 1 ? c : { r: c.r * c.a + 255 * (1 - c.a), g: c.g * c.a + 255 * (1 - c.a), b: c.b * c.a + 255 * (1 - c.a), a: 1 };
          break;
        }
        node = node.parentElement;
      }
      if (!fg || !bg) return;
      const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      out.push({
        text: t,
        color: getComputedStyle(el).color,
        background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100,
      });
    });
    return out;
  }, [labels, insideButtons] as [string[], boolean]);
}

/** Search row: the leading icon and the input, to prove they are not glued (C-032). */
async function searchIconGap(input: Locator) {
  return input.evaluate((el) => {
    const icon = el.previousElementSibling || el.nextElementSibling;
    if (!icon) return null;
    const a = icon.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    const pad = (v: string) => Math.round(parseFloat(v) || 0);
    return {
      icon: (icon.textContent || '').trim(),
      iconLeft: Math.round(a.left),
      iconRight: Math.round(a.right),
      inputLeft: Math.round(b.left),
      inputRight: Math.round(b.right),
      /** Free space between the icon box and where the input's text starts. */
      gapRtl: Math.round(a.left - b.right) + pad(st.paddingRight),
      gapLtr: Math.round(b.left - a.right) + pad(st.paddingLeft),
      direction: st.direction,
    };
  });
}

/**
 * ForbiddenFoods card for a food name: its rating badge, and (once expanded) its own text.
 * Cards carry no role; the card is the smallest ancestor of the name that holds a badge.
 */
async function foodCard(page: Page, name: string, badgeLabels: string[], detailsLabel: string) {
  return page.evaluate(
    ({ name, badgeLabels, detailsLabel }) => {
      const n = (s: string) => s.replace(/[\u00A0\u202F\s]+/g, ' ').trim();
      const leaves = [...document.querySelectorAll('div,span')].filter(
        (e) => e.children.length === 0 && !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().width > 0,
      );
      const title = leaves.find((e) => n(e.textContent || '') === n(name));
      if (!title) return null;
      let card: Element | null = title.parentElement;
      const badgeIn = (root: Element) => leaves.filter((e) => root.contains(e) && badgeLabels.includes(n(e.textContent || '')));
      while (card && badgeIn(card).length === 0) card = card.parentElement;
      if (!card) return { badge: null, badges: 0, expanded: false, text: '' };
      const badges = badgeIn(card);
      let full: Element = card;
      // Expanded details live one level up (foodHeader → foodCard).
      for (let i = 0; i < 3 && full.parentElement; i++) {
        if (n((full as HTMLElement).innerText || '').includes(n(detailsLabel))) break;
        const up: Element = full.parentElement;
        if (badgeIn(up).length > badges.length) break;
        full = up;
      }
      const text = n((full as HTMLElement).innerText || '');
      const r = title.getBoundingClientRect();
      return { badge: n(badges[0].textContent || ''), badges: badges.length, expanded: text.includes(n(detailsLabel)), text, y: Math.round(r.top) };
    },
    { name, badgeLabels, detailsLabel },
  );
}

/**
 * C-055: the chat holds at most ONE emergency call button in the whole thread (inline on the
 * newest alert, or pinned above the input — never both, never one per older alert). `visible`
 * alone cannot see a hidden duplicate scrolled out of view, so the DOM count is asserted too.
 */
function expectOneCallInThread(calls: { inDom: number; visible: number }, where: string) {
  expect.soft(calls.inDom, `${where} C-055: at most one emergency call button in the whole thread ${JSON.stringify(calls)}`).toBeLessThanOrEqual(1);
}

/** The reviewed bubble copy of a red flag (chatbot_data standard_message_<L>), by flag id. */
function redFlagBubbleCopy(flagId: string, L: AppLocale): string {
  const flag = RED_FLAGS.find((f) => f.red_flag_id === flagId) as any;
  return norm(String(flag?.[`standard_message_${L}`] ?? ''));
}
const suggestionFlagId = (sid: string) => String((SUGGESTIONS.find((x) => x.suggestion_id === sid) as any)?.linked_red_flag_ids ?? '');

/** The chatbot call buttons are named by what they show, number included (C-079): "<label> (15)". */
function callName(l: AppLocale): RegExp {
  return new RegExp(`^${esc(tr(l, 'common.chatEmergencyAction'))} \\(.+\\)$`);
}

/** Emergency call buttons the user can actually see right now (in the viewport, not covered). */
async function callsOnScreen(page: Page, label: string | RegExp) {
  const all = page.getByRole('button', { name: label, exact: true });
  const n = await all.count();
  let visible = 0;
  for (let i = 0; i < n; i++) if ((await onScreen(all.nth(i))).ok) visible++;
  return { inDom: n, visible };
}

/** Scroll the virtualized suggestion row until the chip with this label is mounted and in view. */
async function revealChip(page: Page, label: string, knownLabels: string[]) {
  return page.evaluate(
    async ({ label, knownLabels }) => {
      const wait = () => new Promise((r) => setTimeout(r, 250));
      const find = (l: string) => [...document.querySelectorAll('[role="button"]')].find((e) => e.getAttribute('aria-label') === l && !e.closest('[aria-hidden="true"]'));
      const any = knownLabels.map(find).find(Boolean);
      if (!any) return { ok: false, why: 'no suggestion chip mounted' };
      let sc: HTMLElement | null = any.parentElement;
      while (sc && !(sc.scrollWidth > sc.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowX))) sc = sc.parentElement;
      if (!sc) return { ok: false, why: 'no horizontal scroll container' };
      const centre = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = sc!.getBoundingClientRect();
        sc!.scrollLeft += r.left + r.width / 2 - (s.left + s.width / 2);
      };
      for (const sign of [1, -1]) {
        sc.scrollLeft = 0;
        await wait();
        for (let i = 0; i < 60; i++) {
          const hit = find(label);
          if (hit) {
            centre(hit);
            await wait();
            const again = find(label);
            if (again) centre(again);
            await wait();
            return { ok: true, steps: i, sign };
          }
          const before = sc.scrollLeft;
          sc.scrollLeft = before + sign * 300;
          await wait();
          if (sc.scrollLeft === before) break;
        }
      }
      return { ok: false, why: 'chip never mounted while scrolling the row' };
    },
    { label, knownLabels },
  );
}

async function setChip(chip: Locator, on: boolean) {
  if ((await chipActive(chip)) !== on) await chip.click();
  await chip.page().waitForTimeout(250);
}

/** Every card of a virtualized FlatList (initialNumToRender=10): scroll until no new label. */
async function collectCards(page: Page, cards: Locator): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  await page.mouse.move(195, 600);
  for (let round = 0; round < 15; round++) {
    const n = await cards.count();
    let added = 0;
    for (let i = 0; i < n; i++) {
      const c = cards.nth(i);
      const k = (await c.getAttribute('aria-label')) || `#${i}`;
      if (!seen.has(k)) {
        seen.set(k, (await c.innerText()) || '');
        added++;
      }
    }
    if (!added && round > 0) break;
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(400);
  }
  await page.mouse.wheel(0, -50_000);
  await page.waitForTimeout(300);
  return seen;
}

/** Rects of chat user bubbles with exactly this text (anything inside a role=button — a chip — is excluded). */
async function userMsgBoxes(page: Page, text: string): Promise<{ x: number; w: number }[]> {
  return page.evaluate((t) => {
    const out: { x: number; w: number }[] = [];
    document.querySelectorAll('div,span').forEach((el) => {
      if (el.children.length > 0) return;
      if ((el.textContent || '').trim() !== t.trim()) return;
      if (el.closest('[role="button"],button')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      out.push({ x: Math.round(r.left), w: Math.round(r.width) });
    });
    return out;
  }, text);
}

/** First decimal number in a localized string ("1,7 kg" / "42.4 cm" / "١٫٧") → 1.7. */
function num(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.');
  const m = t.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Home hero stats (HomeScreen heroStatsRow): [lengthCard, weightCard], each [value, label].
 * Located from the localized weight label, which is the only fixed string in the row.
 */
async function homeGrowth(page: Page, weightLabel: string) {
  return page.evaluate((wl) => {
    const lbl = [...document.querySelectorAll('div')].find(
      (e) => e.children.length === 0 && (e.textContent || '').trim() === wl && !e.closest('[aria-hidden="true"]'),
    );
    const weightCard = lbl?.parentElement;
    const row = weightCard?.parentElement;
    if (!weightCard || !row || row.children.length < 2) return null;
    const lengthCard = row.children[0] as HTMLElement;
    return {
      length: (lengthCard.children[0]?.textContent || '').trim(),
      lengthLabel: (lengthCard.children[1]?.textContent || '').trim(),
      weight: (weightCard.children[0]?.textContent || '').trim(),
    };
  }, weightLabel);
}

/** BabyEvolution card: [item, size, "Week N · <length label>"] — read size + item next to the caption. */
async function evolutionGrowth(page: Page, lengthLabel: string) {
  return page.evaluate((ll) => {
    const cap = [...document.querySelectorAll('div')].find(
      (e) => e.children.length === 0 && (e.textContent || '').includes(`· ${ll}`) && !e.closest('[aria-hidden="true"]'),
    );
    if (!cap) return null;
    const size = cap.previousElementSibling;
    const item = size?.previousElementSibling;
    return { caption: (cap.textContent || '').trim(), size: (size?.textContent || '').trim(), item: (item?.textContent || '').trim() };
  }, lengthLabel);
}

/**
 * Is the element actually on screen for the user: its box inside the viewport and the
 * top-most element at its centre (not covered). Returns the measurement for evidence.
 */
async function onScreen(loc: Locator) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const inside = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    const hit = inside ? document.elementFromPoint(cx, cy) : null;
    return { ok: inside && !!hit && (hit === el || el.contains(hit)), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
}

/** Poll until the call button is on screen (the chat list scrolls to the end after the reply). */
async function expectCallOnScreen(w: WaveCtx, loc: Locator, label: string) {
  // Wait (not a check): the list scrolls to the end after the reply renders.
  let m = await onScreen(loc);
  for (let i = 0; i < 20 && !m.ok; i++) {
    await loc.page().waitForTimeout(300);
    m = await onScreen(loc);
  }
  w.note(`${label}.onScreen`, m);
  expect.soft(m.ok, `${label}: call button visible on screen ${JSON.stringify(m)}`).toBe(true);
}

/** "12 Aliments" → 12 (ForbiddenFoods results line). */
async function foodsCount(page: Page, L: AppLocale): Promise<number | null> {
  const line = page.getByText(new RegExp(`^\\d+ ${esc(tr(L, 'common.foods'))}$`)).first();
  if (!(await line.isVisible())) return null;
  const txt = (await line.innerText()).trim();
  return Number(txt.split(' ')[0]);
}

/** getLocalizedContent fallback chain (src/utils/i18nHelpers.ts). */
function localized(doc: Record<string, unknown> | null, field: string, L: AppLocale): string {
  if (!doc) return '';
  const chain = [`${field}_${L}`, ...(L === 'tn' ? [`${field}_ar`] : []), `${field}_en`, `${field}_fr`, field];
  for (const k of chain) if (doc[k]) return String(doc[k]);
  return '';
}

// ── Chat helpers ──────────────────────────────────────────────────────────────

/**
 * The message list is a virtualized FlatList, so counting role=alert is unreliable (older
 * alerts unmount). Mark every alert present now; a new triage block is an unmarked one.
 */
async function markAlerts(page: Page) {
  await page.evaluate(() => document.querySelectorAll('[role="alert"]').forEach((e) => e.setAttribute('data-e2e-seen', '1')));
}
const newAlert = (page: Page) => page.locator('[role="alert"]:not([data-e2e-seen])');

async function chatSend(w: WaveCtx, text: string) {
  const { page, L } = w;
  w.typed.push(text);
  const input = page.getByPlaceholder(tr(L, 'common.chatAskQuestion'));
  await input.fill(text);
  const send = page.getByRole('button', { name: tr(L, 'a11y.sendMessage'), exact: true });
  const enabledBefore = (await send.getAttribute('aria-disabled')) !== 'true';
  await send.click();
  const disabledAfter = (await send.getAttribute('aria-disabled')) === 'true';
  return { enabledBefore, disabledAfter };
}

/** Send and wait for new bot lines (lines absent before, excluding the typed text). */
async function chatExchange(w: WaveCtx, text: string): Promise<{ newLines: string[]; enabledBefore: boolean; disabledAfter: boolean }> {
  const { page } = w;
  const before = new Set(splitLines((await page.locator('body').innerText()) || ''));
  const flags = await chatSend(w, text);
  let newLines: string[] = [];
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const now = splitLines((await page.locator('body').innerText()) || '');
    newLines = now.filter((l) => !before.has(l) && l !== text.trim() && l !== '⏳');
    const busy = (await page.getByText('⏳').count()) > 0;
    if (newLines.length > 0 && !busy) break;
  }
  return { newLines, ...flags };
}

// ── Main run: signed-in reader per locale ─────────────────────────────────────

for (const C of CFG) {
  test.describe(`Wave C — ${C.L} signed-in reader`, () => {
    test.use({ ...waveUse(C.L), actionTimeout: 20_000 });

    test(`${C.L}: resources, supplements, foods, recs, baby evolution, chatbot`, async ({ page }, testInfo) => {
      test.setTimeout(480_000);
      const { L } = C;
      const rtl = C.dir === 'rtl';
      const VW = 390;

      // Account (REST, rules apply to the seed) + UI login.
      const email = newAccountEmail('C', `reader-${L}`);
      const acct = await createAccount(email, E2E_PASSWORD);
      // C-070: a LONG first name (>= 14 letters; Arabic one with spaces so it may wrap), because the round-11
      // greeting regression (C-057) only showed with a name that wraps or shrinks. 'Lectrice' (8 letters) never did.
      const readerFirst = rtl ? 'عبد الرحمن بن محمد' : 'Anne-Marguerite';
      expect.soft(readerFirst.replace(/[\s-]/g, '').length, 'C-070: the reader first name has >= 14 letters').toBeGreaterThanOrEqual(14);
      await seedProfile(acct.uid, acct.idToken, { week: 32, country: C.country, firstName: readerFirst, lastName: 'Testeur' });
      const w = new WaveCtx(page, L, L, testInfo);
      w.note('account', { uid: acct.uid, email, country: C.country });
      await uiLogin(page, email, E2E_PASSWORD, L);
      w.typed.push(readerFirst, 'Testeur', email, 'zzqx');

      // ── 00 Home (weekly content language: baby message, recommendations) ────
      await expect(page.getByText(tr(L, 'common.nav.home'), { exact: true }).first()).toBeVisible();
      await page.waitForTimeout(1500);
      const hg = await homeGrowth(page, tr(L, 'common.weight'));
      w.note('00.homeGrowth', hg);
      expect.soft(hg, '00: Home hero size/weight cards found').not.toBeNull();
      expect.soft(num(hg?.length), '00: week-32 length on Home = 42.4 cm').toBe(42.4);
      expect.soft(hg?.weight.replace(/\s+/g, ' '), `00: week-32 weight on Home = "${W32_WEIGHT[L]}", unit included`).toBe(W32_WEIGHT[L]);
      const homeSa = (await visibleLines(page)).filter((l) => /\(\s*\d+\s*SA\s*\)/.test(l));
      expect.soft(homeSa, '00: no stray "(N SA)" aside on Home').toEqual([]);
      // C-026: the size comparison is a label of its own + one value. It used to be the
      // onboarding sentence cut before its placeholder ("Votre bébé fait la taille" / "d'").
      const cmpLabel = tr(L, 'home.sizeComparisonLabel');
      const cmp = await page.evaluate((label) => {
        const el = [...document.querySelectorAll('div')].find(
          (e) => e.children.length === 0 && (e.textContent || '').trim() === label && !e.closest('[aria-hidden="true"]'),
        );
        return el?.parentElement ? [...el.parentElement.children].map((c) => (c.textContent || '').trim()) : null;
      }, cmpLabel);
      w.note('00.C-026.sizeComparison', cmp);
      expect.soft(cmp, `00 C-026: comparison box = ["${cmpLabel}", "<name> (<length>)"]`).not.toBeNull();
      expect.soft(cmp?.length, '00 C-026: comparison box holds exactly the label and one value').toBe(2);
      expect.soft(cmp?.[1] ?? '', '00 C-026: the value quotes the same length as the hero card').toContain(`(${hg?.length})`);
      const homeLines = await visibleLines(page);
      expect.soft(
        homeLines.filter((l) => /^(d['’]|d['’]un\(e\)|de la|du|of|of a)$/i.test(l) || /fait la taille$/i.test(l)),
        '00 C-026: no orphan sentence fragment around the comparison',
      ).toEqual([]);
      expect.soft(homeLines.filter((l) => RAW_MARKDOWN.test(l)), '00 C-028: no raw markdown in Home excerpts').toEqual([]);
      // C-057 / A-049: the greeting never runs under the avatar (physical right in ltr and rtl alike).
      const greet = await greetingVsAvatar(page, readerFirst);
      w.note('00.C-057.greetingVsAvatar', greet);
      expect.soft(greet.found, '00 C-057: greeting and avatar both found').toBe(true);
      if (greet.found) {
        expect.soft(greet.overlapArea, `00 C-057: the ${L} greeting does not overlap the avatar (${JSON.stringify(greet.ink)} vs ${JSON.stringify(greet.avatar)})`).toBe(0);
        expect.soft(greet.gapPx, `00 C-057: the ${L} greeting stays >= 4 px clear of the avatar ring`).toBeGreaterThanOrEqual(4);
        expect.soft(greet.insideViewport, `00 C-057: the ${L} greeting stays inside the viewport`).toBe(true);
      }
      // C-059: the Home recommendation cards draw no stand-in emoji (📰 📚 💊).
      const homeStandIns = await placeholderEmojiCards(page);
      w.note('00.C-059.placeholderEmoji', homeStandIns);
      expect.soft(homeStandIns, '00 C-059: no stand-in emoji on the Home recommendation cards').toEqual([]);
      await w.state('00-home');
      // C-043: the "Baby this week" card sits below the hero fold and was DOM-only in every capture.
      const babyCard = page.getByText(tr(L, 'common.heroTitle')).first(); // the Home card heading is common.heroTitle in every locale
      await expect.soft(babyCard, '00b C-043: Home has the "Baby this week" card').toHaveCount(1);
      if (await babyCard.count()) {
        await babyCard.scrollIntoViewIfNeeded();
        await expect.soft(babyCard, '00b C-043: the card is in view for the capture').toBeInViewport();
        await w.state('00b-home-baby-this-week');
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelectorAll('*').forEach((e) => {
            if ((e as HTMLElement).scrollTop > 0) (e as HTMLElement).scrollTop = 0;
          });
        });
        await page.waitForTimeout(300);
      }
      // C-070: Home below the fold. The "Organisation" tiles and the "Recommandations" rows (round-13 vector
      // icons) were only ever asserted in the DOM, never captured. Each heading is scrolled into view.
      for (const [key, shot] of [['common.organization', '00c-home-organisation'], ['common.recommendationsTitle', '00d-home-recommendations']] as const) {
        const title = page.getByText(tr(L, key)).filter({ visible: true }).first();
        await expect.soft(title, `${shot}: Home has the "${tr(L, key)}" section`).toHaveCount(1);
        if (await title.count()) {
          await title.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          if (key === 'common.recommendationsTitle') {
            const stand = await placeholderEmojiCards(page);
            w.note('00d.C-059.placeholderEmoji', stand);
            expect.soft(stand, '00d C-059: no stand-in emoji on the Home recommendation cards once scrolled to them').toEqual([]);
          }
          await w.state(shot);
        }
      }
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelectorAll('*').forEach((e) => {
          if ((e as HTMLElement).scrollTop > 0) (e as HTMLElement).scrollTop = 0;
        });
      });
      await page.waitForTimeout(300);

      // Chatbot must be local-only: record any non-static, non-Firestore request.
      const foreign: string[] = [];
      page.on('request', (r) => {
        const u = r.url();
        if (u.startsWith(new URL(page.url() || E2E_ORIGIN).origin) || u.startsWith(E2E_ORIGIN)) return;
        if (/127\.0\.0\.1:(8080|9099)|localhost:(8080|9099)|^data:|^blob:/.test(u)) return;
        foreign.push(`${r.method()} ${u.slice(0, 160)}`);
      });

      // ── 01 Resources / Articles ──────────────────────────────────────────────
      await page.getByRole('tab', { name: tr(L, 'common.nav.resources'), exact: true }).click();
      const seeDetails = tr(L, 'common.seeDetails');
      const cards = page.getByRole('button').filter({ hasText: seeDetails });
      await expect(cards.first(), '01: article cards must render').toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('tab', { name: tr(L, 'common.screen.articles'), exact: true })).toHaveAttribute('aria-selected', 'true');
      const titles: string[] = [];
      for (let i = 0; i < Math.min(8, await cards.count()); i++) titles.push((await cards.nth(i).getAttribute('aria-label')) || '');
      w.note('01.titles', titles);
      if (L === 'ar' || L === 'tn') {
        expect.soft(titles.filter((t) => !ARABIC.test(t)), '01: non-Arabic article titles').toEqual([]);
      } else if (L === 'en') {
        expect.soft(titles.filter((t) => FRENCH_WORDS.test(t)), '01: French article titles in en').toEqual([]);
      }
      const lead = await leadSide(cards.first());
      w.note('01.cardLead', lead);
      if (lead) {
        if (rtl) expect.soft(lead.leadLeft, '01: RTL — card icon block must sit on the right of the text').toBeGreaterThan(lead.contentLeft);
        else expect.soft(lead.leadLeft, '01: LTR — card icon block on the left').toBeLessThan(lead.contentLeft);
      }
      // C-023 (articles side): the card tag and the filter chip read the same category label.
      const favChip0 = page.getByRole('button', { name: tr(L, 'common.favorites'), exact: true }).locator('visible=true');
      const rowLabels = await favChip0.first().evaluate((el) => [...(el.parentElement?.children || [])].map((c) => c.getAttribute('aria-label') || ''));
      w.note('01.chipRow', rowLabels);
      expect.soft(rowLabels.slice(0, 2), '01: chip row starts with Favorites, All').toEqual([tr(L, 'common.favorites'), tr(L, 'categories.all')]);
      const catLabel = rowLabels[2];
      expect.soft(!!catLabel, '01: at least one category chip').toBe(true);
      await w.state('01-resources-articles');
      if (catLabel) {
        const allChip0 = page.getByRole('button', { name: tr(L, 'categories.all'), exact: true }).locator('visible=true').first();
        const catChip = page.getByRole('button', { name: catLabel, exact: true }).locator('visible=true').first();
        await catChip.click();
        await page.waitForTimeout(300);
        const nCat = await countOf(cards);
        const cardTags: string[][] = [];
        for (let i = 0; i < Math.min(6, nCat); i++) cardTags.push(splitLines(await cards.nth(i).innerText()));
        const offLabel = cardTags.filter((lines) => !lines.includes(catLabel)).map((lines) => lines.slice(0, 2).join(' | '));
        w.note('01b.C-023.categoryFilter', { chip: catLabel, cards: nCat, cardsWithoutThatTag: offLabel });
        expect.soft(nCat, `01b: category chip "${catLabel}" lists ≥1 article`).toBeGreaterThanOrEqual(1);
        expect.soft(offLabel, `01b C-023: every card under chip "${catLabel}" carries the tag "${catLabel}"`).toEqual([]);
        expect.soft(await chipActive(catChip), '01b: the category chip is lit').toBe(true);
        expect.soft(await chipActive(allChip0), '01b: "All" is not lit while a category is').toBe(false);
        await w.state('01b-articles-category-filter');
        await allChip0.click();
        await page.waitForTimeout(250);
      }

      // ── 02 Articles search ───────────────────────────────────────────────────
      const artSearch = page.getByPlaceholder(tr(L, 'common.searchArticlePlaceholder'));
      await artSearch.fill(C.articleQ);
      await page.waitForTimeout(300);
      const nQ = await countOf(cards);
      w.note('02.results', { q: C.articleQ, n: nQ });
      expect.soft(nQ, `02: "${C.articleQ}" must return ≥1 article`).toBeGreaterThanOrEqual(1);
      if (L === 'fr') {
        await artSearch.fill('nausees');
        await page.waitForTimeout(300);
        const nFold = await countOf(cards);
        w.note('02.HYP-C1.unaccented', { q: 'nausees', n: nFold });
        expect.soft(nFold, '02 HYP-C1: unaccented "nausees" should match like ForbiddenFoods folding does').toBeGreaterThanOrEqual(1);
      }
      await w.state('02-articles-search');

      // ── 03 No match ─────────────────────────────────────────────────────────
      await artSearch.fill('zzqx');
      const emptyArt = tr(L, 'common.noResultsFor', { query: 'zzqx' });
      await expect.soft(page.getByText(emptyArt, { exact: true }), '03: localized empty state').toBeVisible();
      expect.soft(emptyArt.length, '03: empty-state copy ≥20 chars').toBeGreaterThanOrEqual(20);
      expect.soft(await countOf(cards), '03: zzqx → 0 cards').toBe(0);
      await w.state('03-articles-nomatch');

      // ── 03b Unreviewed Ramadan/halal content hidden from search ──────────────
      const ramadanQ = L === 'ar' || L === 'tn' ? 'رمضان' : 'ramadan';
      await artSearch.fill(ramadanQ);
      await page.waitForTimeout(300);
      const nRamadan = await countOf(cards);
      w.note('03b.ramadanSearch', { q: ramadanQ, n: nRamadan });
      expect.soft(nRamadan, `03b: "${ramadanQ}" must return no article (clinically unreviewed content hidden)`).toBe(0);
      await w.state('03b-articles-ramadan-hidden');

      // ── 03c Favoris with nothing saved (C-029) + one lit chip (C-030) ───────
      await artSearch.fill('');
      const favTitle = tr(L, 'common.favoritesEmpty.title');
      const favHint = tr(L, 'common.favoritesEmpty.hint');
      const emptyQuery = tr(L, 'common.noResultsFor', { query: '' });
      const favChipA = page.getByRole('button', { name: tr(L, 'common.favorites'), exact: true }).locator('visible=true').first();
      const allChipA = page.getByRole('button', { name: tr(L, 'categories.all'), exact: true }).locator('visible=true').first();
      expect.soft(await chipActive(allChipA), '03c: "All" lit before any filter').toBe(true);
      expect.soft(await chipActive(favChipA), '03c: Favorites not lit before any filter').toBe(false);
      await setChip(favChipA, true);
      await expect.soft(page.getByText(favTitle, { exact: true }).locator('visible=true'), `03c C-029: empty Favorites says "${favTitle}"`).toBeVisible();
      await expect.soft(page.getByText(favHint, { exact: true }).locator('visible=true'), '03c C-029: … and how to add one').toBeVisible();
      expect.soft((await visibleLines(page)).filter((l) => norm(l) === norm(emptyQuery)), '03c C-029: not a failed search for ""').toEqual([]);
      expect.soft(favTitle.length + favHint.length, '03c: empty-state copy ≥20 chars').toBeGreaterThanOrEqual(20);
      expect.soft(await countOf(cards), '03c: fresh account → 0 favourite articles').toBe(0);
      expect.soft(await chipActive(favChipA), '03c C-030: Favorites lit').toBe(true);
      expect.soft(await chipActive(allChipA), '03c C-030: "All" not lit while Favorites is').toBe(false);
      w.note('03c.C-030.aria', { favorites: await chipAria(favChipA), all: await chipAria(allChipA) });
      await w.state('03c-articles-favoris-empty');
      await setChip(favChipA, false);
      expect.soft(await chipActive(allChipA), '03c C-030: leaving Favorites lights "All" again').toBe(true);

      // ── 04 Article detail (inside ResourcesStack) + bookmark + Favoris ──────
      await artSearch.fill(C.articleQ);
      await expect(cards.first()).toBeVisible();
      const artTitle = (await cards.first().getAttribute('aria-label')) || '';
      await cards.first().click();
      const addFav = tr(L, 'common.addToFavorites');
      const savedLbl = tr(L, 'common.saved');
      const artBookmark = page.getByRole('button', { name: new RegExp(`^(${esc(addFav)}|${esc(savedLbl)})$`) });
      await expect(artBookmark.first(), '04: article detail must render').toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);
      const artBacks = await backAffordances(page);
      w.note('04.GJ-008.backs', artBacks);
      expect.soft(artBacks.length, `04 GJ-008/HYP-C2: exactly one back affordance on ArticleDetail, got ${JSON.stringify(artBacks)}`).toBe(1);
      if (rtl) {
        expect.soft(artBacks.filter((b) => b.x + b.w / 2 < VW / 2), '04: RTL — back affordance(s) must be on the right').toEqual([]);
      }
      await expect.soft(page.getByRole('button', { name: addFav, exact: true }), '04: fresh account → not bookmarked').toBeVisible();
      await page.getByRole('button', { name: addFav, exact: true }).click();
      await expect.soft(page.getByRole('button', { name: savedLbl, exact: true }), '04: bookmark → aria-label flips to saved').toBeVisible();
      await w.state('04-article-detail-bookmark');

      expect(artBacks.length, '04: need a back affordance to leave ArticleDetail').toBeGreaterThan(0);
      await clickBox(page, artBacks[0]);
      await expect(page.getByPlaceholder(tr(L, 'common.searchArticlePlaceholder')), '04: back → Articles list').toBeVisible({ timeout: 15_000 });
      await artSearch.fill('');
      const favChip = page.getByRole('button', { name: tr(L, 'common.favorites'), exact: true });
      w.note('04b.favChipAria', {
        selected: await favChip.getAttribute('aria-selected'),
        pressed: await favChip.getAttribute('aria-pressed'),
        checked: await favChip.getAttribute('aria-checked'),
      });
      expect.soft(
        [await favChip.getAttribute('aria-selected'), await favChip.getAttribute('aria-pressed')].some((v) => v != null),
        '04b a11y: the Favoris filter chip must expose its toggled state (aria-pressed/aria-selected) — RN-Web drops accessibilityState',
      ).toBe(true);
      await setChip(favChip, true);
      const favCards = await countOf(cards);
      w.note('04b.favoris', { artTitle, favCards });
      await expect.soft(page.getByRole('button', { name: artTitle, exact: true }), '04b SYNC-14: bookmarked article listed under Favoris').toBeVisible();
      expect.soft(favCards, '04b: Favoris lists exactly the 1 bookmarked article').toBe(1);
      expect.soft(await chipActive(favChip), '04b C-030: Favorites lit').toBe(true);
      expect.soft(await chipActive(allChipA), '04b C-030: "All" not lit while Favorites is').toBe(false);
      await w.state('04b-articles-favoris');

      if (L === 'fr') {
        // SYNC-14 round trip: unbookmark → gone from Favoris.
        await page.getByRole('button', { name: artTitle, exact: true }).click();
        await expect(page.getByRole('button', { name: savedLbl, exact: true })).toBeVisible({ timeout: 30_000 });
        await page.getByRole('button', { name: savedLbl, exact: true }).click();
        await expect.soft(page.getByRole('button', { name: addFav, exact: true }), '04c: unbookmark flips back').toBeVisible();
        const b2 = await backAffordances(page);
        expect(b2.length).toBeGreaterThan(0);
        await clickBox(page, b2[0]);
        await expect(page.getByPlaceholder(tr(L, 'common.searchArticlePlaceholder'))).toBeVisible({ timeout: 15_000 });
        const chipStillOn = await chipActive(favChip);
        await setChip(favChip, true);
        const favAfter = await countOf(cards);
        w.note('04c.unbookmark', { chipStillOn, favAfter });
        expect.soft(favAfter, '04c SYNC-14: unbookmarked article removed from Favoris').toBe(0);
        await expect.soft(page.getByText(favTitle, { exact: true }).locator('visible=true'), '04c C-029: back to the empty-Favorites state').toBeVisible();
        expect.soft((await visibleLines(page)).filter((l) => norm(l) === norm(emptyQuery)), '04c C-029: not a failed search for ""').toEqual([]);
        await w.state('04c-articles-unbookmark');
      }
      await setChip(favChip, false);

      // ── 05 Supplements list: language of descriptions (HYP-C3) ─────────────
      await page.getByRole('tab', { name: tr(L, 'common.screen.supplements'), exact: true }).click();
      const suppSearch = page.getByPlaceholder(tr(L, 'common.searchSupplement'));
      await expect(suppSearch, '05: supplements list must render').toBeVisible({ timeout: 30_000 });
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });
      const allSupp = await collectCards(page, cards);
      const nSupp = allSupp.size;
      const suppLeaks: { card: string; leaks: string[] }[] = [];
      for (const [card, text] of allSupp) {
        const leaks = scriptLeaks(L, splitLines(text));
        if (leaks.length) suppLeaks.push({ card, leaks });
      }
      w.note('05.cards', nSupp);
      const gap = await searchIconGap(suppSearch);
      w.note('05.C-032.searchRow', gap);
      expect.soft(gap, '05: search row = icon + input').not.toBeNull();
      if (gap) {
        expect.soft(gap.direction, `05 C-032: search input direction`).toBe(C.dir);
        if (rtl) {
          expect.soft(gap.iconLeft, '05 C-032: RTL — search icon on the right of the input').toBeGreaterThanOrEqual(gap.inputRight);
          expect.soft(gap.gapRtl, `05 C-032: RTL — icon not glued to the placeholder ${JSON.stringify(gap)}`).toBeGreaterThanOrEqual(6);
        } else {
          expect.soft(gap.iconRight, '05: LTR — search icon on the left of the input').toBeLessThanOrEqual(gap.inputLeft);
          expect.soft(gap.gapLtr, `05: LTR — icon not glued to the placeholder ${JSON.stringify(gap)}`).toBeGreaterThanOrEqual(6);
        }
      }
      w.note('05.HYP-C3.leaks', suppLeaks);
      expect.soft(nSupp, '05: 15 supplements').toBeGreaterThanOrEqual(15);
      expect.soft(
        suppLeaks.map((s) => `${s.card}: ${s.leaks[0].slice(0, 70)}`),
        `05 HYP-C3: supplement cards not in ${L}`,
      ).toEqual([]);
      // Visible body minus the cards already reported (avoid double counting).
      await w.state('05-supplements-list', { script: false });

      // ── 05b Supplements search ─────────────────────────────────────────────
      await suppSearch.fill(C.suppQ);
      await page.waitForTimeout(300);
      const nSq = await countOf(cards);
      w.note('05b.results', { q: C.suppQ, n: nSq });
      expect.soft(nSq, `05b: "${C.suppQ}" must return ≥1 supplement`).toBeGreaterThanOrEqual(1);
      await suppSearch.fill('zzqx');
      await expect.soft(page.getByText(tr(L, 'common.noSupplementFound', { query: 'zzqx' }), { exact: true }), '05b: localized empty').toBeVisible();
      await w.state('05b-supplements-search', { script: false });
      await suppSearch.fill('');

      // ── 06 "With caution" chip (HYP-C4) ─────────────────────────────────────
      const cautionChip = page.getByRole('button', { name: tr(L, 'common.supplementSafety.caution'), exact: true });
      await setChip(cautionChip, true);
      const cautionLbl = tr(L, 'common.supplementSafety.caution');
      const avoidLbl = tr(L, 'common.supplementSafety.avoid');
      const safeLbl = tr(L, 'common.supplementSafety.safe');
      const cautionCards = await collectCards(page, cards);
      const nCaution = cautionCards.size;
      w.note('06.HYP-C4.caution', nCaution);
      expect.soft(nCaution, '06 HYP-C4: "with caution" filter must list the à-surveiller supplements (s09/s10)').toBeGreaterThanOrEqual(1);
      // C-023: the card badge reads what the chip reads (it used to say "À surveiller" / "Monitor").
      const offCaution = [...cautionCards].filter(([, text]) => !norm(text).includes(cautionLbl)).map(([name]) => name);
      w.note('06.C-023.cardBadges', { chip: cautionLbl, cards: [...cautionCards.keys()], cardsWithoutChipLabel: offCaution });
      expect.soft(offCaution, `06 C-023: every card under chip "${cautionLbl}" is badged "${cautionLbl}"`).toEqual([]);
      const allChipS = page.getByRole('button', { name: tr(L, 'categories.all'), exact: true }).locator('visible=true').first();
      expect.soft(await chipActive(allChipS), '06 C-030: "All" not lit while a rating chip is').toBe(false);
      await w.state('06-supplements-caution-filter', { script: false });
      await setChip(cautionChip, false);

      // ── 06c "Avoid" chip (C-017): vitamin A and selenium, badged "Avoid" ────
      const s11 = await serverDoc('supplements/s11_vitamine_a');
      const s15 = await serverDoc('supplements/s15_selenium');
      w.note('07.server.s11', { pregnancy_safety: s11?.pregnancy_safety, hasShortDescL: !!s11?.[`short_description_${L}`] });
      w.note('06c.server.s15', { pregnancy_safety: s15?.pregnancy_safety });
      const s11Name = localized(s11, 'name', L) || 'Vitamine A';
      const s15Name = localized(s15, 'name', L) || 'Sélénium';
      const avoidChip = page.getByRole('button', { name: avoidLbl, exact: true }).locator('visible=true').first();
      await setChip(avoidChip, true);
      const avoidCards = await collectCards(page, cards);
      const offAvoid = [...avoidCards].filter(([, text]) => !norm(text).includes(avoidLbl)).map(([name]) => name);
      w.note('06c.C-017.avoid', { chip: avoidLbl, cards: [...avoidCards.keys()], cardsWithoutChipLabel: offAvoid });
      expect.soft([...avoidCards.keys()].sort(), '06c C-017: the "Avoid" filter lists exactly vitamin A and selenium').toEqual([s11Name, s15Name].sort());
      expect.soft(offAvoid, `06c C-017/C-023: every card under chip "${avoidLbl}" is badged "${avoidLbl}"`).toEqual([]);
      await w.state('06c-supplements-avoid-filter', { script: false });
      await setChip(avoidChip, false);

      // ── 06b Favoris with nothing saved (C-029 / C-030, supplements side) ────
      const sFav0 = page.getByRole('button', { name: tr(L, 'common.favorites'), exact: true }).locator('visible=true').first();
      await setChip(sFav0, true);
      await expect.soft(page.getByText(favTitle, { exact: true }).locator('visible=true'), '06b C-029: empty supplement Favorites has its own empty state').toBeVisible();
      await expect.soft(page.getByText(favHint, { exact: true }).locator('visible=true'), '06b C-029: … with the hint').toBeVisible();
      expect.soft(
        (await visibleLines(page)).filter((l) => norm(l) === norm(tr(L, 'common.noSupplementFound', { query: '' }))),
        '06b C-029: not a failed search for ""',
      ).toEqual([]);
      expect.soft(await chipActive(sFav0), '06b C-030: Favorites lit').toBe(true);
      expect.soft(await chipActive(allChipS), '06b C-030: "All" not lit while Favorites is').toBe(false);
      await w.state('06b-supplements-favoris-empty', { script: false });
      await setChip(sFav0, false);
      expect.soft(await chipActive(allChipS), '06b C-030: leaving Favorites lights "All" again').toBe(true);

      // ── 07 Supplement detail s11 (HYP-C4b, GJ-008, HYP-C3) + bookmark ──────
      expect.soft(s11?.pregnancy_safety, '07 C-017: server rating of vitamin A').toBe('deconseille');
      await suppSearch.fill(s11Name);
      await page.getByRole('button', { name: s11Name, exact: true }).first().click();
      const sBookmark = page.getByRole('button', { name: new RegExp(`^(${esc(addFav)}|${esc(savedLbl)})$`) });
      await expect(sBookmark.first(), '07: supplement detail must render').toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);
      const sBacks = await backAffordances(page);
      w.note('07.GJ-008.backs', sBacks);
      expect.soft(sBacks.length, `07 GJ-008: exactly one back affordance on SupplementDetail, got ${JSON.stringify(sBacks)}`).toBe(1);
      if (rtl) expect.soft(sBacks.filter((b) => b.x + b.w / 2 < VW / 2), '07: RTL — back on the right').toEqual([]);
      const unknownLbl = tr(L, 'common.supplementSafety.unknown');
      const sBody = (await page.locator('body').innerText()) || '';
      expect.soft(sBody.includes(unknownLbl), `07 HYP-C4b: s11 status must not read "${unknownLbl}"`).toBe(false);
      // C-017: vitamin A (retinol, teratogenic in excess) is rated "Avoid", and its own text says so.
      const ratingLabels = [safeLbl, cautionLbl, avoidLbl, unknownLbl];
      const s11Tags = await ratingTags(page, ratingLabels);
      w.note('07.C-017.vitaminA.tag', s11Tags);
      expect.soft(s11Tags.map((x) => x.text), `07 C-017: vitamin A detail tag = "${avoidLbl}"`).toEqual([avoidLbl]);
      expect.soft(AVOID_WORDS[L].test(sBody), `07 C-017: vitamin A text itself tells her to avoid it (${AVOID_WORDS[L]})`).toBe(true);
      for (const tg of s11Tags) expect.soft(tg.ratio, `07 C-040: tag "${tg.text}" ${tg.color} on ${tg.background} ≥ 4.5:1`).toBeGreaterThanOrEqual(4.5);
      const vitASupplementRating = s11Tags[0]?.text ?? null;
      const sourceLead = tr(L, 'common.sourceLine', { sources: '' }).trim();
      const sourceLines = splitLines(sBody).filter((l) => l.startsWith(sourceLead));
      w.note('07.sourceLine', sourceLines);
      expect.soft(sourceLines.length, `07: source line starts with "${sourceLead}"`).toBeGreaterThan(0);
      if (L !== 'fr') {
        expect.soft(sourceLines.filter((l) => /\bOMS\b|\bRevue\b|Source :/.test(l)), `07: no French authority name or "Source :" in ${L}`).toEqual([]);
      }
      if (L === 'ar' || L === 'tn') {
        expect.soft(sourceLines.filter((l) => /\bWHO\b/.test(l)), `07: WHO printed under its Arabic name in ${L}`).toEqual([]);
        expect.soft(/\(ER\)/.test(sBody), '07 C-024: no French "(ER)" unit gloss in the Arabic dose text').toBe(false);
      }
      // C-024: s11 cites "OMS 2023, ACOG, NHS" — the WHO is named in the reader's language.
      const whoName = tr(L, 'common.sourceAuthorities.who');
      expect.soft(sourceLines[0] ?? '', `07 C-024: source line names the WHO as "${whoName} 2023"`).toContain(`${whoName} 2023`);
      expect.soft(norm(sourceLines[0] ?? '').startsWith(norm(sourceLead)), `07 C-024: lead is the localized "${norm(sourceLead)}"`).toBe(true);
      await page.getByRole('button', { name: addFav, exact: true }).click();
      await expect.soft(page.getByRole('button', { name: savedLbl, exact: true }), '07: supplement bookmark flips').toBeVisible();
      await w.state('07-supplement-detail');

      expect(sBacks.length).toBeGreaterThan(0);
      await clickBox(page, sBacks[0]);
      await expect(suppSearch, '07: back → Supplements list').toBeVisible({ timeout: 15_000 });
      await suppSearch.fill('');
      const sFav = page.getByRole('button', { name: tr(L, 'common.favorites'), exact: true });
      await setChip(sFav, true);
      await expect.soft(page.getByRole('button', { name: s11Name, exact: true }), '07b SYNC-14: bookmarked supplement listed under Favoris').toBeVisible();
      expect.soft(await countOf(cards), '07b: exactly 1 favourite supplement').toBe(1);
      expect.soft(await chipActive(sFav), '07b C-030: Favorites lit').toBe(true);
      expect.soft(await chipActive(allChipS), '07b C-030: "All" not lit while Favorites is').toBe(false);
      expect.soft(norm(await cards.first().innerText()).includes(avoidLbl), `07b C-017: vitamin A list card badged "${avoidLbl}"`).toBe(true);
      await w.state('07b-supplements-favoris', { script: false });
      await setChip(sFav, false);

      {
        // HYP-C4b + C-017 + C-040: the detail tag of one supplement per rating — iron (safe)
        // and selenium (avoid) in every locale, plus zinc / vitamin C (with caution) in fr.
        const want: [string, string, string | null][] = [
          ['s02_fer', safeLbl, '07d-supplement-safe-detail'],
          ...(L === 'fr' ? ([['s09_zinc', cautionLbl, null], ['s10_vitamine_c', cautionLbl, null]] as [string, string, null][]) : []),
          ['s15_selenium', avoidLbl, '07e-supplement-selenium-detail'],
        ];
        const statuses: Record<string, string> = {};
        const tags: Record<string, unknown> = {};
        for (const [id, expected, stateName] of want) {
          const d = await serverDoc(`supplements/${id}`);
          const nm = localized(d, 'name', L);
          await suppSearch.fill(nm);
          await page.getByRole('button', { name: nm, exact: true }).first().click();
          await expect(page.getByRole('button', { name: addFav, exact: true })).toBeVisible({ timeout: 30_000 });
          await page.waitForTimeout(500);
          const b = (await page.locator('body').innerText()) || '';
          statuses[id] = b.includes(unknownLbl) ? unknownLbl : 'ok';
          const tg = await ratingTags(page, ratingLabels);
          tags[id] = tg;
          expect.soft(tg.map((x) => x.text), `07c ${id}: detail tag = "${expected}"`).toEqual([expected]);
          for (const x of tg) expect.soft(x.ratio, `07c C-040 ${id}: tag "${x.text}" ${x.color} on ${x.background} ≥ 4.5:1`).toBeGreaterThanOrEqual(4.5);
          if (id === 's15_selenium') {
            expect.soft(d?.pregnancy_safety, '07e C-017: server rating of selenium').toBe('deconseille');
            expect.soft(AVOID_WORDS[L].test(b), `07e C-017: selenium text itself tells her to avoid supplementing (${AVOID_WORDS[L]})`).toBe(true);
          }
          if (stateName) await w.state(stateName);
          const bb = await backAffordances(page);
          expect(bb.length).toBeGreaterThan(0);
          await clickBox(page, bb[0]);
          await expect(suppSearch).toBeVisible({ timeout: 15_000 });
        }
        w.note('07c.HYP-C4b.statuses', statuses);
        w.note('07c.C-040.tags', tags);
        expect.soft(Object.entries(statuses).filter(([, v]) => v !== 'ok'), `07c HYP-C4b: a supplement shows "${unknownLbl}"`).toEqual([]);
      }

      // ── 08 Forbidden foods ──────────────────────────────────────────────────
      await page.goto('/forbidden-foods', { waitUntil: 'load' });
      const foodSearch = page.getByPlaceholder(tr(L, 'common.searchFoodPlaceholder'));
      await expect(foodSearch, '08: forbidden foods must render').toBeVisible({ timeout: 30_000 });
      const nAll = await foodsCount(page, L);
      w.note('08.total', nAll);
      expect.soft(nAll, '08: results count line "N <foods>"').not.toBeNull();
      const foodRes: Record<string, number | null> = {};
      for (const q of C.foodQ) {
        await foodSearch.fill(q);
        await page.waitForTimeout(250);
        foodRes[q] = await foodsCount(page, L);
        expect.soft(foodRes[q] ?? 0, `08: food "${q}" must return ≥1`).toBeGreaterThanOrEqual(1);
      }
      if (L === 'fr') {
        await foodSearch.fill('pate');
        await page.waitForTimeout(250);
        foodRes['pate(fold)'] = await foodsCount(page, L);
      }
      await foodSearch.fill('zzqx');
      await page.waitForTimeout(250);
      await expect.soft(page.getByText(tr(L, 'common.noResults'), { exact: true }), '08: zzqx → localized empty').toBeVisible();
      await foodSearch.fill('');
      await page.waitForTimeout(250);

      // C-030/C-031: category chips are buttons, follow the page direction, show which one is on.
      const allFood = page.getByRole('button', { name: tr(L, 'forbiddenFoods.all'), exact: true }).locator('visible=true');
      const fishFood = page.getByRole('button', { name: /🐟/ }).locator('visible=true');
      expect.soft(await allFood.count(), '08 C-031: the "All" category chip is a button').toBe(1);
      expect.soft(await fishFood.count(), '08 C-031: the fish category chip is a button').toBe(1);
      const chipRow = await page.evaluate((allLabel) => {
        const all = [...document.querySelectorAll('[role="button"]')].find(
          (e) => (e.textContent || '').trim() === allLabel && !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().width > 0,
        );
        if (!all?.parentElement) return null;
        const chips = [...all.parentElement.children].map((c) => {
          const r = c.getBoundingClientRect();
          return { label: (c.textContent || '').trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height) };
        });
        const txt = all.firstElementChild?.getBoundingClientRect();
        const box = all.getBoundingClientRect();
        return {
          vw: window.innerWidth,
          chips,
          /** Offset of the "All" label's centre from its chip's centre (it used to sit at the top). */
          allLabelOffsetY: txt ? Math.round((txt.top + txt.height / 2 - (box.top + box.height / 2)) * 10) / 10 : null,
        };
      }, tr(L, 'forbiddenFoods.all'));
      w.note('08.C-031.chipRow', chipRow);
      expect.soft(chipRow, '08 C-031: category chip row found').not.toBeNull();
      if (chipRow && chipRow.chips.length > 1) {
        const [first, second] = chipRow.chips;
        expect.soft(first.label, '08 C-031: "All" is the first chip').toBe(tr(L, 'forbiddenFoods.all'));
        if (rtl) {
          expect.soft(first.right, `08 C-031: RTL — "All" starts the row at the right edge ${JSON.stringify(first)}`).toBeGreaterThanOrEqual(chipRow.vw - 40);
          expect.soft(first.right, '08 C-031: RTL — "All" not clipped on the right').toBeLessThanOrEqual(chipRow.vw);
          expect.soft(second.right, '08 C-031: RTL — the second chip sits to the left of "All"').toBeLessThanOrEqual(first.left);
        } else {
          expect.soft(first.left, `08: LTR — "All" starts the row at the left edge ${JSON.stringify(first)}`).toBeLessThanOrEqual(40);
          expect.soft(first.left, '08: LTR — "All" not clipped on the left').toBeGreaterThanOrEqual(0);
          expect.soft(second.left, '08: LTR — the second chip sits to the right of "All"').toBeGreaterThanOrEqual(first.right);
        }
        expect.soft(Math.abs(chipRow.allLabelOffsetY ?? 99), '08 C-031: "All" label vertically centred in its chip').toBeLessThanOrEqual(2);
      }
      const foodAria0 = (await allFood.count()) ? await chipAria(allFood.first()) : null;
      if (await allFood.count()) expect.soft(await chipActive(allFood.first()), '08 C-031: "All" lit before any category is picked').toBe(true);

      // C-017/C-018: rating badges. Every card's badge is read from the screen, the items the
      // review found under-rated must read "Avoid", and a badge must not contradict the card's
      // own text. Vitamin A must carry the same rating word here as in Supplements.
      const sevLabel = (sev: string) => norm(tr(L, `forbiddenFoods.severity.${sev}`));
      const badgeLabels = ['critical', 'high', 'medium', 'low'].map(sevLabel);
      const detailsLabel = tr(L, 'forbiddenFoods.detailsLabel');
      const ratings: Record<string, unknown> = {};
      const wrongBadge: string[] = [];
      const contradictions: string[] = [];
      for (const f of FOODS) {
        const name = foodName(f.id, L);
        let card = await foodCard(page, name, badgeLabels, detailsLabel);
        if (!card || !card.badge) {
          wrongBadge.push(`${f.id}: card or badge not found`);
          continue;
        }
        if (card.badge !== sevLabel(f.severity)) wrongBadge.push(`${f.id}: badge "${card.badge}" ≠ data severity ${f.severity}`);
        if (!MUST_BE_AVOID.includes(f.id)) {
          ratings[f.id] = card.badge;
          continue;
        }
        await page.getByText(name, { exact: true }).locator('visible=true').first().click();
        await page.waitForTimeout(200);
        card = await foodCard(page, name, badgeLabels, detailsLabel);
        const own = card?.text ?? '';
        const says = { avoid: AVOID_WORDS[L].test(own), limit: LIMIT_WORDS[L].test(own) };
        ratings[f.id] = { badge: card?.badge, expanded: card?.expanded, says };
        expect.soft(card?.expanded, `08 ${f.id}: card expands on tap`).toBe(true);
        expect.soft(card?.badge, `08 C-018: ${f.id} ("${name}") is badged "${sevLabel('high')}"`).toBe(sevLabel('high'));
        if (says.limit && !says.avoid) contradictions.push(`${f.id}: badged "${card?.badge}" but its text only says to limit`);
      }
      w.note('08.C-018.ratings', ratings);
      // The rating badge is the safety signal of this screen: same legibility bar as the
      // supplement tag (C-040). One measurement per distinct badge.
      const rawBadges = ['critical', 'high', 'medium', 'low'].map((sev) => tr(L, `forbiddenFoods.severity.${sev}`));
      const badgeContrast = Object.values(
        Object.fromEntries((await ratingTags(page, rawBadges, true)).map((b) => [b.text, b])),
      );
      w.note('08.badgeContrast', badgeContrast);
      expect.soft(badgeContrast.length, '08: one contrast measurement per rating badge').toBe(4);
      expect.soft(
        badgeContrast.filter((b) => b.ratio < 4.5).map((b) => `"${b.text}" ${b.color} on ${b.background} = ${b.ratio}:1`),
        '08 (C-040 family): rating badges on ForbiddenFoods reach 4.5:1',
      ).toEqual([]);
      expect.soft(wrongBadge, '08: every food card shows the badge of its rating').toEqual([]);
      expect.soft(contradictions, '08 C-018: no "Avoid" badge on a card whose own text only says to limit').toEqual([]);
      const strip = (b: string) => norm(b.replace(/^[^\p{L}]+/u, ''));
      const vitAFood = (ratings['vitamin_a_supplements'] as { badge?: string } | undefined)?.badge ?? '';
      w.note('08.C-017.vitaminA', { supplements: vitASupplementRating, forbiddenFoods: vitAFood });
      expect.soft(strip(vitAFood), `08 C-017: vitamin A rated the same in ForbiddenFoods ("${vitAFood}") and Supplements ("${vitASupplementRating}")`).toBe(vitASupplementRating);
      await page.getByText(foodName('vitamin_a_supplements', L), { exact: true }).locator('visible=true').first().scrollIntoViewIfNeeded();
      await w.state('08a-forbidden-vitamin-a-rating');
      await page.mouse.wheel(0, -50_000);
      await page.waitForTimeout(300);

      await fishFood.first().click();
      await page.waitForTimeout(250);
      const nFish = await foodsCount(page, L);
      foodRes['chip:fish'] = nFish;
      w.note('08.results', foodRes);
      expect.soft(nFish ?? 0, '08: fish chip narrows the list').toBeGreaterThanOrEqual(1);
      if (nAll != null && nFish != null) expect.soft(nFish, '08: fish chip < all').toBeLessThan(nAll);
      expect.soft(await chipActive(fishFood.first()), '08 C-031: the picked category chip is lit').toBe(true);
      expect.soft(await chipActive(allFood.first()), '08 C-031: "All" is not lit while a category is').toBe(false);
      const foodAria1 = { all: await chipAria(allFood.first()), fish: await chipAria(fishFood.first()) };
      w.note('08.C-031.aria', { before: { all: foodAria0 }, afterFish: foodAria1 });
      expect.soft(
        [foodAria1.fish.selected, foodAria1.fish.pressed].includes('true'),
        `08 C-031 a11y: the picked category chip exposes its state (aria-pressed/aria-selected) ${JSON.stringify(foodAria1)}`,
      ).toBe(true);
      // Smoked fish + high-mercury fish are the two fish cards of C-018: on screen, expanded.
      await w.state('08-forbidden-search');

      // ── 09 Week recommendations ─────────────────────────────────────────────
      await page.goto('/recommendations', { waitUntil: 'load' });
      const recArt = page.getByText(tr(L, 'common.recommendedArticles'), { exact: true });
      const recSupp = page.getByText(tr(L, 'common.recommendedSupplements'), { exact: true });
      const recEmpty = page.getByText(tr(L, 'common.noRecommendation'), { exact: true });
      await expect(recArt.or(recSupp).or(recEmpty).first(), '09: recommendations resolve').toBeVisible({ timeout: 30_000 });
      w.note('09.sections', { articles: await recArt.count(), supplements: await recSupp.count(), empty: await recEmpty.count() });
      await expect.soft(recArt, '09: week-32 recommended articles section').toBeVisible();
      await expect.soft(recSupp, '09: week-32 recommended supplements section').toBeVisible();
      const recLines = await visibleLines(page);
      const rawMd = recLines.filter((l) => RAW_MARKDOWN.test(l));
      w.note('09.C-028.rawMarkdown', rawMd);
      expect.soft(rawMd, '09 C-027/C-028: no raw "#" / "**" in recommendation excerpts').toEqual([]);
      // C-059 / C-070: the week-recommendation cards draw category icons, never the stand-in emoji.
      const recStandIns = await placeholderEmojiCards(page);
      w.note('09.C-059.placeholderEmoji', recStandIns);
      expect.soft(recStandIns, '09 C-059: no stand-in emoji (📰 📚 💊) on the week-recommendation cards').toEqual([]);
      await w.state('09-week-recs');

      // ── 10 Baby evolution (GJ-011) ──────────────────────────────────────────
      // ── 09b Ramadan article deep link → not found ───────────────────────────
      await page.goto('/article/art_003', { waitUntil: 'load' });
      const notFound = page.getByText(tr(L, 'article.notFound'), { exact: true });
      await expect.soft(notFound, '09b: /article/art_003 (Ramadan) must show not-found').toBeVisible({ timeout: 20_000 });
      await expect.soft(page.getByText(tr(L, 'article.notFoundHint'), { exact: true }), '09b: not-found explains itself').toBeVisible();
      await expect.soft(page.getByRole('button', { name: tr(L, 'article.browseArticles'), exact: true }), '09b: not-found offers the articles list').toBeVisible();
      await expect.soft(page.getByRole('button', { name: tr(L, 'a11y.back'), exact: true }).first(), '09b: not-found keeps a back control').toBeVisible();
      const artBody = await visibleLines(page);
      w.note('09b.art_003', artBody.slice(0, 12));
      expect.soft(artBody.filter((l) => /ramadan|رمضان/i.test(l)), '09b: no Ramadan text rendered').toEqual([]);
      expect.soft(tr(L, 'article.notFoundHint').length, '09b C-042: not-found copy ≥20 chars').toBeGreaterThanOrEqual(20);
      const nfBacks = await backAffordances(page);
      w.note('09b.C-042.backs', nfBacks);
      expect.soft(nfBacks.length, `09b C-042: a back control at the top of the not-found page ${JSON.stringify(nfBacks)}`).toBeGreaterThanOrEqual(1);
      if (rtl) expect.soft(nfBacks.filter((b) => b.x + b.w / 2 < VW / 2), '09b: RTL — back on the right').toEqual([]);
      const nfBg = await notFound.first().evaluate((el) => {
        let n: Element | null = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)') return c;
          n = n.parentElement;
        }
        return null;
      }).catch(() => null);
      w.note('09b.C-042.background', nfBg);
      await w.state('09b-article-art003-hidden');
      // C-042: "browse articles" leads somewhere — the articles list.
      const browse = page.getByRole('button', { name: tr(L, 'article.browseArticles'), exact: true });
      if (await browse.count()) {
        await browse.first().click();
        await expect.soft(page.getByPlaceholder(tr(L, 'common.searchArticlePlaceholder')), '09c C-042: "browse articles" opens the articles list').toBeVisible({ timeout: 15_000 });
        await expect.soft(cards.first(), '09c C-042: … with articles in it').toBeVisible({ timeout: 15_000 });
        await w.state('09c-notfound-browse-articles');
      }

      await page.goto('/baby-evolution', { waitUntil: 'load' });
      const month8 = page.getByText(new RegExp(`${esc(tr(L, 'common.monthLabel', { number: 8 }))} / 9`));
      const anyMonth = page.getByText(/ \/ 9$/);
      await expect(anyMonth.first(), '10: baby evolution renders').toBeVisible({ timeout: 30_000 });
      await expect.soft(month8.first(), '10: week 32 lands on month 8').toBeVisible();
      await expect.soft(page.getByText(tr(L, 'home.youAreHere'), { exact: true }).first(), '10: "you are here" badge').toBeVisible();
      const beBody = (await page.locator('body').innerText()) || '';
      const swipe = splitLines(beBody).filter((l) => /balayez|swipe|اسحب|glissez/i.test(l));
      w.note('10.GJ-011.footer', swipe);
      expect.soft(swipe, '10 GJ-011: footer must not tell the user to swipe (dots/tap UI)').toEqual([]);
      const beBacks = await backAffordances(page);
      w.note('10.backs', beBacks);
      if (rtl) expect.soft(beBacks.filter((b) => b.x + b.w / 2 < VW / 2), '10: RTL — back on the right').toEqual([]);
      const eg = hg ? await evolutionGrowth(page, hg.lengthLabel) : null;
      w.note('10.evolutionGrowth', eg);
      expect.soft(eg, '10: BabyEvolution size caption found').not.toBeNull();
      expect.soft(eg?.size, '10 SYNC: month-8 size identical to Home week-32 size').toBe(hg?.length);
      expect.soft(num(eg?.caption), '10: card quotes the user\'s own week (32)').toBe(32);
      const beSa = (await visibleLines(page)).filter((l) => /\(\s*\d+\s*SA\s*\)/.test(l));
      expect.soft(beSa, '10: no stray "(N SA)" aside').toEqual([]);
      // C-058 / B-046: the nine month dots share one row (same top), inside the viewport.
      const dots = await babyEvolutionDots(page, `^${esc(tr(L, 'common.monthLabel', { number: 1 })).replace(/1/, '[1-9]')}$`);
      w.note('10.C-058.dots', dots);
      expect.soft(dots.count, `10 C-058: nine month dots (${JSON.stringify(dots.names)})`).toBe(9);
      expect.soft(dots.distinctTops, `10 C-058: the nine dots share one row (tops ${JSON.stringify(dots.tops)})`).toBe(1);
      expect.soft(dots.insideViewport, `10 C-058: every dot inside the ${VW} pt viewport (${JSON.stringify(dots.lefts)}..${JSON.stringify(dots.rights)})`).toBe(true);
      await w.state('10-baby-evolution');
      await page.getByRole('button', { name: tr(L, 'common.monthLabel', { number: 3 }), exact: true }).click();
      await expect.soft(page.getByText(new RegExp(`${esc(tr(L, 'common.monthLabel', { number: 3 }))} / 9`)).first(), '10b: dot "Month 3" navigates').toBeVisible();
      await w.state('10b-baby-evolution-dot3');
      // C-043: only months 8 and 3 were ever rendered. Every month dot is opened and captured, and
      // each month must show its own card (not one month's content under another month's label).
      const monthCards: Record<number, string> = {};
      for (let m = 1; m <= 9; m++) {
        await page.getByRole('button', { name: tr(L, 'common.monthLabel', { number: m }), exact: true }).click();
        await expect.soft(page.getByText(new RegExp(`${esc(tr(L, 'common.monthLabel', { number: m }))} / 9`)).first(), `10c C-043: dot "Month ${m}" navigates`).toBeVisible();
        await page.waitForTimeout(500);
        monthCards[m] = (await visibleLines(page)).filter((l) => !/ \/ 9$/.test(l)).join(' | ');
        await w.state(`10c-baby-evolution-month${m}`);
      }
      w.note('10c.C-043.distinctMonthCards', new Set(Object.values(monthCards)).size);
      expect.soft(new Set(Object.values(monthCards)).size, '10c C-043: the nine months show nine different cards').toBe(9);

      // ── 11 Chatbot empty (GJ-007) ───────────────────────────────────────────
      await page.getByRole('tab', { name: tr(L, 'common.nav.chatbot'), exact: true }).click();
      const chatInput = page.getByPlaceholder(tr(L, 'common.chatAskQuestion'));
      await expect(chatInput, '11: chatbot input').toBeVisible({ timeout: 30_000 });
      await expect.soft(page.getByText(tr(L, 'common.chatDisclaimer')).first(), '11: medical disclaimer visible').toBeVisible();
      const welcomeFirst = splitLines(tr(L, 'common.chatWelcome'))[0];
      await expect.soft(page.getByText(welcomeFirst).first(), `11: welcome in ${L}`).toBeVisible();
      await expect(page.getByRole('button', { name: C.cs01, exact: true }), '11: chip cs01 rendered').toBeVisible({ timeout: 15_000 });
      expect.soft([C.cs01, C.cs06], '11: plan chip labels = chatbot_data cs01/cs06').toEqual([chipLabel('cs01', L), chipLabel('cs06', L)]);
      await expect.soft(page.getByText('BETA', { exact: true }), '11: no BETA badge on the assistant').toHaveCount(0);
      const geo = await chipGeometry(page, C.cs01);
      w.note('11.GJ-007.chips', geo);
      if (!geo.error) {
        expect.soft(geo.distinct, `11: one chip per chatbot_data suggestion (${SUGGESTIONS.length})`).toBe(SUGGESTIONS.length);
        if (rtl) {
          expect.soft(geo.atMin.minLeft, `11 GJ-007: RTL — last chip fully visible (left ≥ 8) at scroll end ${JSON.stringify(geo.atMin)}`).toBeGreaterThanOrEqual(8);
          expect.soft(geo.initial.firstRight, `11 GJ-007: RTL — first chip flush right at start ${JSON.stringify(geo.initial)}`).toBeGreaterThanOrEqual(geo.vw - 24);
          expect.soft(geo.initial.firstRight, '11: RTL — first chip not clipped on the right').toBeLessThanOrEqual(geo.vw);
        } else {
          expect.soft(geo.atMax.maxRight, `11 GJ-007: last chip right edge ≤ vw−8 at scroll end ${JSON.stringify(geo.atMax)}`).toBeLessThanOrEqual(geo.vw - 8);
          expect.soft(geo.initial.firstLeft, '11: first chip not clipped on the left').toBeGreaterThanOrEqual(0);
        }
      } else {
        expect.soft(geo.error, '11: chip row geometry').toBeUndefined();
      }
      await w.state('11-chatbot-empty');

      // ── 12 Normal answer ───────────────────────────────────────────────────
      const n = await chatExchange(w, C.normalMsg);
      w.note('12.answer', n);
      expect.soft(n.enabledBefore, '12: send enabled with text').toBe(true);
      expect.soft(n.disabledAfter, '12: send disabled right after sending (empty input / loading)').toBe(true);
      expect.soft(n.newLines.length, '12: bot answered').toBeGreaterThan(0);
      expect.soft(scriptLeaks(L, n.newLines), `12: bot answer in ${L}`).toEqual([]);
      // C-020: "What foods to avoid?" is answered with the foods themselves (the ones the
      // Foods-to-avoid screen rates forbidden / avoid) and a way to the full list.
      const answer = n.newLines.map(norm);
      const wantFoods = FOODS.filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => norm(`• ${foodName(f.id, L)}`));
      const missingFoods = wantFoods.filter((b) => !answer.includes(b));
      w.note('12.C-020', { bullets: answer.filter((l) => l.startsWith('•')).length, expected: wantFoods.length, missing: missingFoods });
      expect.soft(answer, '12 C-020: the answer opens on the foods-to-avoid intro').toContain(norm(tr(L, 'common.chatResponse.foodsToAvoidIntro')));
      expect.soft(missingFoods, '12 C-020: the answer lists every forbidden / to-avoid food of the Foods screen').toEqual([]);
      expect.soft(answer.filter((l) => l.endsWith(norm(tr(L, 'common.chatResponse.topicNutrition')))), '12 C-020: not the empty "here is what I know" nutrition reply').toEqual([]);
      await expect.soft(
        page.getByRole('link', { name: tr(L, 'common.chatSeeForbiddenFoods'), exact: true }),
        '12 C-020: link to the full Foods-to-avoid list',
      ).toBeVisible();
      if (L === 'ar' || L === 'tn') {
        expect.soft(n.newLines.some((l) => ARABIC.test(l)), '12: Arabic answer').toBe(true);
      }
      // Bubble mirroring: user bubble on the end side (right LTR / left RTL).
      const ubs = await userMsgBoxes(page, C.normalMsg);
      const ub = ubs[ubs.length - 1];
      w.note('12.userBubble', ubs);
      expect.soft(ubs.length, '12: user message rendered as a bubble').toBeGreaterThan(0);
      if (ub) {
        const cx = ub.x + ub.w / 2;
        if (rtl) expect.soft(cx, '12: RTL — user bubble must be mirrored to the left').toBeLessThan(VW / 2);
        else expect.soft(cx, '12: LTR — user bubble on the right').toBeGreaterThan(VW / 2);
      }
      await w.state('12-chatbot-normal');

      // ── 13 Red-flag triage (SYNC-16) ───────────────────────────────────────
      await markAlerts(page);
      const rf = await chatExchange(w, C.redflag);
      w.note('13.redflag.newLines', rf.newLines);
      await expect.soft(newAlert(page), `13: "${C.redflag}" must raise a triage alert`).toHaveCount(1, { timeout: 10_000 });
      const lastAlert = newAlert(page).last();
      const got13 = (await newAlert(page).count()) > 0;
      const alertText = got13 ? await lastAlert.innerText() : '';
      w.note('13.alertText', alertText);
      expect.soft(alertText.includes(tr(L, 'common.chatEmergency')), `13: alert titled "${tr(L, 'common.chatEmergency')}"`).toBe(true);
      // One call action at a time: while the conversation is on an emergency it is the bar
      // pinned above the input, and the alert bubble does not repeat it.
      const call = page.getByRole('button', { name: callName(L), exact: true });
      w.note('13.callInBubble', got13 ? await lastAlert.getByRole('button', { name: callName(L), exact: true }).count() : null);
      const hasCall = got13 ? await call.count() : 0;
      w.note('13.callButton', { count: hasCall, text: hasCall ? await call.first().innerText() : null });
      expect.soft(hasCall, '13: exactly one emergency call button on screen').toBe(1);
      // C-019: at 32 weeks the bleeding reply names no "late miscarriage", ends on its own
      // instruction (no generic "don't hesitate…" close) and links no twins article.
      const rfText = rf.newLines.map(norm);
      const rfLinks = rfText.filter((l) => l.startsWith('📄'));
      w.note('13.C-019', { links: rfLinks, miscarriage: rfText.filter((l) => LATE_MISCARRIAGE.test(l)), softClose: rfText.filter((l) => SOFT_CLOSE.test(l)) });
      expect.soft(rfText.filter((l) => LATE_MISCARRIAGE.test(l)), '13 C-019: no miscarriage wording in the week-32 bleeding reply').toEqual([]);
      expect.soft(rfText.filter((l) => SOFT_CLOSE.test(l)), '13 C-019: an emergency reply does not end on "don\'t hesitate… if needed"').toEqual([]);
      expect.soft(rfLinks.filter((l) => l.includes(articleTitle('a19_grossesses_multiples', L))), '13 C-019: no twins article under a bleeding emergency').toEqual([]);
      expect.soft(
        rfLinks.filter((l) => norm(l.replace(/^📄\s*/, '')) !== norm(articleTitle('a03_examens_médicaux_pendant', L))),
        '13 C-019: the only linked article is the medical-exams one',
      ).toEqual([]);
      const calls13 = got13 ? await callsOnScreen(page, callName(L)) : null;
      w.note('13.C-041.calls', calls13);
      if (calls13) expect.soft(calls13.visible, `13 C-041: one call button visible at a time ${JSON.stringify(calls13)}`).toBe(1);
      if (calls13) expectOneCallInThread(calls13, '13');
      expect.soft(await page.getByTestId('chat_pinned_emergency_call').getByRole('button').count(), '13: the call button is the pinned one').toBe(1);
      if (hasCall) await expectCallOnScreen(w, call.first(), '13');
      if (hasCall) {
        expect.soft(await call.first().innerText(), `13 SYNC-16: country ${C.country} → (${C.emergency})`).toContain(`(${C.emergency})`);
      }
      if (L === 'fr' && hasCall) {
        const popups: string[] = [];
        const onPopup = (p: Page) => popups.push(p.url());
        page.on('popup', onPopup);
        const urlBefore = page.url();
        await call.first().click();
        await page.waitForTimeout(1500);
        page.off('popup', onPopup);
        w.note('13.callTap', { popups, dialogs: w.dialogs.messages(), urlBefore, urlAfter: page.url() });
        expect.soft(page.url(), '13: tapping call must not navigate the app away').toBe(urlBefore);
      }
      await w.state('13-chatbot-redflag');

      // ── 14 Negation ─────────────────────────────────────────────────────────
      if (C.negation) {
        await markAlerts(page);
        const ng = await chatExchange(w, C.negation);
        w.note('14.negation', ng.newLines);
        expect.soft(ng.newLines.length, '14: negation still answered').toBeGreaterThan(0);
        expect.soft(await newAlert(page).count(), `14: "${C.negation}" must NOT trigger triage`).toBe(0);
        // C-021: a negated symptom is not a search query — no bleeding / breastfeeding article.
        const ngOff = ng.newLines.filter((l) => BLEEDING_OR_BREASTFEEDING.test(l));
        const ngLinks = ng.newLines.filter((l) => l.startsWith('📄'));
        w.note('14.C-021', { offTopic: ngOff, links: ngLinks });
        expect.soft(ngOff, `14 C-021: "${C.negation}" retrieves nothing about bleeding or breastfeeding`).toEqual([]);
        expect.soft(ngLinks, '14 C-021: no article is recommended for a negated symptom').toEqual([]);
        const calls14 = await callsOnScreen(page, callName(L));
        w.note('14.C-041.callsAfterNegation', calls14);
        expectOneCallInThread(calls14, '14');
        await w.state('14-chatbot-negation');
      } else {
        w.note('14.negation', 'not applicable (no negation phrase in plan for this locale)');
      }

      // ── 15 Bleeding chip cs06 ──────────────────────────────────────────────
      await markAlerts(page);
      w.typed.push(C.cs06);
      const bubbles15 = (await userMsgBoxes(page, C.cs06)).length;
      await page.getByRole('button', { name: C.cs06, exact: true }).click();
      await expect.soft(newAlert(page), '15: bleeding chip → at least urgent_consult triage').toHaveCount(1, { timeout: 15_000 });
      await page.waitForTimeout(500);
      const alert15 = (await newAlert(page).count()) ? await newAlert(page).last().innerText() : '';
      w.note('15.alertText', alert15);
      // C-047: bleeding at 32 weeks is an EMERGENCY (hemorragie_antepartum); "urgent consult"
      // would be a downgrade, so only the emergency title is accepted, in every language.
      expect.soft(alert15.includes(tr(L, 'common.chatEmergency')), `15 C-047: bleeding chip block titled "${tr(L, 'common.chatEmergency')}" (not urgent-consult)`).toBe(true);
      expect.soft(alert15.includes(tr(L, 'common.chatResponse.redFlagModerate')), '15 C-047: an emergency never ends on the soft "monitor and consult if it persists" line').toBe(false);
      w.note('15.chip.answer', { alerts: await newAlert(page).count(), alertLines: splitLines(alert15) });
      const bubbles15After = (await userMsgBoxes(page, C.cs06)).length;
      w.note('15.userBubbles', { before: bubbles15, after: bubbles15After });
      expect.soft(bubbles15After, '15: chip text sent as a user message').toBe(bubbles15 + 1);
      const calls15 = await callsOnScreen(page, callName(L));
      w.note('15.C-041.calls', calls15);
      expect.soft(calls15.visible, `15 C-041: one call button visible at a time ${JSON.stringify(calls15)}`).toBe(1);
      expectOneCallInThread(calls15, '15');
      // C-055: the bubble itself carries the reviewed bleeding copy, not just the call action.
      expect.soft(norm(await page.locator('body').innerText()), `15 C-055: the bubble carries the reviewed bleeding message (${L})`).toContain(redFlagBubbleCopy(suggestionFlagId('cs06'), L));
      if (calls15.inDom) {
        const txt15 = await page.getByRole('button', { name: callName(L), exact: true }).last().innerText();
        expect.soft(txt15, `15 C-047 SYNC-16: emergency call button for ${C.country} → (${C.emergency})`).toContain(`(${C.emergency})`);
      }
      await w.state('15-chatbot-chip');

      // ── 16 Swelling chip cs19 (C-022) ──────────────────────────────────────
      const cs19 = chipLabel('cs19', L);
      w.note('16.C-022.label', cs19);
      expect.soft(SWOLLEN_WORDING[L].test(cs19), `16 C-022: chip names a swelling in ${L}: "${cs19}"`).toBe(true);
      expect.soft(/bloated|انتفاخ|ballonn/i.test(cs19), `16 C-022: chip no longer reads "bloated": "${cs19}"`).toBe(false);
      const revealed = await revealChip(page, cs19, SUGGESTIONS.map((x) => chipLabel(x.suggestion_id, L)));
      w.note('16.reveal', revealed);
      expect(revealed.ok, `16: swelling chip reachable in the suggestion row ${JSON.stringify(revealed)}`).toBe(true);
      await markAlerts(page);
      w.typed.push(cs19);
      const bubbles16 = (await userMsgBoxes(page, cs19)).length;
      await page.getByRole('button', { name: cs19, exact: true }).click();
      await expect.soft(newAlert(page), `16 C-022: tapping "${cs19}" raises its pre-eclampsia alert`).toHaveCount(1, { timeout: 15_000 });
      await page.waitForTimeout(500);
      const alert16 = (await newAlert(page).count()) ? await newAlert(page).last().innerText() : '';
      w.note('16.alertText', alert16);
      expect.soft(
        alert16.includes(tr(L, 'common.chatEmergency')) || alert16.includes(tr(L, 'common.chatEmergencyAction')),
        '16 C-022: the alert block is the emergency block or carries the call action (only an emergency has a title)',
      ).toBe(true);
      expect.soft((await userMsgBoxes(page, cs19)).length, '16: chip text sent as a user message').toBe(bubbles16 + 1);
      const calls16 = await callsOnScreen(page, callName(L));
      w.note('16.C-041.calls', calls16);
      expect.soft(calls16.visible, `16 C-041: one call button visible at a time ${JSON.stringify(calls16)}`).toBe(1);
      expectOneCallInThread(calls16, '16');
      // C-055: an urgent_consult has no heading, so the call action alone cannot prove the triage:
      // the bubble must carry the reviewed pre-eclampsia message for the swelling chip.
      expect.soft(redFlagBubbleCopy(suggestionFlagId('cs19'), L), '16: the swelling chip maps to a reviewed red flag message').not.toBe('');
      expect.soft(norm(await page.locator('body').innerText()), `16 C-055: the bubble carries the reviewed swelling / pre-eclampsia message (${L})`).toContain(redFlagBubbleCopy(suggestionFlagId('cs19'), L));
      if (calls16.inDom) {
        const txt16 = await page.getByRole('button', { name: callName(L), exact: true }).last().innerText();
        expect.soft(txt16, `16 SYNC-16: country ${C.country} → (${C.emergency})`).toContain(`(${C.emergency})`);
      }
      await w.state('16-chatbot-swollen-chip');

      // ── 17 Reduced baby movements (C-047): typed phrase + chip cs07 ──────────
      // The week-32 key alarm. Its red flag is urgent_consult (chatbot_data "ne sens plus le
      // bébé"), so the block carries the urgent-consult title, never plain reassurance.
      await markAlerts(page);
      const mv = await chatExchange(w, C.movementTyped);
      w.note('17.movementTyped', { text: C.movementTyped, lines: mv.newLines });
      await expect.soft(newAlert(page), `17: typed "${C.movementTyped}" raises a triage alert`).toHaveCount(1, { timeout: 10_000 });
      // C-055: the typed report is answered with the reviewed reduced-movements message (urgent_consult).
      expect.soft(redFlagBubbleCopy(suggestionFlagId('cs07'), L), '17: cs07 maps to a reviewed red flag message').not.toBe('');
      expect.soft(norm(await page.locator('body').innerText()), `17 C-055: the bubble carries the reviewed reduced-movements message (${L})`).toContain(redFlagBubbleCopy(suggestionFlagId('cs07'), L));
      const alert17 = (await newAlert(page).count()) ? await newAlert(page).last().innerText() : '';
      w.note('17.typed.alertText', alert17);
      expect.soft(
        alert17.includes(tr(L, 'common.chatEmergency')) || alert17.includes(tr(L, 'common.chatEmergencyAction')),
        `17 C-047: typed reduced-movements report is triaged (emergency title or the call action) in ${L}`,
      ).toBe(true);
      await w.state('17-chatbot-movements-typed');

      const cs07 = chipLabel('cs07', L);
      const revealed07 = await revealChip(page, cs07, SUGGESTIONS.map((x) => chipLabel(x.suggestion_id, L)));
      w.note('17.reveal', revealed07);
      expect.soft(revealed07.ok, `17: reduced-movements chip reachable ${JSON.stringify(revealed07)}`).toBe(true);
      if (revealed07.ok) {
        await markAlerts(page);
        w.typed.push(cs07);
        const bubbles17 = (await userMsgBoxes(page, cs07)).length;
        await page.getByRole('button', { name: cs07, exact: true }).click();
        await expect.soft(newAlert(page), `17 C-047: tapping "${cs07}" raises its triage alert`).toHaveCount(1, { timeout: 15_000 });
        await page.waitForTimeout(500);
        const alert17c = (await newAlert(page).count()) ? await newAlert(page).last().innerText() : '';
        w.note('17.chip.alertText', alert17c);
        expect.soft(
          alert17c.includes(tr(L, 'common.chatEmergency')) || alert17c.includes(tr(L, 'common.chatEmergencyAction')),
          `17 C-047: chip block is the emergency block or carries the call action in ${L}`,
        ).toBe(true);
        expect.soft((await userMsgBoxes(page, cs07)).length, '17: chip text sent as a user message').toBe(bubbles17 + 1);
        const calls17 = await callsOnScreen(page, callName(L));
        w.note('17.calls', calls17);
        expect.soft(calls17.visible, `17 C-041: never more than one call button visible ${JSON.stringify(calls17)}`).toBeLessThanOrEqual(1);
        expectOneCallInThread(calls17, '17');
        await w.state('17-chatbot-movements-chip');
      }

      const analytics = foreign.filter((u) => ANALYTICS.test(u));
      const other = foreign.filter((u) => !ANALYTICS.test(u) && !/^GET tel:/.test(u));
      w.note('network.analytics', { count: analytics.length, hosts: [...new Set(analytics.map((u) => u.split('/')[2]))] });
      w.note('network.otherForeign', other);
      expect.soft(analytics, 'C-011: no analytics request over the whole run').toEqual([]);
      expect.soft(other, 'chatbot/content must not call third-party hosts').toEqual([]);
      console.log(`[wave-C ${L}] observations ${JSON.stringify(w.obs)}`);
      w.dispose();
    });
  });
}

// ── C-G1: real anonymous guest (fr) ───────────────────────────────────────────

async function guestOnboard(
  page: Page,
  L: 'fr' | 'en',
  opts: { country?: string; probeCountryRequired?: (blocked: boolean) => void },
) {
  await page.goto('/welcome', { waitUntil: 'load' });
  const card = page.getByTestId(`lang_card_${L}`);
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();
  await page.locator('text="✓"').first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText(tr(L, 'common.continue'), { exact: true }).last().dispatchEvent('click');
  await page.getByTestId('auth_guest_button').click({ timeout: 30_000 });
  await page.getByRole('button', { name: tr(L, 'onboarding.step1.pregnant'), exact: true }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: tr(L, 'onboarding.step2.methodDdr'), exact: true }).click({ timeout: 20_000 });
  await page.locator('input[type="date"]').fill(lmpIsoForWeek(32).slice(0, 10));
  await page.getByRole('button', { name: tr(L, 'common.continue'), exact: true }).click();
  await page.getByRole('button', { name: '25-29', exact: true }).click({ timeout: 20_000 });
  if (opts.probeCountryRequired) {
    const cont = page.getByRole('button', { name: tr(L, 'common.continue'), exact: true });
    opts.probeCountryRequired((await cont.getAttribute('aria-disabled')) === 'true' || (await cont.isDisabled()));
  }
  if (opts.country) await page.getByRole('button', { name: opts.country, exact: true }).click();
  await page.getByRole('button', { name: tr(L, 'common.continue'), exact: true }).click();
  await tickHealthConsent(page);
  await page.getByTestId('onboarding_step4_skip').click({ timeout: 20_000 });
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 60_000 });
}

test.describe('Wave C — C-G1 real anonymous guest (fr)', () => {
  test.use({ ...waveUse('fr'), actionTimeout: 20_000 });

  test('G: guest reads Firestore content (resources, supplement detail, chatbot)', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const L: AppLocale = 'fr';
    const w = new WaveCtx(page, L, 'G', testInfo);
    const fsReqs: string[] = [];
    page.on('request', (r) => {
      if (/(127\.0\.0\.1|localhost):8080/.test(r.url())) fsReqs.push(`${r.method()} ${r.url().slice(0, 140)}`);
    });

    await guestOnboard(page, 'fr', { country: tr(L, 'common.countries.france') });
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('user_profile') || '{}'));
    const uid: string = profile.uid || '';
    const anonExists = uid ? await authAccountExists(uid) : false;
    w.note('G.guest', { uid, isGuest: profile.isGuest, country: profile.country, anonExists });
    expect.soft(uid.startsWith('guest_'), 'G: guest uid must be a Firebase anonymous uid, not guest_<ts>').toBe(false);
    expect.soft(anonExists, 'G: anonymous auth user exists on the emulator').toBe(true);
    await w.state('00-guest-landed', { script: false });

    // G-01 Resources (articles + supplements, caution chip = Firestore-vs-bundled discriminator).
    await page.getByRole('tab', { name: tr(L, 'common.nav.resources'), exact: true }).click();
    const cards = page.getByRole('button').filter({ hasText: tr(L, 'common.seeDetails') });
    await expect(cards.first(), 'G-01: articles').toBeVisible({ timeout: 30_000 });
    w.note('G-01.articles', await cards.count());
    await page.getByRole('tab', { name: tr(L, 'common.screen.supplements'), exact: true }).click();
    await expect(page.getByPlaceholder(tr(L, 'common.searchSupplement'))).toBeVisible({ timeout: 30_000 });
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: tr(L, 'common.supplementSafety.caution'), exact: true }).click();
    await page.waitForTimeout(300);
    const caution = await cards.count();
    // Firestore seed stores 'à_surveiller' (filter → 0); bundled JSON stores 'a_surveiller' (→ 2).
    w.note('G-01.cautionCount', caution);
    await page.getByRole('button', { name: tr(L, 'common.supplementSafety.caution'), exact: true }).click();
    await w.state('01-guest-resources', { script: false });

    // G-02 Supplement detail.
    const s02 = await serverDoc('supplements/s02_fer');
    await page.getByRole('button', { name: localized(s02, 'name', L), exact: true }).first().click();
    await expect(page.getByRole('button', { name: tr(L, 'common.addToFavorites'), exact: true })).toBeVisible({ timeout: 30_000 });
    const gBacks = await backAffordances(page);
    w.note('G-02.backs', gBacks);
    expect.soft(gBacks.length, 'G-02 GJ-008: one back on SupplementDetail').toBe(1);
    const gTags = await ratingTags(page, ['safe', 'caution', 'avoid', 'unknown'].map((k) => tr(L, `common.supplementSafety.${k}`)));
    w.note('G-02.C-040.tag', gTags);
    expect.soft(gTags.map((x) => x.text), 'G-02: iron detail tag = safe').toEqual([tr(L, 'common.supplementSafety.safe')]);
    for (const x of gTags) expect.soft(x.ratio, `G-02 C-040: tag "${x.text}" ${x.color} on ${x.background} ≥ 4.5:1`).toBeGreaterThanOrEqual(4.5);
    await w.state('02-guest-supplement-detail', { script: false });

    // G-03 Chatbot + triage number (guest country France → 15).
    await page.getByRole('tab', { name: tr(L, 'common.nav.chatbot'), exact: true }).click();
    await expect(page.getByPlaceholder(tr(L, 'common.chatAskQuestion'))).toBeVisible({ timeout: 30_000 });
    await markAlerts(page);
    await chatExchange(w, "j'ai des saignements abondants");
    await expect.soft(newAlert(page), 'G-03: triage alert').toHaveCount(1, { timeout: 10_000 });
    const call = page.getByRole('button', { name: callName(L), exact: true });
    const callText = (await call.count()) ? await call.first().innerText() : null;
    w.note('G-03.call', callText);
    expect.soft(callText ?? '', 'G-03: guest France → 15').toContain('(15)');
    if (callText) await expectCallOnScreen(w, call.first(), 'G-03');
    const gCalls = await callsOnScreen(page, callName(L));
    w.note('G-03.C-041.calls', gCalls);
    expect.soft(gCalls.visible, `G-03 C-041: one call button visible at a time ${JSON.stringify(gCalls)}`).toBe(1);
    expectOneCallInThread(gCalls, 'G-03');
    await w.state('03-guest-chatbot');

    // G-04 (C-020): the foods answer's link opens the Foods-to-avoid screen.
    const gFoods = await chatExchange(w, 'Quels aliments éviter ?');
    w.note('G-04.answer', gFoods.newLines);
    const foodsLink = page.getByRole('link', { name: tr(L, 'common.chatSeeForbiddenFoods'), exact: true });
    await expect.soft(foodsLink, 'G-04 C-020: link to the full list under the answer').toBeVisible();
    if (await foodsLink.count()) {
      await foodsLink.last().click();
      await expect.soft(page.getByPlaceholder(tr(L, 'common.searchFoodPlaceholder')), 'G-04 C-020: the link opens Foods to avoid').toBeVisible({ timeout: 15_000 });
      await w.state('04-guest-chat-foods-link');
    }

    w.note('G.firestoreRequests', { count: fsReqs.length, sample: fsReqs.slice(0, 5) });
    expect.soft(fsReqs.length, 'G: the guest session talks to Firestore (not bundled-only)').toBeGreaterThan(0);
    console.log(`[wave-C G] observations ${JSON.stringify(w.obs)}`);
    w.dispose();
  });
});

// ── C-G2: en guest on a region-less device (HYP-C5) ───────────────────────────
// Browser locale "en" (no region) → no country can be detected. Onboarding must make
// the country an explicit answer; "Other" is the explicit international 112.

test.describe('Wave C — C-G2 en guest, region-less device (HYP-C5)', () => {
  test.use({ ...waveUse('en'), locale: 'en', actionTimeout: 20_000 });

  test('G2: country must be answered; "Other" → 112 call button on screen', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const L: AppLocale = 'en';
    const w = new WaveCtx(page, L, 'G2', testInfo);
    let blocked: boolean | null = null;
    await guestOnboard(page, 'en', {
      country: tr(L, 'common.countries.other'),
      probeCountryRequired: (b) => (blocked = b),
    });
    w.note('G2.countryRequired(continue disabled with no country)', blocked);
    expect.soft(blocked, 'G2: step-3 Continue disabled until a country is answered').toBe(true);
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('user_profile') || '{}'));
    const nav = await page.evaluate(() => navigator.language);
    w.note('G2.guest', { uid: profile.uid, country: profile.country ?? null, navigatorLanguage: nav });
    await page.getByRole('tab', { name: tr(L, 'common.nav.chatbot'), exact: true }).click();
    await expect(page.getByPlaceholder(tr(L, 'common.chatAskQuestion'))).toBeVisible({ timeout: 30_000 });
    await markAlerts(page);
    await chatExchange(w, 'I have heavy bleeding');
    await expect.soft(newAlert(page), 'G2: triage alert').toHaveCount(1, { timeout: 10_000 });
    const call = page.getByRole('button', { name: callName(L), exact: true });
    const n = await call.count();
    const text = n ? await call.first().innerText() : null;
    w.note('G2.HYP-C5.call', { count: n, text, alert: (await newAlert(page).count()) ? await newAlert(page).last().innerText() : null });
    expect.soft(n, 'G2 HYP-C5: call button present').toBe(1);
    expect.soft(text ?? '', 'G2: "Other country" → 112').toContain('112');
    if (n) await expectCallOnScreen(w, call.first(), 'G2');
    await w.state('01-en-guest-other-country-redflag');
    console.log(`[wave-C G2] observations ${JSON.stringify(w.obs)}`);
    w.dispose();
  });
});

// ── C-G3: a TRUE no-country user (profile has no country, region-less device) ──
// E.g. an account created before the country became mandatory. Nothing can resolve a
// national number, so the app must still offer a call — the international 112 — and say so.

test.describe('Wave C — C-G3 signed-in user with no country, region-less device', () => {
  test.use({ ...waveUse('en'), locale: 'en', actionTimeout: 20_000 });

  test('G3: no country anywhere → 112 call button, labelled as a fallback', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const L: AppLocale = 'en';
    const email = newAccountEmail('C', 'g3-nocountry');
    const acct = await createAccount(email, E2E_PASSWORD);
    await seedProfile(acct.uid, acct.idToken, { week: 32, country: undefined, firstName: 'Reader', lastName: 'Tester' });
    const server = await serverDoc(`userProfiles/${acct.uid}`);
    const w = new WaveCtx(page, L, 'G3', testInfo);
    w.typed.push('Reader', 'Tester', email);
    w.note('G3.server.country', server?.country ?? null);
    expect(server?.country ?? null, 'G3 harness: seeded profile has no country').toBeNull();
    await uiLogin(page, email, E2E_PASSWORD, L);
    w.note('G3.navigatorLanguage', await page.evaluate(() => navigator.language));
    await page.getByRole('tab', { name: tr(L, 'common.nav.chatbot'), exact: true }).click();
    await expect(page.getByPlaceholder(tr(L, 'common.chatAskQuestion'))).toBeVisible({ timeout: 30_000 });
    await markAlerts(page);
    await chatExchange(w, 'I have heavy bleeding');
    await expect.soft(newAlert(page), 'G3: triage alert').toHaveCount(1, { timeout: 10_000 });
    const alertText = (await newAlert(page).count()) ? await newAlert(page).last().innerText() : '';
    const call = page.getByRole('button', { name: callName(L), exact: true });
    const n = await call.count();
    const text = n ? await call.first().innerText() : null;
    w.note('G3.call', { count: n, text, alert: alertText });
    expect.soft(n, 'G3: a no-country user still gets a call button').toBe(1);
    expect.soft(text ?? '', 'G3: falls back to 112').toContain('112');
    if (n) await expectCallOnScreen(w, call.first(), 'G3');
    await w.state('01-nocountry-redflag');
    console.log(`[wave-C G3] observations ${JSON.stringify(w.obs)}`);
    w.dispose();
  });
});

// ── C-X1: live language switch while the chatbot is mounted (HYP-C6) ─────────

test.describe('Wave C — C-X1 chatbot welcome after fr → ar switch (HYP-C6)', () => {
  test.use({ ...waveUse('fr'), actionTimeout: 20_000 });

  test('X: welcome message follows the language', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const email = newAccountEmail('C', 'x1-lang');
    const acct = await createAccount(email, E2E_PASSWORD);
    await seedProfile(acct.uid, acct.idToken, { week: 32, country: 'France', firstName: 'Lectrice', lastName: 'Testeur' });
    const w = new WaveCtx(page, 'fr', 'X', testInfo);
    w.typed.push('Lectrice', 'Testeur', email);
    await uiLogin(page, email, E2E_PASSWORD, 'fr');

    await page.getByRole('tab', { name: tr('fr', 'common.nav.chatbot'), exact: true }).click();
    const frWelcome = splitLines(tr('fr', 'common.chatWelcome'))[0];
    const arWelcome = splitLines(tr('ar', 'common.chatWelcome'))[0];
    await expect(page.getByText(frWelcome).first()).toBeVisible({ timeout: 30_000 });
    await w.state('01-chatbot-fr');

    await page.getByRole('tab', { name: tr('fr', 'common.nav.home'), exact: true }).click();
    // The avatar pulses forever (HomeScreen pulseAnim) — never "stable"; force the tap.
    await page.getByRole('button', { name: tr('fr', 'a11y.profile'), exact: true }).first().click({ timeout: 30_000, force: true });
    await page.getByRole('button', { name: tr('fr', 'common.chooseLanguage'), exact: true }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'العربية', exact: true }).click({ timeout: 15_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar', { timeout: 15_000 });
    await page.getByRole('tab', { name: tr('ar', 'common.nav.chatbot'), exact: true }).click();
    await expect(page.getByPlaceholder(tr('ar', 'common.chatAskQuestion'))).toBeVisible({ timeout: 30_000 });
    const frLeft = await page.getByText(frWelcome).count();
    const arShown = await page.getByText(arWelcome).count();
    w.note('X.HYP-C6', { frWelcomeStillShown: frLeft, arWelcomeShown: arShown });
    expect.soft(frLeft, 'X HYP-C6: French welcome must not survive the switch to ar').toBe(0);
    expect.soft(arShown, 'X HYP-C6: Arabic welcome shown after the switch').toBeGreaterThan(0);
    w.L = 'ar'; // state() now checks dir/lang/script against ar
    await w.state('02-chatbot-after-switch-ar');
    console.log(`[wave-C X] observations ${JSON.stringify(w.obs)}`);
    w.dispose();
  });
});
