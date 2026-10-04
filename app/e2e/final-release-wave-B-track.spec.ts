/**
 * Wave B — B-track half (AUDIT_PLAN final-release-2026-09-30 §3, §8 SYNC-6/7, risk R2/R6).
 * Health dashboard, WeightTracker, Kick counter, Contraction timer, Hospital bag at
 * week 32 — every write proven by the emulator oracle AND a fresh context, the tracker
 * records (kickSessions / contractions / hospitalBags) included; plus the offline paths
 * those trackers are built around (records made without signal, logout with unsent records).
 *
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-B \
 *   timeout 1500 npx playwright test e2e/final-release-wave-B-track.spec.ts --reporter=list
 *
 * Every quartet is taken on the surface under test once it has stopped moving
 * (helpers snap → settleVisual). Days are the browser's LOCAL days, like the app's.
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, freshContextLogin, serverDoc, serverQuery, uiLogin, waveUse } from './helpers/emulator-account';
import {
  Observations,
  bodyText,
  bottomTab,
  fold,
  instrument,
  localDay,
  localKeyOf,
  newWeek32Account,
  withDialogPolicy,
  poll,
  state,
  userWrite,
  vis,
  type Instrumented,
} from './helpers/wave-B-helpers';

test.use({ ...waveUse('fr'), actionTimeout: 15_000, navigationTimeout: 45_000 });

// ── Screen readers (pure DOM reads; assertions stay in the test) ──────────────

async function readKick(page: Page) {
  await expect(vis(page.getByText('💡 Conseil', { exact: true })), 'Kick counter loaded').toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const text = await bodyText(page);
  return {
    historyRows: (text.match(/^\d+ coups$/gm) ?? ([] as string[])).length,
    rows: text.match(/^\d+ coups$/gm) ?? ([] as string[]),
    today: text.match(/coups aujourd'hui\s*\n\s*(\d+)/)?.[1] ?? null,
    activeSession: text.includes('Touchez pour compter'),
    firstSessionPrompt: text.includes('Pas encore de session'),
    nextSessionPrompt: text.includes('Prête pour une nouvelle session ?'),
  };
}
async function kickSnapshot(page: Page) {
  await page.goto('/kick-counter', { waitUntil: 'load' });
  return readKick(page);
}

async function readContraction(page: Page) {
  await expect(vis(page.getByRole('button', { name: 'Début de contraction', exact: true })), 'Contraction timer loaded').toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  const text = await bodyText(page);
  return {
    count: text.match(/(\S+)\s*\n\s*Nombre\b/)?.[1] ?? null,
    avgDuration: text.match(/(\S+)\s*\n\s*Durée moyenne/)?.[1] ?? null,
    avgFrequency: text.match(/(\S+)\s*\n\s*Fréquence moyenne/)?.[1] ?? null,
    lastInterval: text.match(/(\S+)\s*\n\s*Dernier intervalle/)?.[1] ?? null,
    empty: text.includes('Aucune contraction enregistrée'),
    historyTimes: text.match(/^\d{1,2}:\d{2}:\d{2}$/gm) ?? ([] as string[]),
  };
}
async function contractionSnapshot(page: Page) {
  await page.goto('/contraction-timer', { waitUntil: 'load' });
  return readContraction(page);
}

async function readBag(page: Page) {
  await expect(page.getByRole('checkbox').filter({ visible: true }).first(), 'Hospital bag loaded').toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const m = (await bodyText(page)).match(/(\d+) \/ (\d+) préparés/);
  return { done: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null };
}
async function bagSnapshot(page: Page) {
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  return readBag(page);
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
    emptyTopCard: text.includes('Aucune pesée enregistrée'),
    emptyHistoryCta: text.includes('Commencez votre suivi'),
  };
}

/**
 * WeightTracker geometry, read from the DOM: the gauge dot against the green band
 * (B-028), the chart against its card (B-014), the tip chips against the screen (B-012).
 */
async function weightLayout(page: Page) {
  return page.evaluate(() => {
    const shown = (e: Element) => (e as HTMLElement).offsetParent !== null;
    const leaf = (test: (t: string) => boolean) =>
      [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && test((d.textContent || '').trim()) && shown(d)) as HTMLElement | undefined;
    const vw = window.innerWidth;
    const round = (n: number) => Math.round(n * 10) / 10;
    /** Hidden by an overflow-clipping ancestor, or past the screen edge. */
    const cutOnTheRight = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 0.5) return true;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if ((cs.overflowX !== 'visible' || cs.overflow !== 'visible') && r.right > a.getBoundingClientRect().right + 0.5 && a.scrollWidth <= a.clientWidth + 1) return true;
      }
      return false;
    };

    const zone = leaf((t) => t === 'Zone indicative');
    const bar = zone?.nextElementSibling as HTMLElement | null | undefined;
    const band = bar?.children[0]?.getBoundingClientRect();
    const dot = bar?.children[1]?.getBoundingClientRect();
    const labelsRow = bar?.nextElementSibling;
    const gauge =
      band && dot
        ? {
            bandLeft: round(band.left),
            bandRight: round(band.right),
            dotCenter: round(dot.left + dot.width / 2),
            labels: labelsRow ? [...labelsRow.children].map((c) => (c.textContent || '').replace(/[  ]/g, ' ').trim()) : [],
          }
        : null;

    const evo = leaf((t) => t === '📈 Évolution');
    const card = evo?.parentElement as HTMLElement | null | undefined;
    const svg = card?.querySelector('svg');
    const chart =
      card && svg
        ? {
            cardLeft: round(card.getBoundingClientRect().left),
            cardRight: round(card.getBoundingClientRect().right),
            svgLeft: round(svg.getBoundingClientRect().left),
            svgRight: round(svg.getBoundingClientRect().right),
            yLabels: [...svg.querySelectorAll('text')].map((t) => (t.textContent || '').trim()).filter((t) => /kg$/.test(t)),
          }
        : null;

    const tip = leaf((t) => t.includes('Hydratez-vous régulièrement'));
    const tips = tip
      ? {
          text: (tip.textContent || '').trim(),
          right: round(tip.getBoundingClientRect().right),
          truncated: tip.scrollWidth > tip.clientWidth + 1,
          cut: cutOnTheRight(tip),
        }
      : null;
    return { vw, gauge, chart, tips };
  });
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
  await page.waitForTimeout(1500);
  return h.dialogs.dialogs.slice(n).map((d) => ({ ...d, message: fold(d.message) }));
}

async function openHealthModal(page: Page, button: string) {
  await vis(page.getByRole('button', { name: button, exact: true })).click();
}

async function openHealth(page: Page) {
  await page.goto('/health', { waitUntil: 'load' });
  await expect(vis(page.getByText('À venir', { exact: true })), 'Health loaded').toBeVisible({ timeout: 30_000 });
}

/** The Glycémie card as rendered: latest value, month summary, target line, flags. */
async function glucoseCard(page: Page) {
  const text = await bodyText(page);
  const summary = ['Aucune mesure ce mois-ci', "Mesures du mois dans l'objectif", 'Mesure hors objectif ce mois-ci'].filter((s) => text.includes(s));
  return {
    values: text.match(/^\d+(?:,\d+)? mmol\/L$/gm) ?? ([] as string[]),
    summary,
    saysNormal: /Glycémie normale/.test(text),
    target: text.match(/Objectif à jeun : [^\n]+/)?.[0] ?? null,
    flags: text.match(/^⚠️ Glycémie[^\n]*$/gm) ?? ([] as string[]),
  };
}

const glucoseValues = async (uid: string) =>
  (await serverQuery('glucoseMetrics', 'user_id', uid)).map((r) => Number(r.data.value)).sort((a, b) => a - b);

async function saveGlucose(page: Page, h: Instrumented, value: string) {
  await openHealthModal(page, 'Glycémie, Ajouter');
  const input = vis(page.getByPlaceholder(/de 3,5 à moins de 5,1 mmol\/L/));
  await expect(input, 'glucose modal (placeholder carries the pregnancy target)').toBeVisible({ timeout: 10_000 });
  await input.fill(value);
  const n = h.dialogs.dialogs.length;
  await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
  await page.waitForTimeout(2500);
  return h.dialogs.dialogs.slice(n).map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`);
}

/** Server side of the three trackers for one account. */
async function trackerServer(uid: string) {
  const kicks = await serverQuery('kickSessions', 'user_id', uid);
  const contractions = await serverQuery('contractions', 'user_id', uid);
  const bag = await serverDoc(`hospitalBags/${uid}`);
  return {
    kickSessions: kicks.map((r) => ({ id: r.id, kicks: Array.isArray(r.data.kicks) ? (r.data.kicks as unknown[]).length : null })),
    contractions: contractions.map((r) => r.id),
    bagChecked: bag ? Object.keys((bag.checked as Record<string, unknown>) ?? {}).length : null,
    bagCustom: bag ? ((bag.customItems as Array<{ label?: string }>) ?? []).map((c) => c.label ?? '') : null,
  };
}

/** Kick → contraction → bag, one quartet each (`name.1-kick`, `name.2-contraction`); ends on the bag. */
async function trackerTriple(h: Instrumented, name: string) {
  const kick = await kickSnapshot(h.page);
  await h.snap(`${name}.1-kick`);
  const con = await contractionSnapshot(h.page);
  await h.snap(`${name}.2-contraction`);
  const bag = await bagSnapshot(h.page);
  return { kick, con, bag };
}

function settleObs(obs: Observations, where: string, ...hs: Instrumented[]) {
  const unsettled = hs.flatMap((x) => x.unsettled);
  obs.add('SNAP-SETTLE', unsettled.length ? 'FAIL' : 'PASS', where, { unsettled });
}

test.describe('Wave B — B-track (Europe/Paris)', () => {
  test('B-track: Weight · Health · Kick · Contraction · Bag · reload · fresh context · logout', async ({ page, browser }, testInfo) => {
    test.setTimeout(20 * 60_000);
    const obs = new Observations('wave-B-track-observations.json', testInfo);
    const acct = await newWeek32Account('track', 'Europe/Paris', { firstName: 'Track' });
    const h = instrument(page, testInfo);
    let local: Record<string, unknown> = {};

    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      await expect(vis(page.getByText('Semaine 32', { exact: true })), 'Home week 32').toBeVisible({ timeout: 30_000 });
      const today = await localDay(page, 0);
      const isLocalToday = async (iso: unknown) => (await localKeyOf(page, String(iso))) === today.key;

      // 22 ── WeightTracker setup (HYP-B9 / SYNC-7)
      await state(h, '22-weight-setup', async () => {
        await vis(page.getByRole('button', { name: 'Mon Poids', exact: true })).click();
        const n = h.dialogs.dialogs.length;
        await doWeightSetup(page);
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        const shown = h.dialogs.dialogs.slice(n).map((d) => fold(d.message));
        expect.soft(shown.join(' '), '22: success alert shown').toContain('Configuration enregistrée');
        await page.waitForTimeout(1500);
        const prof = await serverDoc(`userProfiles/${acct.uid}`);
        expect.soft(prof?.height, '22: server userProfiles.height = 165').toBe(165);
        expect.soft(prof?.prePregnancyWeight, '22: server userProfiles.prePregnancyWeight = 60').toBe(60);
        obs.add('HYP-B9', prof?.height === undefined && prof?.prePregnancyWeight === undefined ? 'CONFIRMED' : 'REFUTED', '22-weight-setup', {
          uiAlert: shown,
          serverHeight: prof?.height ?? null,
          serverPrePregnancyWeight: prof?.prePregnancyWeight ?? null,
        });
        // B-026: with no weighing yet, one empty state (the Historique call to action), not two.
        const text = await bodyText(page);
        const top = text.includes('Aucune pesée enregistrée');
        const cta = text.includes('Commencez votre suivi');
        expect.soft({ top, cta }, '22: one empty state before the first weighing (Historique CTA only)').toEqual({ top: false, cta: true });
        obs.add('B-026-ONE-EMPTY-STATE', !top && cta ? 'PASS' : 'FAIL', '22-weight-setup', { topCardEmptyState: top, historyCta: cta });
      });

      // 22b ── Same-context reload: does the setup survive? + Profile prefill (SYNC-7)
      await state(h, '22b-weight-setup-reload', async () => {
        const w = await weightSnapshot(page);
        await h.snap('22b-weight-setup-reload.weight');
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
        await pw.scrollIntoViewIfNeeded();
      });

      // 23 ── First weight entry 68.4 (+ gauge B-028, chart B-014)
      await state(h, '23-weight-entry', async () => {
        // Continue the wave: re-do the setup if it was lost.
        await page.goto('/weight', { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        if ((await bodyText(page)).includes('⚙️ Configuration initiale')) await doWeightSetup(page);
        const dialogs = await addTrackerWeight(page, h, '68.4');
        expect.soft(dialogs.map((d) => d.message).join(' '), '23: saved alert').toContain('Enregistré');
        await expect.soft(vis(page.getByText('68,4 kg', { exact: true })), '23: history row "68,4 kg" (French decimal comma)').toBeVisible({ timeout: 10_000 });
        const text = await bodyText(page);
        const gain = text.match(/([+-]\d+(?:[.,]\d)?) kg depuis/)?.[1] ?? null;
        expect.soft(gain, '23: gain vs pre-pregnancy 60 kg').toBe('+8,4');
        const range = text.match(/^(\d+(?:,\d)?) - (\d+(?:,\d)?) kg$/m);
        const rows = await poll(() => serverQuery('weight_entries', 'user_id', acct.uid), (r) => r.length >= 1);
        expect.soft(rows.map((r) => r.data.weight), '23: server weight_entries').toEqual([68.4]);
        obs.add('WEIGHT-ENTRY', rows.length === 1 && gain === '+8,4' ? 'PASS' : 'FAIL', '23-weight-entry', { gain, server: rows.map((r) => r.data) });

        const lay = await weightLayout(page);
        const min = range ? Number(range[1].replace(',', '.')) : NaN;
        const max = range ? Number(range[2].replace(',', '.')) : NaN;
        const inRange = 68.4 >= min && 68.4 <= max;
        expect.soft(range?.slice(1) ?? null, '23: recommended range for week 32 printed').not.toBeNull();
        expect.soft(lay.gauge, '23: gauge rendered').not.toBeNull();
        if (lay.gauge && inRange) {
          // B-028: a weight inside the recommended range sits inside the green band.
          expect.soft(lay.gauge.dotCenter, `23: gauge dot (68,4 kg ∈ ${range?.[0]}) is right of the band's left edge`).toBeGreaterThanOrEqual(lay.gauge.bandLeft);
          expect.soft(lay.gauge.dotCenter, `23: gauge dot (68,4 kg ∈ ${range?.[0]}) is left of the band's right edge`).toBeLessThanOrEqual(lay.gauge.bandRight);
          expect.soft(lay.gauge.labels.filter((l) => /kg/.test(l)), '23: gauge end labels are the range bounds, not rounded').toEqual([`${range?.[1]} kg`, `${range?.[2]} kg`]);
        }
        obs.add('B-028-GAUGE', lay.gauge && inRange && lay.gauge.dotCenter >= lay.gauge.bandLeft && lay.gauge.dotCenter <= lay.gauge.bandRight ? 'PASS' : 'FAIL', '23-weight-entry', {
          weight: 68.4,
          recommendedRange: range?.[0] ?? null,
          weightInsideRange: inRange,
          gauge: lay.gauge,
        });
        // B-014: the chart stays inside its card.
        expect.soft(lay.chart, '23: Évolution chart rendered').not.toBeNull();
        if (lay.chart) {
          expect.soft(lay.chart.svgRight, `23: chart right edge (${lay.chart.svgRight}) inside its card (${lay.chart.cardRight})`).toBeLessThanOrEqual(lay.chart.cardRight + 0.5);
          expect.soft(lay.chart.svgLeft, '23: chart left edge inside its card').toBeGreaterThanOrEqual(lay.chart.cardLeft - 0.5);
          expect.soft(lay.chart.yLabels.filter((l) => /\./.test(l)), '23: chart labels use the French decimal comma').toEqual([]);
        }
        obs.add('B-014-CHART', lay.chart && lay.chart.svgRight <= lay.chart.cardRight + 0.5 ? 'PASS' : 'FAIL', '23-weight-entry', { chart: lay.chart, viewport: lay.vw });
        await page.evaluate(() => window.scrollTo(0, 0));
      });
      await state(h, '23b-weight-chart', async () => {
        const evo = vis(page.getByText('📈 Évolution', { exact: true }));
        await expect.soft(evo, '23b: Évolution card').toBeVisible();
        if (await evo.count()) await evo.scrollIntoViewIfNeeded();
      });

      // 24 ── 150 → kg/lb confirm captured, accepted (then the same-day replace confirm)
      await state(h, '24-weight-lb-confirm', async () => {
        const dialogs = await addTrackerWeight(page, h, '150');
        await page.waitForTimeout(1000);
        const all = dialogs.map((d) => `[${d.type}:${d.action}] ${d.message}`);
        expect.soft(dialogs[0]?.message ?? '', '24: kg/lb confirm').toContain('Est-ce bien en kilogrammes');
        expect.soft(all.join(' | '), '24: then the same-day replace confirm, quoting "68,4 kg"').toMatch(/déjà enregistré 68,4 kg aujourd'hui/);
        const rows = await poll(() => serverQuery('weight_entries', 'user_id', acct.uid), (r) => r.length === 1 && r[0].data.weight === 150);
        const todays: unknown[] = [];
        for (const r of rows) if (await isLocalToday(r.data.date)) todays.push(r.data.weight);
        expect.soft(todays, '24: exactly one entry today (150 replaced 68.4)').toEqual([150]);
        const lay = await weightLayout(page);
        // B-012: the tip chips wrap inside the screen.
        if (lay.tips) {
          expect.soft({ cut: lay.tips.cut, truncated: lay.tips.truncated }, `24: hydration tip "${lay.tips.text}" is fully readable (right edge ${lay.tips.right} / ${lay.vw})`).toEqual({ cut: false, truncated: false });
          expect.soft(/\d\s?L\/jour/.test(lay.tips.text), '24: the tip no longer quotes a litre target that contradicts Reminders (B-013)').toBe(false);
        }
        obs.add('B-012-TIP', lay.tips ? (!lay.tips.cut && !lay.tips.truncated ? 'PASS' : 'FAIL') : 'NOT-REACHED', '24-weight-lb-confirm', { tip: lay.tips, viewport: lay.vw });
        obs.add('WEIGHT-LB-CONFIRM', /Est-ce bien en kilogrammes/.test(dialogs[0]?.message ?? '') ? 'PASS' : 'FAIL', '24-weight-lb-confirm', { dialogs: all, server: rows.map((r) => r.data.weight) });
        const tip = vis(page.getByText(/Hydratez-vous régulièrement/));
        if (await tip.count()) await tip.scrollIntoViewIfNeeded();
      });

      // 25 ── Same-day second entry → replace confirm → exactly one doc
      await state(h, '25-weight-same-day', async () => {
        const dialogs = await addTrackerWeight(page, h, '68.4');
        await page.waitForTimeout(1000);
        const replace = dialogs.find((d) => /Voulez-vous remplacer/.test(d.message));
        expect.soft(replace?.message ?? '', '25: replace confirm quotes today\'s 150 kg').toContain('150 kg');
        const rows = await poll(() => serverQuery('weight_entries', 'user_id', acct.uid), (r) => r.length === 1 && r[0].data.weight === 68.4);
        expect.soft(rows.map((r) => r.data.weight), '25: exactly one server doc = 68.4').toEqual([68.4]);
        await expect.soft(page.getByText('150 kg', { exact: true }).filter({ visible: true }), '25: 150 gone from list').toHaveCount(0);
        const w = await bodyText(page);
        const histRows = [...w.matchAll(/^(\d+(?:[.,]\d+)?) kg\n([^\n]*) • Semaine \d+$/gm)].map((m) => m[1]);
        expect.soft(histRows, '25: history lists one row for today').toEqual(['68,4']);
        obs.add('WEIGHT-REPLACE-TRACKER', rows.length === 1 && rows[0].data.weight === 68.4 && !!replace ? 'PASS' : 'FAIL', '25-weight-same-day', {
          dialogs: dialogs.map((d) => `[${d.type}:${d.action}] ${d.message}`),
          server: rows.map((r) => r.data.weight),
          historyRows: histRows,
        });
        const row = vis(page.getByText('68,4 kg', { exact: true }));
        if (await row.count()) await row.scrollIntoViewIfNeeded();
      });

      // 26 ── Health dashboard reflects the tracker (SYNC-6 a)
      await state(h, '26-health-dashboard', async () => {
        await openHealth(page);
        const text = await poll(() => bodyText(page), (t) => /Actuel\s*\n\s*\d/.test(t), 10_000);
        const current = text.match(/Actuel\s*\n\s*([\d.,—]+) kg/)?.[1] ?? null;
        const gain = text.match(/Gain\s*\n\s*([+-]?[\d.,—]+) kg/)?.[1] ?? null;
        const appts = text.match(/(\d+)\s*\n\s*À venir\s*\n\s*(\d+)\s*\n\s*Passés/);
        expect.soft(current, '26: Health "Actuel" = WeightTracker 68,4').toBe('68,4');
        expect.soft(gain, '26: Health "Gain" = WeightTracker +8,4').toBe('+8,4');
        expect.soft(appts ? [appts[1], appts[2]] : null, '26: appointments 0/0 on this account').toEqual(['0', '0']);
        obs.add('SYNC-6a', current === '68,4' && gain === '+8,4' ? 'PASS' : 'FAIL', '26-health-dashboard', { current, gain, appts: appts?.slice(1) ?? null });
      });

      // 26b ── Glycémie card with no reading: neutral, never "normale" (B-009)
      await state(h, '26b-health-glucose-empty', async () => {
        const g = await glucoseCard(page);
        expect.soft(g.values, '26b: no glucose reading yet').toEqual([]);
        expect.soft(g.summary, '26b: with no reading the card says so').toEqual(['Aucune mesure ce mois-ci']);
        expect.soft(g.saysNormal, '26b: never "Glycémie normale" without a reading').toBe(false);
        expect.soft(g.target, '26b: target line = pregnancy fasting target').toBe('Objectif à jeun : de 3,5 à moins de 5,1 mmol/L');
        obs.add('B-009-EMPTY', g.values.length === 0 && g.summary.join() === 'Aucune mesure ce mois-ci' && !g.saysNormal ? 'PASS' : 'FAIL', '26b-health-glucose-empty', g);
        await vis(page.getByRole('button', { name: 'Glycémie, Ajouter', exact: true })).scrollIntoViewIfNeeded();
      });

      // 27 ── Health weight 69.0 on a day that already has 68.4: asks "replace?" (B-001), one weighing a day
      await state(h, '27-health-weight-entry', async () => {
        await openHealthModal(page, 'Ajouter une pesée');
        const input = vis(page.getByPlaceholder('Poids (kg)'));
        await expect(input, 'health weight modal').toBeVisible({ timeout: 10_000 });
        await input.fill('69.0');
        // First answer "no": nothing may change.
        const n1 = h.dialogs.dialogs.length;
        h.dialogs.next('dismiss');
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n1, 6000);
        await page.waitForTimeout(1500);
        const asked = h.dialogs.dialogs.slice(n1).map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`);
        expect.soft(asked.join(' | '), '27: Health asks before replacing today\'s 68,4 kg').toMatch(/déjà enregistré 68,4 kg aujourd'hui\. Voulez-vous remplacer/);
        const afterNo = {
          healthMetrics: (await serverQuery('healthMetrics', 'user_id', acct.uid)).filter((r) => r.data.type === 'weight').map((r) => r.data.value),
          weightEntries: (await serverQuery('weight_entries', 'user_id', acct.uid)).map((r) => r.data.weight),
        };
        expect.soft(afterNo, '27: declining the replace changes nothing on the server').toEqual({ healthMetrics: [], weightEntries: [68.4] });
        // Then "yes".
        if (!(await page.getByPlaceholder('Poids (kg)').filter({ visible: true }).count())) {
          await openHealthModal(page, 'Ajouter une pesée');
          await vis(page.getByPlaceholder('Poids (kg)')).fill('69.0');
        }
        const n2 = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n2, 6000);
        const metrics = await poll(() => serverQuery('healthMetrics', 'user_id', acct.uid), (r) => r.some((x) => x.data.type === 'weight'));
        const hmW = metrics.filter((r) => r.data.type === 'weight');
        expect.soft(hmW.map((r) => r.data.value), '27: server healthMetrics weight 69').toEqual([69]);
        const we = await poll(() => serverQuery('weight_entries', 'user_id', acct.uid), (r) => r.length === 0);
        const accepted = h.dialogs.dialogs.slice(n2).map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`);
        let serverToday = 0;
        for (const d of [...we.map((r) => r.data.date), ...hmW.map((r) => r.data.date)]) if (await isLocalToday(d)) serverToday++;
        // She agreed to replace: the day keeps one weighing on the server, on Health and in the tracker.
        expect.soft(serverToday, '27: after "Remplacer", one server weighing today across weight_entries + healthMetrics').toBe(1);
        const healthNow = (await poll(() => bodyText(page), (t) => /Actuel\s*\n\s*69 kg/.test(t), 8000)).match(/Actuel\s*\n\s*([\d.,—]+) kg/)?.[1] ?? null;
        expect.soft(healthNow, '27: Health "Actuel" = 69').toBe('69');
        await page.evaluate(() => window.scrollTo(0, 0));
        await h.snap('27-health-weight-entry.health');
        const tracker = await weightSnapshot(page);
        const inTracker = tracker.rows.some((x) => x.kg === '69');
        expect.soft(inTracker, '27: WeightTracker lists the Health entry (single weight history)').toBe(true);
        expect.soft(tracker.rows.map((r) => r.kg), '27: one weighing per day across sources, the latest (69)').toEqual(['69']);
        obs.add('WEIGHT-SAME-DAY-DEDUPE', /Voulez-vous remplacer/.test(asked.join(' ')) && tracker.rows.length === 1 && serverToday === 1 ? 'PASS' : 'FAIL', '27-health-weight-entry', {
          dialogsWhenDeclined: asked,
          serverAfterDeclining: afterNo,
          dialogsWhenAccepted: accepted,
          trackerRows: tracker.rows,
          serverWeightEntries: we.map((r) => r.data.weight),
          serverHealthMetricsWeights: hmW.map((r) => r.data.value),
          serverWeighingsToday: serverToday,
        });
        obs.add('HYP-B10', inTracker ? 'REFUTED' : 'CONFIRMED', '27-health-weight-entry', {
          healthMetricsWeights: hmW.map((r) => r.data.value),
          weightTrackerHistory: tracker.history,
        });
      });

      // 28 ── BP boundary 300/200 (HYP-B11), critical 165/105, 140/90 warning (B-010)
      await state(h, '28-health-bp-boundary', async () => {
        await openHealth(page);
        const bpDocs = async () => (await serverQuery('healthMetrics', 'user_id', acct.uid)).filter((r) => r.data.type === 'blood_pressure');
        const bpBefore = (await bpDocs()).length;
        await openHealthModal(page, 'Tension Artérielle, Ajouter');
        await vis(page.getByPlaceholder('Systolique (ex: 120)')).fill('300');
        await vis(page.getByPlaceholder('Diastolique (ex: 80)')).fill('200');
        const n = h.dialogs.dialogs.length;
        const popupsBefore = h.popups.length;
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        await page.waitForTimeout(2500);
        const dialogs300 = h.dialogs.dialogs.slice(n).map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`);
        const popups300 = h.popups.slice(popupsBefore);
        const bpAfter300 = (await bpDocs()).length;
        // Rules side of the boundary, as the user (same payload shape as healthService.saveBloodPressureEntry).
        const restStatus = await userWrite(`healthMetrics/e2e_bp_boundary_${Date.now()}`, acct.idToken, {
          user_id: acct.uid,
          type: 'blood_pressure',
          value: { systolic: 300, diastolic: 200 },
          date: new Date().toISOString(),
          week: 32,
        });
        const specificMessage = dialogs300.some((d) => /300|systolique|diastolique|invalide/i.test(d) && !/Tension très élevée/.test(d));
        const savedByUi = bpAfter300 > bpBefore;
        // HYP-B11 = "the UI accepts 300/200, the rules refuse it, she gets a generic error". Derived from what happened:
        const uiRefusedWithReason = specificMessage && !savedByUi;
        const genericError = !specificMessage && !savedByUi && dialogs300.some((d) => /Erreur/.test(d));
        obs.add('HYP-B11', uiRefusedWithReason ? 'REFUTED' : genericError ? 'CONFIRMED' : 'INFO', '28-health-bp-boundary', {
          uiDialogs: dialogs300,
          popupsOpened: popups300,
          serverBpDocsBefore: bpBefore,
          serverBpDocsAfter: bpAfter300,
          restRulesStatusFor300over200: restStatus,
          uiRefusedWithSpecificMessage: uiRefusedWithReason,
          uiAndRulesAgree: !savedByUi && restStatus !== 200,
        });
        expect.soft(specificMessage || savedByUi, '28: 300/200 must yield a specific validation message (UI and rules agree on the bound)').toBe(true);
        expect.soft(savedByUi === (restStatus === 200), '28: the UI and the rules agree on 300/200').toBe(true);
        await h.snap('28a-health-bp-300-200');
        // Critical but rules-valid (165/105): the confirms must offer "Sauvegarder quand même" and
        // saving must work; "Appeler" must not be the only outcome.
        if (!(await page.getByPlaceholder('Systolique (ex: 120)').filter({ visible: true }).count())) {
          await openHealthModal(page, 'Tension Artérielle, Ajouter');
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
        const crit = await poll(bpDocs, (r) => r.some((x) => (x.data.value as any)?.systolic === 165));
        const critSaved = crit.some((x) => (x.data.value as any)?.systolic === 165);
        expect.soft(offeredSave, '28: critical BP alert offers "Sauvegarder quand même" on web').toBe(true);
        expect.soft(offeredCall, '28: critical BP alert offers the emergency call').toBe(true);
        expect.soft(critSaved, '28: 165/105 saved via "Sauvegarder quand même"').toBe(true);
        expect.soft(h.popups.length - popupsBeforeCrit, '28: declining "Appeler" opens no dialer').toBe(0);
        obs.add('BP-CRITICAL-WEB', offeredSave && offeredCall && critSaved ? 'PASS' : 'FAIL', '28-health-bp-boundary', {
          dialogs: critDialogs.map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`),
          offeredCall,
          offeredSave,
          saved: critSaved,
          dialersOpened: h.popups.length - popupsBeforeCrit,
        });
        // 140/90.
        if (!(await page.getByPlaceholder('Systolique (ex: 120)').filter({ visible: true }).count())) {
          await openHealthModal(page, 'Tension Artérielle, Ajouter');
        }
        await vis(page.getByPlaceholder('Systolique (ex: 120)')).fill('140');
        await vis(page.getByPlaceholder('Diastolique (ex: 80)')).fill('90');
        const m = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > m, 5000);
        const warn = fold(h.dialogs.dialogs[m]?.message ?? '');
        expect.soft(warn, '28: 140/90 clinical warning').toContain('Tension élevée');
        // B-010: 140/90 at 32 SA = contact within 24 h, not "at your next appointment".
        expect.soft(warn, '28: 140/90 says to contact within 24 hours').toMatch(/Contactez votre sage-femme ou votre médecin dans les 24 heures/);
        expect.soft(/prochain rendez-vous/.test(warn), '28: 140/90 no longer defers to "votre prochain rendez-vous"').toBe(false);
        const bp = await poll(bpDocs, (r) => r.some((x) => (x.data.value as any)?.systolic === 140));
        const saved = bp.some((x) => (x.data.value as any)?.systolic === 140);
        expect.soft(saved, '28: 140/90 saved after "proceed"').toBe(true);
        // Out-of-range rows keep their flag in the list.
        const text = await poll(() => bodyText(page), (t) => /140 \/ 90/.test(t) && /165 \/ 105/.test(t), 10_000);
        const flag140 = /140 \/ 90\s*\n\s*⚠️ Tension élevée/.test(text);
        const flag165 = /165 \/ 105\s*\n\s*⚠️ Tension très élevée/.test(text);
        expect.soft({ flag140, flag165 }, '28: 140/90 and 165/105 carry a flag where they are listed').toEqual({ flag140: true, flag165: true });
        obs.add('BP-WARN-140-90', saved && /dans les 24 heures/.test(warn) && !/prochain rendez-vous/.test(warn) ? 'PASS' : 'FAIL', '28-health-bp-boundary', { warn, saved, flag140, flag165 });
        await vis(page.getByRole('button', { name: 'Tension Artérielle, Ajouter', exact: true })).scrollIntoViewIfNeeded();
      });

      // 29a ── Glucose 5.0 fasting: in the pregnancy target → no alert, "dans l'objectif" (B-009/B-010)
      let g50: Awaited<ReturnType<typeof glucoseCard>> | null = null;
      let dialogs50: string[] = [];
      await state(h, '29a-health-glucose-in-range', async () => {
        if (await page.getByPlaceholder('Diastolique (ex: 80)').filter({ visible: true }).count()) {
          await vis(page.getByRole('button', { name: 'Annuler', exact: true })).click();
        }
        dialogs50 = await saveGlucose(page, h, '5.0');
        expect.soft(dialogs50.filter((d) => /Glycémie/.test(d)), '29a: 5,0 mmol/L raises no clinical alert').toEqual([]);
        const server = await poll(() => glucoseValues(acct.uid), (v) => v.length >= 1);
        expect.soft(server, '29a: server glucoseMetrics').toEqual([5]);
        await poll(() => bodyText(page), (t) => /^5 mmol\/L$/m.test(t), 10_000);
        g50 = await glucoseCard(page);
        expect.soft(g50.values[0] ?? null, '29a: latest reading shown').toBe('5 mmol/L');
        expect.soft(g50.summary, '29a: month summary derived from the reading (in range)').toEqual(["Mesures du mois dans l'objectif"]);
        expect.soft(g50.flags, '29a: no flag on an in-range reading').toEqual([]);
        expect.soft(g50.saysNormal, '29a: the fixed "Glycémie normale ce mois-ci" label is gone').toBe(false);
        await vis(page.getByRole('button', { name: 'Glycémie, Ajouter', exact: true })).scrollIntoViewIfNeeded();
      });

      // 29 ── Glucose 5.1 fasting: the GDM criterion → warning, "hors objectif" (B-009/B-010)
      await state(h, '29-health-glucose', async () => {
        const dialogs51 = await saveGlucose(page, h, '5.1');
        const alert = dialogs51.find((d) => /Glycémie à surveiller/.test(d)) ?? '';
        expect.soft(alert, '29: 5,1 mmol/L raises the pregnancy fasting warning').toMatch(/Glycémie à surveiller[\s\S]*5,1 mmol\/L \(0,92 g\/L\) ou plus/);
        expect.soft(/prochain rendez-vous/.test(alert), '29: the warning does not defer to the next appointment').toBe(false);
        const server = await poll(() => glucoseValues(acct.uid), (v) => v.length >= 2);
        expect.soft(server, '29: server glucoseMetrics (saved after "Sauvegarder quand même")').toEqual([5, 5.1]);
        await poll(() => bodyText(page), (t) => /^5,1 mmol\/L$/m.test(t), 10_000);
        const g51 = await glucoseCard(page);
        expect.soft(g51.values[0] ?? null, '29: latest reading shown with the French decimal comma').toBe('5,1 mmol/L');
        expect.soft(g51.summary, '29: month summary derived from the readings (out of range)').toEqual(['Mesure hors objectif ce mois-ci']);
        expect.soft(g51.flags, '29: the 5,1 reading carries its flag').toEqual(['⚠️ Glycémie à surveiller']);
        expect.soft(g51.target, '29: target line').toBe('Objectif à jeun : de 3,5 à moins de 5,1 mmol/L');
        const g = g50 as Awaited<ReturnType<typeof glucoseCard>> | null;
        const pairOk =
          dialogs50.filter((d) => /Glycémie/.test(d)).length === 0 && g?.summary.join() === "Mesures du mois dans l'objectif" &&
          /Glycémie à surveiller/.test(alert) && g51.summary.join() === 'Mesure hors objectif ce mois-ci';
        obs.add('B-009-B-010-GLUCOSE', pairOk ? 'PASS' : 'FAIL', '29-health-glucose', {
          at5_0: { dialogs: dialogs50, card: g },
          at5_1: { dialogs: dialogs51, card: g51 },
          server,
        });
        await vis(page.getByRole('button', { name: 'Glycémie, Ajouter', exact: true })).scrollIntoViewIfNeeded();
      });

      // 29b: moved to its own THROWAWAY account (see 'B-track 29b' below), B-054.

      // 30 ── Symptoms (local day vs doc id; on/off state exposed, B-017)
      await state(h, '30-health-symptom', async () => {
        const nausea = vis(page.getByRole('button', { name: 'Nausées', exact: true }));
        const fatigue = vis(page.getByRole('button', { name: 'Fatigue', exact: true }));
        await expect.soft(nausea, '30: chip off before the tap (aria-pressed)').toHaveAttribute('aria-pressed', 'false');
        await nausea.click();
        await page.waitForTimeout(600);
        await fatigue.click();
        await expect.soft(nausea, '30: Nausées on (aria-pressed)').toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
        await expect.soft(fatigue, '30: Fatigue on (aria-pressed)').toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
        const rows = await poll(
          () => serverQuery('symptomsLog', 'user_id', acct.uid),
          (r) => r.some((x) => Array.isArray(x.data.symptoms) && (x.data.symptoms as string[]).length === 2),
        );
        const doc = rows[0];
        expect.soft(doc?.data.symptoms, '30: server symptoms').toEqual(['nausea', 'fatigue']);
        expect.soft(doc?.id, '30: doc id = uid_<local day>').toBe(`${acct.uid}_${today.key}`);
        obs.add('SYMPTOM-DAY-PARIS', doc?.id === `${acct.uid}_${today.key}` ? 'PASS' : 'FAIL', '30-health-symptom', { id: doc?.id, data: doc?.data, localDay: today.key });
        await nausea.scrollIntoViewIfNeeded();
      });

      // 31 ── Kick counter session to 10 (+ server kickSessions, B-015 prompt)
      await state(h, '31-kick-start', async () => {
        await page.goto('/kick-counter', { waitUntil: 'load' });
        await expect(vis(page.getByText('💡 Conseil', { exact: true }))).toBeVisible({ timeout: 30_000 });
        expect.soft((await bodyText(page)).includes('comptez 10 mouvements'), '31: ≥28w guidance').toBe(true);
        const first = await readKick(page);
        expect.soft({ first: first.firstSessionPrompt, next: first.nextSessionPrompt }, '31: before any session the screen says "Pas encore de session"').toEqual({ first: true, next: false });
        await vis(page.getByRole('button', { name: 'Commencer une session', exact: true })).click();
        await expect.soft(page.locator('[aria-label="1 sur la dernière heure"]').filter({ visible: true }), '31: first tap counts 1').toHaveCount(1, { timeout: 5000 });
        const tap = vis(page.getByRole('button', { name: 'Touchez pour compter', exact: true }));
        for (let i = 0; i < 9; i++) {
          await tap.click();
          await page.waitForTimeout(120);
        }
        await expect.soft(page.locator('[aria-label="10 sur la dernière heure"]').filter({ visible: true }), '31: count 10').toHaveCount(1, { timeout: 5000 });
        await h.snap('31a-kick-active-10');
        await vis(page.getByRole('button', { name: 'Terminer la session', exact: true })).click();
        await expect.soft(vis(page.getByText('10 coups', { exact: true })), '31: history row "10 coups"').toBeVisible({ timeout: 5000 });
        // B-015: with a session in the history the idle card invites a NEW session.
        const after = await readKick(page);
        expect.soft({ first: after.firstSessionPrompt, next: after.nextSessionPrompt }, '31: after a session the screen no longer says "Pas encore de session"').toEqual({ first: false, next: true });
        await expect.soft(vis(page.getByRole('button', { name: 'Nouvelle session', exact: true })), '31: "Nouvelle session" button').toBeVisible();
        expect.soft(after.today, '31: "coups aujourd\'hui" = 10').toBe('10');
        // B-020: the session reaches the server.
        const srv = await poll(() => trackerServer(acct.uid), (s) => s.kickSessions.length >= 1, 12_000);
        expect.soft(srv.kickSessions.map((k) => k.kicks), '31: server kickSessions = one session of 10 kicks').toEqual([10]);
        expect.soft(srv.kickSessions[0]?.id.startsWith(`${acct.uid}_`) ?? false, '31: server doc id is owner-prefixed').toBe(true);
        obs.add('B-015-KICK-PROMPT', !after.firstSessionPrompt && after.nextSessionPrompt ? 'PASS' : 'FAIL', '31-kick-start', { beforeFirstSession: first, afterSession: after });
        obs.add('TRACKER-SERVER-kick', srv.kickSessions.length === 1 && srv.kickSessions[0].kicks === 10 ? 'PASS' : 'FAIL', '31-kick-start', { server: srv.kickSessions });
      });

      // 32 ── Cancel a session → no history row, no server doc
      await state(h, '32-kick-cancel', async () => {
        const before = (await bodyText(page)).match(/^\d+ coups$/gm)?.length ?? 0;
        await vis(page.getByRole('button', { name: 'Nouvelle session', exact: true })).click();
        await expect(vis(page.getByRole('button', { name: 'Touchez pour compter', exact: true }))).toBeVisible();
        const n = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Annuler', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        await page.waitForTimeout(1500);
        const after = (await bodyText(page)).match(/^\d+ coups$/gm)?.length ?? 0;
        expect.soft(after, '32: cancelled session adds no history row').toBe(before);
        expect.soft(fold(h.dialogs.dialogs[n]?.message ?? '(none)'), '32: cancel confirm has a real question, not just "Annuler"').toMatch(/Annuler cette session \?/);
        const srv = await trackerServer(acct.uid);
        expect.soft(srv.kickSessions.map((k) => k.kicks), '32: the cancelled session never reaches the server').toEqual([10]);
      });

      // 33 ── Contractions ×2 (+ server contractions)
      await state(h, '33-contraction', async () => {
        await page.goto('/contraction-timer', { waitUntil: 'load' });
        for (let i = 0; i < 2; i++) {
          await vis(page.getByRole('button', { name: 'Début de contraction', exact: true })).click();
          await page.waitForTimeout(2600);
          await vis(page.getByRole('button', { name: 'Fin de contraction', exact: true })).click();
          await page.waitForTimeout(1500);
        }
        const c = await readContraction(page);
        expect.soft(c.count, '33: Nombre 2').toBe('2');
        expect.soft(!!c.avgDuration && !/NaN/.test(c.avgDuration) && c.avgDuration !== '0:00', `33: average duration sane (${c.avgDuration})`).toBe(true);
        expect.soft(!!c.avgFrequency && /^\d+:\d{2}$/.test(c.avgFrequency) && c.avgFrequency !== '0:00', `33: with two contractions the interval is a real duration (${c.avgFrequency})`).toBe(true);
        expect.soft(c.historyTimes.length >= 2 && (c.historyTimes[0] ?? '') >= (c.historyTimes[1] ?? ''), `33: history newest first (${c.historyTimes.join(',')})`).toBe(true);
        const srv = await poll(() => trackerServer(acct.uid), (s) => s.contractions.length >= 2, 12_000);
        expect.soft(srv.contractions.length, '33: server contractions = 2').toBe(2);
        obs.add('TRACKER-SERVER-contractions', srv.contractions.length === 2 ? 'PASS' : 'FAIL', '33-contraction', { screen: c, server: srv.contractions });
      });

      // 34 ── Clear all → empty state + server emptied; 34b ── one contraction: "—" intervals (B-024)
      await state(h, '34-contraction-clear', async () => {
        const n = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Tout effacer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        expect.soft(fold(h.dialogs.dialogs[n]?.message ?? ''), '34: clear confirm copy').toContain('Effacer toutes les contractions ?');
        await expect.soft(vis(page.getByText('Aucune contraction enregistrée', { exact: true })), '34: empty state with copy').toBeVisible({ timeout: 5000 });
        const srv = await poll(() => trackerServer(acct.uid), (s) => s.contractions.length === 0, 12_000);
        expect.soft(srv.contractions.length, '34: "Tout effacer" deletes the server copies').toBe(0);
        obs.add('TRACKER-SERVER-contractions-clear', srv.contractions.length === 0 ? 'PASS' : 'FAIL', '34-contraction-clear', { server: srv.contractions });
      });
      await state(h, '34b-contraction-single', async () => {
        await vis(page.getByRole('button', { name: 'Début de contraction', exact: true })).click();
        await page.waitForTimeout(2200);
        await vis(page.getByRole('button', { name: 'Fin de contraction', exact: true })).click();
        await page.waitForTimeout(1200);
        const c = await readContraction(page);
        expect.soft(c.count, '34b: Nombre 1').toBe('1');
        expect.soft({ avgFrequency: c.avgFrequency, lastInterval: c.lastInterval }, '34b: one contraction has no interval — "—", not "0:00"').toEqual({ avgFrequency: '—', lastInterval: '—' });
        const srv = await poll(() => trackerServer(acct.uid), (s) => s.contractions.length === 1, 12_000);
        expect.soft(srv.contractions.length, '34b: server contractions = 1 (cleared ones stay gone)').toBe(1);
        obs.add('B-024-SINGLE-CONTRACTION', c.avgFrequency === '—' && c.lastInterval === '—' ? 'PASS' : 'FAIL', '34b-contraction-single', { screen: c, server: srv.contractions });
        await vis(page.getByText('Fréquence moyenne', { exact: true })).scrollIntoViewIfNeeded();
      });

      // 35 ── Hospital bag (+ documents for a France profile B-016, + server hospitalBags)
      await state(h, '35-bag', async () => {
        const start = await bagSnapshot(page);
        expect(start.total, 'bag progress text').not.toBeNull();
        const labels = (await page.getByRole('checkbox').filter({ visible: true }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''))).map(fold);
        const vitale = labels.filter((l) => /Vitale/.test(l));
        const tunisian = labels.filter((l) => /CIN|CNAM/.test(l));
        expect.soft(vitale, '35: a France profile is asked for the carte Vitale and the mutuelle card').toEqual(['Carte Vitale et carte de mutuelle']);
        expect.soft(tunisian, '35: no Tunisian documents (CIN / CNAM) for a France profile').toEqual([]);
        expect.soft(labels.includes("Pièce d'identité"), '35: identity document has the neutral label').toBe(true);
        obs.add('B-016-BAG-FR', vitale.length === 1 && tunisian.length === 0 ? 'PASS' : 'FAIL', '35-bag', { profileCountry: (await serverDoc(`userProfiles/${acct.uid}`))?.country ?? null, papers: labels.filter((l) => /Vitale|CIN|CNAM|identité|assurance/i.test(l)) });
        await h.snap('35a-bag-documents-fr');
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
        const withCustom = await poll(() => trackerServer(acct.uid), (s) => (s.bagCustom ?? []).includes('Chargeur E2E'), 12_000);
        expect.soft(withCustom.bagCustom, '35: server hospitalBags carries the custom item').toEqual(['Chargeur E2E']);
        await vis(page.getByRole('button', { name: 'Retirer', exact: true })).click();
        await page.waitForTimeout(600);
        const minus = (await bodyText(page)).match(/(\d+) \/ (\d+) préparés/);
        expect.soft(minus ? Number(minus[2]) : null, '35: total back to N').toBe(start.total);
        const srv = await poll(() => trackerServer(acct.uid), (s) => s.bagChecked === 3 && (s.bagCustom ?? ['x']).length === 0, 12_000);
        expect.soft({ checked: srv.bagChecked, custom: srv.bagCustom }, '35: server hospitalBags = 3 ticks, custom item removed').toEqual({ checked: 3, custom: [] });
        obs.add('TRACKER-SERVER-bag', srv.bagChecked === 3 && (srv.bagCustom ?? ['x']).length === 0 ? 'PASS' : 'FAIL', '35-bag', { server: { checked: srv.bagChecked, custom: srv.bagCustom }, serverWithCustomItem: withCustom.bagCustom });
        local.bagTotal = start.total;
        await page.evaluate(() => window.scrollTo(0, 0));
      });

      // 36 ── Same-context reload: trackers persist
      await state(h, '36-track-reload', async () => {
        await page.reload({ waitUntil: 'load' });
        const { kick, con, bag } = await trackerTriple(h, '36-track-reload');
        expect.soft(kick.rows, '36: kick history persists').toEqual(['10 coups']);
        expect.soft(con.count, '36: contraction persists').toBe('1');
        expect.soft(bag.done, '36: bag persists').toBe(3);
        local = { ...local, kick, con, bag };
      });
    } finally {
      settleObs(obs, 'B-track main context', h);
      obs.flush();
    }

    // 37 ── New device (fresh context): server data back, trackers included
    const fresh = await freshContextLogin(browser, acct.email, E2E_PASSWORD, 'fr');
    const f = instrument(fresh, testInfo);
    try {
      let health: Record<string, unknown> = {};
      await state(f, '37a-health-fresh-context', async () => {
        await openHealth(fresh);
        // Data arrives after the first render.
        const t = await poll(() => bodyText(fresh), (x) => x.includes('140 / 90') && x.includes('5,1 mmol/L'), 12_000);
        const nausea = vis(fresh.getByRole('button', { name: 'Nausées', exact: true }));
        const fatigue = vis(fresh.getByRole('button', { name: 'Fatigue', exact: true }));
        const headache = vis(fresh.getByRole('button', { name: 'Maux de tête', exact: true }));
        // B-017: today's symptoms come back selected on a new device — asserted on the exposed state.
        await expect.soft(nausea, '37a: Nausées restored as selected (aria-pressed)').toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
        await expect.soft(fatigue, '37a: Fatigue restored as selected (aria-pressed)').toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
        const g = await glucoseCard(fresh);
        health = {
          current: t.match(/Actuel\s*\n\s*([\d.,—]+) kg/)?.[1] ?? null,
          bp140: t.includes('140 / 90'),
          glucoseLatest: g.values[0] ?? null,
          glucoseSummary: g.summary,
          glucoseFlags: g.flags,
          nauseaPressed: await nausea.getAttribute('aria-pressed'),
          fatiguePressed: await fatigue.getAttribute('aria-pressed'),
          untouchedChipPressed: (await headache.count()) ? await headache.getAttribute('aria-pressed') : 'chip not found',
        };
        expect.soft(health.untouchedChipPressed, '37a: a symptom she did not pick stays off').toBe('false');
        expect.soft(health.current, '37a: Health "Actuel" on a new device').toBe('69');
        expect.soft(health.bp140, '37a: BP comes back (server)').toBe(true);
        expect.soft(health.glucoseLatest, '37a: latest glucose comes back (server)').toBe('5,1 mmol/L');
        expect.soft(health.glucoseSummary, '37a: glucose month summary on a new device').toEqual(['Mesure hors objectif ce mois-ci']);
        obs.add('B-017-SYMPTOM-RESTORE', health.nauseaPressed === 'true' && health.fatiguePressed === 'true' && health.untouchedChipPressed === 'false' ? 'PASS' : 'FAIL', '37a-health-fresh-context', health);
        await nausea.scrollIntoViewIfNeeded();
      });
      await state(f, '37-track-fresh-context', async () => {
        const w = await weightSnapshot(fresh);
        await f.snap('37-track-fresh-context.0-weight');
        const { kick, con, bag } = await trackerTriple(f, '37-track-fresh-context');
        const srv = await trackerServer(acct.uid);
        expect.soft(w.setupCardVisible, '37: WeightTracker setup card must not re-appear on a new device (SYNC-7)').toBe(false);
        expect.soft(w.rows.map((r) => r.kg), '37: weight history (one row for today = 69) on a new device').toEqual(['69']);
        // B-020: the tracker history follows the account to a new device, and the server says the same.
        expect.soft(kick.rows, '37: kick history on a new device').toEqual(['10 coups']);
        expect.soft(con.count, '37: contraction history on a new device').toBe('1');
        expect.soft(bag.done, '37: bag ticks on a new device').toBe(3);
        expect.soft({ kicks: srv.kickSessions.map((k) => k.kicks), contractions: srv.contractions.length, bagChecked: srv.bagChecked }, '37: server truth for the three trackers').toEqual({ kicks: [10], contractions: 1, bagChecked: 3 });
        const lost = kick.historyRows === 0 && con.empty && bag.done === 0;
        const back = kick.rows.join() === '10 coups' && con.count === '1' && bag.done === 3;
        obs.add('R6-new-device', lost ? 'CONFIRMED' : back ? 'REFUTED' : 'FAIL', '37-track-fresh-context', {
          before: local,
          freshKick: kick,
          freshContraction: con,
          freshBag: bag,
          server: srv,
          weight: w,
          health,
        });
        obs.add('SYNC-6/7-fresh', !w.setupCardVisible && w.rows.length === 1 && w.rows[0]?.kg === '69' ? 'PASS' : 'FAIL', '37-track-fresh-context', w);
      });
    } finally {
      settleObs(obs, 'B-track fresh context', f);
      obs.flush();
      f.dispose();
      await fresh.context().close();
    }

    // 37b ── Same device, online: logout → login again (everything synced → no loss warning)
    try {
      await state(h, '37b-track-logout-relogin', async () => {
        await page.goto('/profile', { waitUntil: 'load' });
        const out = vis(page.getByRole('button', { name: 'Se déconnecter', exact: true }));
        await expect(out, 'logout row').toBeVisible({ timeout: 30_000 });
        const n = h.dialogs.dialogs.length;
        await out.click();
        // Signed-out = MainTabs unmounted (AuthStack has no tab bar). Wait for it before
        // touching storage / re-login, otherwise /login races an in-flight logout.
        await expect(page.getByRole('tablist'), 'logged out: MainTabs unmounted').toHaveCount(0, { timeout: 30_000 });
        const logoutDialogs = h.dialogs.dialogs.slice(n).map((d) => fold(d.message));
        expect.soft(logoutDialogs.length, `37b: online, with everything synced, logout asks once (${JSON.stringify(logoutDialogs)})`).toBe(1);
        expect.soft(logoutDialogs.some((m) => /pas encore sauvegardés/.test(m)), '37b: no "unsaved records" warning when nothing is unsent').toBe(false);
        await h.snap('37b-track-logout-relogin.0-logged-out');
        const storage = await page.evaluate(() => ({
          kick: localStorage.getItem('kick_counter_v1'),
          contraction: localStorage.getItem('contraction_timer_v1'),
          bag: localStorage.getItem('hospital_bag_v1'),
          checklist: Object.keys(localStorage).filter((k) => k.startsWith('@daily_checklist_v2_')),
        }));
        await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
        const { kick, con, bag } = await trackerTriple(h, '37b-track-logout-relogin');
        expect.soft(kick.rows, '37b: kick history back after logout → login').toEqual(['10 coups']);
        expect.soft(con.count, '37b: contraction back after logout → login').toBe('1');
        expect.soft(bag.done, '37b: bag ticks back after logout → login').toBe(3);
        const lost = kick.historyRows === 0 && con.empty && bag.done === 0;
        const back = kick.rows.join() === '10 coups' && con.count === '1' && bag.done === 3;
        obs.add('R6-logout', lost ? 'CONFIRMED' : back ? 'REFUTED' : 'FAIL', '37b-track-logout-relogin', {
          logoutDialogs,
          url: page.url(),
          deviceWipedAtLogout: storage.kick === null && storage.contraction === null && storage.bag === null,
          localStorageAfterLogout: storage,
          kick,
          con,
          bag,
        });
      });
    } finally {
      settleObs(obs, 'B-track logout/relogin', h);
      obs.flush();
      h.dispose();
    }
  });

  // 29b ── A g/L figure typed into the mmol/L field (B-054). THROWAWAY account: on web the clinical
  // alert's two positive buttons ("Appeler les urgences", "Sauvegarder quand même") are offered one
  // confirm at a time (src/utils/alert.ts:44-52) and declining the first lets the second one save, so
  // the value IS stored (HealthDashboardScreen.tsx showClinicalAlert / handleAddGlucose). That would
  // pollute the main B-track account, hence the separate account. The contract asserted here is the
  // real one: the low-glucose alert is raised (never accepted silently as in range), and a value she
  // chose to save anyway is stored on the server AND listed with its flag.
  test('B-track 29b: 0,92 typed as mmol/L raises the low-glucose alert; saved anyway = stored and flagged', async ({ page }, testInfo) => {
    test.setTimeout(4 * 60_000);
    const obs = new Observations('wave-B-track-observations.json', testInfo);
    const acct = await newWeek32Account('track-glucose-gl', 'Europe/Paris', { firstName: 'Glucie' });
    const h = instrument(page, testInfo);
    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      await openHealth(page);
      await state(h, '29b-health-glucose-gl-value', async () => {
        await openHealthModal(page, 'Glycémie, Ajouter');
        const input = vis(page.getByPlaceholder(/de 3,5 à moins de 5,1 mmol\/L/));
        await expect(input, '29b: glucose modal (placeholder carries the pregnancy target)').toBeVisible({ timeout: 10_000 });
        await input.fill('0.92');
        const n = h.dialogs.dialogs.length;
        // First confirm = "Appeler les urgences": decline it (accepting would open the dialer). The
        // second confirm = "Sauvegarder quand même" is left on the recorder's default (accept).
        h.dialogs.next('dismiss');
        await vis(page.getByRole('button', { name: 'Enregistrer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x >= n + 2, 8000);
        const asked = h.dialogs.dialogs.slice(n).map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`);
        expect.soft(asked.join(' | '), '29b: 0,92 typed as mmol/L is flagged as a low glucose, never accepted silently as in range').toMatch(/Glycémie basse/);
        expect.soft(asked[0] ?? '', '29b: the first offer is the emergency call, declined').toMatch(/dismissed[\s\S]*Appeler les urgences/);
        expect.soft(asked[1] ?? '', '29b: the second offer is "Sauvegarder quand même", accepted').toMatch(/accepted[\s\S]*Sauvegarder quand même/);
        const server = await poll(() => glucoseValues(acct.uid), (v) => v.length >= 1);
        expect.soft(server, '29b: the value she saved anyway is stored on the server').toEqual([0.92]);
        const text = await poll(() => bodyText(page), (t) => /^0,9 mmol\/L$/m.test(t), 10_000);
        const card = await glucoseCard(page);
        expect.soft(/^0,9 mmol\/L$/m.test(text), '29b: the stored value is shown with the French decimal comma (formatDecimal keeps 1 fraction digit)').toBe(true);
        expect.soft(card.flags, '29b: and it carries its low-glucose flag in the list').toEqual(['⚠️ Glycémie basse']);
        obs.add('GLUCOSE-GL-UNIT', /Glycémie basse/.test(asked.join(' ')) && server.join() === '0.92' && card.flags.length === 1 ? 'PASS' : 'FAIL', '29b-health-glucose-gl-value', { asked, server, card });
      });
    } finally {
      settleObs(obs, 'B-track 29b', h);
      obs.flush();
      h.dispose();
    }
  });

  // 35b ── Hospital bag documents for a Tunisia profile (B-016)
  test('B-track 35b: hospital bag documents follow the profile country (Tunisia)', async ({ page }, testInfo) => {
    test.setTimeout(4 * 60_000);
    const obs = new Observations('wave-B-track-observations.json', testInfo);
    const acct = await newWeek32Account('track-bag-tn', 'Europe/Paris', { country: 'tunisia', firstName: 'Tounes' });
    const h = instrument(page, testInfo);
    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      await state(h, '35b-bag-documents-tn', async () => {
        await bagSnapshot(page);
        const labels = (await page.getByRole('checkbox').filter({ visible: true }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''))).map(fold);
        const papers = labels.filter((l) => /Vitale|CIN|CNAM|identité|assurance/i.test(l));
        expect.soft(labels.includes("Carte d'identité (CIN)"), '35b: a Tunisia profile is asked for the CIN').toBe(true);
        expect.soft(labels.includes('Carte CNAM / assurance maladie'), '35b: a Tunisia profile is asked for the CNAM card').toBe(true);
        expect.soft(labels.filter((l) => /Vitale|mutuelle/.test(l)), '35b: no French documents for a Tunisia profile').toEqual([]);
        obs.add('B-016-BAG-TN', labels.includes("Carte d'identité (CIN)") && labels.includes('Carte CNAM / assurance maladie') && !labels.some((l) => /Vitale|mutuelle/.test(l)) ? 'PASS' : 'FAIL', '35b-bag-documents-tn', {
          profileCountry: (await serverDoc(`userProfiles/${acct.uid}`))?.country ?? null,
          papers,
        });
      });
    } finally {
      settleObs(obs, 'B-track 35b', h);
      obs.flush();
      h.dispose();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Offline (B-018 / B-020): records made without signal, "Tout effacer" without signal,
// and a logout while records are still unsent.
// ══════════════════════════════════════════════════════════════════════════════

/** Console lines a browser context produces because the HARNESS cut the network. */
const OFFLINE_NOISE = [/ERR_INTERNET_DISCONNECTED/i, /Could not reach Cloud Firestore backend/i, /client is offline/i, /Failed to load resource/i, /net::ERR_/i, /WebChannelConnection/i, /network-request-failed/i];

test.describe('Wave B — B-track offline', () => {
  test('B-track offline: tracker records without signal · sync on return · logout warns before erasing', async ({ page, context }, testInfo) => {
    test.setTimeout(12 * 60_000);
    const obs = new Observations('wave-B-track-observations.json', testInfo);
    const acct = await newWeek32Account('track-offline', 'Europe/Paris', { firstName: 'Offline' });
    const h = instrument(page, testInfo);
    const home = async () => {
      await bottomTab(page, 'Accueil');
      await page.waitForTimeout(400);
      if (!(await page.getByTestId('home_quick_add_appointment').filter({ visible: true }).count())) await bottomTab(page, 'Accueil');
      await expect(page.getByTestId('home_quick_add_appointment').filter({ visible: true }), 'Home root').toHaveCount(1, { timeout: 20_000 });
    };
    const openTool = async (card: string) => {
      await home();
      await vis(page.getByRole('button', { name: card, exact: true })).click();
    };
    const pendingOnDevice = () =>
      page.evaluate(() => {
        const read = (k: string) => {
          try {
            return JSON.parse(localStorage.getItem(k) || 'null');
          } catch {
            return null;
          }
        };
        const kick = read('kick_counter_v1');
        const con = read('contraction_timer_v1');
        const bag = read('hospital_bag_v1');
        return {
          kickUnsynced: ((kick?.history ?? []) as Array<{ synced?: boolean; endedAt?: number | null }>).filter((s) => !s.synced && s.endedAt !== null).length,
          kickHistory: (kick?.history ?? []).length as number,
          contractionsUnsynced: ((con?.history ?? []) as Array<{ synced?: boolean }>).filter((c) => !c.synced).length,
          contractionHistory: (con?.history ?? []).length as number,
          pendingClear: !!con?.pendingClearBefore,
          bagUnsynced: bag ? !bag.synced && bag.updatedAt !== undefined : false,
        };
      });

    /**
     * Records the SERVER does not hold, counted from both sides (not from the device's own
     * `synced` flags, which are what is under test): ended kick sessions and contractions on
     * the device minus those on the server, plus 1 when the bag has ticks the server lacks.
     */
    const trulyUnsent = async () => {
      const dev = await pendingOnDevice();
      const srv = await trackerServer(acct.uid);
      const bagTicks = await page.evaluate(() => {
        try {
          return Object.values((JSON.parse(localStorage.getItem('hospital_bag_v1') || 'null')?.checked ?? {}) as Record<string, boolean>).filter(Boolean).length;
        } catch {
          return 0;
        }
      });
      const kick = Math.max(0, dev.kickHistory - srv.kickSessions.length);
      const con = dev.pendingClear ? dev.contractionHistory : Math.max(0, dev.contractionHistory - srv.contractions.length);
      const bag = bagTicks !== (srv.bagChecked ?? 0) ? 1 : 0;
      return { total: kick + con + bag, kick, con, bag, device: dev, server: srv };
    };

    // B-035: the strict sink never sees these (IGNORE_CONSOLE already drops net::ERR_*), so
    // h.tolerated stayed at 0 while the quartets held dozens of ERR_INTERNET_DISCONNECTED lines.
    // Watch the page console directly: count the disconnect lines, and fail on any other error.
    const offlineDisconnects: string[] = [];
    const offlineOtherNoise: string[] = [];
    const offlineUnexpected: string[] = [];
    const onOfflineConsole = (msg: import('@playwright/test').ConsoleMessage) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (/ERR_INTERNET_DISCONNECTED/i.test(text)) offlineDisconnects.push(text.slice(0, 240));
      else if (OFFLINE_NOISE.some((re) => re.test(text)) && !/Failed to load resource/i.test(text)) offlineOtherNoise.push(text.slice(0, 240));
      else offlineUnexpected.push(text.slice(0, 240));
    };
    const onOfflinePageError = (err: Error) => offlineUnexpected.push(`pageerror: ${String(err.message).slice(0, 240)}`);
    try {
      await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
      await expect(vis(page.getByText('Semaine 32', { exact: true })), 'Home week 32').toBeVisible({ timeout: 30_000 });

      // 51 ── Online baseline: one contraction on the server
      await state(h, '51-offline-baseline-online', async () => {
        await openTool('Minuteur de contractions');
        await vis(page.getByRole('button', { name: 'Début de contraction', exact: true })).click();
        await page.waitForTimeout(2200);
        await vis(page.getByRole('button', { name: 'Fin de contraction', exact: true })).click();
        const srv = await poll(() => trackerServer(acct.uid), (s) => s.contractions.length === 1, 12_000);
        expect(srv.contractions.length, '51: baseline contraction is on the server before the network is cut').toBe(1);
        expect.soft((await readContraction(page)).count, '51: Nombre 1').toBe('1');
      });

      // ── network cut ──
      await context.setOffline(true);
      h.tolerate.push(...OFFLINE_NOISE);
      page.on('console', onOfflineConsole);
      page.on('pageerror', onOfflinePageError);

      // 52 ── Offline: a kick session is recorded on the device, nothing reaches the server
      await state(h, '52-offline-kick-session', async () => {
        await openTool('Compteur de coups de bébé');
        const start = vis(page.getByRole('button', { name: 'Commencer une session', exact: true }));
        await expect(start, '52: kick screen usable without signal').toBeVisible({ timeout: 45_000 });
        await start.click();
        const tap = vis(page.getByRole('button', { name: 'Touchez pour compter', exact: true }));
        await tap.click();
        await page.waitForTimeout(150);
        await tap.click();
        await vis(page.getByRole('button', { name: 'Terminer la session', exact: true })).click();
        await expect.soft(vis(page.getByText('3 coups', { exact: true })), '52: the offline session is in the history').toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(1500);
        const devAtEnd = await pendingOnDevice();
        // She leaves the screen and comes back, still without signal (the screen re-reads its history on focus).
        await openTool('Compteur de coups de bébé');
        await expect.soft(vis(page.getByText('3 coups', { exact: true })), '52: the offline session is still listed after reopening the screen').toBeVisible({ timeout: 45_000 });
        await page.waitForTimeout(1500);
        const srv = await trackerServer(acct.uid);
        const dev = await pendingOnDevice();
        expect.soft(srv.kickSessions.length, '52: offline → the server has no kick session').toBe(0);
        expect.soft(dev.kickUnsynced, `52: the device still marks the session as unsent while the server lacks it (at session end: ${devAtEnd.kickUnsynced} unsent; after reopening offline: ${dev.kickUnsynced})`).toBe(1);
        obs.add('OFFLINE-kick-recorded', srv.kickSessions.length === 0 && dev.kickUnsynced === 1 ? 'PASS' : 'FAIL', '52-offline-kick-session', { server: srv.kickSessions, deviceAtSessionEnd: devAtEnd, deviceAfterReopeningOffline: dev });
      });

      // 53 ── Offline: "Tout effacer" empties the device; the server copy is still there
      await state(h, '53-offline-contraction-clear', async () => {
        await openTool('Minuteur de contractions');
        const first = await readContraction(page);
        // Without signal the history is read from the device once the server listing gives up.
        const t0 = Date.now();
        const before = await poll(() => readContraction(page), (c) => c.count === '1', 40_000);
        obs.add('OFFLINE-contraction-history-delay', 'INFO', '53-offline-contraction-clear', {
          onOpen: { count: first.count, emptyStateShown: first.empty },
          historyShownAfterMs: before.count === '1' ? (first.count === '1' ? 0 : Date.now() - t0) : null,
        });
        expect.soft(before.count, '53: the synced contraction is still shown without signal').toBe('1');
        const n = h.dialogs.dialogs.length;
        await vis(page.getByRole('button', { name: 'Tout effacer', exact: true })).click();
        await poll(async () => h.dialogs.dialogs.length, (x) => x > n, 5000);
        await expect.soft(vis(page.getByText('Aucune contraction enregistrée', { exact: true })), '53: empty state after the offline clear').toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(1500);
        const srv = await trackerServer(acct.uid);
        const dev = await pendingOnDevice();
        expect.soft(srv.contractions.length, '53: offline → the server still holds the contraction').toBe(1);
        expect.soft(dev.pendingClear, '53: the device remembers the clear to replay it').toBe(true);
        obs.add('OFFLINE-contraction-clear', srv.contractions.length === 1 && dev.pendingClear ? 'PASS' : 'FAIL', '53-offline-contraction-clear', { before, server: srv.contractions, device: dev });
      });

      // 54 ── Offline: bag ticks stay on the device
      await state(h, '54-offline-bag', async () => {
        await openTool('Valise de maternité');
        await readBag(page);
        const boxes = page.getByRole('checkbox').filter({ visible: true });
        for (let i = 0; i < 2; i++) await boxes.nth(i).click();
        const bag = await readBag(page);
        expect.soft(bag.done, '54: two ticks made without signal').toBe(2);
        await page.waitForTimeout(1500);
        const srv = await trackerServer(acct.uid);
        const dev = await pendingOnDevice();
        expect.soft(srv.bagChecked, '54: offline → no hospitalBags doc on the server yet').toBeNull();
        expect.soft(dev.bagUnsynced, '54: the device marks the bag as unsent').toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
      });

      // 55 ── Offline logout: she is told how many records would be lost, and can stay (B-018)
      let warning = '';
      await state(h, '55-offline-logout-warning', async () => {
        const truth = await trulyUnsent();
        const dev = truth.device;
        const expected = truth.total;
        await home();
        await vis(page.getByRole('button', { name: 'Profil utilisateur', exact: true })).click({ force: true }); // the avatar pulses forever: never "stable"
        const out = vis(page.getByRole('button', { name: 'Se déconnecter', exact: true }));
        await expect(out, 'logout row').toBeVisible({ timeout: 30_000 });
        const seen = await withDialogPolicy(
          h,
          (msg) => (/pas encore sauvegardés/.test(fold(msg)) ? 'dismiss' : 'accept'),
          async () => {
            await out.click();
            // Flush attempt is bounded at 3 s, then the warning.
            await page.waitForTimeout(6000);
          },
        );
        const msgs = seen.map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`);
        warning = fold(seen.find((d) => /pas encore sauvegardés/.test(fold(d.message)))?.message ?? '');
        const told = warning.match(/Enregistrements pas encore sauvegardés en ligne : (\d+)/)?.[1] ?? null;
        expect.soft(msgs.length, `55: logout confirm, then the unsent-records warning (${JSON.stringify(msgs)})`).toBe(2);
        expect.soft(warning, '55: the warning names what would be lost and how to keep it').toMatch(/Ils risquent d.être perdus si vous vous déconnectez maintenant[\s\S]*retrouvez une connexion Internet/);
        expect.soft(told === null ? null : Number(told), `55: the warning counts every record the server lacks (kick ${truth.kick} + contractions ${truth.con} + bag ${truth.bag}; device flags: ${JSON.stringify(dev)})`).toBe(expected);
        // She answered "Annuler": still signed in, nothing wiped.
        await expect.soft(page.getByRole('tablist').first(), '55: declining keeps her signed in').toBeVisible({ timeout: 10_000 });
        const after = await pendingOnDevice();
        expect.soft({ kick: after.kickHistory, bag: after.bagUnsynced }, '55: declining keeps the unsent records on the device').toEqual({ kick: dev.kickHistory, bag: dev.bagUnsynced });
        obs.add('B-018-LOGOUT-WARNING', msgs.length === 2 && told !== null && Number(told) === expected && after.kickHistory === dev.kickHistory ? 'PASS' : 'FAIL', '55-offline-logout-warning', {
          dialogs: msgs,
          countInWarning: told,
          deviceFlags: dev,
          recordsTheServerLacks: { kick: truth.kick, contractions: truth.con, bag: truth.bag, total: truth.total },
          server: truth.server,
          deviceAfterDeclining: after,
        });
        await out.scrollIntoViewIfNeeded();
      });

      // ── network back ──
      await context.setOffline(false);

      // 56 ── Back online: reopening each tracker sends what was pending; the server matches
      await state(h, '56-online-resync', async () => {
        const kick = await kickSnapshot(page);
        const srvKick = await poll(() => trackerServer(acct.uid), (s) => s.kickSessions.length === 1, 15_000);
        expect.soft(srvKick.kickSessions.map((k) => k.kicks), '56: the offline kick session reaches the server (3 kicks)').toEqual([3]);
        expect.soft(kick.rows, '56: and is still on screen').toEqual(['3 coups']);
        await h.snap('56-online-resync.1-kick');
        const con = await contractionSnapshot(page);
        const srvCon = await poll(() => trackerServer(acct.uid), (s) => s.contractions.length === 0, 15_000);
        expect.soft(srvCon.contractions.length, '56: the offline "Tout effacer" is replayed on the server').toBe(0);
        expect.soft(con.empty, '56: the cleared contraction does not come back from the server').toBe(true);
        await h.snap('56-online-resync.2-contraction');
        const bag = await bagSnapshot(page);
        const srvBag = await poll(() => trackerServer(acct.uid), (s) => s.bagChecked === 2, 15_000);
        expect.soft(srvBag.bagChecked, '56: the offline bag ticks reach the server').toBe(2);
        expect.soft(bag.done, '56: and are still on screen').toBe(2);
        const dev = await poll(pendingOnDevice, (d) => d.kickUnsynced === 0 && !d.bagUnsynced && !d.pendingClear, 10_000);
        expect.soft({ kick: dev.kickUnsynced, bag: dev.bagUnsynced, pendingClear: dev.pendingClear }, '56: nothing left unsent on the device').toEqual({ kick: 0, bag: false, pendingClear: false });
        const ok = srvKick.kickSessions.length === 1 && srvKick.kickSessions[0].kicks === 3 && srvCon.contractions.length === 0 && srvBag.bagChecked === 2 && con.empty;
        obs.add('OFFLINE-RESYNC', ok ? 'PASS' : 'FAIL', '56-online-resync', {
          screen: { kick, con, bag },
          server: { kickSessions: srvKick.kickSessions, contractions: srvCon.contractions, bagChecked: srvBag.bagChecked },
          device: dev,
        });
      });

      // 57 ── Offline again, one more unsent session, "Se déconnecter quand même": the loss is the disclosed one
      await state(h, '57-offline-logout-anyway', async () => {
        await page.goto('/', { waitUntil: 'load' });
        await expect(page.getByTestId('home_quick_add_appointment').filter({ visible: true }), 'Home root').toHaveCount(1, { timeout: 30_000 });
        await context.setOffline(true);
        await openTool('Compteur de coups de bébé');
        const start = vis(page.getByRole('button', { name: 'Nouvelle session', exact: true }));
        await expect(start, '57: kick screen (history present) without signal').toBeVisible({ timeout: 45_000 });
        await start.click();
        await vis(page.getByRole('button', { name: 'Terminer la session', exact: true })).click();
        await expect.soft(vis(page.getByText('1 coups', { exact: true }).or(page.getByText('1 coup', { exact: true }))), '57: second (offline) session in the history').toBeVisible({ timeout: 5000 });
        // Leave and come back, still without signal, as in 52.
        await openTool('Compteur de coups de bébé');
        await expect.soft(vis(page.getByText('3 coups', { exact: true })), '57: history still listed after reopening offline').toBeVisible({ timeout: 45_000 });
        await page.waitForTimeout(1500);
        const truth = await trulyUnsent();
        const dev = truth.device;
        await home();
        await vis(page.getByRole('button', { name: 'Profil utilisateur', exact: true })).click({ force: true }); // the avatar pulses forever: never "stable"
        const out = vis(page.getByRole('button', { name: 'Se déconnecter', exact: true }));
        await expect(out, 'logout row').toBeVisible({ timeout: 30_000 });
        const n = h.dialogs.dialogs.length;
        await out.click();
        await expect(page.getByRole('tablist'), '57: "Se déconnecter quand même" logs her out').toHaveCount(0, { timeout: 30_000 });
        const msgs = h.dialogs.dialogs.slice(n).map((d) => `[${d.type}:${d.action}] ${fold(d.message)}`);
        const told = msgs.join(' ').match(/Enregistrements pas encore sauvegardés en ligne : (\d+)/)?.[1] ?? null;
        expect.soft(told === null ? null : Number(told), `57: logout warns about the one session the server lacks (dialogs: ${JSON.stringify(msgs)}; device flags: ${JSON.stringify(dev)})`).toBe(truth.total);
        await h.snap('57-offline-logout-anyway.0-logged-out');
        await context.setOffline(false);
        await uiLogin(page, acct.email, E2E_PASSWORD, 'fr');
        const kick = await kickSnapshot(page);
        await page.waitForTimeout(2000);
        const srv = await trackerServer(acct.uid);
        const lostSessions = truth.device.kickHistory - kick.historyRows;
        // A record may only be lost if she was told so: either the warning announced it, or it must still be there.
        expect.soft(told === null ? lostSessions : 0, `57: no kick session is lost without the warning (history before logout ${truth.device.kickHistory}, after re-login ${JSON.stringify(kick.rows)})`).toBe(0);
        expect.soft(kick.rows.includes('3 coups'), '57: the session that had reached the server is back after re-login').toBe(true);
        // B-040: the second dialog says the unsent sessions "risquent d'être perdus" (fr/profile.json
        // logoutUnsyncedMsg). In the web build Firestore's persisted write queue sends them after
        // re-login, so none was lost here; on a build without that queue they would be. The
        // warning is therefore a ceiling: she must never lose MORE than the `told` it announced.
        const promisedLoss = told === null ? 0 : Math.min(Number(told), truth.kick);
        const serverHasUnsent = srv.kickSessions.length >= truth.device.kickHistory;
        expect.soft(
          lostSessions <= promisedLoss,
          `57 (B-040): she lost ${lostSessions} session(s), the warning announced at most ${promisedLoss}; after re-login the history shows ${JSON.stringify(kick.rows)}`,
        ).toBe(true);
        obs.add('B-040-COPY-VS-BEHAVIOUR', lostSessions <= promisedLoss ? 'PASS' : 'FAIL', '57-offline-logout-anyway', {
          copy: 'fr/profile.json logoutUnsyncedMsg: "Ils risquent d\'être perdus si vous vous déconnectez maintenant"',
          warnedCount: told,
          unsentKickSessionsBeforeLogout: truth.kick,
          sessionsLostAfterRelogin: lostSessions,
          serverKickSessionsAfterRelogin: srv.kickSessions.length,
        });
        obs.add('B-018-LOGOUT-ANYWAY', told !== null && Number(told) === truth.total ? 'PASS' : 'FAIL', '57-offline-logout-anyway', {
          dialogs: msgs,
          countInWarning: told,
          recordsTheServerLackedBeforeLogout: { kick: truth.kick, contractions: truth.con, bag: truth.bag, total: truth.total },
          deviceFlagsBeforeLogout: dev,
          kickAfterRelogin: kick,
          sessionsLost: lostSessions,
          lostWithoutWarning: told === null && lostSessions > 0,
          server: srv.kickSessions,
        });
      });
    } finally {
      await context.setOffline(false).catch(() => undefined);
      page.off('console', onOfflineConsole);
      page.off('pageerror', onOfflinePageError);
      // The cut must have produced disconnect errors (else this proves nothing), within a sane
      // budget (59 over states 52-57 when measured; 3x headroom), and nothing else may leak.
      const OFFLINE_DISCONNECT_BUDGET = 180;
      expect.soft(offlineDisconnects.length, 'offline: the network cut surfaced ERR_INTERNET_DISCONNECTED errors (harness effective)').toBeGreaterThan(0);
      expect.soft(offlineDisconnects.length, `offline: ERR_INTERNET_DISCONNECTED lines stay within ${OFFLINE_DISCONNECT_BUDGET}`).toBeLessThanOrEqual(OFFLINE_DISCONNECT_BUDGET);
      expect.soft(offlineUnexpected, 'offline: no console error other than the disconnect noise').toEqual([]);
      obs.add('OFFLINE-CONSOLE-TOLERATED', offlineUnexpected.length ? 'FAIL' : 'INFO', 'B-track offline', {
        disconnectLines: offlineDisconnects.length,
        otherOfflineNoiseLines: offlineOtherNoise.length,
        unexpected: offlineUnexpected.slice(0, 5),
        strictSliceDropped: h.tolerated.length,
        sample: offlineDisconnects.slice(0, 3),
        patterns: OFFLINE_NOISE.map(String),
      });
      settleObs(obs, 'B-track offline', h);
      obs.flush();
      h.dispose();
    }
  });
});
