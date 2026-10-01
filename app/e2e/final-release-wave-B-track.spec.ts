/**
 * Wave B — B-track half (AUDIT_PLAN final-release-2026-09-30 §3, §8 SYNC-6/7, risk R2/R6).
 * Health dashboard, WeightTracker, Kick counter, Contraction timer, Hospital bag at
 * week 32 — every server-backed write proven by the emulator oracle AND a fresh
 * context; local-only tracker history checked across reload, a new device (fresh
 * context) and a same-device logout → login.
 *
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-B \
 *   timeout 900 npx playwright test e2e/final-release-wave-B-track.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';
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
} from './helpers/emulator-account';
import {
  Observations,
  bodyText,
  instrument,
  localDay,
  withDialogPolicy,
  poll,
  state,
  userWrite,
  vis,
  type Instrumented,
} from './helpers/wave-B-helpers';

test.use({ ...waveUse('fr'), actionTimeout: 15_000, navigationTimeout: 45_000 });

// ── Screen readers (pure DOM reads; assertions stay in the test) ──────────────

async function kickSnapshot(page: Page) {
  await page.goto('/kick-counter', { waitUntil: 'load' });
  await expect(vis(page.getByText('💡 Conseil', { exact: true })), 'Kick counter loaded').toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const text = await bodyText(page);
  return {
    historyRows: (text.match(/^\d+ coups$/gm) ?? ([] as string[])).length,
    rows: text.match(/^\d+ coups$/gm) ?? ([] as string[]),
    today: text.match(/coups aujourd'hui\s*\n\s*(\d+)/)?.[1] ?? null,
    activeSession: text.includes('Touchez pour compter'),
  };
}

async function contractionSnapshot(page: Page) {
  await page.goto('/contraction-timer', { waitUntil: 'load' });
  await expect(vis(page.getByRole('button', { name: 'Début de contraction', exact: true })), 'Contraction timer loaded').toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  const text = await bodyText(page);
  return {
    count: text.match(/(\S+)\s*\n\s*Nombre\b/)?.[1] ?? null,
    avgDuration: text.match(/(\S+)\s*\n\s*Durée moyenne/)?.[1] ?? null,
    empty: text.includes('Aucune contraction enregistrée'),
    historyTimes: text.match(/^\d{1,2}:\d{2}:\d{2}$/gm) ?? ([] as string[]),
  };
}

async function bagSnapshot(page: Page) {
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  await expect(page.getByRole('checkbox').filter({ visible: true }).first(), 'Hospital bag loaded').toBeVisible({ timeout: 30_000 });
  const m = (await bodyText(page)).match(/(\d+) \/ (\d+) préparés/);
  return { done: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null };
}

async function weightSnapshot(page: Page) {
  await page.goto('/weight', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const text = await bodyText(page);
  return {
    setupCardVisible: text.includes('⚙️ Configuration initiale'),
    history: text.match(/^\d+(?:[.,]\d+)? kg$/gm) ?? ([] as string[]),
    /** History list rows only: "<w> kg" followed by "<date> • Semaine N". */
    rows: [...text.matchAll(/^(\d+(?:[.,]\d+)?) kg\n([^\n]*) • Semaine \d+$/gm)].map((m) => ({ kg: m[1], date: m[2] })),
  };
}

async function doWeightSetup(page: Page, kg = '60', cm = '165') {
  const w = vis(page.getByRole('textbox', { name: 'Votre poids avant grossesse (kg)' }));
  await expect(w, 'weight setup card').toBeVisible({ timeout: 20_000 });
  await w.fill(kg);
  await vis(page.getByRole('textbox', { name: 'Votre taille (cm)' })).fill(cm);
  await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
  await expect(vis(page.getByText('⚙️ Configuration initiale', { exact: true })), 'setup card closes').toBeHidden({ timeout: 10_000 });
}

async function addTrackerWeight(page: Page, h: Instrumented, value: string) {
  await vis(page.getByRole('button', { name: 'Ajouter une pesée', exact: true })).click();
  const input = vis(page.getByPlaceholder('Ex: 65.5'));
  await expect(input, 'weight entry input').toBeVisible({ timeout: 10_000 });
  await input.fill(value);
  const n = h.dialogs.dialogs.length;
  await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
  await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 8000);
  return h.dialogs.dialogs.slice(n);
}

async function openHealthModal(page: Page, button: string) {
  await vis(page.getByRole('button', { name: button, exact: true })).click();
}

test.describe('Wave B — B-track (Europe/Paris)', () => {
  test('B-track: Weight · Health · Kick · Contraction · Bag · reload · fresh context · logout', async ({ page, browser }, testInfo) => {
    test.setTimeout(14 * 60_000);
    const obs = new Observations('wave-B-track-observations.json', testInfo);
    const acct = await createAccount(newAccountEmail('B', 'track'), E2E_PASSWORD);
    await seedProfile(acct.uid, acct.idToken, { week: 32, country: 'France', lastName: 'Testeur', firstName: 'Track' });
    const h = instrument(page, testInfo);
    const utcToday = new Date().toISOString().slice(0, 10);
    let local: Record<string, unknown> = {};

    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      await expect(vis(page.getByText('Semaine 32', { exact: true })), 'Home week 32').toBeVisible({ timeout: 30_000 });
      const today = await localDay(page, 0);

      // 22 ── WeightTracker setup (HYP-B9 / SYNC-7)
      await state(h, '22-weight-setup', async () => {
        await vis(page.getByRole('button', { name: 'Mon Poids', exact: true })).click();
        const n = h.dialogs.dialogs.length;
        await doWeightSetup(page);
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        const shown = h.dialogs.dialogs.slice(n).map((d) => d.message);
        expect.soft(shown.join(' '), '22: success alert shown').toContain('Configuration enregistrée');
        await page.waitForTimeout(1500);
        const prof = await serverDoc(`userProfiles/${acct.uid}`);
        expect.soft(prof?.height, '22: server userProfiles.height = 165').toBe(165);
        expect.soft(prof?.prePregnancyWeight, '22: server userProfiles.prePregnancyWeight = 60').toBe(60);
        obs.add('HYP-B9', prof?.height === undefined && prof?.prePregnancyWeight === undefined ? 'CONFIRMED' : 'REFUTED', '22-weight-setup', {
          uiAlert: shown,
          serverHeight: prof?.height ?? null,
          serverPrePregnancyWeight: prof?.prePregnancyWeight ?? null,
          cite: 'WeightTrackerScreen.tsx:307 setProfile → PregnancyContext.tsx:272-297 forwards only emergencyContacts for signed-in users',
        });
      });

      // 22b ── Same-context reload: does the setup survive? + Profile prefill (SYNC-7)
      await state(h, '22b-weight-setup-reload', async () => {
        const w = await weightSnapshot(page);
        await page.goto('/profile', { waitUntil: 'load' });
        const pw = vis(page.getByRole('textbox', { name: 'Poids avant grossesse (kg)' }));
        await expect(pw, 'Profile weight field').toBeVisible({ timeout: 30_000 });
        const profileWeight = await pw.inputValue();
        const profileHeight = await vis(page.getByRole('textbox', { name: 'Taille (cm)' })).inputValue();
        expect.soft(w.setupCardVisible, '22b: setup card must not re-appear after reload').toBe(false);
        expect.soft(profileWeight, '22b: Profile pre-pregnancy weight = 60').toBe('60');
        expect.soft(profileHeight, '22b: Profile height = 165').toBe('165');
        obs.add('SYNC-7', !w.setupCardVisible && profileWeight === '60' && profileHeight === '165' ? 'PASS' : 'FAIL', '22b-weight-setup-reload', {
          setupCardAfterReload: w.setupCardVisible,
          profileWeight,
          profileHeight,
        });
        // Continue the wave: re-do the setup if it was lost.
        await page.goto('/weight', { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        if ((await bodyText(page)).includes('⚙️ Configuration initiale')) await doWeightSetup(page);
      });

      // 23 ── First weight entry 68.4
      await state(h, '23-weight-entry', async () => {
        const dialogs = await addTrackerWeight(page, h, '68.4');
        expect.soft(dialogs.map((d) => d.message).join(' '), '23: saved alert').toContain('Enregistré');
        await expect.soft(vis(page.getByText('68.4 kg', { exact: true })), '23: history row 68.4 kg').toBeVisible({ timeout: 10_000 });
        const gain = (await bodyText(page)).match(/([+-]\d+(?:\.\d)?) kg depuis/)?.[1] ?? null;
        expect.soft(gain, '23: gain vs pre-pregnancy 60 kg').toBe('+8.4');
        const rows = await poll(() => serverQuery('weight_entries', 'user_id', acct.uid), (r) => r.length >= 1);
        expect.soft(rows.map((r) => r.data.weight), '23: server weight_entries').toEqual([68.4]);
        obs.add('WEIGHT-ENTRY', rows.length === 1 ? 'PASS' : 'FAIL', '23-weight-entry', { gain, server: rows.map((r) => r.data) });
      });

      // 24 ── 150 → kg/lb confirm captured, accepted (then the same-day replace confirm)
      await state(h, '24-weight-lb-confirm', async () => {
        const dialogs = await addTrackerWeight(page, h, '150');
        await page.waitForTimeout(2000);
        const all = h.dialogs.dialogs.slice(-4).map((d) => `[${d.type}:${d.action}] ${d.message}`);
        expect.soft(dialogs[0]?.message ?? '', '24: kg/lb confirm').toContain('Est-ce bien en kilogrammes');
        const rows = await poll(() => serverQuery('weight_entries', 'user_id', acct.uid), (r) => r.some((x) => x.data.weight === 150));
        const todays = rows.filter((r) => String(r.data.date).startsWith(utcToday));
        expect.soft(todays.map((r) => r.data.weight), '24: exactly one entry today (150 replaced 68.4)').toEqual([150]);
        obs.add('WEIGHT-LB-CONFIRM', 'INFO', '24-weight-lb-confirm', { dialogs: all, server: rows.map((r) => r.data.weight) });
      });

      // 25 ── Same-day second entry → replace confirm → exactly one doc
      await state(h, '25-weight-same-day', async () => {
        const dialogs = await addTrackerWeight(page, h, '68.4');
        await page.waitForTimeout(2000);
        expect.soft(dialogs[0]?.message ?? '', '25: replace confirm').toContain('Voulez-vous remplacer');
        const rows = await poll(() => serverQuery('weight_entries', 'user_id', acct.uid), (r) => r.length === 1 && r[0].data.weight === 68.4);
        expect.soft(rows.map((r) => r.data.weight), '25: exactly one server doc = 68.4').toEqual([68.4]);
        await expect.soft(page.getByText('150 kg', { exact: true }).filter({ visible: true }), '25: 150 gone from list').toHaveCount(0);
      });

      // 26 ── Health dashboard reflects the tracker (SYNC-6 a)
      await state(h, '26-health-dashboard', async () => {
        await page.goto('/health', { waitUntil: 'load' });
        await expect(vis(page.getByText('À venir', { exact: true })), 'Health loaded').toBeVisible({ timeout: 30_000 });
        const text = await bodyText(page);
        const current = text.match(/Actuel\s*\n\s*([\d.,—]+) kg/)?.[1] ?? null;
        const gain = text.match(/Prise\s*\n\s*([^\n]+)/)?.[1] ?? text.match(/([+-]?\d+(?:\.\d)?) kg\s*\n/)?.[1] ?? null;
        const appts = text.match(/(\d+)\s*\n\s*À venir\s*\n\s*(\d+)\s*\n\s*Passés/);
        expect.soft(current, '26: Health "Actuel" = WeightTracker 68.4').toBe('68.4');
        expect.soft(appts ? [appts[1], appts[2]] : null, '26: appointments 0/0 on this account').toEqual(['0', '0']);
        obs.add('SYNC-6a', current === '68.4' ? 'PASS' : 'FAIL', '26-health-dashboard', { current, gain, appts: appts?.slice(1) });
      });

      // 27 ── Health weight 69.0 → does WeightTracker see it? (HYP-B10)
      await state(h, '27-health-weight-entry', async () => {
        await openHealthModal(page, 'Ajouter une pesée');
        const input = vis(page.getByPlaceholder('Poids (kg)'));
        await expect(input, 'health weight modal').toBeVisible({ timeout: 10_000 });
        await input.fill('69.0');
        const n27 = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await page.waitForTimeout(2000);
        const dialogs27 = h.dialogs.dialogs.slice(n27).map((d) => `[${d.type}:${d.action}] ${d.message}`);
        const metrics = await poll(() => serverQuery('healthMetrics', 'user_id', acct.uid), (r) => r.some((x) => x.data.type === 'weight'));
        const w = metrics.filter((r) => r.data.type === 'weight').map((r) => r.data.value);
        expect.soft(w, '27: server healthMetrics weight 69').toEqual([69]);
        const tracker = await weightSnapshot(page);
        const inTracker = tracker.history.some((x) => /^69(\.0)? kg$/.test(x));
        expect.soft(inTracker, '27: WeightTracker lists the Health entry (single weight history)').toBe(true);
        // One weighing per day across sources (tracker 68.4 then Health 69.0, same day).
        const todayRows = tracker.rows;
        expect.soft(todayRows.length, `27: one weighing per day across sources (rows: ${JSON.stringify(todayRows)})`).toBe(1);
        expect.soft(todayRows[0]?.kg, '27: the day keeps the latest weighing (69)').toBe('69');
        const we = await serverQuery('weight_entries', 'user_id', acct.uid);
        const hm = (await serverQuery('healthMetrics', 'user_id', acct.uid)).filter((r) => r.data.type === 'weight');
        const serverToday = [...we.map((r) => String(r.data.date)), ...hm.map((r) => String(r.data.date))].filter((d) => d.startsWith(utcToday)).length;
        expect.soft(serverToday, '27: one server weighing today across weight_entries + healthMetrics').toBe(1);
        obs.add('WEIGHT-SAME-DAY-DEDUPE', todayRows.length === 1 && serverToday === 1 ? 'PASS' : 'FAIL', '27-health-weight-entry', {
          dialogs: dialogs27,
          trackerRows: todayRows,
          serverWeightEntries: we.map((r) => r.data.weight),
          serverHealthMetricsWeights: hm.map((r) => r.data.value),
        });
        obs.add('HYP-B10', inTracker ? 'REFUTED' : 'CONFIRMED', '27-health-weight-entry', {
          healthMetricsWeights: w,
          weightTrackerHistory: tracker.history,
          cite: 'WeightTrackerScreen.tsx:119 getWeightHistory reads weight_entries only; healthService.ts:39 writes healthMetrics',
        });
      });

      // 28 ── BP boundary 300/200 (HYP-B11) + 140/90 warning
      await state(h, '28-health-bp-boundary', async () => {
        await page.goto('/health', { waitUntil: 'load' });
        await expect(vis(page.getByText('À venir', { exact: true }))).toBeVisible({ timeout: 30_000 });
        const bpBefore = (await serverQuery('healthMetrics', 'user_id', acct.uid)).filter((r) => r.data.type === 'blood_pressure').length;
        await openHealthModal(page, '💓 Tension Artérielle, Ajouter');
        await vis(page.getByPlaceholder('Systolique (ex: 120)')).fill('300');
        await vis(page.getByPlaceholder('Diastolique (ex: 80)')).fill('200');
        const n = h.dialogs.dialogs.length;
        const popupsBefore = h.popups.length;
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        await page.waitForTimeout(2500);
        const dialogs300 = h.dialogs.dialogs.slice(n).map((d) => `[${d.type}:${d.action}] ${d.message}`);
        const popups300 = h.popups.slice(popupsBefore);
        const bpAfter300 = (await serverQuery('healthMetrics', 'user_id', acct.uid)).filter((r) => r.data.type === 'blood_pressure').length;
        // Rules side of the boundary, as the user (same payload shape as healthService.saveBloodPressureEntry).
        const restStatus = await userWrite(`healthMetrics/e2e_bp_boundary_${Date.now()}`, acct.idToken, {
          user_id: acct.uid,
          type: 'blood_pressure',
          value: { systolic: 300, diastolic: 200 },
          date: new Date().toISOString(),
          week: 32,
        });
        const specificMessage = dialogs300.some((d) => /300|systolique|diastolique|invalide/i.test(d) && !/Tension très élevée/.test(d));
        obs.add('HYP-B11', 'NOT-REACHED', '28-health-bp-boundary', {
          uiDialogs: dialogs300,
          popupsOpened: popups300,
          serverBpDocsBefore: bpBefore,
          serverBpDocsAfter: bpAfter300,
          restRulesStatusFor300over200: restStatus,
          note: 'UI accepts 300/200 (validation.ts:156-159) → critical alert; on web showAlert() picks the FIRST non-cancel button ("Appeler les urgences", alert.ts) so OK dials the emergency number and "Sauvegarder quand même" is unreachable; the rules-denial path cannot be driven from the web UI',
        });
        expect.soft(specificMessage || bpAfter300 > bpBefore, '28: 300/200 must yield a specific validation message (UI and rules disagree on the bound)').toBe(true);
        // Critical but rules-valid (165/105): on web the chain of confirms must offer
        // "Sauvegarder quand même" and saving must work; "Appeler" must not be the only outcome.
        if (!(await page.getByPlaceholder('Systolique (ex: 120)').filter({ visible: true }).count())) {
          await openHealthModal(page, '💓 Tension Artérielle, Ajouter');
        }
        await vis(page.getByPlaceholder('Systolique (ex: 120)')).fill('165');
        await vis(page.getByPlaceholder('Diastolique (ex: 80)')).fill('105');
        const popupsBeforeCrit = h.popups.length;
        const critDialogs = await withDialogPolicy(
          h,
          (msg) => (/Sauvegarder quand même/.test(msg) ? 'accept' : /Appeler/.test(msg) ? 'dismiss' : 'accept'),
          async () => {
            await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
            await page.waitForTimeout(2500);
          },
        );
        const offeredSave = critDialogs.some((d) => /Sauvegarder quand même/.test(d.message));
        const offeredCall = critDialogs.some((d) => /Appeler/.test(d.message));
        const crit = await poll(
          () => serverQuery('healthMetrics', 'user_id', acct.uid),
          (r) => r.some((x) => x.data.type === 'blood_pressure' && (x.data.value as any)?.systolic === 165),
        );
        const critSaved = crit.some((x) => x.data.type === 'blood_pressure' && (x.data.value as any)?.systolic === 165);
        expect.soft(offeredSave, '28: critical BP alert offers "Sauvegarder quand même" on web').toBe(true);
        expect.soft(critSaved, '28: 165/105 saved via "Sauvegarder quand même"').toBe(true);
        expect.soft(h.popups.length - popupsBeforeCrit, '28: declining "Appeler" opens no dialer').toBe(0);
        obs.add('BP-CRITICAL-WEB', offeredSave && critSaved ? 'PASS' : 'FAIL', '28-health-bp-boundary', {
          dialogs: critDialogs.map((d) => `[${d.type}:${d.action}] ${d.message}`),
          offeredCall,
          offeredSave,
          saved: critSaved,
        });
        // Close the modal if still open, then 140/90.
        if (await page.getByPlaceholder('Systolique (ex: 120)').filter({ visible: true }).count()) {
          await vis(page.getByPlaceholder('Systolique (ex: 120)')).fill('140');
        } else {
          await openHealthModal(page, '💓 Tension Artérielle, Ajouter');
          await vis(page.getByPlaceholder('Systolique (ex: 120)')).fill('140');
        }
        await vis(page.getByPlaceholder('Diastolique (ex: 80)')).fill('90');
        const m = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > m, 5000);
        const warn = h.dialogs.dialogs[m]?.message ?? '';
        expect.soft(warn, '28: 140/90 clinical warning').toContain('Tension élevée');
        const bp = await poll(
          () => serverQuery('healthMetrics', 'user_id', acct.uid),
          (r) => r.some((x) => x.data.type === 'blood_pressure' && (x.data.value as any)?.systolic === 140),
        );
        const saved = bp.some((x) => x.data.type === 'blood_pressure' && (x.data.value as any)?.systolic === 140);
        expect.soft(saved, '28: 140/90 saved after "proceed"').toBe(true);
        obs.add('BP-WARN-140-90', saved ? 'PASS' : 'FAIL', '28-health-bp-boundary', { warn });
      });

      // 29 ── Glucose 5.2
      await state(h, '29-health-glucose', async () => {
        if (await page.getByPlaceholder('Diastolique (ex: 80)').filter({ visible: true }).count()) {
          await vis(page.getByRole('button', { name: 'Annuler', exact: true })).click();
        }
        await openHealthModal(page, 'Glycémie, Ajouter');
        await vis(page.getByPlaceholder('Objectif : 3,5 – 5,5 mmol/L (à jeun)')).fill('5.2');
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        const rows = await poll(() => serverQuery('glucoseMetrics', 'user_id', acct.uid), (r) => r.length >= 1);
        expect.soft(rows.map((r) => r.data.value), '29: server glucoseMetrics').toEqual([5.2]);
        await expect.soft(vis(page.getByText('5.2 mmol/L', { exact: false })), '29: glucose shown').toBeVisible({ timeout: 10_000 });
      });

      // 30 ── Symptoms (local day vs doc id)
      await state(h, '30-health-symptom', async () => {
        await vis(page.getByRole('button', { name: 'Nausées', exact: true })).click();
        await page.waitForTimeout(600);
        await vis(page.getByRole('button', { name: 'Fatigue', exact: true })).click();
        const rows = await poll(
          () => serverQuery('symptomsLog', 'user_id', acct.uid),
          (r) => r.some((x) => Array.isArray(x.data.symptoms) && (x.data.symptoms as string[]).length === 2),
        );
        const doc = rows[0];
        expect.soft(doc?.data.symptoms, '30: server symptoms').toEqual(['nausea', 'fatigue']);
        expect.soft(doc?.id, '30: doc id = uid_<local day>').toBe(`${acct.uid}_${today.key}`);
        obs.add('SYMPTOM-DAY-PARIS', doc?.id === `${acct.uid}_${today.key}` ? 'PASS' : 'FAIL', '30-health-symptom', { id: doc?.id, data: doc?.data, localDay: today.key });
      });

      // 31 ── Kick counter session to 10
      await state(h, '31-kick-start', async () => {
        await page.goto('/kick-counter', { waitUntil: 'load' });
        await expect(vis(page.getByText('💡 Conseil', { exact: true }))).toBeVisible({ timeout: 30_000 });
        expect.soft((await bodyText(page)).includes('comptez 10 mouvements'), '31: ≥28w guidance').toBe(true);
        await vis(page.getByRole('button', { name: 'Commencer une session', exact: true })).click();
        await expect.soft(page.locator('[aria-label="1 sur la dernière heure"]').filter({ visible: true }), '31: first tap counts 1').toHaveCount(1, { timeout: 5000 });
        const tap = vis(page.getByRole('button', { name: 'Touchez pour compter', exact: true }));
        for (let i = 0; i < 9; i++) {
          await tap.click();
          await page.waitForTimeout(120);
        }
        await expect.soft(page.locator('[aria-label="10 sur la dernière heure"]').filter({ visible: true }), '31: count 10').toHaveCount(1, { timeout: 5000 });
        await vis(page.getByRole('button', { name: 'Terminer la session', exact: true })).click();
        await expect.soft(vis(page.getByText('10 coups', { exact: true })), '31: history row "10 coups"').toBeVisible({ timeout: 5000 });
      });

      // 32 ── Cancel a session → no history row
      await state(h, '32-kick-cancel', async () => {
        const before = (await bodyText(page)).match(/^\d+ coups$/gm)?.length ?? 0;
        await vis(page.getByRole('button', { name: 'Commencer une session', exact: true })).click();
        await expect(vis(page.getByRole('button', { name: 'Touchez pour compter', exact: true }))).toBeVisible();
        const n = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Annuler', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        await page.waitForTimeout(600);
        const after = (await bodyText(page)).match(/^\d+ coups$/gm)?.length ?? 0;
        expect.soft(after, '32: cancelled session adds no history row').toBe(before);
        expect.soft(h.dialogs.dialogs[n]?.message ?? '(none)', '32: cancel confirm has a real question, not just "Annuler"').not.toMatch(/^Annuler\s*$/);
      });

      // 33 ── Contractions ×2
      await state(h, '33-contraction', async () => {
        await page.goto('/contraction-timer', { waitUntil: 'load' });
        for (let i = 0; i < 2; i++) {
          await vis(page.getByRole('button', { name: 'Début de contraction', exact: true })).click();
          await page.waitForTimeout(2600);
          await vis(page.getByRole('button', { name: 'Fin de contraction', exact: true })).click();
          await page.waitForTimeout(1500);
        }
        const text = await bodyText(page);
        const count = text.match(/(\S+)\s*\n\s*Nombre\b/)?.[1];
        const avg = text.match(/(\S+)\s*\n\s*Durée moyenne/)?.[1];
        const times = text.match(/^\d{1,2}:\d{2}:\d{2}$/gm) ?? ([] as string[]);
        expect.soft(count, '33: Nombre 2').toBe('2');
        expect.soft(avg && !/NaN/.test(avg) && avg !== '0:00', `33: average duration sane (${avg})`).toBe(true);
        expect.soft(times.length >= 2 && (times[0] ?? '') >= (times[1] ?? ''), `33: history newest first (${times.join(',')})`).toBe(true);
      });

      // 34 ── Clear all → empty state; then one more contraction for the persistence checks
      await state(h, '34-contraction-clear', async () => {
        const n = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Tout effacer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        expect.soft(h.dialogs.dialogs[n]?.message ?? '', '34: clear confirm copy').toContain('Effacer toutes les contractions');
        await expect.soft(vis(page.getByText('Aucune contraction enregistrée', { exact: true })), '34: empty state with copy').toBeVisible({ timeout: 5000 });
        await vis(page.getByRole('button', { name: 'Début de contraction', exact: true })).click();
        await page.waitForTimeout(2200);
        await vis(page.getByRole('button', { name: 'Fin de contraction', exact: true })).click();
      });

      // 35 ── Hospital bag
      await state(h, '35-bag', async () => {
        const start = await bagSnapshot(page);
        expect(start.total, 'bag progress text').not.toBeNull();
        const boxes = page.getByRole('checkbox').filter({ visible: true });
        for (let i = 0; i < 3; i++) {
          await boxes.nth(i).click();
          await expect.soft(boxes.nth(i), `35: item ${i} checked`).toHaveAttribute('aria-checked', 'true');
        }
        const mid = (await bodyText(page)).match(/(\d+) \/ (\d+) préparés/);
        expect.soft(mid ? [Number(mid[1]), Number(mid[2])] : null, '35: 3 / N').toEqual([3, start.total]);
        await vis(page.getByText('+ Ajouter un élément', { exact: true })).click();
        await vis(page.getByPlaceholder('Nouvel élément…')).fill('Chargeur E2E');
        await vis(page.getByRole('button', { name: 'Ajouter', exact: true })).click();
        await expect.soft(vis(page.getByRole('checkbox', { name: 'Chargeur E2E', exact: true })), '35: custom item added').toBeVisible({ timeout: 5000 });
        const plus = (await bodyText(page)).match(/(\d+) \/ (\d+) préparés/);
        expect.soft(plus ? Number(plus[2]) : null, '35: total N+1').toBe((start.total ?? 0) + 1);
        await vis(page.getByRole('button', { name: 'Retirer', exact: true })).click();
        await page.waitForTimeout(600);
        const minus = (await bodyText(page)).match(/(\d+) \/ (\d+) préparés/);
        expect.soft(minus ? Number(minus[2]) : null, '35: total back to N').toBe(start.total);
        local.bagTotal = start.total;
      });

      // 36 ── Same-context reload: local trackers persist
      await state(h, '36-track-reload', async () => {
        await page.reload({ waitUntil: 'load' });
        const kick = await kickSnapshot(page);
        const con = await contractionSnapshot(page);
        const bag = await bagSnapshot(page);
        expect.soft(kick.rows, '36: kick history persists').toContain('10 coups');
        expect.soft(con.count, '36: contraction persists').toBe('1');
        expect.soft(bag.done, '36: bag persists').toBe(3);
        local = { ...local, kick, con, bag };
      });
    } finally {
      obs.flush();
    }

    // 37 ── New device (fresh context): server data back, local trackers?
    const fresh = await freshContextLogin(browser, acct.email, E2E_PASSWORD, 'fr');
    const f = instrument(fresh, testInfo);
    try {
      let health: Record<string, unknown> = {};
      await state(f, '37a-health-fresh-context', async () => {
        await fresh.goto('/health', { waitUntil: 'load' });
        await expect(vis(fresh.getByText('À venir', { exact: true }))).toBeVisible({ timeout: 30_000 });
        // Data arrives after the first render (pregnancyInfo.week gate, HealthDashboardScreen.tsx:105).
        const t = await poll(() => bodyText(fresh), (x) => x.includes('140 / 90') && x.includes('5.2 mmol/L'), 12_000);
        health = {
          current: t.match(/Actuel\s*\n\s*([\d.,—]+) kg/)?.[1] ?? null,
          bp140: t.includes('140 / 90'),
          glucose: t.includes('5.2 mmol/L'),
          nausea: await vis(fresh.getByRole('button', { name: 'Nausées', exact: true })).getAttribute('aria-selected').catch(() => null),
        };
        expect.soft(health.current, '37a: Health "Actuel" on a new device').toBe('69');
        expect.soft(health.bp140 && health.glucose, '37a: BP + glucose come back (server)').toBe(true);
      });
      await state(f, '37-track-fresh-context', async () => {
        const w = await weightSnapshot(fresh);
        const kick = await kickSnapshot(fresh);
        const con = await contractionSnapshot(fresh);
        const bag = await bagSnapshot(fresh);
        expect.soft(w.setupCardVisible, '37: WeightTracker setup card must not re-appear on a new device (SYNC-7)').toBe(false);
        expect.soft(w.rows.map((r) => r.kg), '37: weight history (one row for today = 69) on a new device').toEqual(['69']);
        obs.add('R6-new-device', kick.historyRows === 0 && con.empty && bag.done === 0 ? 'CONFIRMED' : 'REFUTED', '37-track-fresh-context', {
          before: local,
          freshKick: kick,
          freshContraction: con,
          freshBag: bag,
          weight: w,
          health,
          cite: 'kick_counter_v1 / contraction_timer_v1 / hospital_bag_v1 are AsyncStorage-only (storageKeys.ts:12-46)',
        });
        obs.add('SYNC-6/7-fresh', !w.setupCardVisible && w.rows.length === 1 && w.rows[0]?.kg === '69' ? 'PASS' : 'FAIL', '37-track-fresh-context', w);
      });
    } finally {
      obs.flush();
      f.dispose();
      await fresh.context().close();
    }

    // 37b ── Same device: logout → login again
    try {
      await state(h, '37b-track-logout-relogin', async () => {
        await page.goto('/profile', { waitUntil: 'load' });
        const out = vis(page.getByRole('button', { name: 'Se déconnecter', exact: true }));
        await expect(out, 'logout row').toBeVisible({ timeout: 30_000 });
        await out.click();
        // Signed-out = MainTabs unmounted (AuthStack has no tab bar). Wait for it before
        // touching storage / re-login, otherwise /login races an in-flight logout.
        await expect(page.getByRole('tablist'), 'logged out: MainTabs unmounted').toHaveCount(0, { timeout: 30_000 });
        obs.add('LOGOUT-DIALOGS', 'INFO', '37b-track-logout-relogin', { dialogs: h.dialogs.dialogs.slice(-2).map((d) => d.message), url: page.url() });
        const storage = await page.evaluate(() => ({
          kick: localStorage.getItem('kick_counter_v1'),
          contraction: localStorage.getItem('contraction_timer_v1'),
          bag: localStorage.getItem('hospital_bag_v1'),
          checklist: Object.keys(localStorage).filter((k) => k.startsWith('@daily_checklist_v2_')),
        }));
        await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
        const kick = await kickSnapshot(page);
        const con = await contractionSnapshot(page);
        const bag = await bagSnapshot(page);
        obs.add('R6-logout', kick.historyRows === 0 && con.empty && bag.done === 0 ? 'CONFIRMED' : 'REFUTED', '37b-track-logout-relogin', {
          localStorageAfterLogout: storage,
          kick,
          con,
          bag,
          note: 'history wiped by logout with no disclosure in the UI',
        });
      });
    } finally {
      obs.flush();
      h.dispose();
    }
  });
});
