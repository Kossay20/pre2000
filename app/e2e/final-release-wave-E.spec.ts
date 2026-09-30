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
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-0-dryrun/wave-E \
 *   timeout 900 npx playwright test e2e/final-release-wave-E.spec.ts --reporter=list
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
  createAccount,
  newAccountEmail,
  seedProfile,
  serverQuery,
  uiLogin,
  type AppLocale,
  type CreatedAccount,
} from './helpers/emulator-account';
import {
  ctaFold,
  enlargeText,
  focusOrderViolations,
  focusWalk,
  liveRegions,
  measureA11y,
  modalProbe,
  styleFingerprint,
  tabletColumnProbe,
  writeA11yJson,
  type A11yReport,
} from './helpers/wave-E-a11y';

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
test.use({ timezoneId: 'Europe/Paris', storageState: { cookies: [], origins: [] } });

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

  await c.mega.snap(state);
  const report = await measureA11y(page, state, { planRow, ctaFold: fold, ...(opts.extra || {}) });
  writeA11yJson(OUT_DIRS, state, report);

  const L = report.layout;
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

const ARTICLE_PATH = `/article/${encodeURIComponent('a01_symptômes_de_grossesse')}`;

const SIGNED_IN_FR: Surface[] = [
  { slug: 'home', path: '/', ready: (p) => p.getByText('Semaine 32', { exact: true }).first(), cta: (p) => p.getByTestId('home_quick_add_appointment'), tabBar: true },
  { slug: 'calendar', path: '/calendar', ready: (p) => p.getByRole('button', { name: 'Mois', exact: true }), cta: (p) => p.getByRole('button', { name: 'Ajouter un rendez-vous' }), tabBar: true },
  { slug: 'appointment-add', path: '/appointment/add', ready: (p) => p.getByPlaceholder(/Échographie/), cta: (p) => p.getByRole('button', { name: 'Enregistrer les modifications' }) },
  { slug: 'reminders', path: '/reminders', ready: (p) => p.getByRole('tab', { name: 'Tâches' }).first(), cta: (p) => p.getByRole('switch').first(), tabBar: true },
  { slug: 'statistics', path: '/statistics', ready: (p) => p.getByTestId('statistics_screen_root'), cta: (p) => p.getByRole('button', { name: /Aller aux tâches|tâches/i }) },
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
        .map((i) => ({ key: `${r.layout.viewport.w}|${i.axRole}|${i.axName || i.text}|${i.rect.w}x${i.rect.h}`, state: r.state, item: { viewportW: r.layout.viewport.w, axRole: i.axRole, name: i.axName || i.text, w: i.rect.w, h: i.rect.h, below24: i.below24 } })),
    ),
  );
  const contrastFails = dedupe(
    allReports.flatMap((r) =>
      r.contrast
        .filter((s) => s.pass === false)
        .map((s) => ({ key: `${s.text}|${s.fg}|${s.bg}|${s.fontSize}`, state: r.state, item: { text: s.text, fg: s.fg, bg: s.bg, ratio: s.ratio, threshold: s.threshold, fontSize: s.fontSize, fontWeight: s.fontWeight, disabled: s.disabled, placeholder: !!s.placeholder, path: s.path } })),
    ),
  );
  const out = {
    generated: new Date().toISOString(),
    baseUrl: E2E_BASE_URL,
    readerAccount: { uid: reader?.uid, email: reader?.email },
    method: {
      names: 'Chromium AX tree via CDP Accessibility.getPartialAXTree per interactive element',
      targets: 'getBoundingClientRect CSS px; small44 = w<44 || h<44 (Apple HIG / plan), below24 = WCAG 2.5.8 floor (spacing exception NOT evaluated)',
      contrast: 'computed color/background-color/opacity along the ancestor chain, exact normal-blend composition over white; a CSS linear-gradient is evaluated at the text position (worst of 3 points across the text box); url() background → indeterminate; WCAG large = ≥24px or ≥18.66px & ≥700',
      interactiveSelector: 'button, a[href], input, textarea, select, [role=button|link|checkbox|switch|tab|radio|menuitem|slider], [tabindex="0"] — visible only, and not on a layer painted over (inactive tab kept mounted, page under a modal scrim: summary.covered)',
      counts: 'unnamed = empty Chromium AX name; unnamedNoText = unnamed AND no visible text (truly nameless); rolelessWithText = role-less tabindex div showing text; small44Native = small44 re-evaluated on the box grown by the pressable\'s hitSlop prop (RN-web does not render hitSlop)',
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
    await snapState(c, '02-se-auth', 'E 01-15', { cta: page.getByTestId('auth_signup_button') });

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
    for (const s of SIGNED_IN_FR) {
      await go(page, s.path, s.ready?.(page));
      const state = `${nn()}-se-${s.slug}`;
      if (s.slug === 'home') {
        // Home tool-card grid: no overlapping cards (checked by layout.overlaps) — soft here
        const r = await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar });
        expect.soft(r.layout.overlaps, `${state}: overlapping interactive elements`).toEqual([]);
      } else {
        await snapState(c, state, 'E 01-15', { cta: s.cta?.(page), expectTabBar: s.tabBar });
      }
      if (s.slug === 'calendar') {
        await page.getByRole('button', { name: 'Mois', exact: true }).click();
        await settle(page, 800);
        await snapState(c, `${nn()}-se-calendar-month`, 'E 01-15', { cta: s.cta?.(page), expectTabBar: true });
      }
      if (s.slug === 'reminders') {
        // top tabs: the bottom tab bar has the same names → second tablist
        const tasksTab = page.getByRole('tab', { name: 'Tâches' }).last();
        await tasksTab.click();
        await settle(page, 800);
        await snapState(c, `${nn()}-se-tasks`, 'E 01-15', { cta: page.getByRole('button', { name: /Nouvelle tâche/ }), expectTabBar: true });
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
    const col = await tabletColumnProbe(page);
    await snapState(c, '32-ipad-land-home', 'E 21-23', { cta: page.getByTestId('home_quick_add_appointment'), expectTabBar: true, extra: { tabletColumn: col } });
    expect.soft(col.centered, `32-ipad-land-home: column not centred ${JSON.stringify(col.column)}`).toBe(true);

    await go(page, '/calendar', page.getByRole('button', { name: 'Mois', exact: true }));
    await page.getByRole('button', { name: 'Mois', exact: true }).click();
    await settle(page, 800);
    await snapState(c, '33-ipad-land-calendar-month', 'E 21-23', { cta: page.getByRole('button', { name: 'Ajouter un rendez-vous' }), expectTabBar: true, extra: { tabletColumn: await tabletColumnProbe(page) } });

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
    const r1 = await snapState(c, '35-scale-home', 'E 24-27', { cta: page.getByTestId('home_quick_add_appointment'), expectTabBar: true });
    expect.soft(r1.layout.overlaps, '35-scale-home: overlapping controls').toEqual([]);
    expect.soft(r1.layout.clippedLabels.filter((l) => !l.intentionalTruncation), '35-scale-home: clipped button text').toEqual([]);

    await go(page, '/appointment/add', page.getByPlaceholder(/Échographie/));
    const r2 = await snapState(c, '36-scale-appointment-add', 'E 24-27', { cta: page.getByRole('button', { name: 'Enregistrer les modifications' }) });
    expect.soft(r2.layout.overlaps, '36-scale-appointment-add: overlapping controls').toEqual([]);
    expect.soft(r2.layout.clippedLabels.filter((l) => !l.intentionalTruncation), '36-scale-appointment-add: clipped button text').toEqual([]);

    await go(page, '/profile');
    const r3 = await snapState(c, '37-scale-profile', 'E 24-27', { cta: page.getByRole('button', { name: 'Enregistrer les modifications' }) });
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
      await snapState(cold, state, 'E 31', { extra: { focusSteps: steps, violations, noIndicator } });
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
    const bannerSeen = await banner.first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false);
    expect.soft(bannerSeen, '45-offline-home: OfflineNotice (role=alert "Pas de connexion") not shown within 20 s of going offline').toBe(true);
    await snapState(c, '45-offline-home', 'E 33', { expectTabBar: true, extra: { bannerSeen, liveRegions: await liveRegions(page) } });

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
    await settle(page, 5000);
    const afterSave = {
      url: page.url(),
      stillOnForm: await page.getByPlaceholder(/Échographie/).isVisible().catch(() => false),
      dialogs: c.dialogs.messages(),
      liveRegions: await liveRegions(page),
      spinner: await page.locator('[role=progressbar]').count(),
    };
    const serverWhileOffline = await serverQuery('userEvents', 'user_id', acct.uid);
    expect(serverWhileOffline.some((d) => d.data.title === title), 'HARNESS: the offline write reached the server — offline emulation is leaking').toBe(false);
    await snapState(c, '46-offline-add-appointment', 'E 33', { extra: { afterSave, serverDocsWhileOffline: serverWhileOffline.length } });

    // Reconnect
    await context.unroute(/127\.0\.0\.1:(8080|9099)|localhost:(8080|9099)/, blockEmulators);
    await context.setOffline(false);
    const bannerGone = await banner.first().waitFor({ state: 'hidden', timeout: 30_000 }).then(() => true, () => false);
    expect.soft(bannerGone, '47-reconnect: OfflineNotice still visible 30 s after reconnect').toBe(true);
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
    await snapState(c, '47-reconnect', 'E 34', { expectTabBar: true, extra: { bannerGone, synced, uiClaimedSuccess, toastLive, formClosedAfterReconnect: !(await page.getByPlaceholder(/Échographie/).isVisible().catch(() => false)), serverDocs: serverDocs.map((d) => ({ id: d.id, title: d.data.title, start: d.data.startDate ?? d.data.date })) } });
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
    await snapState(c, '49-ar-se-home', 'E 35-36', { cta: page.getByTestId('home_quick_add_appointment'), expectTabBar: true, extra: { rtl: await rtlCheck('49-ar-se-home') } });
    await go(page, '/calendar');
    await snapState(c, '50-ar-se-calendar', 'E 35-36', { expectTabBar: true, extra: { rtl: await rtlCheck('50-ar-se-calendar') } });
    await go(page, '/chatbot', page.getByRole('textbox').first());
    await snapState(c, '51-ar-se-chatbot', 'E 35-36', { cta: page.getByRole('textbox').first(), expectTabBar: true, extra: { rtl: await rtlCheck('51-ar-se-chatbot') } });
    await go(page, '/profile');
    await snapState(c, '52-ar-se-profile', 'E 35-36', { extra: { rtl: await rtlCheck('52-ar-se-profile') } });
    await go(page, '/reminders');
    await snapState(c, '53-ar-se-reminders', 'E 35-36', { expectTabBar: true, extra: { rtl: await rtlCheck('53-ar-se-reminders') } });
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
      await go(page, sf.path, sf.ready?.(page));
      const r = await snapState(c, state, 'E Slide Over', { cta: sf.cta?.(page), expectTabBar: sf.tabBar });
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
      await go(page, sf.path, sf.ready?.(page));
      const scaled = await enlargeText(page, 1.4);
      await settle(page, 400);
      const r = await snapState(c, state, 'E text-scale', { cta: sf.cta?.(page), expectTabBar: sf.tabBar, extra: { textScaled: scaled, factor: 1.4 } });
      expect.soft(r.layout.clippedLabels.filter((l) => !l.intentionalTruncation), `${state}: clipped button text at text ×1.4`).toEqual([]);
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
});
