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
  /** chatbot_data.ts SUGGESTIONS labels (cs01 = first chip, cs06 = "Je saigne un peu"). */
  cs01: string;
  cs06: string;
};

const CFG: LocaleCfg[] = [
  {
    L: 'fr', dir: 'ltr', country: 'France', emergency: '15',
    articleQ: 'Nausées', suppQ: 'fer', foodQ: ['fromage', 'alcool'],
    normalMsg: 'Quels aliments éviter ?', redflag: "j'ai des saignements abondants", negation: 'je ne saigne pas',
    cs01: "J'ai des nausées matinales", cs06: 'Je saigne un peu',
  },
  {
    L: 'en', dir: 'ltr', country: 'France', emergency: '15',
    articleQ: 'morning', suppQ: 'iron', foodQ: ['cheese', 'sushi'],
    normalMsg: 'What foods to avoid?', redflag: 'I have heavy bleeding', negation: 'I am not bleeding',
    cs01: 'I have morning sickness', cs06: "I'm bleeding a little",
  },
  {
    L: 'ar', dir: 'rtl', country: 'Tunisia', emergency: '190',
    articleQ: 'غثيان', suppQ: 'الحديد', foodQ: ['الكحول', 'سوشي'],
    normalMsg: 'ما هي الأطعمة التي يجب تجنبها؟', redflag: 'عندي نزيف',
    cs01: 'لدي غثيان صباحي', cs06: 'لدي نزيف خفيف',
  },
  {
    L: 'tn', dir: 'rtl', country: 'Tunisia', emergency: '190',
    articleQ: 'غثيان', suppQ: 'الحديد', foodQ: ['الحوت', 'الكحول'],
    normalMsg: 'شنوة ما ناكولش؟', redflag: '3andi nzif',
    cs01: 'عندي دوخة وغثيان', cs06: 'عندي شوية دم',
  },
];

// ── Language / script oracles ─────────────────────────────────────────────────

const ARABIC = /[؀-ۿ]/;
/** Tokens legitimately Latin inside Arabic UI (acronyms, units, brand). */
const LATIN_ALLOW = /\b(BETA|DHA|EPA|DNA|ARN|ADN|hCG|B12|B9|OMS|WHO|ACOG|HAS|NICE|NHS|CNGOF|CDC|mg|µg|mcg|UI|IU|SA|Mama|Bébé|OK)\b/g;
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

  constructor(readonly page: Page, public L: AppLocale, readonly prefix: string, testInfo: TestInfo) {
    this.strict = attachConsoleStrict(page);
    this.dirs = QUARTET_DIRS.length ? QUARTET_DIRS : [testInfo.outputPath('quartet')];
    this.rec = attachMegaAuditRecorder(page, this.dirs);
    this.dialogs = attachDialogRecorder(page, this.rec);
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
    const lines = await visibleLines(page);
    expect.soft(lines.length, `${full}: screen must not be blank`).toBeGreaterThan(0);
    const raw = lines.filter((l) => RAW_KEY.test(l) || RAW_KEY_EXTRA.test(l));
    expect.soft(raw, `${full}: raw i18n key(s) visible`).toEqual([]);
    const wantDir = L === 'ar' || L === 'tn' ? 'rtl' : 'ltr';
    expect.soft(await page.locator('html').getAttribute('dir'), `${full}: html[dir]`).toBe(wantDir);
    expect.soft(await page.locator('html').getAttribute('lang'), `${full}: html[lang]`).toBe(L);
    if (opts.script !== false) {
      const leaks = scriptLeaks(L, opts.scriptLines ?? lines, this.typed);
      if (leaks.length) this.note(`${full}.scriptLeaks`, leaks.slice(0, 25));
      expect.soft(leaks, `${full}: ${L === 'en' ? 'French' : 'Latin-script'} strings in a ${L} UI`).toEqual([]);
    }
    await this.rec.snap(full);
    const errs = this.strict.splice(0);
    expect.soft(errs, `${full}: strict console errors`).toEqual([]);
  }

  dispose() {
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
        if (sc!.scrollLeft === last) break;
        last = sc!.scrollLeft;
      }
    };
    const initial = measure();
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
      await seedProfile(acct.uid, acct.idToken, { week: 32, country: C.country, firstName: 'Lectrice', lastName: 'Testeur' });
      const w = new WaveCtx(page, L, L, testInfo);
      w.note('account', { uid: acct.uid, email, country: C.country });
      await uiLogin(page, email, E2E_PASSWORD, L);
      w.typed.push('Lectrice', 'Testeur', email, 'zzqx');

      // ── 00 Home (weekly content language: baby message, recommendations) ────
      await expect(page.getByText(tr(L, 'common.nav.home'), { exact: true }).first()).toBeVisible();
      await page.waitForTimeout(1500);
      const hg = await homeGrowth(page, tr(L, 'common.weight'));
      w.note('00.homeGrowth', hg);
      expect.soft(hg, '00: Home hero size/weight cards found').not.toBeNull();
      expect.soft(num(hg?.length), '00: week-32 length on Home = 42.4 cm').toBe(42.4);
      expect.soft(num(hg?.weight), '00: week-32 weight on Home = 1.7 kg').toBe(1.7);
      const homeSa = (await visibleLines(page)).filter((l) => /\(\s*\d+\s*SA\s*\)/.test(l));
      expect.soft(homeSa, '00: no stray "(N SA)" aside on Home').toEqual([]);
      await w.state('00-home');

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
      await w.state('01-resources-articles');

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
      const nCaution = (await collectCards(page, cards)).size;
      w.note('06.HYP-C4.caution', nCaution);
      expect.soft(nCaution, '06 HYP-C4: "with caution" filter must list the 4 à-surveiller supplements (s09/s10/s11/s15)').toBeGreaterThanOrEqual(1);
      await w.state('06-supplements-caution-filter', { script: false });
      await setChip(cautionChip, false);

      // ── 07 Supplement detail s11 (HYP-C4b, GJ-008, HYP-C3) + bookmark ──────
      const s11 = await serverDoc('supplements/s11_vitamine_a');
      w.note('07.server.s11', { pregnancy_safety: s11?.pregnancy_safety, hasShortDescL: !!s11?.[`short_description_${L}`] });
      const s11Name = localized(s11, 'name', L) || 'Vitamine A';
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
      await w.state('07b-supplements-favoris', { script: false });
      await setChip(sFav, false);

      if (L === 'fr') {
        // HYP-C4b across every à-surveiller record.
        const statuses: Record<string, string> = {};
        for (const id of ['s09_zinc', 's10_vitamine_c', 's15_selenium']) {
          const d = await serverDoc(`supplements/${id}`);
          const nm = localized(d, 'name', L);
          await suppSearch.fill(nm);
          await page.getByRole('button', { name: nm, exact: true }).first().click();
          await expect(page.getByRole('button', { name: addFav, exact: true })).toBeVisible({ timeout: 30_000 });
          const b = (await page.locator('body').innerText()) || '';
          statuses[id] = b.includes(unknownLbl) ? unknownLbl : 'ok';
          const bb = await backAffordances(page);
          expect(bb.length).toBeGreaterThan(0);
          await clickBox(page, bb[0]);
          await expect(suppSearch).toBeVisible({ timeout: 15_000 });
        }
        w.note('07c.HYP-C4b.statuses', statuses);
        expect.soft(Object.entries(statuses).filter(([, v]) => v !== 'ok'), '07c HYP-C4b: s09/s10/s15 show "Inconnu"').toEqual([]);
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
      await page.getByText(/🐟/).first().click();
      await page.waitForTimeout(250);
      const nFish = await foodsCount(page, L);
      foodRes['chip:fish'] = nFish;
      w.note('08.results', foodRes);
      expect.soft(nFish ?? 0, '08: fish chip narrows the list').toBeGreaterThanOrEqual(1);
      if (nAll != null && nFish != null) expect.soft(nFish, '08: fish chip < all').toBeLessThan(nAll);
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
      await w.state('09-week-recs');

      // ── 10 Baby evolution (GJ-011) ──────────────────────────────────────────
      // ── 09b Ramadan article deep link → not found ───────────────────────────
      await page.goto('/article/art_003', { waitUntil: 'load' });
      const notFound = page.getByText(tr(L, 'article.notFound'), { exact: true });
      await expect.soft(notFound, '09b: /article/art_003 (Ramadan) must show not-found').toBeVisible({ timeout: 20_000 });
      const artBody = await visibleLines(page);
      w.note('09b.art_003', artBody.slice(0, 12));
      expect.soft(artBody.filter((l) => /ramadan|رمضان/i.test(l)), '09b: no Ramadan text rendered').toEqual([]);
      await w.state('09b-article-art003-hidden');

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
      await w.state('10-baby-evolution');
      await page.getByRole('button', { name: tr(L, 'common.monthLabel', { number: 3 }), exact: true }).click();
      await expect.soft(page.getByText(new RegExp(`${esc(tr(L, 'common.monthLabel', { number: 3 }))} / 9`)).first(), '10b: dot "Month 3" navigates').toBeVisible();
      await w.state('10b-baby-evolution-dot3');

      // ── 11 Chatbot empty (GJ-007) ───────────────────────────────────────────
      await page.getByRole('tab', { name: tr(L, 'common.nav.chatbot'), exact: true }).click();
      const chatInput = page.getByPlaceholder(tr(L, 'common.chatAskQuestion'));
      await expect(chatInput, '11: chatbot input').toBeVisible({ timeout: 30_000 });
      await expect.soft(page.getByText(tr(L, 'common.chatDisclaimer')).first(), '11: medical disclaimer visible').toBeVisible();
      const welcomeFirst = splitLines(tr(L, 'common.chatWelcome'))[0];
      await expect.soft(page.getByText(welcomeFirst).first(), `11: welcome in ${L}`).toBeVisible();
      w.note('11.betaBadge', await page.getByText('BETA', { exact: true }).count());
      await expect(page.getByRole('button', { name: C.cs01, exact: true }), '11: chip cs01 rendered').toBeVisible({ timeout: 15_000 });
      const geo = await chipGeometry(page, C.cs01);
      w.note('11.GJ-007.chips', geo);
      if (!geo.error) {
        expect.soft(geo.count, '11: 25 suggestion chips').toBeGreaterThanOrEqual(20);
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
      const call = lastAlert.getByRole('button', { name: tr(L, 'a11y.emergencyCall'), exact: true });
      const hasCall = got13 ? await call.count() : 0;
      w.note('13.callButton', { count: hasCall, text: hasCall ? await call.first().innerText() : null });
      expect.soft(hasCall, '13: emergency call button present').toBe(1);
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
        await w.state('14-chatbot-negation');
      } else {
        w.note('14.negation', 'not applicable (no negation phrase in plan for this locale)');
      }

      // ── 15 Bleeding chip cs06 ──────────────────────────────────────────────
      await markAlerts(page);
      w.typed.push(C.cs06);
      const before15 = new Set(splitLines((await page.locator('body').innerText()) || ''));
      const bubbles15 = (await userMsgBoxes(page, C.cs06)).length;
      await page.getByRole('button', { name: C.cs06, exact: true }).click();
      await expect.soft(newAlert(page), '15: bleeding chip → at least urgent_consult triage').toHaveCount(1, { timeout: 15_000 });
      await page.waitForTimeout(500);
      const alert15 = (await newAlert(page).count()) ? await newAlert(page).last().innerText() : '';
      w.note('15.alertText', alert15);
      expect.soft(
        alert15.includes(tr(L, 'common.chatEmergency')) || alert15.includes(tr(L, 'common.chatResponse.redFlagHigh')),
        '15: triage block titled emergency or urgent-consult',
      ).toBe(true);
      const after15 = splitLines((await page.locator('body').innerText()) || '').filter((l) => !before15.has(l));
      w.note('15.chip.newLines', after15);
      const bubbles15After = (await userMsgBoxes(page, C.cs06)).length;
      w.note('15.userBubbles', { before: bubbles15, after: bubbles15After });
      expect.soft(bubbles15After, '15: chip text sent as a user message').toBe(bubbles15 + 1);
      await w.state('15-chatbot-chip');

      const ANALYTICS = /googletagmanager\.com|google-analytics\.com|firebase\.googleapis\.com\/v1alpha\/projects\/-\/apps/;
      const analytics = foreign.filter((u) => ANALYTICS.test(u));
      const other = foreign.filter((u) => !ANALYTICS.test(u) && !/^GET tel:/.test(u));
      w.note('network.analytics', { count: analytics.length, hosts: [...new Set(analytics.map((u) => u.split('/')[2]))] });
      w.note('network.otherForeign', other);
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
    // Firestore seed stores 'à_surveiller' (filter → 0); bundled JSON stores 'a_surveiller' (→ 4).
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
    await w.state('02-guest-supplement-detail', { script: false });

    // G-03 Chatbot + triage number (guest country France → 15).
    await page.getByRole('tab', { name: tr(L, 'common.nav.chatbot'), exact: true }).click();
    await expect(page.getByPlaceholder(tr(L, 'common.chatAskQuestion'))).toBeVisible({ timeout: 30_000 });
    await markAlerts(page);
    await chatExchange(w, "j'ai des saignements abondants");
    await expect.soft(newAlert(page), 'G-03: triage alert').toHaveCount(1, { timeout: 10_000 });
    const call = newAlert(page).last().getByRole('button', { name: tr(L, 'a11y.emergencyCall'), exact: true });
    const callText = (await call.count()) ? await call.first().innerText() : null;
    w.note('G-03.call', callText);
    expect.soft(callText ?? '', 'G-03: guest France → 15').toContain('(15)');
    if (callText) await expectCallOnScreen(w, call.first(), 'G-03');
    await w.state('03-guest-chatbot');

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
    const call = newAlert(page).last().getByRole('button', { name: tr(L, 'a11y.emergencyCall'), exact: true });
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
    const call = newAlert(page).last().getByRole('button', { name: tr(L, 'a11y.emergencyCall'), exact: true });
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
