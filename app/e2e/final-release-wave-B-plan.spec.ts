/**
 * Wave B — B-plan half + timezone flush (AUDIT_PLAN final-release-2026-09-30 §3, §8 SYNC-1/2/3/4/9).
 * Signed-in daily loop at week 32: Home, Calendar, appointments (add/edit/delete),
 * Reminders, Tasks, Statistics — proven against the emulator server truth AND a
 * fresh browser context. Requires the emulator stack (`bash e2e/emulator-stack.sh status`).
 *
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-B \
 *   timeout 1500 npx playwright test e2e/final-release-wave-B-plan.spec.ts --reporter=list
 *
 * Round 4: every quartet is taken on the surface under test once it has stopped moving
 * (helpers snap → settleVisual); cross-surface states are split into one quartet per surface.
 *
 * App-behaviour checks are expect.soft (a real bug is the point — record it);
 * harness steps are hard. A state whose navigation cannot complete is recorded as a
 * soft "state aborted" failure and the wave continues (helpers/wave-B-helpers.ts).
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  E2E_PASSWORD,
  freshContextLogin,
  serverDoc,
  serverQuery,
  uiLogin,
  waveUse,
  type CreatedAccount,
} from './helpers/emulator-account';
import {
  Observations,
  bodyText,
  bottomTab,
  fold,
  homeMyDay,
  instrument,
  laterTodayHHMM,
  localDay,
  localIso,
  newWeek32Account,
  poll,
  relDay,
  remindersTopTab,
  serverCollectionCount,
  state,
  userWrite,
  vis,
  type Instrumented,
  type LocalDay,
} from './helpers/wave-B-helpers';

test.use({ ...waveUse('fr'), actionTimeout: 15_000, navigationTimeout: 45_000 });

const APPT = 'Échographie T3 E2E';
const APPT_TODAY = 'RDV du jour E2E';
const TASK = 'Vitamines E2E';
const LOCATION = 'Clinique E2E';
const NOTES = 'Notes E2E initiales';
const VITAMINS = 'Vitamines prénatales';

// ── Shared steps ──────────────────────────────────────────────────────────────

/** Due date = calendar day of the stored LMP + 280 days, identical in every timezone. */
function canonicalDpa(lmpIso: string): string {
  const d = new Date(lmpIso);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 280));
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc);
}

/** Profile → the line under "Date Prévue d'Accouchement (DPA)". */
async function profileDpaText(page: Page): Promise<string | null> {
  const t = await bodyText(page);
  return t.match(/Date Prévue d'Accouchement \(DPA\)\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? null;
}

async function expectHomeWeek(page: Page, week: number) {
  // "Semaine N" alone is ambiguous (Health header shows it too) → require a Home-only control.
  await expect(page.getByTestId('home_quick_add_appointment').filter({ visible: true }), 'Home root is displayed').toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(vis(page.getByText(`Semaine ${week}`, { exact: true })), `Home shows "Semaine ${week}"`).toBeVisible({
    timeout: 30_000,
  });
}

/** Home tab ROOT: a second press on the focused tab pops HomeStack (e.g. Health) to top. */
async function goHome(page: Page) {
  await bottomTab(page, 'Accueil');
  await page.waitForTimeout(400);
  if (!(await page.getByTestId('home_quick_add_appointment').filter({ visible: true }).count())) {
    await bottomTab(page, 'Accueil');
    await page.waitForTimeout(400);
  }
  // A deep-linked stack screen (e.g. /health) is mounted as the ONLY route of HomeStack:
  // no back arrow and the Home tab cannot reach HomeMain. Reload the root instead.
  if (!(await page.getByTestId('home_quick_add_appointment').filter({ visible: true }).count())) {
    await page.goto('/', { waitUntil: 'load' });
  }
}

/** Week-view day button: a11y label = format(date,'EEEE d MMMM', fr) (WeeklyStrip.tsx). */
async function selectWeekDay(page: Page, day: LocalDay) {
  const btn = vis(page.getByRole('button', { name: `${day.weekdayLong} ${day.d} ${day.monthLong}`, exact: true }));
  await expect(btn, `week strip day ${day.key}`).toBeVisible({ timeout: 20_000 });
  await btn.click();
}

async function openCalendar(page: Page) {
  await bottomTab(page, 'Calendrier');
  await expect(vis(page.getByText(/^Semaine \d+ de grossesse$/)), 'Calendar header').toBeVisible({ timeout: 30_000 });
}

async function calendarWeekLabel(page: Page): Promise<number | null> {
  const m = (await bodyText(page)).match(/Semaine (\d+) de grossesse/);
  return m ? Number(m[1]) : null;
}

async function openAppointmentFormFromFab(page: Page) {
  await vis(page.getByRole('button', { name: 'Ajouter un rendez-vous', exact: true })).click();
  await expect(vis(page.getByText('Nouveau Rendez-vous', { exact: true })), 'AddAppointment (create)').toBeVisible({
    timeout: 20_000,
  });
}

function form(page: Page) {
  return {
    title: vis(page.getByPlaceholder(/Échographie/)),
    date: vis(page.getByPlaceholder('YYYY-MM-DD')),
    time: vis(page.getByPlaceholder('HH:MM')),
    location: vis(page.getByRole('textbox', { name: 'Lieu (optionnel)' })),
    notes: vis(page.getByRole('textbox', { name: 'Notes (optionnel)' })),
    medical: vis(page.getByRole('button', { name: 'Médical', exact: true })),
    personal: vis(page.getByRole('button', { name: 'Personnel', exact: true })),
    save: vis(page.getByRole('button', { name: 'Enregistrer les modifications', exact: true })),
    switches: page.getByRole('switch').filter({ visible: true }),
  };
}

/** Save and wait for the success toast (blurred tab screens stay "visible" in RN-web, so the
 *  form's disappearance is not observable). Returns whether the toast was seen. */
async function saveForm(page: Page): Promise<boolean> {
  await form(page).save.click();
  const text = await poll(() => bodyText(page), (t) => /Rendez-vous (ajouté|modifié) !/.test(t), 10_000);
  await page.waitForTimeout(800);
  return /Rendez-vous (ajouté|modifié) !/.test(text);
}

/** Read "À venir"/"Passés" counters on the Health dashboard (leaves the page on Health). */
async function healthAppointmentCounts(page: Page): Promise<{ upcoming: number | null; past: number | null }> {
  await page.goto('/health', { waitUntil: 'load' });
  await expect(vis(page.getByText('À venir', { exact: true })), 'Health dashboard loaded').toBeVisible({ timeout: 30_000 });
  const re = /(\d+)\s*\n\s*À venir\s*\n\s*(\d+)\s*\n\s*Passés/;
  const m = (await poll(() => bodyText(page), (t) => re.test(t), 10_000)).match(re);
  await vis(page.getByText('À venir', { exact: true })).scrollIntoViewIfNeeded();
  return m ? { upcoming: Number(m[1]), past: Number(m[2]) } : { upcoming: null, past: null };
}

// ── B-006: the Calendar strip and Home must count the same seven days ─────────

type HomeWeek = { dayOfPregnancy: number | null; week: number | null; dayInWeek: number | null; start: LocalDay | null };

/**
 * Home prints "Jour N" (day of pregnancy, 1-based). Day 1 of the week Home shows is
 * therefore local today − ((N−1) mod 7) days. Read on Home at the real week only.
 */
async function homeWeekStart(page: Page): Promise<HomeWeek> {
  const t = await poll(() => bodyText(page), (x) => /Jour \d+(?!\s*\/)/.test(x), 10_000);
  const n = Number(t.match(/Jour (\d+)(?!\s*\/)/)?.[1] ?? NaN);
  if (!Number.isFinite(n)) return { dayOfPregnancy: null, week: null, dayInWeek: null, start: null };
  const dayInWeek = ((n - 1) % 7) + 1;
  return { dayOfPregnancy: n, week: Math.floor((n - 1) / 7) + 1, dayInWeek, start: await localDay(page, -(dayInWeek - 1)) };
}

/** a11y labels of the visible week-strip day buttons, in DOM order ("jeudi 01 octobre"). */
async function stripDays(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const re = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{2} \S+$/;
    return [...document.querySelectorAll('[aria-label]')]
      .filter((e) => re.test(e.getAttribute('aria-label') || '') && (e as HTMLElement).offsetParent !== null)
      .map((e) => e.getAttribute('aria-label') as string);
  });
}

const dayLabel = (d: LocalDay) => `${d.weekdayLong} ${d.d} ${d.monthLong}`;
const lmpWeekday = (lmpIso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(lmpIso));

/**
 * On the Calendar as it OPENS (no tap on "Aujourd'hui"): the header week is Home's week,
 * the strip holds today, and its first day is the day Home counts as day 1 of that week —
 * the LMP's weekday — in the page's timezone.
 */
async function assertStripMatchesHome(page: Page, obs: Observations, stateName: string, hw: HomeWeek, lmpIso: string, today: LocalDay, tz: string) {
  const label = await calendarWeekLabel(page);
  const days = await poll(() => stripDays(page), (d) => d.length >= 7, 10_000);
  const expectedFirst = hw.start ? dayLabel(hw.start) : null;
  const todayInStrip = days.includes(dayLabel(today));
  expect.soft(label, `${stateName}: Calendar opens on Home's week (${hw.week})`).toBe(hw.week);
  expect.soft(days.length, `${stateName}: the strip shows 7 days (${days.join(' | ')})`).toBe(7);
  expect.soft(todayInStrip, `${stateName}: Calendar opens on the week holding today (${dayLabel(today)}) — strip: ${days.join(' | ')}`).toBe(true);
  expect.soft(days[0] ?? null, `${stateName}: strip day 1 = Home's day 1 of week ${hw.week} (${tz})`).toBe(expectedFirst);
  expect.soft(days[0]?.split(' ')[0] ?? null, `${stateName}: strip starts on the LMP weekday (${tz})`).toBe(lmpWeekday(lmpIso));
  const ok = label === hw.week && days.length === 7 && todayInStrip && days[0] === expectedFirst && days[0]?.split(' ')[0] === lmpWeekday(lmpIso);
  obs.add('B-006-STRIP', ok ? 'PASS' : 'FAIL', stateName, {
    tz,
    lmp: lmpIso,
    lmpWeekday: lmpWeekday(lmpIso),
    homeDayOfPregnancy: hw.dayOfPregnancy,
    homeWeek: hw.week,
    homeDayInWeek: hw.dayInWeek,
    homeDay1: expectedFirst,
    calendarWeekLabel: label,
    strip: days,
    today: dayLabel(today),
  });
  return { label, days };
}

// ── B-008: one "Ma Journée" list for Home and Tasks ───────────────────────────

type TasksMyDay = {
  total: number;
  done: number;
  percent: number | null;
  remaining: number | null;
  allDone: boolean;
  titles: string[];
  titleLeft: number;
  dateText: string | null;
  cards: Array<{ left: number; right: number }>;
  viewport: number;
};

/** The Tasks tab's "Ma Journée" section as rendered: its checkboxes, percentage, footer and geometry. */
async function tasksMyDay(page: Page): Promise<TasksMyDay | null> {
  return page.evaluate(() => {
    const shown = (e: Element) => (e as HTMLElement).offsetParent !== null;
    const title = [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && d.textContent === 'Ma Journée' && shown(d));
    let root: HTMLElement | null = title?.parentElement ?? null;
    while (root && !root.querySelector('[role="checkbox"]')) root = root.parentElement;
    if (!title || !root) return null;
    const boxes = [...root.querySelectorAll('[role="checkbox"]')].filter(shown);
    const text = (root.innerText || '').replace(/[  ]/g, ' ');
    const pct = text.match(/(\d+)%/);
    const rem = text.match(/(\d+) tâches? restantes?/);
    const date = title.nextElementSibling as HTMLElement | null;
    return {
      total: boxes.length,
      done: boxes.filter((b) => b.getAttribute('aria-checked') === 'true').length,
      percent: pct ? Number(pct[1]) : null,
      remaining: rem ? Number(rem[1]) : null,
      allDone: /Tout est fait/.test(text),
      titles: boxes.map((b) => b.getAttribute('aria-label') || ''),
      titleLeft: Math.round(title.getBoundingClientRect().left),
      dateText: date ? (date.textContent || '').trim() : null,
      cards: boxes.map((b) => {
        const r = (b.parentElement as HTMLElement).getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right) };
      }),
      viewport: window.innerWidth,
    };
  });
}

/** Home → the "Ma Journée x/y" pill once Home has reloaded it on focus. */
async function homePill(page: Page) {
  await goHome(page);
  await expectHomeWeek(page, 32);
  return poll(() => homeMyDay(page), (v) => v !== null, 12_000);
}

/** B-008 comparison: the pill and the Tasks section must print the same done/total, and Tasks must be self-consistent. */
function assertSameMyDay(obs: Observations, stateName: string, when: string, home: { done: number; total: number } | null, tasks: TasksMyDay | null) {
  const tasksPair = tasks ? { done: tasks.done, total: tasks.total } : null;
  expect.soft(home, `${stateName}: Home "Ma Journée x/y" = Tasks done/total (${when}) — Tasks lists ${JSON.stringify(tasks?.titles)}`).toEqual(tasksPair);
  if (tasks) {
    expect.soft(tasks.percent, `${stateName}: Tasks percentage = round(done/total) (${when})`).toBe(tasks.total ? Math.round((tasks.done / tasks.total) * 100) : 0);
    if (!tasks.allDone) expect.soft(tasks.remaining, `${stateName}: Tasks "N tâche(s) restante(s)" = total − done (${when})`).toBe(tasks.total - tasks.done);
  }
  const agree = !!home && !!tasks && home.done === tasks.done && home.total === tasks.total;
  obs.add('B-008-MYDAY', agree ? 'PASS' : 'FAIL', stateName, { when, home, tasks: tasks && { done: tasks.done, total: tasks.total, percent: tasks.percent, remaining: tasks.remaining, titles: tasks.titles } });
  return agree;
}

/** SYNC-4: every surface's week/trimester/DPA/month in the page's timezone, one quartet per surface. Ends on Profile (DPA in view). */
async function sync4Surfaces(h: Instrumented, obs: Observations, stateName: string, acct: CreatedAccount, tz: string) {
  const page = h.page;
  const out: Record<string, unknown> = {};
  const prof = await serverDoc(`userProfiles/${acct.uid}`);
  const lmp = String(prof?.lmp);
  const today = await localDay(page, 0);
  // Home
  await goHome(page);
  await expectHomeWeek(page, 32);
  const home = await bodyText(page);
  out.homeWeek = home.match(/Semaine (\d+)\n/)?.[1] ?? null;
  out.homeTrimester = home.match(/(\dème) Trimestre/)?.[1] ?? null;
  const hw = await homeWeekStart(page);
  out.homeDayOfPregnancy = hw.dayOfPregnancy;
  await h.snap(`${stateName}.1-home`);
  // Calendar, as it opens
  await openCalendar(page);
  const strip = await assertStripMatchesHome(page, obs, stateName, hw, lmp, today, tz);
  out.calendarWeek = strip.label;
  out.calendarStrip = strip.days;
  await h.snap(`${stateName}.2-calendar`);
  await vis(page.getByRole('button', { name: "Aujourd'hui", exact: true })).click();
  await page.waitForTimeout(500);
  out.calendarWeekAfterToday = await calendarWeekLabel(page);
  out.calendarStripAfterToday = await stripDays(page);
  // Reminders header
  await bottomTab(page, 'Rappels');
  await remindersTopTab(page, 'Rappels');
  await expect(vis(page.getByText('Mes Rappels', { exact: true })), 'Reminders header').toBeVisible({ timeout: 30_000 });
  const rem = (await bodyText(page)).match(/Semaine (\d+) • (\S+) Trimestre/);
  out.remindersWeek = rem?.[1] ?? null;
  out.remindersTrimester = rem?.[2] ?? null;
  await h.snap(`${stateName}.3-reminders`);
  // WeekRecommendations, BabyEvolution, Kick guidance, Profile DPA (stack screens → deep links)
  await page.goto('/recommendations', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  out.recommendationsWeekMentions = [...new Set(((await bodyText(page)).match(/Semaine \d+/g) || []))];
  await h.snap(`${stateName}.4-recommendations`);
  await page.goto('/baby-evolution', { waitUntil: 'load' });
  const badge = vis(page.getByText('📍 Vous êtes ici', { exact: true }));
  await expect(badge, 'BabyEvolution current badge').toBeVisible({ timeout: 30_000 });
  out.babyEvolutionMonth = await page.evaluate(() => {
    const b = [...document.querySelectorAll('div')].find(
      (d) => d.textContent === '📍 Vous êtes ici' && (d as HTMLElement).offsetParent !== null,
    );
    const header = b?.parentElement?.parentElement;
    return header?.textContent?.match(/Mois (\d+)/)?.[1] ?? null;
  });
  await badge.scrollIntoViewIfNeeded();
  await h.snap(`${stateName}.5-baby-evolution`);
  await page.goto('/kick-counter', { waitUntil: 'load' });
  const tip = vis(page.getByText('💡 Conseil', { exact: true }));
  await expect(tip, 'Kick guidance card').toBeVisible({ timeout: 30_000 });
  out.kickGuidance28 = (await bodyText(page)).includes('À partir de 28 semaines, comptez 10 mouvements');
  await tip.scrollIntoViewIfNeeded();
  await h.snap(`${stateName}.6-kick`);
  await page.goto('/profile', { waitUntil: 'load' });
  const dpaLabel = vis(page.getByText("Date Prévue d'Accouchement (DPA)", { exact: true }));
  await expect(dpaLabel, 'Profile DPA').toBeVisible({ timeout: 30_000 });
  const expectedDpa = canonicalDpa(lmp);
  out.profileDpaText = await profileDpaText(page);
  out.expectedDpa = expectedDpa;
  out.serverLmp = lmp;
  // B-021: the DPA line is below the fold — bring it into the quartet.
  await dpaLabel.scrollIntoViewIfNeeded();

  expect.soft(out.homeWeek, `${stateName}: Home week`).toBe('32');
  expect.soft(out.homeTrimester, `${stateName}: Home trimester`).toBe('3ème');
  expect.soft(out.calendarWeek, `${stateName}: Calendar week on open`).toBe(32);
  expect.soft(out.calendarWeekAfterToday, `${stateName}: Calendar week after "Aujourd'hui"`).toBe(32);
  expect.soft(out.calendarStripAfterToday, `${stateName}: "Aujourd'hui" keeps the same seven days`).toEqual(out.calendarStrip);
  expect.soft(out.remindersWeek, `${stateName}: Reminders week`).toBe('32');
  expect.soft(out.remindersTrimester, `${stateName}: Reminders trimester uses the same label as Home`).toBe(out.homeTrimester);
  expect.soft(out.babyEvolutionMonth, `${stateName}: BabyEvolution month`).toBe('8');
  expect.soft(out.kickGuidance28, `${stateName}: Kick ≥28w guidance`).toBe(true);
  expect.soft(out.profileDpaText, `${stateName}: Profile DPA = LMP calendar day + 280 (${expectedDpa}), timezone-independent`).toBe(expectedDpa);
  const consistent =
    out.homeWeek === '32' && out.calendarWeek === 32 && out.calendarWeekAfterToday === 32 && out.remindersWeek === '32' &&
    out.babyEvolutionMonth === '8' && out.remindersTrimester === out.homeTrimester && out.homeTrimester === '3ème' && out.profileDpaText === expectedDpa;
  obs.add('SYNC-4', consistent ? 'PASS' : 'FAIL', stateName, out);
}

function settleObs(obs: Observations, where: string, ...hs: Instrumented[]) {
  const unsettled = hs.flatMap((x) => x.unsettled);
  obs.add('SNAP-SETTLE', unsettled.length ? 'FAIL' : 'PASS', where, { unsettled });
}

// ══════════════════════════════════════════════════════════════════════════════
// B-plan: states 01–13, 15–21 on one account (Europe/Paris)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Wave B — B-plan (Europe/Paris)', () => {
  test('B-plan: Home · Calendar · appointments · Reminders · Tasks · Statistics · fresh context', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const obs = new Observations('wave-B-plan-observations.json', testInfo);
    const acct = await newWeek32Account('plan');
    const lmp = String((await serverDoc(`userProfiles/${acct.uid}`))?.lmp);
    const h = instrument(page, testInfo);
    const today = { key: '' } as LocalDay;
    let plus2 = { key: '' } as LocalDay;
    let hw: HomeWeek = { dayOfPregnancy: null, week: null, dayInWeek: null, start: null };
    let todayApptHHMM: string | null = null;
    let todayApptCreated = false;
    let tasksAfter: TasksMyDay | null = null;

    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      Object.assign(today, await localDay(page, 0));
      plus2 = await localDay(page, 2);

      // 01 ── Home at week 32
      await state(h, '01-home-week32', async () => {
        await expectHomeWeek(page, 32);
        await expect.soft(vis(page.getByText('3ème Trimestre', { exact: true })), '01: trimester').toBeVisible();
        for (const card of ['Compteur de coups de bébé', 'Minuteur de contractions', 'Valise de maternité', 'Rappels', 'Calendrier', 'Mon Poids']) {
          await expect.soft(vis(page.getByRole('button', { name: card, exact: true })), `01: tool card "${card}"`).toBeVisible();
        }
        await expect.soft(page.getByText('Bienvenue dans votre espace 🌸'), '01: no welcome overlay').toHaveCount(0);
        hw = await homeWeekStart(page);
        expect.soft(hw.week, '01: Home "Jour N" is a day of week 32').toBe(32);
      });

      // 02 ── Week navigation (time machine): quartet taken AT week 27
      await state(h, '02-home-week-nav', async () => {
        const prev = vis(page.getByRole('button', { name: 'Semaine précédente', exact: true }));
        for (let i = 0; i < 5; i++) await prev.click();
        await expectHomeWeek(page, 27);
        await expect.soft(vis(page.getByText('2ème Trimestre', { exact: true })), '02: week 27 → T2').toBeVisible();
        const kick = await vis(page.getByRole('button', { name: 'Compteur de coups de bébé', exact: true })).isVisible();
        const contraction = await page.getByRole('button', { name: 'Minuteur de contractions', exact: true }).filter({ visible: true }).count();
        const bag = await page.getByRole('button', { name: 'Valise de maternité', exact: true }).filter({ visible: true }).count();
        obs.add('HOME-WEEKNAV-GATE', contraction > 0 && bag > 0 ? 'PASS' : 'FAIL', '02-home-week-nav', {
          previewedWeek: 27,
          kickVisible: kick,
          contractionCards: contraction,
          bagCards: bag,
        });
        expect.soft(contraction, '02: previewing week 27 keeps the contraction card (her real week is 32)').toBeGreaterThan(0);
        expect.soft(bag, '02: previewing week 27 keeps the hospital-bag card').toBeGreaterThan(0);
        await expect.soft(page.getByTestId('home_return_to_today'), '02: return-to-today pill').toBeVisible();
      });
      await state(h, '02b-home-return-today', async () => {
        await page.getByTestId('home_return_to_today').click();
        await expectHomeWeek(page, 32);
        await expect.soft(vis(page.getByText('3ème Trimestre', { exact: true })), '02b: back on T3').toBeVisible();
      });

      // 03 ── Calendar week as it opens (B-006, Europe/Paris) + SYNC-4 surfaces
      await state(h, '03-calendar-week', async () => {
        await openCalendar(page);
        await assertStripMatchesHome(page, obs, '03-calendar-week', hw, lmp, today, 'Europe/Paris');
        await vis(page.getByRole('button', { name: "Aujourd'hui", exact: true })).click();
        await page.waitForTimeout(400);
        expect.soft(await calendarWeekLabel(page), '03: after "Aujourd\'hui"').toBe(32);
        const todayBtn = vis(page.getByRole('button', { name: dayLabel(today), exact: true }));
        await expect.soft(todayBtn, '03: today is inside the displayed pregnancy week').toBeVisible();
      });
      await state(h, '03b-sync4-surfaces', async () => {
        await sync4Surfaces(h, obs, '03b-sync4-surfaces', acct, 'Europe/Paris');
      });

      // 04 ── Suggestions (HYP-B1): quartet taken with the section open
      await state(h, '04-calendar-suggestions', async () => {
        await openCalendar(page);
        const templates = await serverCollectionCount('calendarTemplates');
        const btn = vis(page.getByRole('button', { name: /Suggestions/ }));
        await btn.click();
        await page.waitForTimeout(800);
        const expanded = await btn.getAttribute('aria-expanded');
        const text = await bodyText(page);
        const section = /Suggestions pour cette semaine|Suggestions pour ce mois/.test(text);
        const hasCopy = /aucune suggestion|pas de suggestion/i.test(text);
        obs.add('HYP-B1', templates === 0 && !section && !hasCopy ? 'CONFIRMED' : 'REFUTED', '04-calendar-suggestions', {
          calendarTemplatesOnServer: templates,
          ariaExpanded: expanded,
          suggestionsSectionRendered: section,
          emptyStateCopy: hasCopy,
        });
        expect.soft(section || hasCopy, '04: tapping "Suggestions" must show suggestions or an explained empty state').toBe(true);
      });

      // 05 ── Empty appointment form
      await state(h, '05-appt-form-empty', async () => {
        const sugg = vis(page.getByRole('button', { name: /Suggestions/ }));
        if ((await sugg.getAttribute('aria-expanded')) === 'true') await sugg.click();
        await openAppointmentFormFromFab(page);
        const f = form(page);
        await expect.soft(f.save, '05: Save disabled on empty title').toBeDisabled();
        // Toggle chips expose aria-pressed (role=button does not allow aria-selected, E-070).
        await expect.soft(f.medical, '05: new appointment defaults to Médical').toHaveAttribute('aria-pressed', 'true');
        await expect.soft(f.personal, '05: Personnel not selected by default').toHaveAttribute('aria-pressed', 'false');
        // The subtitle follows the selected category (B-002).
        const subtitleMedical = (await bodyText(page)).match(/Ajoutez un rendez-vous (\S+) à votre calendrier/)?.[1] ?? null;
        await f.personal.click();
        const subtitlePersonal = (await bodyText(page)).match(/Ajoutez un rendez-vous (\S+) à votre calendrier/)?.[1] ?? null;
        await f.medical.click();
        expect.soft(subtitleMedical, '05: subtitle with Médical selected').toBe('médical');
        expect.soft(subtitlePersonal, '05: subtitle with Personnel selected').toBe('personnel');
        // The chips now carry a vector icon (an icon-font glyph in the private-use area), not an emoji.
        const rawChips = fold((await f.medical.innerText()) + '|' + (await f.personal.innerText()));
        const chipText = rawChips.replace(/[\uE000-\uF8FF\s]/g, '');
        expect.soft(chipText, '05: chip labels').toBe('Médical|Personnel');
        expect.soft(/\p{Extended_Pictographic}/u.test(rawChips), '05: chips carry no emoji').toBe(false);
        obs.add('APPT-DEFAULT-TYPE', (await f.medical.getAttribute('aria-pressed')) === 'true' && subtitleMedical === 'médical' && subtitlePersonal === 'personnel' ? 'PASS' : 'FAIL', '05-appt-form-empty', {
          medicalSelected: await f.medical.getAttribute('aria-pressed'),
          personalSelected: await f.personal.getAttribute('aria-pressed'),
          subtitleMedical,
          subtitlePersonal,
          chipText,
        });
        expect.soft(await page.locator('input[role="switch"]').filter({ visible: true }).count(), '05: 3 reminder switches').toBe(3);
        for (const [name, on] of [['La veille (8h)', 'true'], ['Le jour J (8h)', 'true'], ['2h avant', 'false']] as const) {
          await expect.soft(vis(page.getByRole('switch', { name, exact: true })), `05: switch ${name}`).toBeChecked({ checked: on === 'true' });
        }
      });

      // 06 ── Impossible date (HYP-B2)
      await state(h, '06-appt-form-invalid-date', async () => {
        const f = form(page);
        const before = await f.date.inputValue();
        await f.date.fill('2026-02-31');
        await page.waitForTimeout(300);
        const after = await f.date.inputValue();
        const readout = (await bodyText(page)).match(/\d{2} \S+ \d{4}/)?.[0] ?? null;
        obs.add('HYP-B2', after === '2026-03-03' ? 'CONFIRMED' : 'REFUTED', '06-appt-form-invalid-date', {
          typed: '2026-02-31',
          valueBefore: before,
          valueAfter: after,
          readout,
        });
        // fill() writes the string verbatim, so the value check alone can never fail: what
        // matters is that the form says so and refuses to save.
        expect.soft(after, '06: 2026-02-31 must be rejected, not rolled over to 2026-03-03').not.toBe('2026-03-03');
        expect.soft(after, '06: the typed impossible date stays as typed').toBe('2026-02-31');
        await expect.soft(vis(page.getByRole('alert').filter({ hasText: 'Date invalide' })), '06: "Date invalide" error is shown').toBeVisible();
        await expect.soft(f.save, '06: Save stays disabled on an invalid date').toBeDisabled();
        await f.save.click({ force: true }).catch(() => undefined);
        await page.waitForTimeout(500);
        expect.soft(/Rendez-vous (ajouté|modifié) !/.test(await bodyText(page)), '06: a forced click on the disabled Save creates nothing').toBe(false);
      });

      // 07 ── Create the appointment (today+2 10:30) → week + month card + server
      const apptIso = await localIso(page, plus2.key, '10:30');
      await state(h, '07-appt-saved', async () => {
        const f = form(page);
        await f.title.fill(APPT);
        await f.date.fill(plus2.key);
        await f.time.fill('10:30');
        await f.medical.click();
        await f.location.fill(LOCATION);
        await f.notes.fill(NOTES);
        await expect.soft(f.save, '07: Save enabled with a title').toBeEnabled();
        expect.soft(await saveForm(page), '07: success toast').toBe(true);
        // Week view card
        await selectWeekDay(page, plus2);
        await expect.soft(vis(page.getByText(APPT, { exact: true })), '07: card in week view').toBeVisible({ timeout: 15_000 });
        await expect.soft(vis(page.getByText(LOCATION, { exact: true })), '07: location on week card').toBeVisible();
        await expect.soft(vis(page.getByText(`💬 ${NOTES}`)), '07: notes on week card').toBeVisible();
        // Month view card (its own quartet)
        await vis(page.getByRole('button', { name: 'Mois', exact: true })).click();
        const monthCard = vis(page.getByText(APPT, { exact: true }));
        await expect.soft(monthCard, '07: card in month view').toBeVisible({ timeout: 15_000 });
        const monthLoc = await page.getByText(LOCATION, { exact: true }).filter({ visible: true }).count();
        obs.add('MONTH-CARD-LOCATION', monthLoc > 0 ? 'PASS' : 'FAIL', '07-appt-saved', { monthViewShowsLocation: monthLoc > 0 });
        if (await monthCard.count()) await monthCard.scrollIntoViewIfNeeded();
        await h.snap('07a-appt-saved-month');
        // Back to the week view: the state's own quartet shows the week card.
        await vis(page.getByRole('button', { name: 'Semaine', exact: true })).click();
        await selectWeekDay(page, plus2);
        await expect.soft(vis(page.getByText(APPT, { exact: true })), '07: card back in week view').toBeVisible({ timeout: 15_000 });
        // Server truth
        const rows = await poll(() => serverQuery('userEvents', 'user_id', acct.uid), (r) => r.length >= 1);
        const mine = rows.filter((r) => r.data.title === APPT);
        expect.soft(mine.length, '07: exactly one server userEvents doc').toBe(1);
        const d = mine[0]?.data ?? {};
        expect.soft(String(d.date).slice(0, 16), '07: server date = local 10:30 of today+2').toBe(apptIso.slice(0, 16));
        expect.soft(String(d.date).slice(16), '07: time stored with seconds/ms zeroed').toBe(':00.000Z');
        expect.soft(d.category, '07: server category').toBe('medical');
        expect.soft(d.type, '07: server type').toBe('appointment');
        expect.soft(d.location, '07: server location').toBe(LOCATION);
        expect.soft(d.notes, '07: server notes').toBe(NOTES);
        expect.soft(d.week, '07: server week').toBe(32);
        const draft = await page.evaluate(() => localStorage.getItem('@pending_appointment_draft'));
        expect.soft(draft, '07: draft key cleared after save').toBeNull();
        obs.add('SYNC-1a', mine.length === 1 && String(d.date).slice(0, 16) === apptIso.slice(0, 16) ? 'PASS' : 'FAIL', '07-appt-saved', { server: d });
      });

      // 08 ── Home upcoming (SYNC-1) + pill; 08b ── Health "À venir"
      // Home upcoming a11y label: format(date, 'd MMMM, HH:mm') — the day is not zero-padded (HomeScreen.tsx).
      const label08 = `${APPT}, ${plus2.d} ${plus2.monthLong}, 10:30`;
      let home08 = false;
      await state(h, '08-home-upcoming', async () => {
        await goHome(page);
        await expectHomeWeek(page, 32);
        const section = vis(page.getByText('📅 Vos prochains rendez-vous'));
        await expect.soft(section, '08: upcoming section').toBeVisible({ timeout: 15_000 });
        const item = vis(page.getByRole('button', { name: label08, exact: true }));
        await expect.soft(item, `08: upcoming item "${label08}"`).toBeVisible();
        home08 = await item.isVisible();
        const rel = hw.start ? await relDay(page, apptIso, hw.start.key) : 'other';
        const expectedPill =
          rel === 'today' ? "Aujourd'hui : 1 rendez-vous !" : rel === 'tomorrow' ? "N'oubliez pas ! 1 rendez-vous demain." : rel === 'thisWeek' ? 'Vous avez 1 rendez-vous prévu cette semaine.' : null;
        // The pill is filled in after Home regains focus.
        const text = await poll(() => bodyText(page), (t) => !expectedPill || t.includes(expectedPill), 8000);
        expect.soft(rel, '08: today+2 is inside the pregnancy week Home shows').toBe('thisWeek');
        if (expectedPill) expect.soft(text.includes(expectedPill), `08: pill "${expectedPill}"`).toBe(true);
        obs.add('HOME-PILL-GRAMMAR', expectedPill && text.includes(expectedPill) ? 'PASS' : 'FAIL', '08-home-upcoming', {
          expectedPill,
          rel,
          pregnancyWeekStart: hw.start?.key ?? null,
          pillLine: text.split('\n').find((l) => /rendez-vous (prévus? cette semaine|demain|!)/.test(l)) ?? null,
        });
        await h.snap('08-home-upcoming.pill');
        if (await section.count()) await section.scrollIntoViewIfNeeded();
      });
      await state(h, '08b-health-upcoming', async () => {
        const counts = await healthAppointmentCounts(page);
        expect.soft(counts.upcoming, '08b: Health "À venir" = 1 (SYNC-1)').toBe(1);
        obs.add('SYNC-1', home08 && counts.upcoming === 1 ? 'PASS' : 'FAIL', '08b-health-upcoming', { homeLabel: label08, homeItemVisible: home08, health: counts });
      });

      // 09 ── Appointment today via Home quick-add → pill + MA JOURNÉE
      await goHome(page);
      todayApptHHMM = await laterTodayHHMM(page, 120);
      await state(h, '09-appt-today', async () => {
        if (!todayApptHHMM) {
          obs.add('SYNC-1-today', 'NOT-REACHED', '09-appt-today', { reason: 'too close to local midnight' });
          return;
        }
        await expectHomeWeek(page, 32);
        await page.getByTestId('home_quick_add_appointment').click();
        await expect(vis(page.getByText('Nouveau Rendez-vous', { exact: true })), '09: quick-add opens the form').toBeVisible({ timeout: 20_000 });
        const f = form(page);
        const prefilled = await f.date.inputValue();
        expect.soft(prefilled, '09: quick-add pre-fills TODAY (LMP-derived date == local today)').toBe(today.key);
        await f.title.fill(APPT_TODAY);
        await f.date.fill(today.key);
        await f.time.fill(todayApptHHMM);
        await f.personal.click();
        expect.soft(await saveForm(page), '09: success toast').toBe(true);
        todayApptCreated = true;
        // Where does the Calendar tab land after a Home quick-add? (stack = [AddAppointment])
        await bottomTab(page, 'Calendrier');
        await page.waitForTimeout(1200);
        const calHeader = await page.getByText(/^Semaine \d+ de grossesse$/).filter({ visible: true }).count();
        const staleForm = await page.getByText('Nouveau Rendez-vous', { exact: true }).filter({ visible: true }).count();
        obs.add('QUICKADD-CALENDAR-TAB', calHeader ? 'PASS' : 'FAIL', '09-appt-today', { calendarHeaderVisible: calHeader > 0, staleFormVisible: staleForm > 0 });
        expect.soft(calHeader, '09: Calendar tab shows the calendar after a Home quick-add').toBeGreaterThan(0);
        await h.snap('09a-calendar-after-quick-add');
        if (!calHeader) await page.goto('/calendar', { waitUntil: 'load' });
        await goHome(page);
        await expectHomeWeek(page, 32);
        const text = await poll(() => bodyText(page), (t) => t.includes("Aujourd'hui : 1 rendez-vous !"), 8000);
        expect.soft(text.includes("Aujourd'hui : 1 rendez-vous !"), '09: Home pill "Aujourd\'hui : 1"').toBe(true);
        await h.snap('09b-home-pill-today');
        await bottomTab(page, 'Rappels');
        await remindersTopTab(page, 'Tâches');
        await expect.soft(vis(page.getByRole('checkbox', { name: APPT_TODAY, exact: true })), '09: MA JOURNÉE lists today\'s appointment').toBeVisible({ timeout: 20_000 });
        const rows = await serverQuery('userEvents', 'user_id', acct.uid);
        const doc = rows.find((r) => r.data.title === APPT_TODAY)?.data;
        expect.soft(String(doc?.date).slice(0, 16), '09: server date = local today at chosen time').toBe((await localIso(page, today.key, todayApptHHMM)).slice(0, 16));
        expect.soft(doc?.category, '09: server category').toBe('other');
      });

      // 10 ── Edit from MONTH view (HYP-B3, HYP-B4, SYNC-2)
      const editedIso = await localIso(page, plus2.key, '11:00');
      await state(h, '10-appt-edit', async () => {
        await openCalendar(page);
        await vis(page.getByRole('button', { name: 'Semaine', exact: true })).click();
        await selectWeekDay(page, plus2);
        await vis(page.getByRole('button', { name: 'Mois', exact: true })).click();
        await expect(vis(page.getByText(APPT, { exact: true })), '10: card in month view').toBeVisible({ timeout: 15_000 });
        await vis(page.getByRole('button', { name: 'Modifier le rendez-vous', exact: true })).click();
        await expect(vis(page.getByText('Modifier le RDV', { exact: true })), '10: edit form').toBeVisible({ timeout: 15_000 });
        const f = form(page);
        const locInForm = await f.location.inputValue();
        const notesInForm = await f.notes.inputValue();
        expect.soft(locInForm, '10: edit form (month view) pre-fills location').toBe(LOCATION);
        await f.time.fill('11:00');
        await f.notes.fill('');
        expect.soft(await saveForm(page), '10: success toast').toBe(true);
        const doc = (
          await poll(
            () => serverQuery('userEvents', 'user_id', acct.uid),
            (r) => r.some((x) => x.data.title === APPT && String(x.data.date).slice(0, 16) === editedIso.slice(0, 16)),
          )
        ).find((r) => r.data.title === APPT)?.data;
        expect.soft(String(doc?.date).slice(0, 16), '10: server time = 11:00').toBe(editedIso.slice(0, 16));
        expect.soft(doc?.location, '10: location preserved on server').toBe(LOCATION);
        expect.soft(doc?.notes, '10: notes cleared on server').toBeUndefined();
        obs.add('HYP-B3', locInForm === '' ? 'CONFIRMED' : 'REFUTED', '10-appt-edit', {
          formLocationFromMonthView: locInForm,
          serverLocationAfterSave: doc?.location ?? null,
        });
        obs.add('HYP-B4', doc?.notes !== undefined ? 'CONFIRMED' : 'REFUTED', '10-appt-edit', {
          notesInForm,
          serverNotesAfterClearing: doc?.notes ?? null,
        });
        // SYNC-2 surfaces
        const monthTime = vis(page.getByText('11:00', { exact: true }));
        await expect.soft(monthTime, '10: month card shows 11:00').toBeVisible({ timeout: 10_000 });
        if (await monthTime.count()) await monthTime.scrollIntoViewIfNeeded();
        await h.snap('10a-calendar-month-edited');
        await goHome(page);
        await expectHomeWeek(page, 32);
        const label = `${APPT}, ${plus2.d} ${plus2.monthLong}, 11:00`;
        const item = vis(page.getByRole('button', { name: label, exact: true }));
        await expect.soft(item, `10: Home shows "${label}"`).toBeVisible({ timeout: 15_000 });
        const homeShows = await item.isVisible();
        if (homeShows) await item.scrollIntoViewIfNeeded();
        obs.add('SYNC-2', String(doc?.date).slice(0, 16) === editedIso.slice(0, 16) && doc?.location === LOCATION && doc?.notes === undefined && homeShows ? 'PASS' : 'FAIL', '10-appt-edit', { server: doc, homeShowsEditedTime: homeShows });
      });

      // 11 ── Reload while editing (HYP-B5): quartet taken on the reloaded form
      await state(h, '11-appt-edit-reload', async () => {
        await openCalendar(page);
        await vis(page.getByRole('button', { name: 'Semaine', exact: true })).click();
        await selectWeekDay(page, plus2);
        await vis(page.getByRole('button', { name: 'Modifier le rendez-vous', exact: true })).click();
        await expect(vis(page.getByText('Modifier le RDV', { exact: true })), '11: edit form').toBeVisible({ timeout: 15_000 });
        const urlBefore = page.url();
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(3000);
        const text = await bodyText(page);
        const isEdit = text.includes('Modifier le RDV');
        const isCreate = text.includes('Nouveau Rendez-vous');
        const titleValue = await page.getByPlaceholder(/Échographie/).filter({ visible: true }).first().inputValue().catch(() => null);
        const intact = isEdit && titleValue === APPT;
        obs.add('HYP-B5', intact ? 'REFUTED' : 'CONFIRMED', '11-appt-edit-reload', {
          urlBefore,
          urlAfter: page.url(),
          header: isEdit ? 'edit' : isCreate ? 'create' : 'neither',
          titleValue,
        });
        expect.soft(isEdit, '11: a reload of the edit form must stay in edit mode (not silently become "create")').toBe(true);
        expect.soft(titleValue, '11: the reloaded edit form still carries the event (title)').toBe(APPT);
      });

      // 13 ── Delete → dismiss the confirm (today appointment stays)
      await state(h, '13-appt-delete-cancel', async () => {
        await page.goto('/calendar', { waitUntil: 'load' });
        await expect(vis(page.getByText(/^Semaine \d+ de grossesse$/)), '13: back on Calendar').toBeVisible({ timeout: 30_000 });
        if (!todayApptCreated) {
          obs.add('13-precondition', 'NOT-REACHED', '13-appt-delete-cancel', { reason: 'today appointment was not created in 09' });
          return;
        }
        await selectWeekDay(page, today);
        await expect(vis(page.getByText(APPT_TODAY, { exact: true })), '13: today card').toBeVisible({ timeout: 15_000 });
        h.dialogs.next('dismiss');
        const n = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Supprimer le rendez-vous', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        expect.soft(h.dialogs.dialogs[n]?.message, '13: delete confirm copy').toContain('supprimer');
        await page.waitForTimeout(800);
        await expect.soft(vis(page.getByText(APPT_TODAY, { exact: true })), '13: card still present after cancel').toBeVisible();
        const rows = await serverQuery('userEvents', 'user_id', acct.uid);
        expect.soft(rows.some((r) => r.data.title === APPT_TODAY), '13: server doc still present').toBe(true);
      });

      // 12 ── Delete → accept (SYNC-3): Calendar, then Home (12b), then Health (12c)
      let serverGone = false;
      let orphan = false;
      let rdvKey: string | null = null;
      await state(h, '12-appt-delete', async () => {
        const before = await serverQuery('userEvents', 'user_id', acct.uid);
        const target = before.find((r) => r.data.title === APPT);
        await selectWeekDay(page, plus2);
        await expect(vis(page.getByText(APPT, { exact: true })), '12: card before delete').toBeVisible({ timeout: 15_000 });
        const n = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Supprimer le rendez-vous', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        await expect.soft(page.getByText(APPT, { exact: true }).filter({ visible: true }), '12: card gone').toHaveCount(0, { timeout: 10_000 });
        const after = await poll(() => serverQuery('userEvents', 'user_id', acct.uid), (r) => !r.some((x) => x.data.title === APPT));
        serverGone = !after.some((r) => r.data.title === APPT);
        expect.soft(serverGone, '12: server doc deleted').toBe(true);
        rdvKey = await page.evaluate(() => localStorage.getItem('@rdv_reminders'));
        orphan = !!(rdvKey && target && rdvKey.includes(target.id));
        expect.soft(orphan, '12: no orphan @rdv_reminders record for the deleted event').toBe(false);
      });
      let homeGone = false;
      await state(h, '12b-home-after-delete', async () => {
        await goHome(page);
        await expectHomeWeek(page, 32);
        await page.waitForTimeout(1500);
        const left = page.getByRole('button', { name: new RegExp(`^${APPT},`) }).filter({ visible: true });
        await expect.soft(left, '12b: gone from Home upcoming').toHaveCount(0);
        homeGone = (await left.count()) === 0;
        const section = vis(page.getByText('📅 Vos prochains rendez-vous'));
        if (await section.count()) await section.scrollIntoViewIfNeeded();
      });
      await state(h, '12c-health-after-delete', async () => {
        const counts = await healthAppointmentCounts(page);
        const expectedUpcoming = todayApptCreated ? 1 : 0;
        expect.soft(counts.upcoming, '12c: Health "À venir" after delete').toBe(expectedUpcoming);
        obs.add('SYNC-3', serverGone && !orphan && homeGone && counts.upcoming === expectedUpcoming ? 'PASS' : 'FAIL', '12c-health-after-delete', {
          serverDocGone: serverGone,
          rdvRemindersKey: rdvKey,
          goneFromHome: homeGone,
          health: counts,
          expectedUpcoming,
        });
      });

      // 15 ── Reminders tab header
      await state(h, '15-reminders-tab', async () => {
        await goHome(page);
        await bottomTab(page, 'Rappels');
        await remindersTopTab(page, 'Rappels');
        await expect(vis(page.getByText('Mes Rappels', { exact: true })), '15: reminders loaded').toBeVisible({ timeout: 30_000 });
        const text = await bodyText(page);
        expect.soft(text.includes('Semaine 32 • 3ème Trimestre'), '15: header "Semaine 32 • 3ème Trimestre"').toBe(true);
        expect.soft(/2ème Trimestre/.test(text), '15: no "2ème Trimestre"').toBe(false);
        const banner = await page.getByRole('button', { name: 'Activez les notifications pour recevoir vos rappels' }).filter({ visible: true }).count();
        const settings = await poll(() => serverQuery('reminder_settings_v2', 'user_id', acct.uid), (r) => r.length >= 3);
        obs.add('REMINDERS-DEFAULTS', settings.length >= 3 ? 'PASS' : 'FAIL', '15-reminders-tab', {
          permissionBannerVisible: banner > 0,
          serverSettings: settings.map((s) => [s.id, s.data.enabled]),
        });
        expect.soft(settings.length, '15: default reminder settings persisted server-side').toBeGreaterThanOrEqual(3);
      });

      // 16 ── Toggle a reminder off (HYP-B7)
      await state(h, '16-reminder-toggle', async () => {
        const sw = vis(page.getByRole('switch', { name: VITAMINS, exact: true }));
        await expect(sw, '16: vitamins switch').toBeVisible({ timeout: 15_000 });
        const before = String(await sw.isChecked());
        await sw.click();
        await expect.soft(sw, '16: switch now off').not.toBeChecked({ timeout: 5000 });
        const doc = await poll(
          () => serverDoc(`reminder_settings_v2/${acct.uid}_rem_med_prenatal_vitamins`),
          (d) => d?.enabled === false,
        );
        expect.soft(doc?.enabled, '16: server reminder_settings_v2 enabled=false').toBe(false);
        obs.add('HYP-B7', doc?.enabled === false ? 'REFUTED' : 'CONFIRMED', '16-reminder-toggle', { ariaBefore: before, ariaAfter: String(await sw.isChecked()), server: doc });
        await sw.scrollIntoViewIfNeeded();
      });

      // 17 ── Create a task (+ B-011 gutters); 17b ── Home pill before completing (B-008)
      let tasksBefore: TasksMyDay | null = null;
      await state(h, '17-task-create', async () => {
        await remindersTopTab(page, 'Tâches');
        await vis(page.getByRole('button', { name: 'Nouvelle tâche', exact: true })).click();
        const input = vis(page.getByPlaceholder('Ex: Acheter des vitamines'));
        await expect(input, '17: task modal').toBeVisible({ timeout: 10_000 });
        await input.fill('Vi');
        await expect.soft(vis(page.locator('[aria-disabled="true"]', { hasText: 'Créer ✓' })), '17: "Créer" disabled under 3 chars').toBeVisible();
        await input.fill(TASK);
        await vis(page.getByText('Créer ✓', { exact: true })).click();
        const box = vis(page.getByRole('checkbox', { name: TASK, exact: true }));
        await expect.soft(box, '17: task in MA JOURNÉE').toBeVisible({ timeout: 15_000 });
        const rows = await poll(() => serverQuery('userTasks', 'user_id', acct.uid), (r) => r.length >= 1);
        expect.soft(rows.filter((r) => r.data.title === TASK).length, '17: one server userTasks doc').toBe(1);
        expect.soft(rows.find((r) => r.data.title === TASK)?.data.completed, '17: server completed=false').toBe(false);
        await page.waitForTimeout(1200);
        tasksBefore = await tasksMyDay(page);
        expect.soft(tasksBefore, '17: Tasks "Ma Journée" section rendered').not.toBeNull();
        if (tasksBefore) {
          // B-011: the section keeps the 16 px gutter of the sections around it; the date is not Title-Cased.
          const t = tasksBefore as TasksMyDay;
          expect.soft(t.titleLeft, '17: "Ma Journée" title is inside a ≥16 px gutter').toBeGreaterThanOrEqual(16);
          expect.soft(Math.min(...t.cards.map((c) => c.left)), '17: cards start inside a ≥16 px gutter').toBeGreaterThanOrEqual(16);
          expect.soft(Math.max(...t.cards.map((c) => c.right)), `17: cards end inside a ≥16 px gutter (viewport ${t.viewport})`).toBeLessThanOrEqual(t.viewport - 16);
          expect.soft(t.dateText ?? '', '17: date reads "Jeudi 1 octobre" (only the first letter capitalised)').toMatch(/^[A-ZÉ][a-zéèêûô]+ \d{1,2} [a-zéèêûô]+$/);
          obs.add('B-011-GUTTER', t.titleLeft >= 16 && Math.min(...t.cards.map((c) => c.left)) >= 16 && Math.max(...t.cards.map((c) => c.right)) <= t.viewport - 16 ? 'PASS' : 'FAIL', '17-task-create', {
            titleLeft: t.titleLeft,
            cards: t.cards,
            viewport: t.viewport,
            dateText: t.dateText,
          });
        }
        if (await box.count()) await box.scrollIntoViewIfNeeded();
      });
      await state(h, '17b-home-myday-before', async () => {
        const home = await homePill(page);
        assertSameMyDay(obs, '17b-home-myday-before', 'before completing', home, tasksBefore);
      });

      // 18 ── Complete the task (SYNC-9); 18b ── Home pill after completing (B-008)
      let serverCompleted = false;
      let aria18: string | null = null;
      await state(h, '18-task-complete', async () => {
        await bottomTab(page, 'Rappels');
        await remindersTopTab(page, 'Tâches');
        const box = vis(page.getByRole('checkbox', { name: TASK, exact: true }));
        await expect(box, '18: task checkbox').toBeVisible({ timeout: 15_000 });
        await box.click();
        await page.waitForTimeout(800);
        aria18 = await box.getAttribute('aria-checked');
        const tick = await box.getByText('✓', { exact: true }).count();
        expect.soft(aria18, '18: checkbox exposes aria-checked=true').toBe('true');
        expect.soft(tick, '18: visual tick').toBeGreaterThan(0);
        const rows = await poll(() => serverQuery('userTasks', 'user_id', acct.uid), (r) => r.some((x) => x.data.title === TASK && x.data.completed === true));
        const doc = rows.find((r) => r.data.title === TASK)?.data;
        serverCompleted = doc?.completed === true;
        expect.soft(doc?.completed, '18: server completed=true').toBe(true);
        tasksAfter = await tasksMyDay(page);
        const tb = tasksBefore as TasksMyDay | null;
        const ta = tasksAfter as TasksMyDay | null;
        expect.soft(ta && tb ? [ta.done, ta.total] : null, '18: Tasks done +1, total unchanged').toEqual(tb ? [tb.done + 1, tb.total] : 'no "Ma Journée" section before');
        await box.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, 0));
      });
      await state(h, '18b-home-myday-after', async () => {
        const home = await homePill(page);
        const agree = assertSameMyDay(obs, '18b-home-myday-after', 'after completing', home, tasksAfter);
        const tb = tasksBefore as TasksMyDay | null;
        expect.soft(home?.done ?? null, '18b: Home "Ma Journée" done +1 on focus').toBe(tb ? tb.done + 1 : 'no "Ma Journée" section before');
        obs.add('SYNC-9a', serverCompleted && aria18 === 'true' && agree ? 'PASS' : 'FAIL', '18b-home-myday-after', { aria: aria18, serverCompleted, home, tasksBefore: tb && [tb.done, tb.total], tasksAfter: tasksAfter && [(tasksAfter as TasksMyDay).done, (tasksAfter as TasksMyDay).total] });
      });

      // 19 ── Home quick "add task" (HYP-B8): quartet taken with the modal open
      await state(h, '19-home-quick-add-task', async () => {
        await expectHomeWeek(page, 32);
        await page.getByTestId('home_quick_add_task').click();
        await page.waitForTimeout(2500);
        const open = await page.getByPlaceholder('Ex: Acheter des vitamines').filter({ visible: true }).count();
        obs.add('HYP-B8', open ? 'REFUTED' : 'CONFIRMED', '19-home-quick-add-task', { modalOpened: open > 0 });
        expect.soft(open, '19: quick "Tâche" opens the add-task modal').toBeGreaterThan(0);
      });

      // 20 ── Statistics after completing a task: read from the Statistics screen itself
      await state(h, '20-statistics', async () => {
        if (await page.getByPlaceholder('Ex: Acheter des vitamines').filter({ visible: true }).count()) {
          await vis(page.getByText('Annuler', { exact: true })).click();
        }
        await bottomTab(page, 'Rappels');
        await remindersTopTab(page, 'Tâches');
        await vis(page.getByRole('button', { name: 'Voir mes statistiques', exact: true })).click();
        const root = vis(page.getByTestId('statistics_screen_root'));
        await expect(root, '20: statistics').toBeVisible({ timeout: 20_000 });
        await expect.soft(root.getByText('Mes Statistiques', { exact: true }), '20: Statistics header').toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(1500);
        const text = fold(await root.innerText());
        const noData = text.includes('Pas encore de données');
        const todayPct = text.match(/Aujourd'hui : (\d+) % réalisé/)?.[1] ?? null;
        const ta = tasksAfter as TasksMyDay | null;
        expect.soft(noData, '20: a completed task must not yield "Pas encore de données"').toBe(false);
        expect.soft(todayPct, '20: Statistics prints today\'s completion ("Aujourd\'hui : N % réalisé")').not.toBeNull();
        expect.soft(todayPct === null ? null : Number(todayPct), '20: Statistics "today" % = the Tasks tab "Ma Journée" % for the same day').toBe(ta?.percent ?? 'no Tasks percentage');
        obs.add('SYNC-9-stats', !noData && todayPct !== null && Number(todayPct) === ta?.percent ? 'PASS' : 'FAIL', '20-statistics', {
          noDataShown: noData,
          statisticsTodayPercent: todayPct,
          tasksTabPercent: ta?.percent ?? null,
          tasksDoneTotal: ta && [ta.done, ta.total],
          statisticsText: text.slice(0, 500),
        });
      });
    } finally {
      settleObs(obs, 'B-plan main context', h);
      obs.flush();
    }

    // 21 ── Fresh context (server-backed data only), one quartet per surface
    const fresh = await freshContextLogin(browser, acct.email, E2E_PASSWORD, 'fr');
    const f = instrument(fresh, testInfo);
    const found: Record<string, unknown> = {};
    try {
      await state(f, '21-fresh-context', async () => {
        await expectHomeWeek(fresh, 32);
        if (todayApptCreated && todayApptHHMM) {
          const label = `${APPT_TODAY}, ${today.d} ${today.monthLong}, ${todayApptHHMM}`;
          const item = vis(fresh.getByRole('button', { name: label, exact: true }));
          await expect.soft(item, '21: Home upcoming (fresh)').toBeVisible({ timeout: 15_000 });
          found.homeUpcoming = await item.isVisible();
        }
        await expect.soft(fresh.getByRole('button', { name: new RegExp(`^${APPT},`) }).filter({ visible: true }), '21: deleted appointment stays deleted on Home').toHaveCount(0);
        found.homePill = await poll(() => homeMyDay(fresh), (v) => v !== null, 12_000);
      });
      await state(f, '21b-fresh-calendar', async () => {
        await openCalendar(fresh);
        await assertStripMatchesHome(fresh, obs, '21b-fresh-calendar', hw, lmp, today, 'Europe/Paris (fresh context)');
        if (todayApptCreated) {
          await selectWeekDay(fresh, today);
          await expect.soft(vis(fresh.getByText(APPT_TODAY, { exact: true })), '21b: Calendar card (fresh)').toBeVisible({ timeout: 15_000 });
        }
        await expect.soft(fresh.getByText(APPT, { exact: true }).filter({ visible: true }), '21b: deleted appointment stays deleted').toHaveCount(0);
      });
      await state(f, '21c-fresh-reminders', async () => {
        await bottomTab(fresh, 'Rappels');
        await remindersTopTab(fresh, 'Rappels');
        const sw = vis(fresh.getByRole('switch', { name: VITAMINS, exact: true }));
        await expect(sw, '21c: vitamins switch (fresh)').toBeVisible({ timeout: 30_000 });
        found.vitaminsAria = String(await sw.isChecked());
        expect.soft(found.vitaminsAria, '21c: reminder toggle off survives (server)').toBe('false');
        await sw.scrollIntoViewIfNeeded();
      });
      let freshTasks: TasksMyDay | null = null;
      await state(f, '21d-fresh-tasks', async () => {
        await remindersTopTab(fresh, 'Tâches');
        const box = vis(fresh.getByRole('checkbox', { name: TASK, exact: true }));
        await expect.soft(box, '21d: task present (fresh)').toBeVisible({ timeout: 20_000 });
        found.taskAria = await box.getAttribute('aria-checked').catch(() => null);
        found.taskTick = await box.getByText('✓', { exact: true }).count().catch(() => 0);
        expect.soft(found.taskAria, '21d: task still completed (fresh, aria-checked)').toBe('true');
        expect.soft(found.taskTick, '21d: task still completed (fresh, tick)').toBeGreaterThan(0);
        await fresh.waitForTimeout(1000);
        freshTasks = await tasksMyDay(fresh);
        assertSameMyDay(obs, '21d-fresh-tasks', 'fresh context', found.homePill as { done: number; total: number } | null, freshTasks);
      });
      await state(f, '21e-fresh-statistics', async () => {
        await vis(fresh.getByRole('button', { name: 'Voir mes statistiques', exact: true })).click();
        const root = vis(fresh.getByTestId('statistics_screen_root'));
        await expect(root).toBeVisible({ timeout: 20_000 });
        await expect.soft(root.getByText('Mes Statistiques', { exact: true }), '21e: Statistics header').toBeVisible({ timeout: 15_000 });
        await fresh.waitForTimeout(1200);
        const text = fold(await root.innerText());
        found.statisticsNoData = text.includes('Pas encore de données');
        found.statisticsTodayPercent = text.match(/Aujourd'hui : (\d+) % réalisé/)?.[1] ?? null;
        const ft = freshTasks as TasksMyDay | null;
        found.tasksTabPercent = ft?.percent ?? null;
        expect.soft(found.statisticsNoData, '21e: completed task still counted on a new device').toBe(false);
        expect.soft(found.statisticsTodayPercent === null ? null : Number(found.statisticsTodayPercent), '21e: Statistics "today" % = Tasks tab % (fresh context)').toBe(ft?.percent ?? 'no Tasks percentage');
        obs.add('SYNC-9', found.vitaminsAria === 'false' && found.taskAria === 'true' && found.statisticsNoData === false ? 'PASS' : 'FAIL', '21e-fresh-statistics', found);
      });
    } finally {
      settleObs(obs, 'B-plan fresh context', f);
      obs.flush();
      f.dispose();
      await fresh.context().close();
      h.dispose();
    }
  });

  // 14 ── Four appointments on the LAST day of the pregnancy week + one the day after (HYP-B6, B-006)
  test('B-plan 14: four appointments → Home list cap and "this week" pill count', async ({ page }, testInfo) => {
    test.setTimeout(5 * 60_000);
    const obs = new Observations('wave-B-plan-observations.json', testInfo);
    const acct = await newWeek32Account('plan-4appts');
    const h = instrument(page, testInfo);
    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      let calendarCount: string | null = null;
      let pillCount: string | null = null;
      let listed = 0;
      let seededOn = '';
      await state(h, '14-appt-4-items', async () => {
        await expectHomeWeek(page, 32);
        const hw = await homeWeekStart(page);
        expect(hw.dayInWeek, 'Home prints the day of pregnancy').not.toBeNull();
        // Day 7 of the pregnancy week Home shows; must not be today/tomorrow or the pill says so instead.
        const offset = 7 - (hw.dayInWeek as number);
        if (offset < 2) {
          obs.add('HYP-B6', 'NOT-REACHED', '14-appt-4-items', { reason: `today is day ${hw.dayInWeek} of the pregnancy week; its last day is today/tomorrow` });
          return;
        }
        const day = await localDay(page, offset);
        const nextWeekDay = await localDay(page, offset + 1);
        seededOn = day.key;
        const lmp = String((await serverDoc(`userProfiles/${acct.uid}`))?.lmp);
        const seed = async (title: string, iso: string, i: number) => {
          const id = `user_event_e2e_${Date.now()}_${i}`;
          const week = Math.min(40, Math.floor((new Date(iso).getTime() - new Date(lmp).getTime()) / 86_400_000 / 7) + 1);
          const status = await userWrite(`userEvents/${id}`, acct.idToken, {
            event_id: id,
            user_id: acct.uid,
            title,
            date: iso,
            week,
            type: 'appointment',
            category: 'medical',
            created_at: new Date().toISOString(),
          });
          expect(status, 'REST seed as user').toBe(200);
        };
        const isos: string[] = [];
        for (const [i, hhmm] of ['09:00', '10:00', '11:00', '12:00'].entries()) {
          const iso = await localIso(page, day.key, hhmm);
          isos.push(iso);
          await seed(`Wave B RDV ${i + 1}`, iso, i);
        }
        await seed('Wave B RDV semaine suivante', await localIso(page, nextWeekDay.key, '09:00'), 9);
        await page.reload({ waitUntil: 'load' });
        await expectHomeWeek(page, 32);
        await page.waitForTimeout(2500);
        listed = await page.getByRole('button', { name: /^Wave B RDV \d, / }).filter({ visible: true }).count();
        const text = await bodyText(page);
        pillCount = text.match(/Vous avez (\d+) rendez-vous prévus? cette semaine\./)?.[1] ?? null;
        expect.soft(listed, '14: Home lists max 3 upcoming').toBe(3);
        expect.soft(pillCount, '14: pill counts the 4 appointments of this pregnancy week (not the one on day 1 of next week)').toBe('4');
        obs.add('HYP-B6', pillCount === '3' ? 'CONFIRMED' : pillCount === '4' ? 'REFUTED' : 'INFO', '14-appt-4-items', {
          homeDayInWeek: hw.dayInWeek,
          pregnancyWeekStart: hw.start?.key ?? null,
          seededOn: day.key,
          seededNextWeekOn: nextWeekDay.key,
          isos,
          homeListed: listed,
          homePillCount: pillCount,
        });
      });
      await state(h, '14b-calendar-4-items', async () => {
        await openCalendar(page);
        calendarCount = (await poll(() => bodyText(page), (t) => /\d+ RDV cette semaine/.test(t), 8000)).match(/(\d+) RDV cette semaine/)?.[1] ?? null;
        expect.soft(calendarCount, '14b: Calendar "N RDV cette semaine" counts the same 4').toBe('4');
        expect.soft(calendarCount, '14b: Calendar count = Home pill count').toBe(pillCount);
        const days = await stripDays(page);
        const last = await localDay(page, 0);
        obs.add('WEEK-COUNT-HOME-VS-CALENDAR', calendarCount === '4' && pillCount === '4' ? 'PASS' : 'FAIL', '14b-calendar-4-items', {
          today: last.key,
          seededOn,
          homePillCount: pillCount,
          calendarWeekCount: calendarCount,
          strip: days,
        });
      });
    } finally {
      settleObs(obs, 'B-plan 14', h);
      obs.flush();
      h.dispose();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Timezone flush — SYNC-4 + B-006 strip + today-appointment + week edge + symptom date
// ══════════════════════════════════════════════════════════════════════════════

async function tzRun(page: Page, testInfo: TestInfo, tz: string, slug: string, base: number) {
  const obs = new Observations('wave-B-plan-observations.json', testInfo);
  const acct = await newWeek32Account(`tz-${slug}`, tz);
  const h = instrument(page, testInfo);
  try {
    await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
    const clock = await page.evaluate(() => ({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      local: new Date().toString(),
      utc: new Date().toISOString(),
    }));
    expect(clock.tz, 'context timezone applied').toBe(tz);
    const today = await localDay(page, 0);
    let hw: HomeWeek = { dayOfPregnancy: null, week: null, dayInWeek: null, start: null };
    let todayAppt = false;

    await state(h, `${base}-tz-${slug}-sync4`, async () => {
      await expectHomeWeek(page, 32);
      hw = await homeWeekStart(page);
      obs.add(`TZ-${slug}-clock`, 'INFO', `${base}-tz-${slug}-sync4`, clock);
      await sync4Surfaces(h, obs, `${base}-tz-${slug}-sync4`, acct, tz);
    });

    await state(h, `${base + 1}-tz-${slug}-today-appt`, async () => {
      await page.goto('/', { waitUntil: 'load' });
      const hhmm = await laterTodayHHMM(page, 60);
      if (!hhmm) {
        obs.add(`TZ-${slug}-today-appt`, 'NOT-REACHED', `${base + 1}-tz-${slug}-today-appt`, { reason: 'near local midnight' });
        return;
      }
      await expectHomeWeek(page, 32);
      await page.getByTestId('home_quick_add_appointment').click();
      await expect(vis(page.getByText('Nouveau Rendez-vous', { exact: true })), 'quick-add form').toBeVisible({ timeout: 20_000 });
      const f = form(page);
      const prefilled = await f.date.inputValue();
      expect.soft(prefilled, `${slug}: quick-add pre-fills local today`).toBe(today.key);
      await f.title.fill(`RDV TZ ${slug}`);
      await f.date.fill(today.key);
      await f.time.fill(hhmm);
      expect.soft(await saveForm(page), `${slug}: success toast`).toBe(true);
      todayAppt = true;
      await goHome(page);
      await expectHomeWeek(page, 32);
      const pill = (await poll(() => bodyText(page), (t) => t.includes("Aujourd'hui : 1 rendez-vous !"), 8000)).includes("Aujourd'hui : 1 rendez-vous !");
      expect.soft(pill, `${slug}: Home pill "Aujourd'hui : 1"`).toBe(true);
      await h.snap(`${base + 1}-tz-${slug}-today-appt.home-pill`);
      await bottomTab(page, 'Rappels');
      await remindersTopTab(page, 'Tâches');
      const box = page.getByRole('checkbox', { name: `RDV TZ ${slug}`, exact: true }).filter({ visible: true });
      const listed = (await poll(() => box.count(), (c) => c > 0, 15_000)) > 0;
      expect.soft(listed, `${slug}: MA JOURNÉE lists today's appointment`).toBe(true);
      const iso = await localIso(page, today.key, hhmm);
      const tzDoc = (await serverQuery('userEvents', 'user_id', acct.uid)).find((r) => r.data.title === `RDV TZ ${slug}`)?.data;
      expect.soft(tzDoc?.category, `${slug}: appointment saved with the default category Médical`).toBe('medical');
      expect.soft(String(tzDoc?.date).slice(0, 16), `${slug}: server date = local today at the chosen time`).toBe(iso.slice(0, 16));
      obs.add(`TZ-${slug}-today-appt`, pill && listed ? 'PASS' : 'FAIL', `${base + 1}-tz-${slug}-today-appt`, {
        localDay: today.key,
        hhmm,
        storedIso: tzDoc?.date ?? null,
        expectedIso: iso,
        utcDayOfStoredIso: iso.slice(0, 10),
        pill,
        myDayListed: listed,
      });
    });

    // B-006 consequence: an appointment on day 7 of the week Home shows is "this week" on the
    // Calendar, and one on the day after is not.
    await state(h, `${base + 1}b-tz-${slug}-week-edge`, async () => {
      expect(hw.dayInWeek, 'Home prints the day of pregnancy').not.toBeNull();
      const lastOffset = 7 - (hw.dayInWeek as number);
      const last = await localDay(page, lastOffset);
      const next = await localDay(page, lastOffset + 1);
      const lmp = String((await serverDoc(`userProfiles/${acct.uid}`))?.lmp);
      for (const [i, [title, day]] of ([[`RDV dernier jour ${slug}`, last], [`RDV semaine suivante ${slug}`, next]] as const).entries()) {
        const iso = await localIso(page, day.key, '12:00');
        const id = `user_event_e2e_${Date.now()}_${i}`;
        const status = await userWrite(`userEvents/${id}`, acct.idToken, {
          event_id: id,
          user_id: acct.uid,
          title,
          date: iso,
          week: Math.min(40, Math.floor((new Date(iso).getTime() - new Date(lmp).getTime()) / 86_400_000 / 7) + 1),
          type: 'appointment',
          category: 'medical',
          created_at: new Date().toISOString(),
        });
        expect(status, 'REST seed as user').toBe(200);
      }
      await page.goto('/calendar', { waitUntil: 'load' });
      await expect(vis(page.getByText(/^Semaine \d+ de grossesse$/)), 'Calendar header').toBeVisible({ timeout: 30_000 });
      const expected = (todayAppt ? 1 : 0) + 1;
      const text = await poll(() => bodyText(page), (t) => new RegExp(`${expected} RDV cette semaine`).test(t), 10_000);
      const count = text.match(/(\d+) RDV cette semaine/)?.[1] ?? null;
      const days = await stripDays(page);
      expect.soft(count, `${slug}: Calendar counts day 7 (${last.key}) in this week and not ${next.key}`).toBe(String(expected));
      expect.soft(days[6] ?? null, `${slug}: the strip's last day is Home's day 7`).toBe(dayLabel(last));
      expect.soft(days.includes(dayLabel(next)), `${slug}: the day after day 7 is not in the strip`).toBe(false);
      const lastBtn = vis(page.getByRole('button', { name: dayLabel(last), exact: true }));
      let cardOnLastDay = false;
      if (await lastBtn.count()) {
        await lastBtn.click();
        const card = vis(page.getByText(`RDV dernier jour ${slug}`, { exact: true }));
        await expect.soft(card, `${slug}: the day-7 appointment shows under the strip's last day`).toBeVisible({ timeout: 10_000 });
        cardOnLastDay = await card.isVisible();
      }
      obs.add(`TZ-${slug}-week-edge`, count === String(expected) && days[6] === dayLabel(last) && cardOnLastDay ? 'PASS' : 'FAIL', `${base + 1}b-tz-${slug}-week-edge`, {
        homeDayInWeek: hw.dayInWeek,
        homeDay1: hw.start?.key ?? null,
        day7: last.key,
        nextWeekDay1: next.key,
        calendarCount: count,
        expectedCount: expected,
        strip: days,
        cardOnLastDay,
      });
    });

    await state(h, `${base + 2}-tz-${slug}-symptom`, async () => {
      await page.goto('/health', { waitUntil: 'load' });
      const chip = vis(page.getByRole('button', { name: 'Nausées', exact: true }));
      await expect(chip, 'symptom chip').toBeVisible({ timeout: 30_000 });
      await chip.click();
      await expect.soft(chip, `${slug}: chip exposes its on state (aria-pressed)`).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
      const rows = await poll(() => serverQuery('symptomsLog', 'user_id', acct.uid), (r) => r.length >= 1);
      const ids = rows.map((r) => r.id);
      const docDate = rows[0]?.id.slice(acct.uid.length + 1) ?? null;
      expect.soft(docDate, `${slug}: symptomsLog doc date = displayed LOCAL day`).toBe(today.key);
      obs.add(`TZ-${slug}-symptom-date`, docDate === today.key ? 'PASS' : 'FAIL', `${base + 2}-tz-${slug}-symptom`, {
        localDay: today.key,
        utcDay: new Date().toISOString().slice(0, 10),
        docIds: ids,
        data: rows[0]?.data,
      });
      await chip.scrollIntoViewIfNeeded();
    });
  } finally {
    settleObs(obs, `tz ${slug}`, h);
    obs.flush();
    h.dispose();
  }
}

test.describe('Wave B — timezone flush: Africa/Tunis', () => {
  test.use({ timezoneId: 'Africa/Tunis' });
  test('B-tz Tunis: SYNC-4 + today appointment + week edge + symptom day', async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    await tzRun(page, testInfo, 'Africa/Tunis', 'tunis', 38);
  });
});

test.describe('Wave B — timezone flush: America/New_York', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('B-tz New York: SYNC-4 + today appointment + week edge + symptom day', async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    await tzRun(page, testInfo, 'America/New_York', 'ny', 41);
  });
});

// Both ends of the date line, always: UTC−12 (the last place on a calendar day) and
// Kiritimati UTC+14 (the first). "boundary" is whichever of the two is on a different
// calendar day from UTC right now; the other one runs as states 48-50.
const UTC_MINUS_12 = 'Etc/GMT+12';
const KIRITIMATI = 'Pacific/Kiritimati';
const BOUNDARY_TZ = new Date().getUTCHours() >= 10 ? KIRITIMATI : UTC_MINUS_12;
const OTHER_EXTREME_TZ = BOUNDARY_TZ === KIRITIMATI ? UTC_MINUS_12 : KIRITIMATI;
const OTHER_SLUG = OTHER_EXTREME_TZ === KIRITIMATI ? 'kiritimati' : 'utc-12';
test.describe(`Wave B — timezone flush: date-boundary ${BOUNDARY_TZ}`, () => {
  test.use({ timezoneId: BOUNDARY_TZ });
  test('B-tz boundary: local day ≠ UTC day', async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    await tzRun(page, testInfo, BOUNDARY_TZ, 'boundary', 44);
  });
});
test.describe(`Wave B — timezone flush: other extreme ${OTHER_EXTREME_TZ}`, () => {
  test.use({ timezoneId: OTHER_EXTREME_TZ });
  test('B-tz other extreme of the date line', async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    await tzRun(page, testInfo, OTHER_EXTREME_TZ, OTHER_SLUG, 48);
  });
});

// One account, five timezones: the due date on Profile must be the same calendar day.
test.describe('Wave B — due date identical across timezones', () => {
  test('B-tz DPA: Paris / New York / Tunis / UTC−12 / Kiritimati show the same DPA', async ({ browser }, testInfo) => {
    test.setTimeout(8 * 60_000);
    const obs = new Observations('wave-B-plan-observations.json', testInfo);
    const acct = await newWeek32Account('tz-dpa');
    const lmp = String((await serverDoc(`userProfiles/${acct.uid}`))?.lmp);
    const expected = canonicalDpa(lmp);
    const seen: Record<string, string | null> = {};
    const unsettled: Instrumented['unsettled'] = [];
    try {
      for (const tz of ['Europe/Paris', 'America/New_York', 'Africa/Tunis', UTC_MINUS_12, KIRITIMATI]) {
        const p = await freshContextLogin(browser, acct.email, E2E_PASSWORD, 'fr', { timezoneId: tz });
        const h = instrument(p, testInfo);
        try {
          await state(h, `47-tz-dpa-${tz.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`, async () => {
            await p.goto('/profile', { waitUntil: 'load' });
            const dpaLabel = vis(p.getByText("Date Prévue d'Accouchement (DPA)", { exact: true }));
            await expect(dpaLabel, 'Profile DPA').toBeVisible({ timeout: 30_000 });
            seen[tz] = await profileDpaText(p);
            expect.soft(seen[tz], `DPA in ${tz}`).toBe(expected);
            // B-021: the DPA line is below the fold — bring it into the quartet.
            await dpaLabel.scrollIntoViewIfNeeded();
          });
        } finally {
          unsettled.push(...h.unsettled);
          h.dispose();
          await p.context().close();
        }
      }
      const values = new Set(Object.values(seen));
      expect.soft(values.size, `DPA identical across zones ${JSON.stringify(seen)}`).toBe(1);
      obs.add('DPA-ACROSS-TZ', values.size === 1 && seen['Europe/Paris'] === expected ? 'PASS' : 'FAIL', '47-tz-dpa', { lmp, expected, seen });
      obs.add('SNAP-SETTLE', unsettled.length ? 'FAIL' : 'PASS', 'tz dpa', { unsettled });
    } finally {
      obs.flush();
    }
  });
});
