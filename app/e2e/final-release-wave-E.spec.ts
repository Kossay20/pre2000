/**
 * Wave E — Form factors & accessibility (AUDIT_PLAN final-release-2026-09-30 §6).
 *
 * Viewports: 375×667 (iPhone SE), 390×844, 820×1180 (iPad portrait), 1180×820 (iPad
 * landscape), 320×1000 (iPad Slide Over), 280×603 @ DPR 1.4 (narrow-layout proxy: a
 * 390pt layout zoomed ×1.4). Real text enlargement (text ×1.4 = the capped
 * maxFontSizeMultiplier, App.tsx:12-16, boxes unchanged) runs at 390×844. Locales fr + ar.
 *
 * Accounts: ONE read-only week-32 account (REST-created, profile seeded as the user) for
 * every signed-in surface, plus ONE dedicated account for the offline-write scenario
 * (E-33/34, the only state that writes). Cold-funnel states run un-sessioned.
 *
 * Every state writes the quartet (PNG + DOM + console + network) AND `<state>.a11y.json`
 * (tap targets, AX names from Chromium's accessibility tree, contrast ratios computed
 * from computed styles, overflow / clipping / overlap). `wave-E-a11y-summary.json`
 * aggregates them and `wave-E-state-map.json` maps each state to the plan row.
 *
 * App-behaviour checks are `expect.soft` (one real bug must not hide the rest);
 * harness / navigation steps are hard.
 *
 * Round 4: every finding-specific measurement goes through `check(id, state, …)`: a soft
 * assertion plus one line in `wave-E-finding-checks.json` (id, state, expected, actual),
 * so the reviewer reads the status of each finding id without parsing the run log.
 *
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-4/wave-E \
 *   npx playwright test e2e/final-release-wave-E.spec.ts --reporter=list --trace=off \
 *     --output=<a directory of your own>
 * (--output / --trace=off: the other waves run at the same time and Playwright empties the
 * shared test-results/ at start, which removed this run's trace file mid-test.)
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { attachConsole, attachConsoleStrict, RAW_KEY, waitBodyPopulated } from './helpers/audit-guards';
import { attachMegaAuditRecorder } from './helpers/mega-audit-snap';
import { attachDialogRecorder, type DialogRecorder } from './helpers/dialog-recorder';
import {
  E2E_BASE_URL,
  E2E_PASSWORD,
  FIRESTORE_EMULATOR,
  PROJECT_ID,
  createAccount,
  newAccountEmail,
  seedProfile,
  serverQuery,
  uiLogin,
  type AppLocale,
  type CreatedAccount,
} from './helpers/emulator-account';
import { babyEvolutionDots, greetingVsAvatar, headingAudit, placeholderEmojiCards, pillContainment } from './helpers/round11-guards';
import {
  ctaFold,
  enlargeText,
  focusOrderViolations,
  focusWalk,
  liveRegions,
  measureA11y,
  modalProbe,
  RNW_DEFAULT_ACTIVE_THUMB,
  styleFingerprint,
  tabletColumnProbe,
  writeA11yJson,
  type A11yReport,
} from './helpers/wave-E-a11y';
import { tickHealthConsent } from './helpers/health-consent';

const QUARTET_DIRS = [process.env.E2E_QUARTET_DIR, process.env.E2E_QUARTET_DIR2].filter((d): d is string => !!d);
const OUT_DIRS = QUARTET_DIRS.length ? QUARTET_DIRS : [path.resolve(__dirname, '../test-results/wave-E')];

const VP = {
  se: { width: 375, height: 667 },
  std: { width: 390, height: 844 },
  ipad: { width: 820, height: 1180 },
  ipadLand: { width: 1180, height: 820 },
  scale: { width: 280, height: 603 },
  // iPad Slide Over: Info.plist allows multitasking (UIRequiresFullScreen=false), so a
  // 320pt-wide window on an iPad-height screen is reachable.
  slideOver: { width: 320, height: 1000 },
} as const;

const BCP47: Record<AppLocale, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar', tn: 'ar-TN' };

// NOT serial: a soft failure fails the test, and serial mode would then skip the rest of
// the wave. workers=1 (playwright.config.ts) keeps the order; a failed test restarts the
// worker, so cross-test state (the reader account, the roll-up) goes through disk, keyed
// by the Playwright runner pid (constant across the run's workers).
test.use({ timezoneId: 'Europe/Paris', storageState: { cookies: [], origins: [] }, navigationTimeout: 60_000 });

// ── shared state ───────────────────────────────────────────────────────────────

let reader: CreatedAccount; // read-only week-32 account
const RUN_FILE = path.join(OUT_DIRS[0], `.wave-E-run-${process.ppid}.json`);
type RunInfo = { startedAt: number; reader: CreatedAccount };

/** Every `<state>.a11y.json` written during THIS run (mtime ≥ run start). */
function loadRunReports(): A11yReport[] {
  if (!fs.existsSync(RUN_FILE)) return [];
  const run: RunInfo = JSON.parse(fs.readFileSync(RUN_FILE, 'utf8'));
  const dir = OUT_DIRS[0];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.a11y.json'))
    .filter((f) => fs.statSync(path.join(dir, f)).mtimeMs >= run.startedAt - 1000)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as A11yReport);
}

// ── finding checks ─────────────────────────────────────────────────────────────

const CHECKS_FILE = path.join(OUT_DIRS[0], `.wave-E-checks-${process.ppid}.jsonl`);
type FindingCheck = { id: string; state: string; pass: boolean | null; expected: string; actual: unknown };

/**
 * One measurement tied to a finding id. `pass === null` = not reached / measurement only
 * (no assertion). Anything else is a SOFT assertion on app behaviour, and is logged.
 */
function check(id: string, state: string, pass: boolean | null, expected: string, actual: unknown) {
  fs.mkdirSync(OUT_DIRS[0], { recursive: true });
  fs.appendFileSync(CHECKS_FILE, JSON.stringify({ id, state, pass, expected, actual } satisfies FindingCheck) + '\n');
  if (pass !== null) expect.soft(pass, `${state}: [${id}] expected: ${expected} — actual: ${JSON.stringify(actual)}`).toBe(true);
}

function loadChecks(): FindingCheck[] {
  if (!fs.existsSync(CHECKS_FILE)) return [];
  return fs
    .readFileSync(CHECKS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FindingCheck);
}

/** WCAG contrast ratio between two computed `rgb()/rgba()` colours (alpha ignored). */
function contrastOf(a: string, b: string): number | null {
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(Number) : null;
  };
  const lum = (c: number[]) => {
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return null;
  const [l1, l2] = [lum(ca), lum(cb)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

type Leaf = { text: string; x: number; y: number; w: number; h: number; right: number; fontSize: number };

/**
 * Visible text lines of the screen the user sees: own text of each element, whitespace
 * normalised (NBSP / narrow NBSP → space: the fr strings now use them before : ? !),
 * aria-hidden subtrees (inactive tabs) left out.
 */
async function leafTexts(page: Page): Promise<Leaf[]> {
  return page.evaluate(() => {
    const norm = (t: string) => (t || '').replace(/[\s\u00a0\u202f]+/g, ' ').trim();
    const vw = window.innerWidth;
    const out: any[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*')) as HTMLElement[]) {
      const own = norm(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join(''));
      if (!own || el.closest('[aria-hidden=true]')) continue;
      if (typeof (el as any).checkVisibility === 'function' && !(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.left >= vw) continue;
      out.push({ text: own, x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, right: Math.round(r.right * 10) / 10, fontSize: parseFloat(getComputedStyle(el).fontSize) });
    }
    return out;
  });
}

/** Active tab of the bottom tab bar (the lowest visible tablist). */
async function activeBottomTab(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const tls = Array.from(document.querySelectorAll('[role=tablist]')).filter((t) => t.getBoundingClientRect().width > 0 && !t.closest('[aria-hidden=true]'));
    const bottom = tls.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    const sel = bottom?.querySelector('[role=tab][aria-selected=true]') as HTMLElement | null;
    return sel ? (sel.getAttribute('aria-label') || sel.innerText || '').replace(/\s+/g, ' ').trim() : null;
  });
}

/** Ink box of a text (Range rect, not the element box) against a control's box. */
async function textVsControl(page: Page, textRe: string, controlSelector: string) {
  return page.evaluate(
    ([reSrc, sel]) => {
      const re = new RegExp(reSrc);
      const norm = (t: string) => (t || '').replace(/[\s\u00a0\u202f]+/g, ' ').trim();
      const R = (r: DOMRect) => ({ x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
      const el = (Array.from(document.body.querySelectorAll('*')) as HTMLElement[]).find(
        (e) => !e.closest('[aria-hidden=true]') && e.getBoundingClientRect().width > 0 && re.test(norm(Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join(''))),
      );
      const ctl = (Array.from(document.querySelectorAll(sel)) as HTMLElement[]).find((c) => !c.closest('[aria-hidden=true]') && c.getBoundingClientRect().width > 0);
      if (!el || !ctl) return { found: false as const, text: !!el, control: !!ctl };
      const range = document.createRange();
      range.selectNodeContents(el);
      const tr = range.getBoundingClientRect();
      const cr = ctl.getBoundingClientRect();
      const w = Math.min(tr.right, cr.right) - Math.max(tr.left, cr.left);
      const h = Math.min(tr.bottom, cr.bottom) - Math.max(tr.top, cr.top);
      return { found: true as const, text: norm(el.innerText), textInk: R(tr), control: R(cr), overlapArea: w > 0 && h > 0 ? Math.round(w * h) : 0 };
    },
    [textRe, controlSelector] as const,
  );
}

/**
 * E-025: the Home "Ma Journée n/m" pill (DailyRoutinesTracker) is drawn after an async
 * load, and only once the account has reminder settings — those are created the first
 * time she opens the Reminders tab (a brand-new account has none: no pill, by design,
 * DailyRoutinesTracker "don't render an empty ghost pill"). Round 3 photographed Home
 * before that first visit in one state and after it in the others. Every Home snapshot
 * of the reader account now waits for the pill; if it is not there after 8 s the
 * Reminders tab is opened once (creating the defaults) and Home is loaded again.
 */
async function waitMyDayPill(page: Page, state: string, name: RegExp = /Ma Journée \d+\/\d+/) {
  const pill = page.getByRole('button', { name }).first();
  const early = await pill.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false);
  if (!early) {
    await go(page, '/reminders');
    await settle(page, 2500);
    await go(page, '/');
  }
  await expect.soft(pill, `${state}: Home "Ma Journée n/m" pill (DailyRoutinesTracker) not rendered within 30 s (reminder defaults ${early ? 'present' : 'created by a first visit to Reminders'})`).toBeVisible({ timeout: 30_000 });
  await settle(page, 400);
  return { pillBeforeRemindersVisit: early };
}

/**
 * Chromium's CDP offline emulation (context.setOffline) flips navigator.onLine and fires
 * window 'online' / 'offline', but not the NetworkInformation 'change' event. NetInfo
 * 11.4.1 on web listens ONLY to that event when navigator.connection exists
 * (nativeModule.web.ts:254-260), so under emulation it learns of the change at its next
 * reachability poll (HEAD '/', every 60 s). A real browser fires 'change' when the link
 * drops. This sends the event the emulation leaves out. Both readings are recorded: with
 * and without it.
 */
async function fireConnectionChange(page: Page) {
  await page.evaluate(() => (navigator as any).connection?.dispatchEvent(new Event('change')));
}

type Ctx = {
  context: BrowserContext;
  page: Page;
  errors: string[];
  mega: ReturnType<typeof attachMegaAuditRecorder>;
  dialogs: DialogRecorder;
  locale: AppLocale;
  label: string;
};

async function openCtx(
  browser: Browser,
  opts: { viewport: { width: number; height: number }; locale: AppLocale; signedIn: boolean; dpr?: number; label: string; account?: CreatedAccount },
): Promise<Ctx> {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    viewport: opts.viewport,
    deviceScaleFactor: opts.dpr ?? 1,
    timezoneId: 'Europe/Paris',
    locale: BCP47[opts.locale],
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const errors = opts.signedIn ? attachConsoleStrict(page) : attachConsole(page);
  const mega = attachMegaAuditRecorder(page, OUT_DIRS);
  const dialogs = attachDialogRecorder(page, mega);
  if (opts.signedIn) {
    const acct = opts.account ?? reader;
    await uiLogin(page, acct.email, acct.password, opts.locale);
  } else {
    await page.addInitScript((l) => {
      try {
        if (!sessionStorage.getItem('__e2e_waveE_locale')) {
          sessionStorage.setItem('__e2e_waveE_locale', '1');
          localStorage.setItem('app_locale', l);
        }
      } catch {
        /* storage blocked */
      }
    }, opts.locale);
  }
  return { context, page, errors, mega, dialogs, locale: opts.locale, label: opts.label };
}

async function closeCtx(c: Ctx) {
  // Strict console (signed-in) / lenient (un-sessioned): any app error is a finding.
  expect.soft(c.errors, `${c.label}: console errors: ${c.errors.join(' | ')}`).toEqual([]);
  c.mega.dispose();
  c.dialogs.dispose();
  await c.context.close();
}

async function settle(page: Page, ms = 1200) {
  await page.waitForTimeout(ms);
}

/**
 * E-055: a toast / banner (role=status|alert) fades and slides for ~300 ms at each end
 * (ToastContext), and a contrast sample taken mid-fade reads half-faded colours. Before any
 * a11y probe, wait until every visible live box (opacity and transform along its ancestor
 * chain, plus its position) has stopped changing for three polls. A box held at a constant
 * opacity below 1 is stable and passes through; one that has left the DOM is stable too.
 * Best effort by design (a wait, not an assertion): it never fails a state by itself.
 */
async function settleLiveBoxes(page: Page) {
  await page
    .evaluate(() => {
      (window as any).__liveSettle = { sig: null, stable: 0 };
    })
    .catch(() => undefined);
  await page
    .waitForFunction(
      () => {
        const w = window as any;
        const parts: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('[role="status"],[role="alert"]'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          let op = 1;
          const tf: string[] = [];
          for (let n: HTMLElement | null = el; n && n !== document.documentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            op *= parseFloat(cs.opacity || '1');
            if (cs.transform && cs.transform !== 'none') tf.push(cs.transform);
          }
          parts.push(`${op.toFixed(3)}|${tf.join('/')}|${Math.round(r.top * 10)},${Math.round(r.left * 10)}`);
        }
        const sig = parts.join('#');
        const st = w.__liveSettle || (w.__liveSettle = { sig: null, stable: 0 });
        st.stable = st.sig === sig ? st.stable + 1 : 0;
        st.sig = sig;
        return st.stable >= 3;
      },
      null,
      { polling: 100, timeout: 5_000 },
    )
    .catch(() => undefined);
}

/** Navigate by URL (SPA fallback) and wait for the app to paint. */
async function go(page: Page, p: string, ready?: Locator) {
  await page.goto(p, { waitUntil: 'load' });
  await waitBodyPopulated(page, 20);
  if (ready) await expect(ready, `navigation to ${p}: ready marker`).toBeVisible({ timeout: 30_000 });
  await settle(page);
}

/**
 * Snap one state: soft "non-blank + no raw key", quartet, a11y JSON, and the
 * layout soft-assertions every Wave E state carries.
 */
async function snapState(
  c: Ctx,
  state: string,
  planRow: string,
  opts: { cta?: Locator; ctaIsPrimary?: boolean; expectTabBar?: boolean; extra?: Record<string, unknown> } = {},
) {
  const { page } = c;
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  expect.soft(body.trim().length, `${state}: blank screen`).toBeGreaterThan(0);
  const leak = body.split('\n').find((l) => RAW_KEY.test(l));
  expect.soft(leak, `${state}: raw i18n key leaked → "${leak}"`).toBeFalsy();

  let fold: unknown = undefined;
  if (opts.cta) {
    // measure BEFORE the screenshot scrolls anything
    fold = await ctaFold(page, opts.cta);
    const f = fold as Awaited<ReturnType<typeof ctaFold>>;
    expect.soft(f.found, `${state}: primary CTA not found`).toBe(true);
    if (f.found) {
      expect.soft(f.reachableAfterScroll, `${state}: primary CTA not reachable by vertical scroll (${JSON.stringify(f.after)})`).toBe(true);
    }
    // restore scroll to top for the screenshot of the landing state
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('*').forEach((e) => {
        if ((e as HTMLElement).scrollTop > 0) (e as HTMLElement).scrollTop = 0;
      });
    });
    await page.waitForTimeout(250);
  }

  await settleLiveBoxes(page);
  await c.mega.snap(state);
  // E-055: the contrast probe must not read a toast mid-fade (the snap above takes time too).
  await settleLiveBoxes(page);
  const report = await measureA11y(page, state, { planRow, ctaFold: fold, ...(opts.extra || {}) });
  writeA11yJson(OUT_DIRS, state, report);

  // E-016: an ON Switch must not fall back to RN-web's default teal thumb.
  const on = report.probes.switches.filter((s) => s.checked);
  if (on.length) {
    check('E-016', state, on.every((s) => s.thumb !== RNW_DEFAULT_ACTIVE_THUMB), `ON Switch thumb takes the colour the screen asked for, not RN-web default ${RNW_DEFAULT_ACTIVE_THUMB}`, on.map((s) => ({ name: s.name, thumb: s.thumb, track: s.track })));
  }

  const L = report.layout;
  // A screen painted over yet still mounted and in the accessibility tree (a tab kept
  // alive after blur, E-022) is reported, not skipped as "covered".
  expect.soft(report.hiddenMountedSample, `${state}: ${report.summary.hiddenMounted} control(s) on a hidden screen still exposed to assistive tech`).toEqual([]);
  expect.soft(L.horizontalScroll, `${state}: horizontal scroll (scrollWidth ${L.doc.scrollWidth} > clientWidth ${L.doc.clientWidth})`).toBe(false);
  expect.soft(L.offscreenX, `${state}: element(s) leave the viewport horizontally`).toEqual([]);
  if (opts.cta && opts.ctaIsPrimary !== false) {
    const ctaText = ((await opts.cta.first().innerText().catch(() => '')) || '').trim();
    const cut = L.clippedLabels.filter((cl) => ctaText && ctaText.includes(cl.text.slice(0, 10)));
    expect.soft(cut, `${state}: primary CTA label clipped`).toEqual([]);
  }
  if (opts.expectTabBar) {
    expect.soft(L.tablist, `${state}: bottom tab bar missing`).not.toBeNull();
    if (L.tablist) {
      expect.soft(L.tablist.fullyInViewport, `${state}: tab bar not fully inside the viewport ${JSON.stringify(L.tablist.rect)}`).toBe(true);
      expect.soft(L.tablist.tabs.filter((t) => t.truncated).map((t) => t.name), `${state}: truncated tab labels`).toEqual([]);
    }
  }
  return report;
}

// ── surfaces ───────────────────────────────────────────────────────────────────

type Surface = { slug: string; path: string; ready?: (p: Page) => Locator; cta?: (p: Page) => Locator; tabBar?: boolean };

// E-024: the article is opened the way a user does — Resources tab, then the card — not
// through a deep link (which mounts ArticleDetail under the Home tab). `path` is where the
// navigation starts.
const ARTICLE_PATH = '/resources';

/** Open one surface. Home waits for the "Ma Journée" pill; Article goes through Resources. */
async function openSurface(page: Page, s: Surface, state: string) {
  if (s.slug === 'article') {
    await go(page, '/resources', page.getByRole('tab', { name: /Articles/ }).first());
    const byTitle = page.getByRole('button', { name: /symptômes de grossesse/i }).first();
    const card = (await byTitle.count()) ? byTitle : page.getByRole('button').filter({ hasText: /grossesse|Grossesse/ }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(s.ready!(page), `${state}: article opened from the Resources list`).toBeVisible({ timeout: 30_000 });
    await settle(page);
    return;
  }
  await go(page, s.path, s.ready?.(page));
  if (s.slug === 'home') await waitMyDayPill(page, state);
}

const SIGNED_IN_FR: Surface[] = [
  { slug: 'home', path: '/', ready: (p) => p.getByText('Semaine 32', { exact: true }).first(), cta: (p) => p.getByTestId('home_quick_add_appointment'), tabBar: true },
  { slug: 'calendar', path: '/calendar', ready: (p) => p.getByRole('button', { name: 'Mois', exact: true }), cta: (p) => p.getByRole('button', { name: 'Ajouter un rendez-vous' }), tabBar: true },
  { slug: 'appointment-add', path: '/appointment/add', ready: (p) => p.getByPlaceholder(/Échographie/), cta: (p) => p.getByRole('button', { name: 'Enregistrer les modifications' }) },
  { slug: 'reminders', path: '/reminders', ready: (p) => p.getByRole('tab', { name: 'Tâches' }).first(), cta: (p) => p.getByRole('switch').first(), tabBar: true },
  { slug: 'statistics', path: '/statistics', ready: (p) => p.getByTestId('statistics_screen_root'), // the way back is the one control in both branches (empty state has "Aller aux tâches", the data branch none)
    cta: (p) => p.getByRole('button', { name: 'Retour', exact: true }) },
  { slug: 'health', path: '/health', ready: (p) => p.getByRole('button', { name: /Ajouter une pesée/ }).first(), cta: (p) => p.getByRole('button', { name: /Ajouter une pesée/ }) },
  { slug: 'weight', path: '/weight', cta: (p) => p.getByRole('button', { name: /Enregistrer|Ajouter une pesée/ }) },
  { slug: 'resources', path: '/resources', ready: (p) => p.getByRole('tab', { name: /Articles/ }).first(), cta: (p) => p.getByRole('tab', { name: /Articles/ }), tabBar: true },
  { slug: 'article', path: ARTICLE_PATH, ready: (p) => p.getByRole('button', { name: /Ajouter aux favoris|Enregistré/ }).first(), cta: (p) => p.getByRole('button', { name: /Ajouter aux favoris|Enregistré/ }) },
  { slug: 'chatbot', path: '/chatbot', ready: (p) => p.getByPlaceholder(/Posez votre question/), cta: (p) => p.getByPlaceholder(/Posez votre question/), tabBar: true },
  { slug: 'profile', path: '/profile', cta: (p) => p.getByRole('button', { name: 'Enregistrer les modifications' }) },
  { slug: 'settings', path: '/settings', ready: (p) => p.getByRole('switch').first(), cta: (p) => p.getByRole('switch').first() },
  { slug: 'kick-counter', path: '/kick-counter', ready: (p) => p.getByRole('button', { name: /Commencer une session/ }), cta: (p) => p.getByRole('button', { name: /Commencer une session/ }) },
  { slug: 'hospital-bag', path: '/hospital-bag', ready: (p) => p.getByRole('checkbox').first(), cta: (p) => p.getByRole('button', { name: /Ajouter un élément/ }) },
  { slug: 'baby-evolution', path: '/baby-evolution', ready: (p) => p.getByRole('button', { name: /Mois 8/ }).first(), cta: (p) => p.getByRole('button', { name: /Mois 8/ }) },
];

// ── setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  if (fs.existsSync(RUN_FILE)) {
    reader = (JSON.parse(fs.readFileSync(RUN_FILE, 'utf8')) as RunInfo).reader;
    return;
  }
  const startedAt = Date.now();
  reader = await createAccount(newAccountEmail('E', 'reader'), E2E_PASSWORD);
  await seedProfile(reader.uid, reader.idToken, { week: 32, firstName: 'Eva', lastName: 'Lecteur' });
  fs.mkdirSync(OUT_DIRS[0], { recursive: true });
  fs.writeFileSync(RUN_FILE, JSON.stringify({ startedAt, reader } satisfies RunInfo));
});

test.afterAll(async () => {
  const allReports = loadRunReports();
  const summaries = allReports.map((r) => ({ state: r.state, planRow: (r.extra as any)?.planRow, summary: r.summary }));
  const stateMap = Object.fromEntries(summaries.map((s) => [s.state, s.planRow]));
  // Cross-state aggregation for the reviewer: every unnamed control, every sub-44 target,
  // every contrast failure, deduped by (text/name, state list).
  const dedupe = <T>(items: Array<{ key: string; state: string; item: T }>) => {
    const m = new Map<string, { item: T; states: string[] }>();
    for (const { key, state, item } of items) {
      const prev = m.get(key);
      if (prev) {
        if (!prev.states.includes(state)) prev.states.push(state);
      } else m.set(key, { item, states: [state] });
    }
    return Array.from(m.values());
  };
  const unnamed = dedupe(
    allReports.flatMap((r) => r.interactive.filter((i) => i.unnamed).map((i) => ({ key: `${i.tag}|${i.domRole}|${i.html.slice(0, 120)}`, state: r.state, item: { tag: i.tag, domRole: i.domRole, axRole: i.axRole, text: i.text, rect: i.rect, html: i.html } }))),
  );
  const symbolOnly = dedupe(
    allReports.flatMap((r) => r.interactive.filter((i) => i.symbolOnlyName).map((i) => ({ key: `${i.axName}|${i.domRole}`, state: r.state, item: { axName: i.axName, axRole: i.axRole, rect: i.rect, html: i.html } }))),
  );
  const roleless = dedupe(
    allReports.flatMap((r) => r.interactive.filter((i) => i.roleless).map((i) => ({ key: `${i.axName}|${i.text}`, state: r.state, item: { axName: i.axName, axRole: i.axRole, text: i.text, rect: i.rect, html: i.html } }))),
  );
  const small = dedupe(
    allReports.flatMap((r) =>
      r.interactive
        .filter((i) => i.small44 && !i.disabled)
        .map((i) => ({ key: `${r.layout.viewport.w}|${i.axRole}|${i.axName || i.text}|${i.rect.w}x${i.rect.h}`, state: r.state, item: { viewportW: r.layout.viewport.w, axRole: i.axRole, name: i.axName || i.text, w: i.rect.w, h: i.rect.h, below24: i.below24, small44Native: i.small44Native, webOnlySwitch: i.domRole === 'switch' && i.rect.w === 40 && i.rect.h === 20 } })),
    ),
  );
  const contrastFails = dedupe(
    allReports.flatMap((r) =>
      r.contrast
        .filter((s) => s.pass === false)
        .map((s) => ({ key: `${s.text}|${s.fg}|${s.bg}|${s.fontSize}`, state: r.state, item: { text: s.text, fg: s.fg, bg: s.bg, ratio: s.ratio, threshold: s.threshold, fontSize: s.fontSize, fontWeight: s.fontWeight, disabled: s.disabled, placeholder: !!s.placeholder, placeholderUnstyled: !!s.placeholderUnstyled, path: s.path } })),
    ),
  );
  const checks = loadChecks();
  const byId: Record<string, { pass: number; fail: number; notReached: number; failures: Array<{ state: string; expected: string; actual: unknown }> }> = {};
  for (const c of checks) {
    const e = (byId[c.id] ||= { pass: 0, fail: 0, notReached: 0, failures: [] });
    if (c.pass === null) e.notReached++;
    else if (c.pass) e.pass++;
    else {
      e.fail++;
      e.failures.push({ state: c.state, expected: c.expected, actual: c.actual });
    }
  }
  const switchesOn = dedupe(
    allReports.flatMap((r) => r.probes.switches.filter((s) => s.checked).map((s) => ({ key: `${s.name}|${s.thumb}|${s.track}`, state: r.state, item: { name: s.name, thumb: s.thumb, track: s.track, tealDefault: s.thumb === RNW_DEFAULT_ACTIVE_THUMB } }))),
  );
  const emoji = dedupe(allReports.flatMap((r) => r.probes.emojiText.map((e) => ({ key: `${e.text}|${e.inControl}`, state: r.state, item: { text: e.text, inControl: e.inControl } }))));
  const orphanPunct = dedupe(allReports.flatMap((r) => r.probes.orphanPunct.map((o) => ({ key: `${o.text}|${o.punct}`, state: r.state, item: o }))));
  const plainSpacePunct = dedupe(allReports.flatMap((r) => r.probes.plainSpaceBeforePunct.map((t) => ({ key: t, state: r.state, item: t }))));
  const duplicateTitles = dedupe(allReports.flatMap((r) => r.probes.duplicateTitles.map((t) => ({ key: t, state: r.state, item: t }))));
  const clippedInputs = dedupe(allReports.flatMap((r) => r.layout.clippedInputs.map((i) => ({ key: `${r.layout.viewport.w}|${i.name}|${i.value}`, state: r.state, item: { viewportW: r.layout.viewport.w, ...i } }))));
  const overlayCovers = allReports.flatMap((r) => r.layout.overlayCovers.filter((o) => o.covers.length).map((o) => ({ state: r.state, role: o.role, text: o.text, rect: o.rect, covers: o.covers })));
  const overlapsAll = allReports.flatMap((r) => r.layout.overlaps.map((o) => ({ state: r.state, viewportW: r.layout.viewport.w, ...o })));
  const out = {
    generated: new Date().toISOString(),
    baseUrl: E2E_BASE_URL,
    readerAccount: { uid: reader?.uid, email: reader?.email },
    method: {
      names: 'Chromium AX tree via CDP Accessibility.getPartialAXTree per interactive element',
      targets: 'getBoundingClientRect CSS px; small44 = w<44 || h<44 (Apple HIG / plan), below24 = WCAG 2.5.8 floor (spacing exception NOT evaluated)',
      contrast: 'computed color/background-color/opacity along the ancestor chain, exact normal-blend composition over white; a CSS linear-gradient is evaluated at the text position (worst of 3 points across the text box); url() background → indeterminate; WCAG large = ≥24px or ≥18.66px & ≥700',
      interactiveSelector: 'button, a[href], input, textarea, select, [role=button|link|checkbox|switch|tab|radio|menuitem|slider], [tabindex="0"] — visible only, and not on a layer painted over: summary.covered = coveredByModal (page under a modal scrim, expected) + hiddenMounted (a screen painted over but still mounted and exposed, E-022, asserted). Covered = the element\'s own visible centre shows another layer; fixed chrome (tab bars, pinned footers) never covers',
      placeholders: 'a placeholder drawn in the input\'s text colour (placeholderTextColor unset; RN-web default) is placeholderUnstyled and counted as a failure, not scored',
      emoji: 'text nodes whose only letters/digits are emoji glyphs (ℹ️ U+2139, keycaps, ZWJ) are not contrast samples',
      counts: 'unnamed = empty Chromium AX name; unnamedNoText = unnamed AND no visible text (truly nameless); rolelessWithText = role-less tabindex div showing text; small44Native = small44 re-evaluated on the box grown by the pressable\'s hitSlop prop (RN-web does not render hitSlop)',
      hiddenScreens: 'E-042: contrast, layout and overlap samples skip every screen-sized aria-hidden subtree (inactive tabs on web: aria-hidden + z-index:-1), like the interactive list already did; per state, probeSkips.textInHiddenScreen counts what was left out and layout.hiddenScreens lists the mounted hidden screens (E-022)',
      toasts: 'E-042: a positioned role=status|alert box is a transient overlay, not chrome; hit-tests look through it to find the owning screen; layout.overlayCovers lists every control / text it sits on (E-043)',
      occlusion: 'E-021: each text sample is hit-tested with document.elementFromPoint at its visible centre; a sample painted over by an unrelated opaque element is not scored and is listed in probeSkips.occludedText; interactive elements are kept and carry occludedBy; an interactive element with the same box as an interactive ancestor is merged (probeSkips.nestedDuplicates)',
      switches: `probes.switches: computed background-color of the RN-web Switch track and thumb; RN-web paints ${RNW_DEFAULT_ACTIVE_THUMB} when activeThumbColor is unset (E-016)`,
      webOnly: 'RN-web Switch is 40x20 CSS px; native UISwitch is 51x31 (AUDIT_PLAN §0.3 web-harness): listed in targetsUnder44 with webOnlySwitch:true, scored P2 web-harness, not a native defect',
      article: 'E-024: the article state is reached through the Resources tab and the list card (extra.activeTab), not a deep link',
      homeReady: 'E-025: every Home state of the reader account waits for the "Ma Journée n/m" pill before the snapshot; the pill exists only once the account has reminder settings (created by the first visit to Reminders), so a Home without it gets that visit first',
      offline: 'E-007: context.setOffline does not fire the NetworkInformation change event NetInfo web listens to; the spec records the banner without it (raw) and after dispatching it (what a real browser does)',
    },
    findingChecks: byId,
    switchesOn,
    emojiGlyphs: emoji,
    orphanPunctuation: orphanPunct,
    frPlainSpaceBeforePunctuation: plainSpacePunct,
    duplicateTitles,
    clippedInputs,
    overlayCovers,
    overlaps: overlapsAll,
    probeSkips: {
      nestedDuplicates: allReports.reduce((n, r) => n + r.probeSkips.nestedDuplicates, 0),
      textInHiddenScreen: allReports.reduce((n, r) => n + r.probeSkips.textInHiddenScreen, 0),
      occludedText: allReports.flatMap((r) => r.probeSkips.occludedText.map((o) => ({ state: r.state, ...o }))),
      hiddenScreensByState: Object.fromEntries(allReports.filter((r) => r.layout.hiddenScreens.length).map((r) => [r.state, r.layout.hiddenScreens.map((h) => h.sample)])),
    },
    states: summaries,
    unnamedControls: unnamed,
    symbolOnlyNames: symbolOnly,
    rolelessFocusables: roleless,
    targetsUnder44: small,
    contrastFailures: contrastFails.sort((a, b) => (a.item.ratio ?? 0) - (b.item.ratio ?? 0)),
  };
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'wave-E-a11y-summary.json'), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(dir, 'wave-E-state-map.json'), JSON.stringify(stateMap, null, 2));
    fs.writeFileSync(path.join(dir, 'wave-E-finding-checks.json'), JSON.stringify({ generated: out.generated, baseUrl: E2E_BASE_URL, byId, checks }, null, 2));
  }
});

// ── 01-06: iPhone SE cold funnel (un-sessioned) ──────────────────────────────

test('E01-06 SE 375×667 fr — cold funnel (welcome, auth, register, login, onboarding 2+4)', async ({ browser }) => {
  test.setTimeout(300_000);
  const c = await openCtx(browser, { viewport: VP.se, locale: 'fr', signedIn: false, label: 'SE cold fr' });
  const { page } = c;
  try {
    // 01 welcome — GJ-006: Continue must be visible without scroll
    await go(page, '/welcome', page.locator('[data-testid="lang_card_fr"]'));
    await page.locator('[data-testid="lang_card_fr"]').click();
    await settle(page, 500);
    const cont = page.getByText(/^(Continuer|Continue|متابعة)$/).first();
    const fold = await ctaFold(page, cont);
    expect.soft(fold.found && fold.visibleWithoutScroll, `01-se-welcome: GJ-006 Continue below the fold at 375×667 → ${JSON.stringify(fold.found ? fold.before : null)}`).toBe(true);
    await page.evaluate(() => document.querySelectorAll('*').forEach((e) => ((e as HTMLElement).scrollTop = 0)));
    await snapState(c, '01-se-welcome', 'E 01-15 (GJ-006)', { cta: cont, extra: { gj006: fold } });

    // 02 auth
    await go(page, '/auth', page.getByTestId('auth_guest_button'));
    for (const id of ['auth_signup_button', 'auth_login_button', 'auth_guest_button']) {
      const f = await ctaFold(page, page.getByTestId(id));
      expect.soft(f.found && f.reachableAfterScroll, `02-se-auth: ${id} not reachable`).toBe(true);
    }
    const r02 = await snapState(c, '02-se-auth', 'E 01-15', { cta: page.getByTestId('auth_signup_button') });
    // E-040: French punctuation stays with its word (NBSP before : ? !).
    check('E-040', '02-se-auth', r02.probes.orphanPunct.length === 0 && r02.probes.plainSpaceBeforePunct.length === 0, 'fr /auth at 375: no " :" / " ?" / " !" wrapped alone to the next line, none written with a plain space', { orphanPunct: r02.probes.orphanPunct, plainSpaceBeforePunct: r02.probes.plainSpaceBeforePunct });

    // 03 register
    await go(page, '/register', page.getByTestId('register_email_input'));
    await snapState(c, '03-se-register', 'E 01-15', { cta: page.getByTestId('register_submit_button') });

    // 04 login
    await go(page, '/login', page.getByTestId('login_email_input'));
    await snapState(c, '04-se-login', 'E 01-15', { cta: page.getByTestId('login_submit_button') });

    // 05 onboarding step 2 → 06 step 4
    await go(page, '/onboarding', page.getByRole('button', { name: 'Je suis enceinte' }));
    await page.getByRole('button', { name: 'Je suis enceinte' }).click();
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 15_000 });
    const d = new Date();
    d.setDate(d.getDate() - 31 * 7);
    await dateInput.fill(d.toISOString().slice(0, 10));
    await settle(page, 600);
    const step2Continue = page.getByRole('button', { name: 'Continuer', exact: true });
    await snapState(c, '05-se-onboarding-step2', 'E 01-15', { cta: step2Continue });
    await step2Continue.first().click();
    await expect(page.getByPlaceholder(/.+/).first()).toBeVisible({ timeout: 15_000 });
    await settle(page, 500);
    await page.getByRole('button', { name: 'Continuer', exact: true }).first().click();
    await expect(page.getByTestId('onboarding_step4_submit')).toBeVisible({ timeout: 15_000 });
    // Tick the health-data consent so the photographed CTA is the live one: a disabled
    // button is exempt from the contrast check and would hide a real failure.
    await tickHealthConsent(page);
    await settle(page, 600);
    await snapState(c, '06-se-onboarding-step4', 'E 01-15', { cta: page.getByTestId('onboarding_step4_skip') });
  } finally {
    await closeCtx(c);
  }
});

// ── 07-24: iPhone SE signed-in (fr) ──────────────────────────────────────────

test('E07-24 SE 375×667 fr — signed-in surfaces', async ({ browser }) => {
  test.setTimeout(600_000);
  const c = await openCtx(browser, { viewport: VP.se, locale: 'fr', signedIn: true, label: 'SE signed-in fr' });
  const { page } = c;
  let n = 7;
  const nn = () => String(n++).padStart(2, '0');
  try {
    let homeTrimester: string | null = null;
    for (const s of SIGNED_IN_FR) {
      const state = `${nn()}-se-${s.slug}`;
      await openSurface(page, s, state);
      const leafs = await leafTexts(page);
      const has = (re: RegExp) => leafs.some((l) => re.test(l.text));
      if (s.slug === 'home') {
        // E-032: "Jour N" and the percentage next to it come from the same day count.
        const day = leafs.find((l) => /^Jour \d+$/.test(l.text));
        const pct = day ? leafs.filter((l) => /^\d+ ?%$/.test(l.text)).sort((a, b) => Math.abs(a.y - day.y) - Math.abs(b.y - day.y))[0] : undefined;
        const n = day ? Number(day.text.replace(/\D/g, '')) : NaN;
        const expectedPct = day ? ((Math.min(n, 280) / 280) * 100).toFixed(0) : null;
        homeTrimester = leafs.find((l) => /trimestre/i.test(l.text))?.text ?? null;
        // Home tool-card grid: no overlapping cards (checked by layout.overlaps) — soft here
        const r = await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar, extra: { homeDay: day?.text ?? null, homePercent: pct?.text ?? null, homeTrimester } });
        expect.soft(r.layout.overlaps, `${state}: overlapping interactive elements`).toEqual([]);
        check('E-032', state, !!day && !!pct && pct.text.replace(/\D/g, '') === expectedPct, 'Home "Jour N" and the progress percentage agree (N/280)', { day: day?.text ?? null, percent: pct?.text ?? null, expectedPercent: expectedPct });
        const pillInDom = fs.readFileSync(path.join(OUT_DIRS[0], `${state}.dom.html`), 'utf8').includes('Ma Journée');
        check('E-025', state, pillInDom, 'the Home snapshot DOM contains the "Ma Journée n/m" pill', { pillInSnapshotDom: pillInDom, pillButton: r.interactive.find((i) => /Ma Journée/.test(i.axName))?.axName ?? null });
        // E-030: the pill is one 14 pt line in a glass box; the OUTER box (the pressable) must be a
        // pill, not the 139×69 block it was (product plan: height 36-44).
        const pill030 = r.interactive.find((i) => /Ma Journée/.test(i.axName));
        check('E-030', state, !!pill030 && pill030.rect.h <= 44, 'Home "Ma Journée n/m": the outer glass container is at most 44 pt tall (one text line, no 69 pt block)', pill030 ? { name: pill030.axName, w: pill030.rect.w, h: pill030.rect.h } : 'pill not found');
      } else if (s.slug === 'calendar') {
        // E-028: the empty state draws an icon, not the 📅 emoji (Apple prints "JUL 17" on it).
        const emptyVisible = has(/^Aucun événement pour ce jour$/);
        const emptyIcon = await page.evaluate(() => {
          const el = (Array.from(document.querySelectorAll('*')) as HTMLElement[]).find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'Aucun événement pour ce jour' && !e.closest('[aria-hidden=true]'));
          const box = el?.parentElement;
          if (!box) return null;
          const icon = (Array.from(box.querySelectorAll('*')) as HTMLElement[]).find((e) => /ionicons/i.test(getComputedStyle(e).fontFamily));
          return icon ? { fontFamily: getComputedStyle(icon).fontFamily, color: getComputedStyle(icon).color, size: getComputedStyle(icon).fontSize } : null;
        });
        const r = await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar, extra: { emptyVisible, emptyIcon } });
        const calEmoji = r.probes.emojiText.filter((e) => /📅|🗓|📆/u.test(e.text));
        check('E-028', state, emptyVisible ? calEmoji.length === 0 && !!emptyIcon : null, 'calendar empty state: a drawn icon, no 📅 emoji glyph on screen', { emptyVisible, emptyIcon, calendarEmoji: calEmoji.map((e) => e.text) });
      } else if (s.slug === 'appointment-add') {
        // E-044: type chips carry a vector icon in the label colour, no emoji.
        const chips = await page.evaluate(() => {
          const norm = (t: string) => (t || '').replace(/[\s  ]+/g, ' ').trim();
          return (Array.from(document.querySelectorAll('[aria-selected]')) as HTMLElement[])
            .filter((e) => !e.closest('[aria-hidden=true]') && !e.closest('[role=tablist]') && /^(Médical|Personnel)/.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0)
            .map((e) => {
              const icon = (Array.from(e.querySelectorAll('*')) as HTMLElement[]).find((k) => /ionicons/i.test(getComputedStyle(k).fontFamily));
              const label = (Array.from(e.querySelectorAll('*')) as HTMLElement[]).find((k) => k.children.length === 0 && /Médical|Personnel/.test(k.textContent || ''));
              return {
                text: norm(label?.textContent || e.getAttribute('aria-label') || ''),
                selected: e.getAttribute('aria-selected') === 'true',
                hasEmoji: /\p{Extended_Pictographic}/u.test(e.innerText + (e.getAttribute('aria-label') || '')),
                bg: getComputedStyle(e).backgroundColor,
                iconColor: icon ? getComputedStyle(icon).color : null,
                labelColor: label ? getComputedStyle(label).color : null,
              };
            });
        });
        const scored = chips.map((ch) => ({ ...ch, iconContrast: ch.iconColor ? contrastOf(ch.iconColor, ch.bg) : null }));
        const subtitle = leafs.find((l) => /^Ajoutez un rendez-vous /.test(l.text))?.text ?? null;
        await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar, extra: { typeChips: scored, subtitle } });
        check('E-044', state, scored.length === 2 && scored.every((ch) => !ch.hasEmoji && ch.iconColor !== null && (ch.iconContrast ?? 0) >= 3), 'both type chips: no emoji, a vector icon at ≥3:1 on the chip (WCAG 1.4.11)', scored);
        const sel = scored.find((ch) => ch.selected)?.text ?? '';
        check('E-044', state, !!subtitle && (/Médical/.test(sel) ? /médical/.test(subtitle) : /personnel/.test(subtitle)), 'the subtitle names the selected type', { selected: sel, subtitle });
      } else if (s.slug === 'reminders') {
        // E-017: one fr trimester label on Home and on Reminders.
        const remTrimester = leafs.find((l) => /trimestre/i.test(l.text))?.text ?? null;
        await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar, extra: { remindersTrimester: remTrimester, homeTrimester } });
        check('E-017', state, !!homeTrimester && !!remTrimester && remTrimester.includes(homeTrimester), 'Reminders header uses the same fr trimester label as Home', { home: homeTrimester, reminders: remTrimester });
      } else if (s.slug === 'statistics') {
        // E-030: the empty state has the title and a way back.
        const emptyBranch = has(/^Pas encore de données$/);
        const title = leafs.find((l) => l.text === 'Mes Statistiques');
        const back = leafs.find((l) => l.text === 'Retour');
        const rootBg = await page.getByTestId('statistics_screen_root').first().evaluate((e) => getComputedStyle(e).backgroundColor);
        await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar, extra: { emptyBranch, title, back, rootBg } });
        // Both branches are evaluated (the reader's data decides which one shows): a way back
        // always, and the title when it is the empty state. Never "not reached".
        check('E-030', state, !!back && (emptyBranch ? !!title : true), 'Statistics: a "Retour" control in either branch, and the "Mes Statistiques" title on the empty state', { emptyBranch, title: title ?? null, back: back ?? null, rootBg });
      } else if (s.slug === 'article') {
        // E-024: reached through Resources → the Resources tab stays active. E-026: one title.
        const activeTab = await activeBottomTab(page);
        const r = await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar, extra: { activeTab, openedFrom: '/resources → article card', url: page.url() } });
        check('E-024', state, !!activeTab && /Ressources/.test(activeTab), 'article opened from the Resources list keeps the Resources tab active', { activeTab, url: page.url() });
        check('E-026', state, r.probes.duplicateTitles.length === 0, 'the article title is drawn once (header / H1 / H2 do not repeat it)', { duplicateTitles: r.probes.duplicateTitles, headings: r.probes.headings.slice(0, 6).map((h) => `${h.text} [${h.level}]`) });
      } else if (s.slug === 'resources') {
        const r = await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar });
        const books = r.probes.emojiText.filter((e) => /📚/u.test(e.text));
        check('E-027', state, books.length === 0, 'article cards do not use the 📚 placeholder thumbnail', { placeholderThumbnails: books.length, sample: books.slice(0, 3) });
      } else {
        const r = await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar });
        if (r.probes.duplicateTitles.length) check('E-026', state, false, 'a screen title is drawn once', { duplicateTitles: r.probes.duplicateTitles });
      }
      if (s.slug === 'calendar') {
        await page.getByRole('button', { name: 'Mois', exact: true }).click();
        await settle(page, 800);
        const st = `${nn()}-se-calendar-month`;
        const r = await snapState(c, st, 'E 01-15', { cta: s.cta?.(page), expectTabBar: true });
        // E-008: the FAB must not sit on day cells in month view.
        const fab = r.layout.overlaps.filter((o) => /Ajouter un rendez-vous/.test(o.a) || /Ajouter un rendez-vous/.test(o.b));
        check('E-008', st, fab.length === 0, 'month view: the "Ajouter un rendez-vous" FAB covers no day cell', fab.map((o) => ({ a: o.a, b: o.b, area: o.area })));
      }
      if (s.slug === 'reminders') {
        // Hydration settings (E-016): the "Activer les rappels" Switch, ON. Local state only:
        // the sheet is closed without "Sauvegarder", nothing is written.
        const gear = page.getByRole('button', { name: /Ouvrir les (paramètres|réglages)/ }).first();
        const gearSeen = await gear.isVisible().catch(() => false);
        if (gearSeen) {
          await gear.scrollIntoViewIfNeeded();
          await gear.click();
          const sw = page.getByRole('switch', { name: 'Activer les rappels' });
          await expect(sw, 'hydration settings sheet').toBeVisible({ timeout: 10_000 });
          const wasOn = await sw.isChecked();
          if (!wasOn) await sw.click({ force: true });
          await settle(page, 500);
          const st = '11b-se-hydration-settings';
          const r = await snapState(c, st, 'E 01-15 (E-016 hydration settings)', { extra: { switchWasOn: wasOn, modal: await modalProbe(page) } });
          const hyd = r.probes.switches.find((x) => x.name === 'Activer les rappels');
          check('E-016', st, !!hyd && hyd.checked && hyd.thumb !== RNW_DEFAULT_ACTIVE_THUMB, 'hydration settings: "Activer les rappels" ON thumb is not RN-web default teal', hyd ?? null);
          await page.getByRole('button', { name: 'Fermer la fenêtre' }).first().click();
          await settle(page, 500);
        } else {
          check('E-016', '11b-se-hydration-settings', null, 'hydration settings sheet reachable from the Reminders tab', 'gear "Ouvrir les paramètres" not found');
        }
        // top tabs: the bottom tab bar has the same names → second tablist
        const tasksTab = page.getByRole('tab', { name: 'Tâches' }).last();
        await tasksTab.click();
        await settle(page, 800);
        const st = `${nn()}-se-tasks`;
        // B-011: the "Ma Journée" section keeps the 16pt gutter of the sections around it.
        const myDay = await page.evaluate(() => {
          const norm = (t: string) => (t || '').replace(/[\s  ]+/g, ' ').trim();
          const vw = window.innerWidth;
          const title = (Array.from(document.querySelectorAll('*')) as HTMLElement[]).find((e) => {
            const r = e.getBoundingClientRect();
            return e.children.length === 0 && norm(e.textContent || '') === 'Ma Journée' && !e.closest('[aria-hidden=true]') && r.width > 0 && r.left >= 0 && r.right <= vw;
          });
          if (!title) return null;
          // the section: the first ancestor taller than its header (title + rows)
          let section: HTMLElement | null = title.parentElement;
          while (section && section.getBoundingClientRect().height < 120) section = section.parentElement;
          const tr = title.getBoundingClientRect();
          const sr = section ? section.getBoundingClientRect() : null;
          return { vw, titleX: Math.round(tr.left * 10) / 10, sectionX: sr ? Math.round(sr.left * 10) / 10 : null, sectionRight: sr ? Math.round(sr.right * 10) / 10 : null };
        });
        const dateLine = (await leafTexts(page)).find((l) => /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d+ /i.test(l.text))?.text ?? null;
        await snapState(c, st, 'E 01-15', { cta: page.getByRole('button', { name: /Nouvelle tâche/ }), expectTabBar: true, extra: { myDay, dateLine } });
        check('B-011', st, myDay ? myDay.titleX >= 12 && (myDay.sectionX ?? 0) >= 12 && (myDay.sectionRight ?? myDay.vw) <= myDay.vw - 12 : null, 'Tasks "Ma Journée": title and cards keep a ≥12 px gutter on both sides', { ...myDay, dateLine });
      }
    }
  } finally {
    await closeCtx(c);
  }
});

// ── 25-31: iPad portrait 820×1180 ────────────────────────────────────────────

test('E25-31 iPad portrait 820×1180 fr — TabletFrame column, gutters, modals', async ({ browser }) => {
  test.setTimeout(420_000);
  // un-sessioned welcome first
  const cold = await openCtx(browser, { viewport: VP.ipad, locale: 'fr', signedIn: false, label: 'iPad cold fr' });
  try {
    await go(cold.page, '/welcome', cold.page.locator('[data-testid="lang_card_fr"]'));
    const col = await tabletColumnProbe(cold.page);
    await snapState(cold, '25-ipad-welcome', 'E 16-20', { extra: { tabletColumn: col } });
    expect.soft(col.centered, `25-ipad-welcome: column not centred ${JSON.stringify(col.column)}`).toBe(true);
  } finally {
    await closeCtx(cold);
  }

  const c = await openCtx(browser, { viewport: VP.ipad, locale: 'fr', signedIn: true, label: 'iPad signed-in fr' });
  const { page } = c;
  try {
    // 26 home
    await go(page, '/', page.getByText('Semaine 32', { exact: true }).first());
    await waitMyDayPill(page, '26-ipad-home');
    const col = await tabletColumnProbe(page);
    await snapState(c, '26-ipad-home', 'E 16-20', { cta: page.getByTestId('home_quick_add_appointment'), expectTabBar: true, extra: { tabletColumn: col } });
    expect.soft(col.column, '26-ipad-home: TabletFrame column not found').not.toBeNull();
    expect.soft(col.centered, `26-ipad-home: column not centred ${JSON.stringify(col.column)}`).toBe(true);
    expect.soft(col.gutterBgLeft, '26-ipad-home: left gutter not painted in the app background').toBe(col.columnBg);
    expect.soft(col.gutterBgRight, '26-ipad-home: right gutter not painted in the app background').toBe(col.columnBg);
    if (col.tablist && col.column) {
      expect.soft(col.tablist.w, '26-ipad-home: tab bar wider than the column').toBeLessThanOrEqual(col.column.w + 1);
    }

    // 27 calendar
    await go(page, '/calendar', page.getByRole('button', { name: 'Mois', exact: true }));
    await snapState(c, '27-ipad-calendar', 'E 16-20', { cta: page.getByRole('button', { name: 'Ajouter un rendez-vous' }), expectTabBar: true, extra: { tabletColumn: await tabletColumnProbe(page) } });

    // 28 tasks → AddTask modal (centred inside the column?) + Escape closes it (E-31)
    await go(page, '/reminders', page.getByRole('tab', { name: 'Tâches' }).first());
    await page.getByRole('tab', { name: 'Tâches' }).last().click();
    await settle(page, 800);
    await page.getByRole('button', { name: /Nouvelle tâche/ }).first().click();
    await expect(page.getByPlaceholder(/Acheter des vitamines/)).toBeVisible({ timeout: 10_000 });
    await settle(page, 600);
    const m1 = await modalProbe(page);
    const colT = await tabletColumnProbe(page);
    await snapState(c, '28-ipad-addtask-modal', 'E 16-20 + E 31 (modal)', { extra: { modal: m1, tabletColumn: colT } });
    if (m1.found && m1.sheet && colT.column) {
      expect.soft(m1.sheet.x >= colT.column.x - 1 && m1.sheet.x + m1.sheet.w <= colT.column.x + colT.column.w + 1, `28-ipad-addtask-modal: sheet ${JSON.stringify(m1.sheet)} escapes the column ${JSON.stringify(colT.column)}`).toBe(true);
    } else {
      expect.soft(m1.found, '28-ipad-addtask-modal: no aria-modal/role=dialog layer found').toBe(true);
    }
    await page.keyboard.press('Escape');
    await settle(page, 700);
    const stillOpen = await page.getByPlaceholder(/Acheter des vitamines/).isVisible().catch(() => false);
    expect.soft(stillOpen, '28-ipad-addtask-modal: Escape does not close the modal (web)').toBe(false);
    if (stillOpen) {
      // close it the normal way so the next state is clean
      await page.getByRole('button', { name: /Annuler|Fermer/ }).first().click().catch(() => undefined);
      await settle(page, 400);
    }

    // 29 health → weight modal
    await go(page, '/health', page.getByRole('button', { name: /Ajouter une pesée/ }).first());
    await page.getByRole('button', { name: /Ajouter une pesée/ }).first().click();
    await settle(page, 900);
    const m2 = await modalProbe(page);
    const colH = await tabletColumnProbe(page);
    await snapState(c, '29-ipad-health-modal', 'E 16-20', { extra: { modal: m2, tabletColumn: colH } });
    if (m2.found && m2.sheet && colH.column) {
      expect.soft(m2.sheet.x >= colH.column.x - 1 && m2.sheet.x + m2.sheet.w <= colH.column.x + colH.column.w + 1, `29-ipad-health-modal: sheet ${JSON.stringify(m2.sheet)} escapes the column ${JSON.stringify(colH.column)}`).toBe(true);
    } else {
      expect.soft(m2.found, '29-ipad-health-modal: no aria-modal/role=dialog layer found').toBe(true);
    }
    await page.keyboard.press('Escape');
    await settle(page, 500);

    // 30 profile
    await go(page, '/profile');
    await snapState(c, '30-ipad-profile', 'E 16-20', { cta: page.getByRole('button', { name: 'Enregistrer les modifications' }), extra: { tabletColumn: await tabletColumnProbe(page) } });

    // 31 chatbot
    await go(page, '/chatbot', page.getByPlaceholder(/Posez votre question/));
    await snapState(c, '31-ipad-chatbot', 'E 16-20', { cta: page.getByPlaceholder(/Posez votre question/), expectTabBar: true, extra: { tabletColumn: await tabletColumnProbe(page) } });
  } finally {
    await closeCtx(c);
  }
});

// ── 32-34: iPad landscape 1180×820 ───────────────────────────────────────────

test('E32-34 iPad landscape 1180×820 fr — Home, Calendar, Chatbot (focused input)', async ({ browser }) => {
  test.setTimeout(300_000);
  const c = await openCtx(browser, { viewport: VP.ipadLand, locale: 'fr', signedIn: true, label: 'iPad landscape fr' });
  const { page } = c;
  try {
    await go(page, '/', page.getByText('Semaine 32', { exact: true }).first());
    await waitMyDayPill(page, '32-ipad-land-home');
    const col = await tabletColumnProbe(page);
    await snapState(c, '32-ipad-land-home', 'E 21-23', { cta: page.getByTestId('home_quick_add_appointment'), expectTabBar: true, extra: { tabletColumn: col } });
    expect.soft(col.centered, `32-ipad-land-home: column not centred ${JSON.stringify(col.column)}`).toBe(true);

    await go(page, '/calendar', page.getByRole('button', { name: 'Mois', exact: true }));
    await page.getByRole('button', { name: 'Mois', exact: true }).click();
    await settle(page, 800);
    const r33 = await snapState(c, '33-ipad-land-calendar-month', 'E 21-23', { cta: page.getByRole('button', { name: 'Ajouter un rendez-vous' }), expectTabBar: true, extra: { tabletColumn: await tabletColumnProbe(page) } });
    const fab33 = r33.layout.overlaps.filter((o) => /Ajouter un rendez-vous/.test(o.a) || /Ajouter un rendez-vous/.test(o.b));
    check('E-008', '33-ipad-land-calendar-month', fab33.length === 0, 'month view (1180×820): the "Ajouter un rendez-vous" FAB covers no day cell', fab33.map((o) => ({ a: o.a, b: o.b, area: o.area })));

    await go(page, '/chatbot', page.getByPlaceholder(/Posez votre question/));
    const input = page.getByPlaceholder(/Posez votre question/);
    await input.focus();
    await settle(page, 400);
    const box = await input.boundingBox();
    const vh = VP.ipadLand.height;
    expect.soft(!!box && box.y >= 0 && box.y + box.height <= vh, `34-ipad-land-chatbot-focused: input not inside the viewport when focused ${JSON.stringify(box)}`).toBe(true);
    await snapState(c, '34-ipad-land-chatbot-focused', 'E 21-23', { expectTabBar: true, extra: { inputBox: box, tabletColumn: await tabletColumnProbe(page) } });
  } finally {
    await closeCtx(c);
  }
});

// ── 35-38: text-scale proxy 280×603 @ DPR 1.4 ────────────────────────────────

test('E35-38 scale proxy 280×603@1.4 fr — Home, AddAppointment, Profile, Onboarding step 3', async ({ browser }) => {
  test.setTimeout(360_000);
  const c = await openCtx(browser, { viewport: VP.scale, dpr: 1.4, locale: 'fr', signedIn: true, label: 'scale signed-in fr' });
  const { page } = c;
  try {
    await go(page, '/', page.getByText('Semaine 32', { exact: true }).first());
    await waitMyDayPill(page, '35-scale-home');
    // E-008 (280): the avatar must not sit on the greeting. Text ink (Range) vs the avatar box.
    const greet = await textVsControl(page, '^Bonjour ', '[aria-label="Profil utilisateur"]');
    const r1 = await snapState(c, '35-scale-home', 'E 24-27', { cta: page.getByTestId('home_quick_add_appointment'), expectTabBar: true, extra: { greetingVsAvatar: greet } });
    check('E-008', '35-scale-home', greet.found ? greet.overlapArea === 0 : null, '280 pt Home: the avatar does not cover the greeting text', greet);
    expect.soft(r1.layout.overlaps, '35-scale-home: overlapping controls').toEqual([]);
    expect.soft(r1.layout.clippedLabels.filter((l) => !l.intentionalTruncation), '35-scale-home: clipped button text').toEqual([]);

    await go(page, '/appointment/add', page.getByPlaceholder(/Échographie/));
    const r2 = await snapState(c, '36-scale-appointment-add', 'E 24-27', { cta: page.getByRole('button', { name: 'Enregistrer les modifications' }) });
    // E-019: the Date / Time values must fit their fields at 280 pt.
    check('E-019', '36-scale-appointment-add', r2.layout.clippedInputs.length === 0, '280 pt AddAppointment: every input shows its whole value (scrollWidth ≤ clientWidth)', r2.layout.clippedInputs);
    expect.soft(r2.layout.overlaps, '36-scale-appointment-add: overlapping controls').toEqual([]);
    expect.soft(r2.layout.clippedLabels.filter((l) => !l.intentionalTruncation), '36-scale-appointment-add: clipped button text').toEqual([]);

    await go(page, '/profile');
    // E-029: the header e-mail keeps a 16 pt inset at 280 pt.
    await expect(page.getByText(reader.email).first(), '37-scale-profile: header e-mail').toBeVisible({ timeout: 30_000 });
    const emailBox = await page.getByText(reader.email).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const ink = range.getBoundingClientRect();
      const h = el as HTMLElement;
      return { x: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, inkX: Math.round(ink.left * 10) / 10, inkRight: Math.round(ink.right * 10) / 10, vw: window.innerWidth, truncated: h.scrollWidth > h.clientWidth + 1, textOverflow: getComputedStyle(h).textOverflow, lines: Math.round(r.height / parseFloat(getComputedStyle(h).lineHeight || '20')) };
    });
    const r3 = await snapState(c, '37-scale-profile', 'E 24-27', { cta: page.getByRole('button', { name: 'Enregistrer les modifications' }), extra: { emailBox } });
    check('E-029', '37-scale-profile', emailBox.x >= 15 && emailBox.right <= emailBox.vw - 15, '280 pt Profile: the header e-mail sits ≥16 px from both screen edges', emailBox);
    expect.soft(r3.layout.overlaps, '37-scale-profile: overlapping controls').toEqual([]);
    expect.soft(r3.layout.clippedLabels.filter((l) => !l.intentionalTruncation), '37-scale-profile: clipped button text').toEqual([]);
  } finally {
    await closeCtx(c);
  }

  const cold = await openCtx(browser, { viewport: VP.scale, dpr: 1.4, locale: 'fr', signedIn: false, label: 'scale cold fr' });
  try {
    const p = cold.page;
    await go(p, '/onboarding', p.getByRole('button', { name: 'Je suis enceinte' }));
    await p.getByRole('button', { name: 'Je suis enceinte' }).click();
    await expect(p.locator('input[type="date"]').first()).toBeVisible({ timeout: 15_000 });
    await settle(p, 500);
    await p.getByRole('button', { name: 'Continuer', exact: true }).first().click();
    await settle(p, 900);
    const r4 = await snapState(cold, '38-scale-onboarding-step3', 'E 24-27', { cta: p.getByRole('button', { name: 'Continuer', exact: true }) });
    expect.soft(r4.layout.overlaps, '38-scale-onboarding-step3: overlapping controls').toEqual([]);
    expect.soft(r4.layout.clippedLabels.filter((l) => !l.intentionalTruncation), '38-scale-onboarding-step3: clipped button text').toEqual([]);
  } finally {
    await closeCtx(cold);
  }
});

// ── 39-40: focus order (keyboard) ────────────────────────────────────────────

test('E39-40 focus order — Login (fr, ar) + AddAppointment (fr)', async ({ browser }) => {
  test.setTimeout(300_000);
  for (const locale of ['fr', 'ar'] as const) {
    const cold = await openCtx(browser, { viewport: VP.std, locale, signedIn: false, label: `focus login ${locale}` });
    try {
      const p = cold.page;
      await go(p, '/login', p.getByTestId('login_email_input'));
      await p.mouse.click(2, 2);
      const steps = await focusWalk(p, 12);
      const violations = focusOrderViolations(steps, locale === 'ar');
      const noIndicator = steps.filter((s) => s.rect && !s.indicatorDiffers).map((s) => `${s.tag}[${s.role}] "${s.name}"`);
      const state = locale === 'fr' ? '39-focus-login-fr' : '39b-focus-login-ar';
      const emailPlaceholder = await p.getByTestId('login_email_input').getAttribute('placeholder');
      await snapState(cold, state, 'E 31', { extra: { focusSteps: steps, violations, noIndicator, emailPlaceholder } });
      if (locale === 'ar') check('E-031', state, !!emailPlaceholder && !/your@/i.test(emailPlaceholder), 'ar Login e-mail placeholder is not the English "your@email.com"', { emailPlaceholder });
      expect.soft(violations, `${state}: tab order does not follow visual order`).toEqual([]);
      expect.soft(noIndicator, `${state}: focused element(s) with no visible focus indicator`).toEqual([]);
      // the three primary fields must be reachable by Tab
      const names = steps.map((s) => s.name);
      expect.soft(names.some((x) => /mail|البريد/i.test(x)), `${state}: email input not reachable by Tab (${names.join(' → ')})`).toBe(true);
    } finally {
      await closeCtx(cold);
    }
  }

  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'focus add-appointment fr' });
  try {
    const p = c.page;
    await go(p, '/appointment/add', p.getByPlaceholder(/Échographie/));
    await p.getByPlaceholder(/Échographie/).focus();
    const steps = await focusWalk(p, 22);
    const violations = focusOrderViolations(steps, false);
    const noIndicator = steps.filter((s) => s.rect && !s.indicatorDiffers).map((s) => `${s.tag}[${s.role}] "${s.name}"`);
    await snapState(c, '40-focus-appointment-add', 'E 31', { extra: { focusSteps: steps, violations, noIndicator } });
    expect.soft(violations, '40-focus-appointment-add: tab order does not follow visual order').toEqual([]);
    expect.soft(noIndicator, '40-focus-appointment-add: focused element(s) with no visible focus indicator').toEqual([]);
    // leaving a dirty form is a confirm → our recorder accepts; nothing typed here, so no dialog expected
  } finally {
    await closeCtx(c);
  }
});

// ── 41-44: live regions ──────────────────────────────────────────────────────

test('E41-44 live regions — Register/Login errors, chatbot triage, kick counter', async ({ browser }) => {
  test.setTimeout(300_000);
  const cold = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: false, label: 'live cold fr' });
  try {
    const p = cold.page;
    await go(p, '/register', p.getByTestId('register_submit_button'));
    await p.getByTestId('register_submit_button').click();
    await settle(p, 800);
    const lrReg = await liveRegions(p);
    await snapState(cold, '41-live-register-empty', 'E 32', { extra: { liveRegions: lrReg } });
    expect.soft(lrReg.some((l) => l.role === 'alert' && /requis/i.test(l.text)), `41-live-register-empty: no role=alert with the error (${JSON.stringify(lrReg)})`).toBe(true);

    await go(p, '/login', p.getByTestId('login_email_input'));
    await p.getByTestId('login_email_input').fill(reader.email);
    await p.getByTestId('login_password_input').fill('Wrong-Passw0rd9');
    // The browser logs every 4xx as "Failed to load resource". The 400 from
    // accounts:signInWithPassword IS the wrong-password answer; only that one is excluded.
    const expected400: string[] = [];
    const on400 = (msg: import('@playwright/test').ConsoleMessage) => {
      if (msg.type() === 'error' && /status of 400/.test(msg.text()) && /accounts:signInWithPassword/.test(msg.location().url || '')) expected400.push(msg.text());
    };
    p.on('console', on400);
    await p.getByTestId('login_submit_button').click();
    await expect(p.getByText(/incorrect/i).first()).toBeVisible({ timeout: 20_000 });
    await settle(p, 300);
    p.off('console', on400);
    for (const m of expected400) {
      const k = cold.errors.indexOf(m);
      if (k >= 0) cold.errors.splice(k, 1);
    }
    const lrLog = await liveRegions(p);
    await snapState(cold, '42-live-login-wrong-password', 'E 32', { extra: { liveRegions: lrLog, expectedAuth400: expected400.length } });
    expect.soft(lrLog.some((l) => l.role === 'alert' && /incorrect/i.test(l.text)), `42-live-login-wrong-password: no role=alert with the error (${JSON.stringify(lrLog)})`).toBe(true);
  } finally {
    await closeCtx(cold);
  }

  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'live signed-in fr' });
  try {
    const p = c.page;
    await go(p, '/chatbot', p.getByPlaceholder(/Posez votre question/));
    await p.getByPlaceholder(/Posez votre question/).fill("j'ai des saignements abondants");
    await p.getByRole('button', { name: /Envoyer le message/ }).click();
    await expect(p.getByText(/URGENCE/).first()).toBeVisible({ timeout: 15_000 });
    await settle(p, 600);
    const lrChat = await liveRegions(p);
    await snapState(c, '43-live-chatbot-triage', 'E 32', { extra: { liveRegions: lrChat } });
    expect.soft(lrChat.some((l) => l.role === 'alert' && /URGENCE/.test(l.text)), `43-live-chatbot-triage: triage not in role=alert (${JSON.stringify(lrChat)})`).toBe(true);
    const chatLive = await p.evaluate(() => !!document.querySelector('[aria-live=polite],[aria-live=assertive],[role=log]'));
    expect.soft(chatLive, '43-live-chatbot-triage: bot replies are not in any aria-live / role=log region').toBe(true);

    await go(p, '/kick-counter', p.getByRole('button', { name: /Commencer une session/ }));
    await p.getByRole('button', { name: /Commencer une session/ }).click();
    await settle(p, 800);
    const lrKick = await liveRegions(p);
    const kickCountLive = await p.evaluate(() => {
      const nums = Array.from(document.querySelectorAll('div,span')).filter(
        (e) => e.children.length === 0 && /^\d+$/.test((e.textContent || '').trim()) && parseFloat(getComputedStyle(e).fontSize) >= 40,
      );
      return nums.map((e) => ({ text: e.textContent, live: !!e.closest('[aria-live],[role=status],[role=alert]') }));
    });
    await snapState(c, '44-live-kick-counter', 'E 32', { extra: { liveRegions: lrKick, kickCountLive } });
    expect.soft(kickCountLive.length > 0 && kickCountLive.every((k) => k.live), `44-live-kick-counter: kick count not in an aria-live region (${JSON.stringify(kickCountLive)})`).toBe(true);
  } finally {
    await closeCtx(c);
  }
});

// ── 45-47: offline / reconnect (dedicated account — the only write in Wave E) ─

test('E45-47 offline banner, bundled Resources, offline appointment → reconnect → server', async ({ browser }) => {
  test.setTimeout(420_000);
  const acct = await createAccount(newAccountEmail('E', 'offline'), E2E_PASSWORD);
  await seedProfile(acct.uid, acct.idToken, { week: 32, firstName: 'Olga', lastName: 'Horsligne' });
  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'offline fr', account: acct });
  const { page, context } = c;
  try {
    await expect(page.getByText('Semaine 32', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await settle(page, 1500);
    // setOffline alone leaves Firestore's already-open WebChannel able to flush writes
    // (round-0 dry run: the "offline" appointment reached the server). Abort every
    // request to the emulators too, so offline really is offline.
    const blockEmulators = (route: import('@playwright/test').Route) => route.abort('internetdisconnected');
    await context.route(/127\.0\.0\.1:(8080|9099)|localhost:(8080|9099)/, blockEmulators);
    await context.setOffline(true);
    const banner = page.getByRole('alert').filter({ hasText: /Pas de connexion/ });
    // Raw reading first (emulation only), then with the NetworkInformation 'change' event a
    // real browser fires (see fireConnectionChange).
    const bannerRaw20s = await banner.first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false);
    if (!bannerRaw20s) await fireConnectionChange(page);
    const bannerSeen = bannerRaw20s || (await banner.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false));
    await settle(page, 600);
    const bannerBox = bannerSeen ? await banner.first().boundingBox() : null;
    const r45 = await snapState(c, '45-offline-home', 'E 33', { expectTabBar: true, extra: { bannerSeen, bannerRaw20s, bannerBox, liveRegions: await liveRegions(page) } });
    check('E-007', '45-offline-home', bannerSeen, 'OfflineNotice (role=alert "Pas de connexion Internet") shows once NetInfo hears of the offline change', { bannerSeen, withoutConnectionChangeEventWithin20s: bannerRaw20s, bannerBox, covers: r45.layout.overlayCovers.map((o) => ({ text: o.text, rect: o.rect, covers: o.covers.map((x) => `${x.kind}: ${x.label}`) })) });

    // Resources via the tab bar (a page.goto would fail offline)
    const t0 = Date.now();
    await page.getByRole('tab', { name: /Ressources/ }).first().click();
    const articlesVisible = await page
      .getByRole('button')
      .filter({ hasText: /grossesse|Grossesse/ })
      .first()
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true, () => false);
    const resourcesMs = Date.now() - t0;
    expect.soft(articlesVisible && resourcesMs <= 4_500, `45b-offline-resources: bundled fallback content not shown within 4 s (visible=${articlesVisible}, ${resourcesMs} ms)`).toBe(true);
    await snapState(c, '45b-offline-resources', 'E 33', { expectTabBar: true, extra: { resourcesMs, articlesVisible } });

    // Add an appointment offline
    await page.getByRole('tab', { name: /Calendrier/ }).first().click();
    await expect(page.getByRole('button', { name: 'Ajouter un rendez-vous' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Ajouter un rendez-vous' }).click();
    await expect(page.getByPlaceholder(/Échographie/)).toBeVisible({ timeout: 15_000 });
    const title = `Offline E ${Date.now() % 100000}`;
    await page.getByPlaceholder(/Échographie/).fill(title);
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    await page.getByPlaceholder('YYYY-MM-DD').fill(tomorrow);
    await page.getByPlaceholder('HH:MM').fill('10:30');
    await settle(page, 400);
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
    // The offline save races the write against a timeout, then shows a role=status toast.
    const toast = page.getByRole('status').filter({ hasText: /hors ligne|appareil|synchro/i }).first();
    const toastSeen = await toast.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false);
    if (!toastSeen) await settle(page, 2000);
    else await settle(page, 500); // slide-in animation
    // E-043: measured right now (the toast is transient): its box against the visible header controls.
    const toastGeo = toastSeen
      ? await page.evaluate(() => {
          const R = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
          const t = (Array.from(document.querySelectorAll('[role=status]')) as HTMLElement[]).find((e) => e.getBoundingClientRect().width > 0 && !e.closest('[aria-hidden=true]'));
          if (!t) return null;
          const tr = t.getBoundingClientRect();
          const hits = (Array.from(document.querySelectorAll('button,[role=button],[role=tab],[role=link]')) as HTMLElement[])
            .filter((b) => !b.closest('[aria-hidden=true]') && !t.contains(b) && b.getBoundingClientRect().width > 0)
            .map((b) => {
              const r = b.getBoundingClientRect();
              const w = Math.min(r.right, tr.right) - Math.max(r.left, tr.left);
              const h = Math.min(r.bottom, tr.bottom) - Math.max(r.top, tr.top);
              return { label: (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50), rect: R(r), area: w > 0 && h > 0 ? Math.round(w * h) : 0 };
            })
            .filter((x) => x.area > 4);
          const lineHeight = parseFloat(getComputedStyle(t.querySelector('div[dir]') || t).lineHeight) || 20;
          return { text: t.innerText.replace(/\s+/g, ' ').trim(), rect: R(tr), position: getComputedStyle(t).position, lineHeight, coveredControls: hits };
        })
      : null;
    const afterSave = {
      toastSeen,
      toastGeo,
      url: page.url(),
      stillOnForm: await page.getByPlaceholder(/Échographie/).isVisible().catch(() => false),
      dialogs: c.dialogs.messages(),
      liveRegions: await liveRegions(page),
      spinner: await page.locator('[role=progressbar]').count(),
    };
    const serverWhileOffline = await serverQuery('userEvents', 'user_id', acct.uid);
    expect(serverWhileOffline.some((d) => d.data.title === title), 'HARNESS: the offline write reached the server — offline emulation is leaking').toBe(false);
    const r46 = await snapState(c, '46-offline-add-appointment', 'E 33', { extra: { afterSave, serverDocsWhileOffline: serverWhileOffline.length } });
    check('E-043', '46-offline-add-appointment', toastGeo ? toastGeo.coveredControls.length === 0 : null, 'the offline-save toast covers no Calendar header control (week / month chevrons)', toastGeo ? { toast: toastGeo.text, rect: toastGeo.rect, coveredControls: toastGeo.coveredControls, probeOverlayCovers: r46.layout.overlayCovers.map((o) => ({ text: o.text, covers: o.covers.map((x) => `${x.kind}: ${x.label} (${x.area}px²)`) })) } : 'toast not seen within 20 s of the offline save');
    // E-042: nothing from a hidden tab may be sampled in this state.
    const phantom = [...r46.contrast.map((s) => s.text), ...r46.layout.overlaps.flatMap((o) => [o.a, o.b])].filter((t) => /Bonjour Olga|Profil utilisateur|^Compléments$/.test(t));
    check('E-042', '46-offline-add-appointment', phantom.length === 0, 'probe: no sample from the hidden Home / Resources tabs under the toast', { phantom, textInHiddenScreen: r46.probeSkips.textInHiddenScreen, occludedText: r46.probeSkips.occludedText, hiddenScreens: r46.layout.hiddenScreens.map((h) => h.sample) });

    // Reconnect
    await context.unroute(/127\.0\.0\.1:(8080|9099)|localhost:(8080|9099)/, blockEmulators);
    await context.setOffline(false);
    const goneRaw10s = await banner.first().waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true, () => false);
    if (!goneRaw10s) await fireConnectionChange(page);
    const bannerGone = goneRaw10s || (await banner.first().waitFor({ state: 'hidden', timeout: 30_000 }).then(() => true, () => false));
    check('E-007', '47-reconnect', bannerSeen && bannerGone, 'OfflineNotice was shown offline and disappears on reconnect', { bannerSeen, bannerGone, goneWithoutConnectionChangeEventWithin10s: goneRaw10s });
    let serverDocs = serverWhileOffline;
    for (let i = 0; i < 20 && !serverDocs.some((d) => d.data.title === title); i++) {
      await page.waitForTimeout(1000);
      serverDocs = await serverQuery('userEvents', 'user_id', acct.uid);
    }
    const synced = serverDocs.some((d) => d.data.title === title);
    const uiClaimedSuccess = !afterSave.stillOnForm;
    // A "success" (form closed) that never reaches the server after reconnect is a P0.
    if (uiClaimedSuccess) expect.soft(synced, '47-reconnect: UI accepted the offline appointment but it never reached the server after reconnect').toBe(true);
    const toastLive = await liveRegions(page);
    // E-056: the "Enregistré hors ligne. Synchro à la reconnexion." toast must not outlive the
    // reconnection. Whatever visible role=status is left must carry the success copy (replaceOnReconnect).
    const statusTexts = await page.evaluate(() =>
      (Array.from(document.querySelectorAll('[role=status]')) as HTMLElement[])
        .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[aria-hidden=true]'))
        .map((e) => e.innerText.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    );
    const staleOffline = statusTexts.filter((x) => /hors ligne|Synchro à la reconnexion/i.test(x));
    const successCopy = statusTexts.filter((x) => /Rendez-vous (ajouté|modifié)/.test(x));
    expect.soft(staleOffline, '47-reconnect (E-056): no stale "Enregistré hors ligne" toast after reconnecting').toEqual([]);
    check('E-056', '47-reconnect', staleOffline.length === 0 && statusTexts.every((x) => successCopy.includes(x)), 'after reconnect the offline-save toast is gone or replaced by the success copy', { statusTexts, staleOffline, successCopy, synced });
    await snapState(c, '47-reconnect', 'E 34', { expectTabBar: true, extra: { bannerGone, goneRaw10s, synced, uiClaimedSuccess, toastLive, formClosedAfterReconnect: !(await page.getByPlaceholder(/Échographie/).isVisible().catch(() => false)), serverDocs: serverDocs.map((d) => ({ id: d.id, title: d.data.title, start: d.data.startDate ?? d.data.date })) } });
  } finally {
    await context.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
    await context.setOffline(false).catch(() => undefined);
    await closeCtx(c);
  }
});

// ── 48-54: Arabic RTL at the smallest and largest widths ─────────────────────

test('E48-54 ar RTL — SE (welcome, home, calendar, chatbot, profile) + iPad calendar', async ({ browser }) => {
  test.setTimeout(480_000);
  const cold = await openCtx(browser, { viewport: VP.se, locale: 'ar', signedIn: false, label: 'SE cold ar' });
  try {
    const p = cold.page;
    await go(p, '/welcome', p.locator('[data-testid="lang_card_ar"]'));
    await p.locator('[data-testid="lang_card_ar"]').click();
    await settle(p, 800);
    const cont = p.getByText(/^(Continuer|Continue|متابعة)$/).first();
    const fold = await ctaFold(p, cont);
    expect.soft(fold.found && fold.visibleWithoutScroll, `48-ar-se-welcome: GJ-006 Continue below the fold (ar) → ${JSON.stringify(fold.found ? fold.before : null)}`).toBe(true);
    await p.evaluate(() => document.querySelectorAll('*').forEach((e) => ((e as HTMLElement).scrollTop = 0)));
    await snapState(cold, '48-ar-se-welcome', 'E 35-36 (GJ-006 ar)', { cta: cont, extra: { gj006: fold } });
  } finally {
    await closeCtx(cold);
  }

  const c = await openCtx(browser, { viewport: VP.se, locale: 'ar', signedIn: true, label: 'SE signed-in ar' });
  const { page } = c;
  try {
    const rtlCheck = async (state: string) => {
      const info = await page.evaluate(() => ({
        dir: document.documentElement.getAttribute('dir'),
        lang: document.documentElement.getAttribute('lang'),
        // Arabic text blocks rendered left-aligned (LTR-stuck rows)
        ltrStuck: Array.from(document.querySelectorAll('div,span'))
          .filter((e) => e.children.length === 0 && /[؀-ۿ]{3,}/.test(e.textContent || '') && e.getBoundingClientRect().width > 120)
          .filter((e) => {
            const cs = getComputedStyle(e);
            return cs.textAlign === 'left' || (cs.direction === 'ltr' && cs.textAlign === 'start');
          })
          .map((e) => (e.textContent || '').trim().slice(0, 50))
          .slice(0, 20),
      }));
      expect.soft(info.dir, `${state}: html[dir] should be rtl`).toBe('rtl');
      expect.soft(info.lang, `${state}: html[lang] should be ar`).toMatch(/^ar/);
      return info;
    };
    await go(page, '/', page.getByText(/32/).first());
    await waitMyDayPill(page, '49-ar-se-home', /\d+\/\d+/);
    await snapState(c, '49-ar-se-home', 'E 35-36', { cta: page.getByTestId('home_quick_add_appointment'), expectTabBar: true, extra: { rtl: await rtlCheck('49-ar-se-home') } });

    // E-007 (plan row 33, "fr/ar"): the offline banner in Arabic. Read-only: nothing is written.
    const errorsBefore = c.errors.length;
    await c.context.setOffline(true);
    const arBanner = page.getByRole('alert').filter({ hasText: /لا يوجد اتصال/ }).first();
    const arRaw5s = await arBanner.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
    if (!arRaw5s) await fireConnectionChange(page);
    const arBannerSeen = arRaw5s || (await arBanner.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false));
    await settle(page, 600);
    const r49b = await snapState(c, '49b-ar-se-offline-banner', 'E 33 (ar)', { expectTabBar: true, extra: { bannerSeen: arBannerSeen, bannerBox: arBannerSeen ? await arBanner.boundingBox() : null, liveRegions: await liveRegions(page), rtl: await rtlCheck('49b-ar-se-offline-banner') } });
    await c.context.setOffline(false);
    await settle(page, 300);
    await fireConnectionChange(page);
    const arBannerGone = await arBanner.waitFor({ state: 'hidden', timeout: 30_000 }).then(() => true, () => false);
    check('E-007', '49b-ar-se-offline-banner', arBannerSeen && arBannerGone, 'ar: OfflineNotice ("لا يوجد اتصال بالإنترنت") shows offline and disappears on reconnect', { bannerSeen: arBannerSeen, withoutConnectionChangeEventWithin5s: arRaw5s, bannerGone: arBannerGone, covers: r49b.layout.overlayCovers.map((o) => ({ text: o.text, covers: o.covers.map((x) => `${x.kind}: ${x.label}`) })) });
    // The browser logs each request it could not send while the harness held the network
    // down. Those lines are the harness, not the app; anything else stays in c.errors.
    const offlineNoise = c.errors.slice(errorsBefore).filter((e) => /ERR_INTERNET_DISCONNECTED/.test(e));
    for (const m of offlineNoise) c.errors.splice(c.errors.indexOf(m), 1);
    await settle(page, 1500);
    await go(page, '/calendar');
    await snapState(c, '50-ar-se-calendar', 'E 35-36', { expectTabBar: true, extra: { rtl: await rtlCheck('50-ar-se-calendar') } });
    await go(page, '/chatbot', page.getByRole('textbox').first());
    await snapState(c, '51-ar-se-chatbot', 'E 35-36', { cta: page.getByRole('textbox').first(), expectTabBar: true, extra: { rtl: await rtlCheck('51-ar-se-chatbot') } });
    await go(page, '/profile');
    await snapState(c, '52-ar-se-profile', 'E 35-36', { extra: { rtl: await rtlCheck('52-ar-se-profile') } });
    await go(page, '/reminders');
    // E-031: the hydration card writes the litre in Arabic ("لتر"), not "L".
    const arLeafs = await leafTexts(page);
    const litre = { arabicUnit: arLeafs.filter((l) => /لتر/.test(l.text)).map((l) => l.text).slice(0, 4), latinUnit: arLeafs.filter((l) => /(^|[\d\s])L$/.test(l.text) || /^L$/.test(l.text)).map((l) => l.text).slice(0, 4) };
    await snapState(c, '53-ar-se-reminders', 'E 35-36', { expectTabBar: true, extra: { rtl: await rtlCheck('53-ar-se-reminders'), litre } });
    check('E-031', '53-ar-se-reminders', litre.arabicUnit.length > 0 && litre.latinUnit.length === 0, 'ar Reminders hydration card: the unit reads "لتر", no Latin "L"', litre);
  } finally {
    await closeCtx(c);
  }

  const ip = await openCtx(browser, { viewport: VP.ipad, locale: 'ar', signedIn: true, label: 'iPad signed-in ar' });
  try {
    const p = ip.page;
    await go(p, '/calendar');
    const col = await tabletColumnProbe(p);
    const dir = await p.evaluate(() => document.documentElement.getAttribute('dir'));
    expect.soft(dir, '54-ar-ipad-calendar: html[dir] should be rtl').toBe('rtl');
    expect.soft(col.centered, `54-ar-ipad-calendar: column not centred ${JSON.stringify(col.column)}`).toBe(true);
    await snapState(ip, '54-ar-ipad-calendar', 'E 35-36', { expectTabBar: true, extra: { tabletColumn: col, dir } });
  } finally {
    await closeCtx(ip);
  }
});

// ── 55: dark-mode emulation must be a no-op (light-only app) ─────────────────

test('E55 prefers-color-scheme: dark leaves the page identical (light-only app)', async ({ browser }) => {
  test.setTimeout(180_000);
  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'dark fr' });
  try {
    const p = c.page;
    await go(p, '/', p.getByText('Semaine 32', { exact: true }).first());
    await waitMyDayPill(p, '55-dark-home');
    await settle(p, 800);
    const light = await styleFingerprint(p);
    await p.emulateMedia({ colorScheme: 'dark' });
    await settle(p, 1000);
    const dark = await styleFingerprint(p);
    const diffs: string[] = [];
    for (let i = 0; i < Math.max(light.length, dark.length); i++) if (light[i] !== dark[i]) diffs.push(`${i}: ${light[i]} → ${dark[i]}`);
    expect.soft(diffs.slice(0, 20), '55-dark-home: dark-mode emulation changed computed colours').toEqual([]);
    await snapState(c, '55-dark-home', 'E dark-mode no-op', { expectTabBar: true, extra: { fingerprintSize: light.length, diffs: diffs.slice(0, 50) } });
  } finally {
    await closeCtx(c);
  }
});

// ── 57-59: iPad Slide Over 320pt (E-024) ─────────────────────────────────────

test('E57-59 iPad Slide Over 320×1000 fr — Home, Calendar, Reminders', async ({ browser }) => {
  test.setTimeout(300_000);
  const c = await openCtx(browser, { viewport: VP.slideOver, dpr: 2, locale: 'fr', signedIn: true, label: 'slide over fr' });
  const { page } = c;
  try {
    const plan: Array<[string, Surface]> = [
      ['57-slideover-home', SIGNED_IN_FR.find((s) => s.slug === 'home')!],
      ['58-slideover-calendar', SIGNED_IN_FR.find((s) => s.slug === 'calendar')!],
      ['59-slideover-reminders', SIGNED_IN_FR.find((s) => s.slug === 'reminders')!],
    ];
    for (const [state, sf] of plan) {
      await openSurface(page, sf, state);
      const r = await snapState(c, state, 'E Slide Over', { cta: sf.cta?.(page), expectTabBar: sf.tabBar });
      if (sf.slug === 'home') {
        // E-030 (a): size of the "Ma Journée" pill at 320 pt — measurement only.
        const pill = r.interactive.find((i) => /Ma Journée/.test(i.axName));
        check('E-030', state, !!pill && pill.rect.h <= 44, 'at 320 pt the "Ma Journée n/m" outer glass container is at most 44 pt tall (round 3: 140×70)', pill ? { name: pill.axName, w: pill.rect.w, h: pill.rect.h } : 'pill not found');
      }
      expect.soft(r.layout.overlaps, `${state}: overlapping controls`).toEqual([]);
      expect.soft(r.layout.clippedLabels.filter((l) => !l.intentionalTruncation), `${state}: clipped button text`).toEqual([]);
    }
  } finally {
    await closeCtx(c);
  }
});

// ── 60-63: real text enlargement ×1.4 at 390×844 (E-024) ─────────────────────

test('E60-63 text ×1.4 (boxes fixed) fr — Home, Calendar, AddAppointment, Reminders', async ({ browser }) => {
  test.setTimeout(300_000);
  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'text x1.4 fr' });
  const { page } = c;
  try {
    const plan: Array<[string, Surface]> = [
      ['60-text-home', SIGNED_IN_FR.find((s) => s.slug === 'home')!],
      ['61-text-calendar', SIGNED_IN_FR.find((s) => s.slug === 'calendar')!],
      ['62-text-appointment-add', SIGNED_IN_FR.find((s) => s.slug === 'appointment-add')!],
      ['63-text-reminders', SIGNED_IN_FR.find((s) => s.slug === 'reminders')!],
    ];
    for (const [state, sf] of plan) {
      await openSurface(page, sf, state);
      const scaled = await enlargeText(page, 1.4);
      await settle(page, 400);
      const r = await snapState(c, state, 'E text-scale', { cta: sf.cta?.(page), expectTabBar: sf.tabBar, extra: { textScaled: scaled, factor: 1.4 } });
      expect.soft(r.layout.clippedLabels.filter((l) => !l.intentionalTruncation), `${state}: clipped button text at text ×1.4`).toEqual([]);
    }
  } finally {
    await closeCtx(c);
  }
});

// ── 64-65: weight tips chip and chart inside the card (B-012 / B-014) ─────────

test('E64-65 WeightTracker 390×844 fr — tip chips and the chart stay inside the card (dedicated account)', async ({ browser }) => {
  test.setTimeout(300_000);
  const acct = await createAccount(newAccountEmail('E', 'weight'), E2E_PASSWORD);
  await seedProfile(acct.uid, acct.idToken, { week: 32, firstName: 'Wanda', lastName: 'Poids', prePregnancyWeight: 60, height: 165 });
  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'weight fr', account: acct });
  const { page } = c;
  try {
    await go(page, '/weight', page.getByRole('button', { name: 'Ajouter une pesée', exact: true }).first());
    await page.getByRole('button', { name: 'Ajouter une pesée', exact: true }).first().click();
    const input = page.getByPlaceholder('Ex: 65.5');
    await expect(input, 'weight entry input').toBeVisible({ timeout: 10_000 });
    await input.fill('68.4');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
    await expect(page.getByText(/^68[.,]4 kg$/).first(), 'history row after the weigh-in').toBeVisible({ timeout: 20_000 });
    await settle(page, 1500);

    // Every box must stay inside each of its ancestors, horizontally, up to the scroller.
    const containment = async (kind: 'chip' | 'chart') =>
      page.evaluate((k) => {
        const norm = (t: string) => (t || '').replace(/[\s\u00a0\u202f]+/g, ' ').trim();
        const R = (r: DOMRect) => ({ x: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
        const vw = window.innerWidth;
        const targets: HTMLElement[] =
          k === 'chart'
            ? (Array.from(document.querySelectorAll('svg')) as unknown as HTMLElement[]).filter((e) => !e.closest('[aria-hidden=true]') && e.getBoundingClientRect().width > 150 && e.getBoundingClientRect().height > 120)
            : (Array.from(document.querySelectorAll('*')) as HTMLElement[]).filter((e) => {
                const own = norm(Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join(''));
                // tips: one emoji-led sentence in a pill (WeightTrackerScreen suggestionChip)
                return !e.closest('[aria-hidden=true]') && e.getBoundingClientRect().width > 0 && own.length > 15 && /Hydratez-vous|Hydratation|rétention|Reposez-vous|Privilégiez|marche quotidienne|Fractionnez|vitamines prénatales/i.test(own);
              });
        return targets.map((e) => {
          const r = e.getBoundingClientRect();
          const exceeded: any[] = [];
          for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
            const cs = getComputedStyle(a);
            const ar = a.getBoundingClientRect();
            if (r.right > ar.right + 1 || r.left < ar.left - 1) exceeded.push({ ancestor: a.tagName.toLowerCase() + (a.getAttribute('data-testid') ? `[${a.getAttribute('data-testid')}]` : ''), rect: R(ar), bg: cs.backgroundColor, radius: cs.borderTopLeftRadius });
            if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
          }
          const h = e as HTMLElement;
          return { text: norm((h.textContent || '').slice(0, 90)), rect: R(r), vw, pastViewport: r.right > vw + 0.5 || r.left < -0.5, cutNoWrap: h.scrollWidth > h.clientWidth + 1, lines: Math.max(1, Math.round(r.height / (parseFloat(getComputedStyle(h).lineHeight) || 18))), exceededAncestors: exceeded };
        });
      }, kind);

    // 64: tips
    const chips = await containment('chip');
    if (chips.length) await page.getByText(chips[0].text.slice(0, 30)).first().scrollIntoViewIfNeeded().catch(() => undefined);
    await settle(page, 400);
    const chips2 = await containment('chip');
    await snapState(c, '64-weight-tips', 'B-012 (weight tip chips)', { extra: { chips: chips2 } });
    check('B-012', '64-weight-tips', chips2.length ? chips2.every((x) => !x.pastViewport && !x.cutNoWrap && x.exceededAncestors.length === 0) : null, 'weight tip chips stay inside the card and wrap (no text past the right edge)', chips2.length ? chips2 : 'no tip chip on screen for this account');

    // E-017: every trimester the Weight screen names (tips or anywhere else) uses the label Home and
    // Reminders write for week 32 ("3ème Trimestre"). Evaluated on all leaf texts, not just the chips.
    const triMentions = (await leafTexts(page)).map((l) => l.text).filter((t) => /trimestre/i.test(t));
    check('E-017', '64-weight-tips', triMentions.every((t) => /3ème Trimestre/.test(t)), 'fr trimester wording on the Weight screen is the Home / Reminders label "3ème Trimestre"', { mentions: triMentions, count: triMentions.length });

    // 65: chart
    const svg = page.locator('svg').first();
    await svg.scrollIntoViewIfNeeded().catch(() => undefined);
    await settle(page, 400);
    const chart = await containment('chart');
    await snapState(c, '65-weight-chart', 'B-014 (weight chart)', { extra: { chart } });
    check('B-014', '65-weight-chart', chart.length ? chart.every((x) => !x.pastViewport && x.exceededAncestors.length === 0) : null, 'the weight chart is drawn inside its card (no ancestor exceeded horizontally)', chart.length ? chart.map((x) => ({ rect: x.rect, exceededAncestors: x.exceededAncestors })) : 'no chart svg found');
  } finally {
    await closeCtx(c);
  }
});

// ── 66-71: round-11 regression guards (the round-10 fixes broke these; nothing could fail) ──

/** Create/overwrite a document as the emulator owner (rules bypassed: seeding only). */
async function ownerWriteE(docPath: string, data: Record<string, string | number>) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v }]));
  const res = await fetch(`${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`ownerWriteE(${docPath}): ${res.status} ${await res.text()}`);
}

const MONTH_DOT_RE = '^(Mois|Month|شهر)\\s*[1-9]\\b';
const HOME_PILL_ROW_RE = "^(Aujourd.hui|N.oubliez pas|Vous avez)[\\s\\S]*\\d+ rendez-vous|^Ma Journée \\d+/\\d+";

test('E66-67 Baby Evolution dots on one row + Home / Resources cards (375 + 390, fr)', async ({ browser }) => {
  test.setTimeout(300_000);
  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'round-11 guards fr' });
  const { page } = c;
  try {
    // C-058 / B-046: nine dots, one row (same top), inside the viewport — at 390 and at 375.
    await go(page, '/baby-evolution', page.getByRole('button', { name: /Mois 8/ }).first());
    for (const vp of [VP.std, VP.se]) {
      await page.setViewportSize(vp);
      await settle(page, 600);
      const dots = await babyEvolutionDots(page, MONTH_DOT_RE);
      await c.mega.snap(`66-baby-evolution-dots-${vp.width}`);
      check('B-046', `66-baby-evolution-dots-${vp.width}`, dots.count === 9 && dots.distinctTops === 1 && dots.insideViewport, `${vp.width} pt: the nine month dots share one row (same top) and stay inside the viewport`, dots);
    }
    await page.setViewportSize(VP.std);

    // B-030 / C-059 / E-062: no stand-in emoji on the Home recommendation cards nor on the Articles cards.
    await go(page, '/', page.getByText('Semaine 32', { exact: true }).first());
    await waitMyDayPill(page, '67-home-cards');
    for (const vp of [VP.std, VP.se]) {
      await page.setViewportSize(vp);
      await settle(page, 800);
      const myDay = await pillContainment(page, HOME_PILL_ROW_RE);
      check('B-045', `67-home-pill-myday-${vp.width}`, myDay.found ? myDay.outside.length === 0 : false, `${vp.width} pt: the "Ma Journée n/m" pill content sits inside its border`, myDay);
    }
    await page.setViewportSize(VP.std);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(150);
    }
    const homeEmoji = await placeholderEmojiCards(page);
    check('C-059', '67-home-recommendations', homeEmoji.length === 0, 'Home recommendation cards draw no stand-in emoji (📰 📚 💊 …)', homeEmoji);
    await go(page, '/resources', page.getByRole('tab', { name: /Articles/ }).first());
    await expect.soft(page.getByRole('button').filter({ hasText: /grossesse|Grossesse/ }).first(), '67: Articles cards listed').toBeVisible({ timeout: 20_000 });
    await settle(page, 600);
    const listEmoji = await placeholderEmojiCards(page);
    await c.mega.snap('67-resources-articles-cards');
    check('B-030', '67-resources-articles', listEmoji.length === 0, 'Articles list cards draw no stand-in emoji (📰 📚 💊 …)', listEmoji);
  } finally {
    await closeCtx(c);
  }
});

test('E68 one non-empty heading and no blank header band on the screens that draw their own title (375, fr)', async ({ browser }) => {
  test.setTimeout(300_000);
  const c = await openCtx(browser, { viewport: VP.se, locale: 'fr', signedIn: true, label: 'round-11 headings fr' });
  const { page } = c;
  try {
    // Deep links: each is the root of its stack (no back control) — the case that left an empty band.
    for (const [slug, p] of [
      ['settings', '/settings'],
      ['kick-counter', '/kick-counter'],
      ['contraction-timer', '/contraction-timer'],
      ['hospital-bag', '/hospital-bag'],
    ] as const) {
      await go(page, p);
      await settle(page, 1200);
      const h = await headingAudit(page);
      await c.mega.snap(`68-headings-${slug}`);
      check('E-057', `68-headings-${slug}`, h.empty === 0 && h.nonEmpty === 1, `${p}: exactly one non-empty role=heading and no empty heading element`, h.headings);
      check('E-058', `68-headings-${slug}`, h.blankHeaderBand === null, `${p}: no blank header band (a top bar with neither a title nor a back control)`, h.band);
    }
  } finally {
    await closeCtx(c);
  }
  // The same on the funnel screens that were de-duplicated with the same option (login, register).
  const cold = await openCtx(browser, { viewport: VP.se, locale: 'fr', signedIn: false, label: 'round-11 headings cold fr' });
  try {
    for (const [slug, p] of [
      ['login', '/login'],
      ['register', '/register'],
    ] as const) {
      await go(cold.page, p);
      await settle(cold.page, 1200);
      const h = await headingAudit(cold.page);
      await cold.mega.snap(`68-headings-${slug}`);
      check('E-057', `68-headings-${slug}`, h.empty === 0 && h.nonEmpty === 1, `${p}: exactly one non-empty role=heading and no empty heading element`, h.headings);
      check('E-058', `68-headings-${slug}`, h.blankHeaderBand === null, `${p}: no blank header band`, h.band);
    }
  } finally {
    await closeCtx(cold);
  }
});

for (const loc of ['fr', 'ar', 'tn'] as const) {
  test(`E69 ${loc} Home greeting with a long first name stays clear of the avatar (390)`, async ({ browser }) => {
    test.setTimeout(240_000);
    // 10 letters: the longest the greeting must still fit beside the avatar without overlapping it.
    const first = 'Abdelhakim';
    const acct = await createAccount(newAccountEmail('E', `greeting-${loc}`), E2E_PASSWORD);
    await seedProfile(acct.uid, acct.idToken, { week: 32, firstName: first, lastName: 'Longnom' });
    const c = await openCtx(browser, { viewport: VP.std, locale: loc, signedIn: true, label: `greeting ${loc}`, account: acct });
    const { page } = c;
    try {
      await go(page, '/', page.getByText(new RegExp(first)).first());
      await settle(page, 800);
      const g = await greetingVsAvatar(page, first);
      await c.mega.snap(`69-greeting-${loc}-long-name`);
      check('C-057', `69-greeting-${loc}-long-name`, g.found ? g.overlapArea === 0 && g.gapPx >= 4 && g.insideViewport : false, `${loc} 390 pt Home: the greeting "…${first}…" does not overlap the avatar (>= 4 px clear) and stays inside the viewport`, g);
    } finally {
      await closeCtx(c);
    }
  });
}

test('E70 Home pill: icon, text and chevron stay inside its border (390 + 375, fr; 4 appointments tomorrow)', async ({ browser }) => {
  test.setTimeout(300_000);
  const acct = await createAccount(newAccountEmail('E', 'pill'), E2E_PASSWORD);
  await seedProfile(acct.uid, acct.idToken, { week: 32, firstName: 'Pilar', lastName: 'Pastille' });
  // Tomorrow at 12:00 Paris time, four times: the long "N'oubliez pas ! 4 rendez-vous demain." row.
  const parisHour = (t: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date(t)));
  const base = Date.now() + 24 * 3600 * 1000;
  const noon = base + (12 - parisHour(base)) * 3600 * 1000;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < 4; i++) {
    await ownerWriteE(`userEvents/pill-${acct.uid}-${i}`, {
      user_id: acct.uid,
      event_id: `pill-${acct.uid}-${i}`,
      title: `RDV pastille ${i + 1}`,
      date: new Date(noon + i * 60_000).toISOString(),
      type: 'medical',
      createdAt: nowIso,
    });
  }
  const c = await openCtx(browser, { viewport: VP.std, locale: 'fr', signedIn: true, label: 'pill fr', account: acct });
  const { page } = c;
  try {
    await go(page, '/', page.getByText('Semaine 32', { exact: true }).first());
    for (const vp of [VP.std, VP.se]) {
      await page.setViewportSize(vp);
      await settle(page, 1500);
      const row = page.getByRole('button', { name: new RegExp(HOME_PILL_ROW_RE) }).first();
      const shown = await row.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false);
      const pill = await pillContainment(page, HOME_PILL_ROW_RE);
      await c.mega.snap(`70-home-pill-${vp.width}`);
      check('B-045', `70-home-pill-${vp.width}`, shown && pill.found ? pill.outside.length === 0 : false, `${vp.width} pt: everything in the Home pill (icon, text, chevron) sits inside its own border`, { shown, ...pill });
    }
  } finally {
    await closeCtx(c);
  }
});

// ── 56: a11y roll-up gate (plan rows 28-30) ──────────────────────────────────

test('E56 a11y roll-up — unnamed controls, contrast AA, tap targets (plan 28/29/30)', async () => {
  const allReports = loadRunReports();
  // Evaluated over every state captured above. The detailed evidence lives in each
  // <state>.a11y.json and in wave-E-a11y-summary.json (written in afterAll).
  test.skip(allReports.length === 0, 'no states captured');
  const unnamed = allReports.flatMap((r) => r.interactive.filter((i) => i.unnamed).map((i) => `${r.state}: ${i.tag}[${i.domRole}] ${i.html.slice(0, 90)}`));
  const inputsNoName = unnamed.filter((u) => /input|textarea/.test(u));
  expect.soft([...new Set(unnamed)], '28-axe: controls with no accessible name (button-name / link-name / label)').toEqual([]);
  expect.soft([...new Set(inputsNoName)], '28-axe: inputs with no label').toEqual([]);
  const cFails = allReports.flatMap((r) => r.contrast.filter((s) => s.pass === false && !s.disabled).map((s) => `${s.text} ${s.fg}/${s.bg} = ${s.ratio} < ${s.threshold}`));
  expect.soft([...new Set(cFails)], '29-contrast: text below WCAG AA').toEqual([]);
  const small = allReports.flatMap((r) =>
    r.interactive.filter((i) => i.below24 && !i.disabled).map((i) => `${r.layout.viewport.w}w ${i.axRole} "${i.axName || i.text}" ${i.rect.w}×${i.rect.h}`),
  );
  expect.soft([...new Set(small)], '30-target-size: targets below the WCAG 2.5.8 24×24 floor (44×44 list in the summary JSON)').toEqual([]);

  // E-022: `unmountOnBlur` is a no-op in bottom-tabs v7 (dead config); the visited tabs stay
  // mounted (aria-hidden, z-index:-1). Static read of App.tsx + the mounted hidden screens seen.
  const appTsx = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
  const line = appTsx.split('\n').findIndex((l) => /unmountOnBlur/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  const maxHidden = allReports.reduce((m, r) => (r.layout.hiddenScreens.length > m.n ? { n: r.layout.hiddenScreens.length, state: r.state } : m), { n: 0, state: '' });
  check('E-022', 'App.tsx', line < 0, 'App.tsx no longer sets the no-op `unmountOnBlur`', { appTsxLine: line >= 0 ? line + 1 : null, mostHiddenScreensMounted: maxHidden, hiddenMountedExposed: allReports.reduce((n, r) => n + r.summary.hiddenMounted, 0) });

  // RN-web Switch 52×26 (set by switchThumbProps; react-native-web's own default is 40×20) (web-harness, §0.3): reported, not asserted — native UISwitch is 51×31.
  const webSwitches = new Set(allReports.flatMap((r) => r.interactive.filter((i) => i.domRole === 'switch' && i.small44 && !i.disabled).map((i) => `${i.axName} ${i.rect.w}×${i.rect.h}`)));
  // The accepted exception is exactly RN-web's own 52×26 Switch box; any other "switch" under 44 is not it.
  check('E-006', 'roll-up', [...webSwitches].every((x) => /52×26$/.test(x)), 'RN-web Switch boxes under 44 pt are exactly the 52×26 web Switch (≥ the 24×24 floor) (native UISwitch 51×31 — §0.3)', { count: webSwitches.size, sample: [...webSwitches].slice(0, 8) });
  const nonSwitchSmallNative = new Set(allReports.flatMap((r) => r.interactive.filter((i) => i.small44Native && !i.disabled && i.domRole !== 'switch').map((i) => `${r.layout.viewport.w}w ${i.axRole} "${i.axName || i.text}" ${i.rect.w}×${i.rect.h}`)));
  // The plan's 44×44 (not the 24 px floor above): every non-Switch target, hitSlop included, must
  // reach it. Switches are the accepted web-harness exception above (native UISwitch 51×31).
  check('E-006', 'roll-up', nonSwitchSmallNative.size === 0, 'no non-Switch interactive target under 44×44 pt even with its hitSlop (small44Native)', { count: nonSwitchSmallNative.size, sample: [...nonSwitchSmallNative].slice(0, 25) });
});
