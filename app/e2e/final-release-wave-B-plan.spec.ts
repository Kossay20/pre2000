/**
 * Wave B — B-plan half + timezone flush (AUDIT_PLAN final-release-2026-09-30 §3, §8 SYNC-1/2/3/4/9).
 * Signed-in daily loop at week 32: Home, Calendar, appointments (add/edit/delete),
 * Reminders, Tasks, Statistics — proven against the emulator server truth AND a
 * fresh browser context. Requires the emulator stack (`bash e2e/emulator-stack.sh status`).
 *
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-B \
 *   timeout 900 npx playwright test e2e/final-release-wave-B-plan.spec.ts --reporter=list
 *
 * App-behaviour checks are expect.soft (a real bug is the point — record it);
 * harness steps are hard. A state whose navigation cannot complete is recorded as a
 * soft "state aborted" failure and the wave continues (helpers/wave-B-helpers.ts).
 */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  E2E_PASSWORD,
  createAccount,
  freshContextLogin,
  newAccountEmail,
  seedProfile,
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
  homeMyDay,
  instrument,
  laterTodayHHMM,
  localDay,
  localIso,
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

/** Week 32 as of the user's LOCAL calendar day in `tz` (the app dates the pregnancy by local day). */
/** Due date = calendar day of the stored LMP + 280 days, identical in every timezone. */
function canonicalDpa(lmpIso: string): string {
  const d = new Date(lmpIso);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 280));
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc);
}

/** Profile → the line under "Date Prévue d'Accouchement (DPA)". */
async function profileDpaText(page: Page): Promise<string | null> {
  const t = await bodyText(page);
  return t.match(/Date Prévue d'Accouchement \(DPA\)\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? null;
}

async function newWeek32Account(scenario: string, tz = 'Europe/Paris'): Promise<CreatedAccount> {
  const acct = await createAccount(newAccountEmail('B', scenario), E2E_PASSWORD);
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  const now = new Date(Date.UTC(y, m - 1, d));
  await seedProfile(acct.uid, acct.idToken, { week: 32, now, country: 'France', lastName: 'Testeur', firstName: 'Wave' });
  return acct;
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

/** Week-view day button: a11y label = format(date,'EEEE dd MMMM', fr) (WeeklyStrip.tsx:48). */
async function selectWeekDay(page: Page, day: LocalDay) {
  const btn = vis(page.getByRole('button', { name: `${day.weekdayLong} ${day.dd} ${day.monthLong}`, exact: true }));
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
    title: vis(page.getByPlaceholder('Ex: Échographie, Consultation...')),
    date: vis(page.getByPlaceholder('YYYY-MM-DD')),
    time: vis(page.getByPlaceholder('HH:MM')),
    location: vis(page.getByRole('textbox', { name: 'Lieu (optionnel)' })),
    notes: vis(page.getByRole('textbox', { name: 'Notes (optionnel)' })),
    medical: vis(page.getByRole('button', { name: 'Médical 🩺', exact: true })),
    personal: vis(page.getByRole('button', { name: 'Personnel 📅', exact: true })),
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

/** Read "À venir"/"Passés" counters on the Health dashboard. */
async function healthAppointmentCounts(page: Page): Promise<{ upcoming: number | null; past: number | null }> {
  await page.goto('/health', { waitUntil: 'load' });
  await expect(vis(page.getByText('À venir', { exact: true })), 'Health dashboard loaded').toBeVisible({ timeout: 30_000 });
  const re = /(\d+)\s*\n\s*À venir\s*\n\s*(\d+)\s*\n\s*Passés/;
  const m = (await poll(() => bodyText(page), (t) => re.test(t), 10_000)).match(re);
  return m ? { upcoming: Number(m[1]), past: Number(m[2]) } : { upcoming: null, past: null };
}

/** SYNC-4: every surface's week/trimester/DPA/month in the page's timezone. */
async function sync4Surfaces(h: Instrumented, obs: Observations, stateName: string, acct: CreatedAccount) {
  const page = h.page;
  const out: Record<string, unknown> = {};
  // Home
  await goHome(page);
  const home = await bodyText(page);
  out.homeWeek = home.match(/Semaine (\d+)\n/)?.[1] ?? null;
  out.homeTrimester = home.match(/(\dème) Trimestre/)?.[1] ?? null;
  // Calendar
  await openCalendar(page);
  out.calendarWeek = await calendarWeekLabel(page);
  await vis(page.getByRole('button', { name: "Aujourd'hui", exact: true })).click();
  await page.waitForTimeout(500);
  out.calendarWeekAfterToday = await calendarWeekLabel(page);
  // Reminders header
  await bottomTab(page, 'Rappels');
  await remindersTopTab(page, 'Rappels');
  await expect(vis(page.getByText('Mes Rappels', { exact: true })), 'Reminders header').toBeVisible({ timeout: 30_000 });
  const rem = (await bodyText(page)).match(/Semaine (\d+) • (\d)e trimestre/);
  out.remindersWeek = rem?.[1] ?? null;
  out.remindersTrimester = rem?.[2] ?? null;
  // WeekRecommendations, BabyEvolution, Kick guidance, Profile DPA (stack screens → deep links)
  await page.goto('/recommendations', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  out.recommendationsWeekMentions = [...new Set(((await bodyText(page)).match(/Semaine \d+/g) || []))];
  await page.goto('/baby-evolution', { waitUntil: 'load' });
  await expect(vis(page.getByText('📍 Vous êtes ici', { exact: true })), 'BabyEvolution current badge').toBeVisible({
    timeout: 30_000,
  });
  out.babyEvolutionMonth = await page.evaluate(() => {
    const badge = [...document.querySelectorAll('div')].find(
      (d) => d.textContent === '📍 Vous êtes ici' && (d as HTMLElement).offsetParent !== null,
    );
    const header = badge?.parentElement?.parentElement;
    return header?.textContent?.match(/Mois (\d+)/)?.[1] ?? null;
  });
  await page.goto('/kick-counter', { waitUntil: 'load' });
  await expect(vis(page.getByText('💡 Conseil', { exact: true })), 'Kick guidance card').toBeVisible({ timeout: 30_000 });
  out.kickGuidance28 = (await bodyText(page)).includes('À partir de 28 semaines, comptez 10 mouvements');
  await page.goto('/profile', { waitUntil: 'load' });
  await expect(vis(page.getByText("Date Prévue d'Accouchement (DPA)", { exact: true })), 'Profile DPA').toBeVisible({
    timeout: 30_000,
  });
  const prof = await serverDoc(`userProfiles/${acct.uid}`);
  const expectedDpa = canonicalDpa(String(prof?.lmp));
  out.profileDpaText = await profileDpaText(page);
  out.expectedDpa = expectedDpa;
  out.profileShowsDpa = (await bodyText(page)).includes(expectedDpa);
  out.serverCurrentWeek = prof?.currentWeek ?? null;

  expect.soft(out.homeWeek, `${stateName}: Home week`).toBe('32');
  expect.soft(out.homeTrimester, `${stateName}: Home trimester`).toBe('3ème');
  expect.soft(out.calendarWeek, `${stateName}: Calendar week`).toBe(32);
  expect.soft(out.calendarWeekAfterToday, `${stateName}: Calendar "Aujourd'hui" week (uses user.currentWeek)`).toBe(32);
  expect.soft(out.remindersWeek, `${stateName}: Reminders week`).toBe('32');
  expect.soft(out.remindersTrimester, `${stateName}: Reminders trimester`).toBe('3');
  expect.soft(out.babyEvolutionMonth, `${stateName}: BabyEvolution month`).toBe('8');
  expect.soft(out.kickGuidance28, `${stateName}: Kick ≥28w guidance`).toBe(true);
  expect.soft(out.profileDpaText, `${stateName}: Profile DPA = LMP calendar day + 280 (${expectedDpa}), timezone-independent`).toBe(expectedDpa);
  const consistent =
    out.homeWeek === '32' && out.calendarWeek === 32 && out.calendarWeekAfterToday === 32 && out.remindersWeek === '32' &&
    out.babyEvolutionMonth === '8' && out.remindersTrimester === '3' && out.profileDpaText === expectedDpa;
  obs.add('SYNC-4', consistent ? 'PASS' : 'FAIL', stateName, out);
  // Leave on Home.
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// B-plan: states 01–13, 15–21 on one account (Europe/Paris)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Wave B — B-plan (Europe/Paris)', () => {
  test('B-plan: Home · Calendar · appointments · Reminders · Tasks · Statistics · fresh context', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(14 * 60_000);
    const obs = new Observations('wave-B-plan-observations.json', testInfo);
    const acct = await newWeek32Account('plan');
    const h = instrument(page, testInfo);
    const today = { key: '' } as LocalDay;
    let plus2 = { key: '' } as LocalDay;
    let todayApptHHMM: string | null = null;
    let todayApptCreated = false;

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
      });

      // 02 ── Week navigation (time machine)
      await state(h, '02-home-week-nav', async () => {
        const prev = vis(page.getByRole('button', { name: 'Semaine précédente', exact: true }));
        for (let i = 0; i < 5; i++) await prev.click();
        await expectHomeWeek(page, 27);
        await expect.soft(vis(page.getByText('2ème Trimestre', { exact: true })), '02: week 27 → T2').toBeVisible();
        const kick = await vis(page.getByRole('button', { name: 'Compteur de coups de bébé', exact: true })).isVisible();
        const contraction = await page.getByRole('button', { name: 'Minuteur de contractions', exact: true }).filter({ visible: true }).count();
        const bag = await page.getByRole('button', { name: 'Valise de maternité', exact: true }).filter({ visible: true }).count();
        obs.add('HOME-WEEKNAV-GATE', 'INFO', '02-home-week-nav', {
          note: 'tool gates use the DISPLAYED week (HomeScreen.tsx:903,924) — previewing week 27 hides labour tools the user (really at 32) needs',
          kickVisible: kick,
          contractionCards: contraction,
          bagCards: bag,
        });
        expect.soft(contraction, '02: previewing week 27 keeps the contraction card (her real week is 32)').toBeGreaterThan(0);
        expect.soft(bag, '02: previewing week 27 keeps the hospital-bag card').toBeGreaterThan(0);
        const back = page.getByTestId('home_return_to_today');
        await expect.soft(back, '02: return-to-today pill').toBeVisible();
        await back.click();
        await expectHomeWeek(page, 32);
      });

      // 03 ── Calendar week + SYNC-4 surfaces
      await state(h, '03-calendar-week', async () => {
        await openCalendar(page);
        expect.soft(await calendarWeekLabel(page), '03: Calendar current week').toBe(32);
        await vis(page.getByRole('button', { name: "Aujourd'hui", exact: true })).click();
        await page.waitForTimeout(400);
        expect.soft(await calendarWeekLabel(page), '03: after "Aujourd\'hui" (user.currentWeek)').toBe(32);
        const todayBtn = vis(page.getByRole('button', { name: `${today.weekdayLong} ${today.dd} ${today.monthLong}`, exact: true }));
        await expect.soft(todayBtn, '03: today is inside the displayed pregnancy week').toBeVisible();
      });
      await state(h, '03b-sync4-surfaces', async () => {
        await sync4Surfaces(h, obs, '03b-sync4-surfaces', acct);
      });

      // 04 ── Suggestions (HYP-B1)
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
          cite: 'CalendarScreen.tsx:544-547 renders nothing when there are 0 suggestions; calendarTemplates not in import-data',
        });
        expect.soft(section || hasCopy, '04: tapping "Suggestions" must show suggestions or an explained empty state').toBe(true);
        if (expanded === 'true') await btn.click();
      });

      // 05 ── Empty appointment form
      await state(h, '05-appt-form-empty', async () => {
        await openAppointmentFormFromFab(page);
        const f = form(page);
        await expect.soft(f.save, '05: Save disabled on empty title').toBeDisabled();
        await expect.soft(f.medical, '05: new appointment defaults to Médical').toHaveAttribute('aria-selected', 'true');
        await expect.soft(f.personal, '05: Personnel not selected by default').toHaveAttribute('aria-selected', 'false');
        obs.add('APPT-DEFAULT-TYPE', 'INFO', '05-appt-form-empty', {
          medicalSelected: await f.medical.getAttribute('aria-selected'),
          personalSelected: await f.personal.getAttribute('aria-selected'),
          cite: 'AddAppointmentScreen.tsx:69-73 new event → editingEvent?.type undefined → "other" (Personnel)',
        });
        expect.soft(await page.locator('input[role="switch"]').filter({ visible: true }).count(), '05: 3 reminder switches').toBe(3);
        for (const [name, on] of [['La veille (8h)', 'true'], ['Le jour J (8h)', 'true'], ['2h avant', 'false']] as const) {
          await expect.soft(vis(page.getByRole('switch', { name, exact: true })), `05: switch ${name}`).toHaveAttribute('aria-checked', on);
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
          cite: 'AddAppointmentScreen.tsx:302-312 setFullYear(2026,1,31) rolls over; isValid() is true',
        });
        expect.soft(after, '06: 2026-02-31 must be rejected, not rolled over to 2026-03-03').not.toBe('2026-03-03');
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
        // Month view card
        await vis(page.getByRole('button', { name: 'Mois', exact: true })).click();
        await expect.soft(vis(page.getByText(APPT, { exact: true })), '07: card in month view').toBeVisible({ timeout: 15_000 });
        const monthLoc = await page.getByText(LOCATION, { exact: true }).filter({ visible: true }).count();
        obs.add('MONTH-CARD-LOCATION', monthLoc > 0 ? 'PASS' : 'FAIL', '07-appt-saved', {
          monthViewShowsLocation: monthLoc > 0,
          cite: 'CalendarScreen.tsx:209-221 month map drops location',
        });
        await vis(page.getByRole('button', { name: 'Semaine', exact: true })).click();
        // Server truth
        const rows = await poll(() => serverQuery('userEvents', 'user_id', acct.uid), (r) => r.length >= 1);
        const mine = rows.filter((r) => r.data.title === APPT);
        expect.soft(mine.length, '07: exactly one server userEvents doc').toBe(1);
        const d = mine[0]?.data ?? {};
        expect.soft(String(d.date).slice(0, 16), '07: server date = local 10:30 of today+2').toBe(apptIso.slice(0, 16));
        expect.soft(String(d.date).slice(16), '07: time stored with seconds/ms zeroed (web time input keeps now()\'s seconds, AddAppointmentScreen.tsx:320)').toBe(':00.000Z');
        expect.soft(d.category, '07: server category').toBe('medical');
        expect.soft(d.type, '07: server type').toBe('appointment');
        expect.soft(d.location, '07: server location').toBe(LOCATION);
        expect.soft(d.notes, '07: server notes').toBe(NOTES);
        expect.soft(d.week, '07: server week').toBe(32);
        const draft = await page.evaluate(() => localStorage.getItem('@pending_appointment_draft'));
        expect.soft(draft, '07: draft key cleared after save').toBeNull();
        obs.add('SYNC-1a', mine.length === 1 && String(d.date).slice(0, 16) === apptIso.slice(0, 16) ? 'PASS' : 'FAIL', '07-appt-saved', { server: d });
      });

      // 08 ── Home upcoming (SYNC-1) + pill + Health "À venir"
      await state(h, '08-home-upcoming', async () => {
        await goHome(page);
        await expectHomeWeek(page, 32);
        await expect.soft(vis(page.getByText('📅 Vos prochains rendez-vous')), '08: upcoming section').toBeVisible({ timeout: 15_000 });
        const label = `${APPT}, ${plus2.dd} ${plus2.monthLong}, 10:30`;
        await expect.soft(vis(page.getByRole('button', { name: label, exact: true })), `08: upcoming item "${label}"`).toBeVisible();
        const rel = await relDay(page, apptIso);
        const text = await bodyText(page);
        const expectedPill =
          rel === 'today' ? "Aujourd'hui : 1 rendez-vous !" : rel === 'tomorrow' ? "N'oubliez pas ! 1 rendez-vous demain." : rel === 'thisWeek' ? 'Vous avez 1 rendez-vous prévu cette semaine.' : null;
        if (expectedPill) expect.soft(text.includes(expectedPill), `08: pill "${expectedPill}"`).toBe(true);
        obs.add('HOME-PILL-GRAMMAR', 'INFO', '08-home-upcoming', { pill: expectedPill, rel });
        const counts = await healthAppointmentCounts(page);
        expect.soft(counts.upcoming, '08: Health "À venir" = 1 (SYNC-1)').toBe(1);
        obs.add('SYNC-1', label && counts.upcoming === 1 ? 'PASS' : 'FAIL', '08-home-upcoming', { homeLabel: label, health: counts });
        await goHome(page);
      });

      // 09 ── Appointment today via Home quick-add → pill + MA JOURNÉE
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
        if (!calHeader) await page.goto('/calendar', { waitUntil: 'load' });
        await goHome(page);
        await expectHomeWeek(page, 32);
        await page.waitForTimeout(1500);
        const text = await bodyText(page);
        expect.soft(text.includes("Aujourd'hui : 1 rendez-vous !"), '09: Home pill "Aujourd\'hui : 1"').toBe(true);
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
          cite: 'CalendarScreen.tsx:209-221 (month map has no location) → AddAppointmentScreen.tsx:115',
        });
        obs.add('HYP-B4', doc?.notes !== undefined ? 'CONFIRMED' : 'REFUTED', '10-appt-edit', {
          notesInForm,
          serverNotesAfterClearing: doc?.notes ?? null,
          cite: 'AddAppointmentScreen.tsx:443 notes.trim()||undefined → calendarService.ts:352-361 merge keeps old notes',
        });
        // SYNC-2 surfaces
        await expect.soft(vis(page.getByText('11:00', { exact: true })), '10: month card shows 11:00').toBeVisible({ timeout: 10_000 });
        await goHome(page);
        const label = `${APPT}, ${plus2.dd} ${plus2.monthLong}, 11:00`;
        await expect.soft(vis(page.getByRole('button', { name: label, exact: true })), `10: Home shows "${label}"`).toBeVisible({ timeout: 15_000 });
        obs.add('SYNC-2', String(doc?.date).slice(0, 16) === editedIso.slice(0, 16) && doc?.location === LOCATION && doc?.notes === undefined ? 'PASS' : 'FAIL', '10-appt-edit', { server: doc });
      });

      // 11 ── Reload while editing (HYP-B5)
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
        const titleValue = await page.getByPlaceholder('Ex: Échographie, Consultation...').filter({ visible: true }).first().inputValue().catch(() => null);
        const intact = isEdit && titleValue === APPT;
        obs.add('HYP-B5', intact ? 'REFUTED' : 'CONFIRMED', '11-appt-edit-reload', {
          urlBefore,
          urlAfter: page.url(),
          header: isEdit ? 'edit' : isCreate ? 'create' : 'neither',
          titleValue,
          cite: 'AddAppointmentScreen.tsx:57 editingEvent = route.params.event (object param, not URL-serializable)',
        });
        expect.soft(isEdit, '11: a reload of the edit form must stay in edit mode (not silently become "create")').toBe(true);
        expect.soft(titleValue, '11: the reloaded edit form still carries the event (title)').toBe(APPT);
        await page.goto('/calendar', { waitUntil: 'load' });
        await expect(vis(page.getByText(/^Semaine \d+ de grossesse$/)), '11: back on Calendar').toBeVisible({ timeout: 30_000 });
      });

      // 13 ── Delete → dismiss the confirm (today appointment stays)
      await state(h, '13-appt-delete-cancel', async () => {
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

      // 12 ── Delete → accept (SYNC-3)
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
        expect.soft(after.some((r) => r.data.title === APPT), '12: server doc deleted').toBe(false);
        const rdv = await page.evaluate(() => localStorage.getItem('@rdv_reminders'));
        const orphan = !!(rdv && target && rdv.includes(target.id));
        expect.soft(orphan, '12: no orphan @rdv_reminders record for the deleted event').toBe(false);
        await goHome(page);
        await page.waitForTimeout(1500);
        await expect.soft(page.getByRole('button', { name: new RegExp(`^${APPT},`) }).filter({ visible: true }), '12: gone from Home upcoming').toHaveCount(0);
        const counts = await healthAppointmentCounts(page);
        const expectedUpcoming = todayApptCreated ? 1 : 0;
        expect.soft(counts.upcoming, '12: Health "À venir" after delete').toBe(expectedUpcoming);
        obs.add('SYNC-3', !after.some((r) => r.data.title === APPT) && !orphan && counts.upcoming === expectedUpcoming ? 'PASS' : 'FAIL', '12-appt-delete', {
          rdvRemindersKey: rdv,
          health: counts,
        });
        await goHome(page);
      });

      // 15 ── Reminders tab header
      await state(h, '15-reminders-tab', async () => {
        await bottomTab(page, 'Rappels');
        await remindersTopTab(page, 'Rappels');
        await expect(vis(page.getByText('Mes Rappels', { exact: true })), '15: reminders loaded').toBeVisible({ timeout: 30_000 });
        const text = await bodyText(page);
        expect.soft(text.includes('Semaine 32 • 3e trimestre'), '15: header "Semaine 32 • 3e trimestre"').toBe(true);
        expect.soft(/2e trimestre/.test(text), '15: no "2e trimestre"').toBe(false);
        const banner = await page.getByRole('button', { name: 'Activez les notifications pour recevoir vos rappels' }).filter({ visible: true }).count();
        const settings = await poll(() => serverQuery('reminder_settings_v2', 'user_id', acct.uid), (r) => r.length >= 3);
        obs.add('REMINDERS-DEFAULTS', 'INFO', '15-reminders-tab', {
          permissionBannerVisible: banner > 0,
          serverSettings: settings.map((s) => [s.id, s.data.enabled]),
        });
        expect.soft(settings.length, '15: default reminder settings persisted server-side').toBeGreaterThanOrEqual(3);
      });

      // 16 ── Toggle a reminder off (HYP-B7)
      await state(h, '16-reminder-toggle', async () => {
        const sw = vis(page.getByRole('switch', { name: VITAMINS, exact: true }));
        await expect(sw, '16: vitamins switch').toBeVisible({ timeout: 15_000 });
        const before = await sw.getAttribute('aria-checked');
        await sw.click();
        await expect.soft(sw, '16: switch now off').toHaveAttribute('aria-checked', 'false', { timeout: 5000 });
        const doc = await poll(
          () => serverDoc(`reminder_settings_v2/${acct.uid}_rem_med_prenatal_vitamins`),
          (d) => d?.enabled === false,
        );
        expect.soft(doc?.enabled, '16: server reminder_settings_v2 enabled=false').toBe(false);
        obs.add('HYP-B7', doc?.enabled === false ? 'REFUTED' : 'CONFIRMED', '16-reminder-toggle', {
          ariaBefore: before,
          server: doc,
          note: 'happy path reaches the server; the swallow-on-error path (remindersV2Service.ts:198-209) is not reachable from the UI',
        });
      });

      // 17 ── Create a task
      let myDayBefore: { done: number; total: number } | null = null;
      await state(h, '17-task-create', async () => {
        await remindersTopTab(page, 'Tâches');
        await vis(page.getByRole('button', { name: '➕ Nouvelle tâche', exact: true })).click();
        const input = vis(page.getByPlaceholder('Ex: Acheter des vitamines'));
        await expect(input, '17: task modal').toBeVisible({ timeout: 10_000 });
        await input.fill('Vi');
        await expect.soft(vis(page.locator('[aria-disabled="true"]', { hasText: 'Créer ✓' })), '17: "Créer" disabled under 3 chars').toBeVisible();
        await input.fill(TASK);
        await vis(page.getByText('Créer ✓', { exact: true })).click();
        await expect.soft(vis(page.getByRole('checkbox', { name: TASK, exact: true })), '17: task in MA JOURNÉE').toBeVisible({ timeout: 15_000 });
        const rows = await poll(() => serverQuery('userTasks', 'user_id', acct.uid), (r) => r.length >= 1);
        expect.soft(rows.filter((r) => r.data.title === TASK).length, '17: one server userTasks doc').toBe(1);
        expect.soft(rows.find((r) => r.data.title === TASK)?.data.completed, '17: server completed=false').toBe(false);
        await goHome(page);
        await page.waitForTimeout(2000);
        myDayBefore = await homeMyDay(page);
      });

      // 18 ── Complete the task (SYNC-9)
      await state(h, '18-task-complete', async () => {
        await bottomTab(page, 'Rappels');
        await remindersTopTab(page, 'Tâches');
        const box = vis(page.getByRole('checkbox', { name: TASK, exact: true }));
        await expect(box, '18: task checkbox').toBeVisible({ timeout: 15_000 });
        await box.click();
        await page.waitForTimeout(800);
        const aria = await box.getAttribute('aria-checked');
        const tick = await box.getByText('✓', { exact: true }).count();
        expect.soft(aria, '18: checkbox exposes aria-checked=true (MyDaySection.tsx:385-387)').toBe('true');
        expect.soft(tick, '18: visual tick').toBeGreaterThan(0);
        const rows = await poll(() => serverQuery('userTasks', 'user_id', acct.uid), (r) => r.some((x) => x.data.title === TASK && x.data.completed === true));
        const doc = rows.find((r) => r.data.title === TASK)?.data;
        expect.soft(doc?.completed, '18: server completed=true').toBe(true);
        await goHome(page);
        await page.waitForTimeout(2000);
        const after = await homeMyDay(page);
        if (myDayBefore && after) expect.soft(after.done, '18: Home "Ma Journée" done +1 on focus').toBe(myDayBefore.done + 1);
        else expect.soft({ myDayBefore, after }, '18: Home "Ma Journée x/y" pill present').toEqual({ myDayBefore: 'x/y', after: 'x/y' });
        obs.add('SYNC-9a', doc?.completed === true && aria === 'true' ? 'PASS' : 'FAIL', '18-task-complete', { aria, tick, server: doc, myDayBefore, after });
      });

      // 19 ── Home quick "add task" (HYP-B8)
      await state(h, '19-home-quick-add-task', async () => {
        await expectHomeWeek(page, 32);
        await page.getByTestId('home_quick_add_task').click();
        await page.waitForTimeout(2500);
        const open = await page.getByPlaceholder('Ex: Acheter des vitamines').filter({ visible: true }).count();
        obs.add('HYP-B8', open ? 'REFUTED' : 'CONFIRMED', '19-home-quick-add-task', {
          modalOpened: open > 0,
          cite: 'HomeScreen.tsx:572 passes params.action="add"; TasksTab.tsx reads only highlightId (:61)',
        });
        expect.soft(open, '19: quick "Tâche" opens the add-task modal').toBeGreaterThan(0);
        if (open) await vis(page.getByText('Annuler', { exact: true })).click();
      });

      // 20 ── Statistics after completing a task
      await state(h, '20-statistics', async () => {
        await bottomTab(page, 'Rappels');
        await remindersTopTab(page, 'Tâches');
        await vis(page.getByRole('button', { name: 'Voir mes statistiques', exact: true })).click();
        await expect(vis(page.getByTestId('statistics_screen_root')), '20: statistics').toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(1500);
        const text = await bodyText(page);
        const noData = text.includes('Pas encore de données');
        obs.add('SYNC-9-stats', noData ? 'FAIL' : 'PASS', '20-statistics', {
          noDataShown: noData,
          excerpt: text.slice(0, 400),
          cite: 'getHistoricalData reads only @daily_checklist_v2_* (dailyChecklistService.ts:289); custom tasks never saved there (MyDaySection.tsx:229-236)',
        });
        expect.soft(noData, '20: a completed task must not yield "Pas encore de données"').toBe(false);
      });
    } finally {
      obs.flush();
    }

    // 21 ── Fresh context (server-backed data only)
    const fresh = await freshContextLogin(browser, acct.email, E2E_PASSWORD, 'fr');
    const f = instrument(fresh, testInfo);
    try {
      await state(f, '21-fresh-context', async () => {
        await expectHomeWeek(fresh, 32);
        const found: Record<string, unknown> = {};
        if (todayApptCreated && todayApptHHMM) {
          const label = `${APPT_TODAY}, ${today.dd} ${today.monthLong}, ${todayApptHHMM}`;
          found.homeUpcoming = await vis(fresh.getByRole('button', { name: label, exact: true })).isVisible().catch(() => false);
          await expect.soft(vis(fresh.getByRole('button', { name: label, exact: true })), '21: Home upcoming (fresh)').toBeVisible({ timeout: 15_000 });
          await openCalendar(fresh);
          await selectWeekDay(fresh, today);
          await expect.soft(vis(fresh.getByText(APPT_TODAY, { exact: true })), '21: Calendar card (fresh)').toBeVisible({ timeout: 15_000 });
        }
        await expect.soft(fresh.getByText(APPT, { exact: true }).filter({ visible: true }), '21: deleted appointment stays deleted').toHaveCount(0);
        await bottomTab(fresh, 'Rappels');
        await remindersTopTab(fresh, 'Rappels');
        const sw = vis(fresh.getByRole('switch', { name: VITAMINS, exact: true }));
        await expect(sw, '21: vitamins switch (fresh)').toBeVisible({ timeout: 30_000 });
        found.vitaminsAria = await sw.getAttribute('aria-checked');
        expect.soft(found.vitaminsAria, '21: reminder toggle off survives (server)').toBe('false');
        await remindersTopTab(fresh, 'Tâches');
        const box = vis(fresh.getByRole('checkbox', { name: TASK, exact: true }));
        await expect.soft(box, '21: task present (fresh)').toBeVisible({ timeout: 20_000 });
        found.taskTick = await box.getByText('✓', { exact: true }).count().catch(() => 0);
        expect.soft(found.taskTick, '21: task still completed (fresh)').toBeGreaterThan(0);
        await vis(fresh.getByRole('button', { name: 'Voir mes statistiques', exact: true })).click();
        await expect(vis(fresh.getByTestId('statistics_screen_root'))).toBeVisible({ timeout: 20_000 });
        await fresh.waitForTimeout(1200);
        found.statisticsFresh = (await bodyText(fresh)).includes('Pas encore de données') ? 'no-data' : 'has-data';
        obs.add('SYNC-9', found.vitaminsAria === 'false' && (found.taskTick as number) > 0 ? 'PASS' : 'FAIL', '21-fresh-context', found);
      });
    } finally {
      obs.flush();
      f.dispose();
      await fresh.context().close();
      h.dispose();
    }
  });

  // 14 ── Four appointments this week (HYP-B6) — own account, REST-seeded as the user
  test('B-plan 14: four appointments → Home list cap and "this week" pill count', async ({ page }, testInfo) => {
    test.setTimeout(5 * 60_000);
    const obs = new Observations('wave-B-plan-observations.json', testInfo);
    const acct = await newWeek32Account('plan-4appts');
    const h = instrument(page, testInfo);
    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      await state(h, '14-appt-4-items', async () => {
        // Last day of this (Sunday-start) week, not today/tomorrow → the pill must use "cette semaine".
        const dow = await page.evaluate(() => new Date().getDay());
        const offset = 6 - dow;
        if (offset < 2) {
          obs.add('HYP-B6', 'NOT-REACHED', '14-appt-4-items', { reason: `today is day ${dow}; no day in this week beyond tomorrow` });
          return;
        }
        const day = await localDay(page, offset);
        const lmp = String((await serverDoc(`userProfiles/${acct.uid}`))?.lmp);
        const isos: string[] = [];
        for (const [i, hhmm] of ['09:00', '10:00', '11:00', '12:00'].entries()) {
          const iso = await localIso(page, day.key, hhmm);
          isos.push(iso);
          const id = `user_event_e2e_${Date.now()}_${i}`;
          const week = Math.floor((new Date(iso).getTime() - new Date(lmp).getTime()) / 86_400_000 / 7) + 1;
          const status = await userWrite(`userEvents/${id}`, acct.idToken, {
            event_id: id,
            user_id: acct.uid,
            title: `Wave B RDV ${i + 1}`,
            date: iso,
            week,
            type: 'appointment',
            category: 'medical',
            created_at: new Date().toISOString(),
          });
          expect(status, 'REST seed as user').toBe(200);
        }
        await page.reload({ waitUntil: 'load' });
        await expectHomeWeek(page, 32);
        await page.waitForTimeout(2500);
        const listed = await page.getByRole('button', { name: /^Wave B RDV \d, / }).filter({ visible: true }).count();
        const text = await bodyText(page);
        const pill = text.match(/Vous avez (\d+) rendez-vous prévus? cette semaine\./);
        expect.soft(listed, '14: Home lists max 3 upcoming').toBe(3);
        expect.soft(pill?.[1], '14: pill counts all 4 appointments this week').toBe('4');
        await openCalendar(page);
        const cal = (await bodyText(page)).match(/(\d+) RDV cette semaine/)?.[1] ?? null;
        obs.add('HYP-B6', pill?.[1] === '3' ? 'CONFIRMED' : pill?.[1] === '4' ? 'REFUTED' : 'INFO', '14-appt-4-items', {
          seededOn: day.key,
          isos,
          homeListed: listed,
          homePillCount: pill?.[1] ?? null,
          calendarWeekCount: cal,
          cite: 'HomeScreen.tsx:201 getUpcomingAppointments(uid) limit 3 (calendarService.ts:209,225) feeds DailyRoutinesTracker.tsx:125-127',
        });
      });
    } finally {
      obs.flush();
      h.dispose();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Timezone flush — SYNC-4 + today-appointment + symptom date (states 38-44)
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

    await state(h, `${base}-tz-${slug}-sync4`, async () => {
      await expectHomeWeek(page, 32);
      obs.add(`TZ-${slug}-clock`, 'INFO', `${base}-tz-${slug}-sync4`, clock);
      await sync4Surfaces(h, obs, `${base}-tz-${slug}-sync4`, acct);
    });

    await state(h, `${base + 1}-tz-${slug}-today-appt`, async () => {
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
      await goHome(page);
      await page.waitForTimeout(1500);
      const pill = (await bodyText(page)).includes("Aujourd'hui : 1 rendez-vous !");
      expect.soft(pill, `${slug}: Home pill "Aujourd'hui : 1"`).toBe(true);
      await bottomTab(page, 'Rappels');
      await remindersTopTab(page, 'Tâches');
      const box = page.getByRole('checkbox', { name: `RDV TZ ${slug}`, exact: true }).filter({ visible: true });
      const listed = (await poll(() => box.count(), (c) => c > 0, 15_000)) > 0;
      expect.soft(listed, `${slug}: MA JOURNÉE lists today's appointment`).toBe(true);
      const iso = await localIso(page, today.key, hhmm);
      const tzDoc = (await serverQuery('userEvents', 'user_id', acct.uid)).find((r) => r.data.title === `RDV TZ ${slug}`)?.data;
      expect.soft(tzDoc?.category, `${slug}: appointment saved with the default category Médical`).toBe('medical');
      obs.add(`TZ-${slug}-today-appt`, pill && listed ? 'PASS' : 'FAIL', `${base + 1}-tz-${slug}-today-appt`, {
        localDay: today.key,
        hhmm,
        storedIso: iso,
        utcDayOfStoredIso: iso.slice(0, 10),
        pill,
        myDayListed: listed,
        cite: 'dailyChecklistService.ts:53 event.date.startsWith(localDate) compares a UTC ISO string to a local day',
      });
    });

    await state(h, `${base + 2}-tz-${slug}-symptom`, async () => {
      await page.goto('/health', { waitUntil: 'load' });
      const chip = vis(page.getByRole('button', { name: 'Nausées', exact: true }));
      await expect(chip, 'symptom chip').toBeVisible({ timeout: 30_000 });
      await chip.click();
      const rows = await poll(() => serverQuery('symptomsLog', 'user_id', acct.uid), (r) => r.length >= 1);
      const ids = rows.map((r) => r.id);
      const docDate = rows[0]?.id.slice(acct.uid.length + 1) ?? null;
      expect.soft(docDate, `${slug}: symptomsLog doc date = displayed LOCAL day`).toBe(today.key);
      obs.add(`TZ-${slug}-symptom-date`, docDate === today.key ? 'PASS' : 'FAIL', `${base + 2}-tz-${slug}-symptom`, {
        localDay: today.key,
        docIds: ids,
        data: rows[0]?.data,
        cite: 'healthService.ts:225 today = new Date().toISOString().split("T")[0] (UTC day)',
      });
    });
  } finally {
    obs.flush();
    h.dispose();
  }
}

test.describe('Wave B — timezone flush: Africa/Tunis', () => {
  test.use({ timezoneId: 'Africa/Tunis' });
  test('B-tz Tunis: SYNC-4 + today appointment + symptom day', async ({ page }, testInfo) => {
    test.setTimeout(8 * 60_000);
    await tzRun(page, testInfo, 'Africa/Tunis', 'tunis', 38);
  });
});

test.describe('Wave B — timezone flush: America/New_York', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('B-tz New York: SYNC-4 + today appointment + symptom day', async ({ page }, testInfo) => {
    test.setTimeout(8 * 60_000);
    await tzRun(page, testInfo, 'America/New_York', 'ny', 41);
  });
});

// Extra flush: a zone whose LOCAL calendar day differs from the UTC day right now,
// so UTC-vs-local mismatches surface regardless of when the wave runs.
const BOUNDARY_TZ = new Date().getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Etc/GMT+12';
test.describe(`Wave B — timezone flush: date-boundary ${BOUNDARY_TZ}`, () => {
  test.use({ timezoneId: BOUNDARY_TZ });
  test('B-tz boundary: local day ≠ UTC day', async ({ page }, testInfo) => {
    test.setTimeout(8 * 60_000);
    await tzRun(page, testInfo, BOUNDARY_TZ, 'boundary', 44);
  });
});

// One account, four timezones: the due date on Profile must be the same calendar day.
test.describe('Wave B — due date identical across timezones', () => {
  test('B-tz DPA: Paris / New York / Tunis / boundary show the same DPA', async ({ browser }, testInfo) => {
    test.setTimeout(6 * 60_000);
    const obs = new Observations('wave-B-plan-observations.json', testInfo);
    const acct = await newWeek32Account('tz-dpa');
    const lmp = String((await serverDoc(`userProfiles/${acct.uid}`))?.lmp);
    const expected = canonicalDpa(lmp);
    const seen: Record<string, string | null> = {};
    try {
      for (const tz of ['Europe/Paris', 'America/New_York', 'Africa/Tunis', BOUNDARY_TZ]) {
        const p = await freshContextLogin(browser, acct.email, E2E_PASSWORD, 'fr', { timezoneId: tz });
        const h = instrument(p, testInfo);
        try {
          await state(h, `47-tz-dpa-${tz.replace(/[^A-Za-z]+/g, '-').toLowerCase()}`, async () => {
            await p.goto('/profile', { waitUntil: 'load' });
            await expect(vis(p.getByText("Date Prévue d'Accouchement (DPA)", { exact: true })), 'Profile DPA').toBeVisible({ timeout: 30_000 });
            seen[tz] = await profileDpaText(p);
            expect.soft(seen[tz], `DPA in ${tz}`).toBe(expected);
          });
        } finally {
          h.dispose();
          await p.context().close();
        }
      }
      const values = new Set(Object.values(seen));
      expect.soft(values.size, `DPA identical across zones ${JSON.stringify(seen)}`).toBe(1);
      obs.add('DPA-ACROSS-TZ', values.size === 1 && seen['Europe/Paris'] === expected ? 'PASS' : 'FAIL', '47-tz-dpa', { lmp, expected, seen });
    } finally {
      obs.flush();
    }
  });
});
