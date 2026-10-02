/**
 * Wave B helpers (final-release-2026-09-30) — signed-in daily loop at week 32.
 * Thin layer over the committed harness (emulator-account / audit-guards /
 * dialog-recorder / mega-audit-snap). Nothing here re-implements the harness:
 * it adds per-state bookkeeping (strict console slice, raw-key check, observations)
 * and user-token REST writes for seeding (rules apply, like seedProfile).
 */
import fs from 'fs';
import path from 'path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { attachConsoleStrict, RAW_KEY } from './audit-guards';
import { attachMegaAuditRecorder } from './mega-audit-snap';
import { describeProblems, inspectFrame, type FrameProblems } from './visual-settle';
import { attachDialogRecorder, type DialogRecorder, type DialogRecord } from './dialog-recorder';
import { E2E_PASSWORD, FIRESTORE_EMULATOR, PROJECT_ID, createAccount, newAccountEmail, seedProfile, type CreatedAccount } from './emulator-account';

const DOCS = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── Quartet dirs ──────────────────────────────────────────────────────────────

export function quartetDirs(testInfo: TestInfo): string[] {
  const primary = process.env.E2E_QUARTET_DIR || testInfo.outputPath('quartet');
  return [primary, process.env.E2E_QUARTET_DIR2].filter((d): d is string => !!d);
}

// ── Per-page instrumentation ──────────────────────────────────────────────────

export type Instrumented = {
  page: Page;
  strict: string[];
  dialogs: DialogRecorder;
  recordEvent: ReturnType<typeof attachMegaAuditRecorder>['recordEvent'];
  popups: string[];
  /** Snaps whose surface was still moving when the settle budget ran out (name → ms waited). */
  unsettled: Array<{ name: string; ms: number; changed: number; problems?: string }>;
  /** Console lines the strict slice must not count (harness-induced, e.g. while the context is offline). */
  tolerate: RegExp[];
  /** Strict lines dropped by `tolerate`, kept as evidence. */
  tolerated: string[];
  /** Settle (no pulse / fade / slide) → quartet + strict-console slice (soft) + raw-key check (soft). */
  snap: (name: string) => Promise<void>;
  dispose: () => void;
};

export function instrument(page: Page, testInfo: TestInfo): Instrumented {
  const strict = attachConsoleStrict(page);
  const mega = attachMegaAuditRecorder(page, quartetDirs(testInfo));
  const dialogs = attachDialogRecorder(page, mega);
  const popups: string[] = [];
  // Linking.openURL('tel:…') on web opens a popup; record it and close it so the
  // run is not left with a dangling tab. The URL is the evidence.
  page.context().on('page', (p) => {
    popups.push(p.url() || '(blank)');
    p.waitForLoadState('domcontentloaded', { timeout: 3000 })
      .then(() => popups.push(`loaded:${p.url()}`))
      .finally(() => p.close())
      .catch(() => undefined);
  });
  let consumed = 0;
  const unsettled: Instrumented['unsettled'] = [];
  const tolerate: RegExp[] = [];
  const tolerated: string[] = [];
  async function snap(name: string) {
    // B-021: a quartet is evidence only when the surface has stopped moving — loading
    // skeletons pulse, screens fade in over 500 ms, tab panes slide.
    const settled = await settleVisual(page);
    const problems = describeProblems(settled.problems);
    mega.recordEvent({ level: 'settle', text: `[settle] ${name}: ${settled.stable ? 'stable' : 'STILL MOVING'} after ${settled.ms} ms (last frame-to-frame change ${(settled.changed * 100).toFixed(2)} % of the viewport)${problems ? ` — ${problems}` : ''}` });
    if (!settled.stable) unsettled.push({ name, ms: settled.ms, changed: settled.changed, problems: problems || undefined });
    // B-032: two equal frames also describe a screen stuck 98 px left; an offset or a
    // half-faded block makes the quartet unusable as evidence.
    expect.soft(problems, `${name}: frame not clean at snap time`).toBe('');
    await mega.snap(name);
    const slice = strict.slice(consumed);
    consumed = strict.length;
    const fresh = slice.filter((l) => !tolerate.some((re) => re.test(l)));
    tolerated.push(...slice.filter((l) => tolerate.some((re) => re.test(l))));
    expect.soft(fresh, `${name}: strict console errors`).toEqual([]);
    const text = (await page.locator('body').innerText().catch(() => '')) || '';
    const leak = text.split('\n').find((l) => RAW_KEY.test(l));
    expect.soft(leak, `${name}: raw i18n key leaked → "${leak}"`).toBeFalsy();
  }
  const inst: Instrumented = {
    page,
    strict,
    dialogs,
    recordEvent: mega.recordEvent,
    popups,
    unsettled,
    tolerate,
    tolerated,
    snap,
    dispose: () => {
      mega.dispose();
      inst.dialogs.dispose();
    },
  };
  return inst;
}

/**
 * Run `fn` with a per-message dialog policy (e.g. a chain of window.confirm calls where
 * only one option must be accepted). The committed recorder is detached for the
 * duration; every dialog is still written to the quartet and returned.
 */
export async function withDialogPolicy(
  h: Instrumented,
  policy: (message: string, type: string) => 'accept' | 'dismiss',
  fn: () => Promise<void>,
): Promise<DialogRecord[]> {
  const seen: DialogRecord[] = [];
  h.dialogs.dispose();
  const handler = async (d: import('@playwright/test').Dialog) => {
    const action = policy(d.message(), d.type());
    const rec: DialogRecord = { type: d.type() as DialogRecord['type'], message: d.message(), action: action === 'accept' ? 'accepted' : 'dismissed', ts: Date.now() };
    seen.push(rec);
    h.recordEvent({ level: 'dialog', type: rec.type, message: rec.message, action: rec.action, text: `[${rec.type}:${rec.action}] ${rec.message}` });
    try {
      if (action === 'accept') await d.accept();
      else await d.dismiss();
    } catch {
      /* page closed */
    }
  };
  h.page.on('dialog', handler);
  try {
    await fn();
  } finally {
    h.page.off('dialog', handler);
    h.dialogs = attachDialogRecorder(h.page, { recordEvent: h.recordEvent });
  }
  return seen;
}

// pngjs ships without type declarations; only PNG.sync.read is used.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PNG } = require('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };

/** Share of viewport pixels that differ between two same-size PNG screenshots (1 when sizes differ). */
function changedFraction(a: Buffer, b: Buffer): number {
  if (a.equals(b)) return 0;
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return 1;
  let changed = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    if (Math.abs(A.data[i] - B.data[i]) > 8 || Math.abs(A.data[i + 1] - B.data[i + 1]) > 8 || Math.abs(A.data[i + 2] - B.data[i + 2]) > 8) changed++;
  }
  return changed / (A.width * A.height);
}

/** Home's profile button pulses forever (≈1 % of the viewport, decorative): below this share the surface counts as still. */
export const SETTLE_TOLERANCE = 0.02;

/**
 * Wait until two consecutive viewport screenshots 250 ms apart show (almost) the same
 * pixels — no loading skeleton pulsing, no screen fading in, no tab pane sliding — up to
 * `maxMs`. A change confined to under SETTLE_TOLERANCE of the viewport (Home's pulsing
 * avatar) is not movement of the surface. A screen with a live timer over a larger area
 * never settles; the caller records that instead of pretending.
 *
 * Equal frames are necessary, not sufficient (B-032): a pager stuck mid-slide is equal to
 * itself. The frame must also have no horizontal offset (document scrolled, tab bar or app
 * root partly outside the viewport) and no finite animation running; otherwise it keeps
 * waiting and finally reports `stable: false` with the reason in `problems`. Opacity is
 * not part of this gate — Home's decorative pulse keeps inline opacities moving forever.
 */
export async function settleVisual(
  page: Page,
  maxMs = 8000,
): Promise<{ stable: boolean; ms: number; changed: number; problems: FrameProblems }> {
  const t0 = Date.now();
  let prev = await page.screenshot().catch(() => null);
  let changed = 1;
  let frame = await inspectFrame(page, { opacity: false });
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(250);
    const cur = await page.screenshot().catch(() => null);
    frame = await inspectFrame(page, { opacity: false });
    if (prev && cur) {
      changed = changedFraction(prev, cur);
      if (changed <= SETTLE_TOLERANCE && frame.ok) return { stable: true, ms: Date.now() - t0, changed, problems: frame.problems };
    }
    prev = cur;
  }
  return { stable: false, ms: Date.now() - t0, changed, problems: frame.problems };
}

/** Fold the French no-break spaces (U+00A0 / U+202F before ": ; ? !") to plain spaces. */
export const fold = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');

/**
 * One audit state. Runs `fn` as a test.step; an exception (a navigation that could
 * not happen because the app misbehaved) is recorded as a SOFT failure — never
 * swallowed — so one real bug does not hide the rest of the wave. The quartet is
 * always written.
 */
export async function state(h: Instrumented, name: string, fn: () => Promise<void>): Promise<boolean> {
  let ok = true;
  await test.step(name, async () => {
    try {
      await fn();
    } catch (e: any) {
      ok = false;
      const msg = String(e?.message || e).split('\n').slice(0, 6).join(' | ').slice(0, 700);
      expect.soft(msg, `${name}: state aborted`).toBe('<state completed>');
    }
    try {
      await h.snap(name);
    } catch (e: any) {
      expect.soft(String(e?.message || e).slice(0, 300), `${name}: snap failed`).toBe('<snap ok>');
    }
  });
  return ok;
}

// ── Observations (HYP-/SYNC-/R- evidence), written next to the quartets ───────

export type ObsStatus = 'CONFIRMED' | 'REFUTED' | 'NOT-REACHED' | 'PASS' | 'FAIL' | 'INFO';

export class Observations {
  private rows: Array<{ id: string; status: ObsStatus; state: string; evidence: unknown; ts: string }> = [];
  constructor(private file: string, private testInfo: TestInfo) {}
  add(id: string, status: ObsStatus, stateName: string, evidence: unknown) {
    this.rows.push({ id, status, state: stateName, evidence, ts: new Date().toISOString() });
    this.testInfo.annotations.push({ type: `${id}:${status}`, description: `${stateName} ${JSON.stringify(evidence)}`.slice(0, 900) });
  }
  flush() {
    for (const dir of quartetDirs(this.testInfo)) {
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, this.file);
      let prev: unknown[] = [];
      try {
        prev = JSON.parse(fs.readFileSync(target, 'utf8'));
      } catch {
        prev = [];
      }
      fs.writeFileSync(target, JSON.stringify([...prev, ...this.rows], null, 2));
    }
    this.rows = [];
  }
}

// ── Locators ──────────────────────────────────────────────────────────────────

/** First VISIBLE match (RN-web keeps blurred stack screens mounted in the DOM). */
export const vis = (l: Locator) => l.filter({ visible: true }).first();

// French strings carry a no-break space before ":", "?" and "!"; fold it to a plain
// space so the literal expectations in the specs keep reading naturally.
export async function bodyText(page: Page): Promise<string> {
  return fold((await page.locator('body').innerText().catch(() => '')) || '');
}

/** Bottom tab bar (the tablist that owns "Accueil"). */
export async function bottomTab(page: Page, name: string) {
  const bar = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: 'Accueil', exact: true }) });
  await bar.getByRole('tab', { name, exact: true }).first().click();
}

/** Reminders top tabs (the tablist that owns "Tâches"). */
export async function remindersTopTab(page: Page, name: 'Rappels' | 'Tâches') {
  const bar = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: 'Tâches', exact: true }) });
  await expect(bar.first(), 'reminders top tablist').toBeVisible({ timeout: 20_000 });
  await bar.first().getByRole('tab', { name, exact: true }).click();
}

/** Home "Ma Journée x/y" pill → {done,total} or null. */
export async function homeMyDay(page: Page): Promise<{ done: number; total: number } | null> {
  const m = (await bodyText(page)).match(/Ma Journée\s+(\d+)\/(\d+)/);
  return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
}

// ── Browser-local date helpers (timezone-correct in every run) ────────────────

export type LocalDay = {
  key: string; // yyyy-MM-dd local
  weekdayLong: string; // "vendredi"
  dd: string; // "02"
  d: string; // "2"
  monthLong: string; // "octobre"
  year: string;
};

export async function localDay(page: Page, offsetDays = 0): Promise<LocalDay> {
  return page.evaluate((off) => {
    const t = new Date();
    t.setDate(t.getDate() + off);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      key: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
      weekdayLong: new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(t),
      dd: pad(t.getDate()),
      d: String(t.getDate()),
      monthLong: new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(t),
      year: String(t.getFullYear()),
    };
  }, offsetDays);
}

/** ISO string of a LOCAL wall-clock time in the browser's timezone. */
export async function localIso(page: Page, key: string, hhmm: string): Promise<string> {
  return page.evaluate(
    ([k, t]) => {
      const [y, m, d] = k.split('-').map(Number);
      const [hh, mm] = t.split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
    },
    [key, hhmm] as const,
  );
}

/** now + `minutes`, clamped to 23:50 local today; null when that is already past. */
export async function laterTodayHHMM(page: Page, minutes: number): Promise<string | null> {
  return page.evaluate((mins) => {
    const now = new Date();
    const cap = new Date(now);
    cap.setHours(23, 50, 0, 0);
    let t = new Date(now.getTime() + mins * 60_000);
    if (t.getDate() !== now.getDate() || t > cap) t = cap;
    if (t <= new Date(now.getTime() + 5 * 60_000)) return null;
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  }, minutes);
}

/**
 * Where `iso` falls for the Home pill: today, tomorrow, or inside the pregnancy week in
 * progress — the seven local days starting at `weekStartKey` (yyyy-MM-dd), which is the
 * week the app counts "cette semaine" in (DailyRoutinesTracker → getCurrentPregnancyWeekRange).
 */
export async function relDay(page: Page, iso: string, weekStartKey: string): Promise<'today' | 'tomorrow' | 'thisWeek' | 'other'> {
  return page.evaluate(
    ([s, ws]) => {
      const d = new Date(s);
      const now = new Date();
      const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
      if (same(d, now)) return 'today';
      const tm = new Date(now);
      tm.setDate(now.getDate() + 1);
      if (same(d, tm)) return 'tomorrow';
      const [y, m, dd] = ws.split('-').map(Number);
      const start = new Date(y, m - 1, dd, 0, 0, 0, 0);
      const end = new Date(y, m - 1, dd + 7, 0, 0, 0, 0);
      return d >= start && d < end ? 'thisWeek' : 'other';
    },
    [iso, weekStartKey] as const,
  );
}

/** Local yyyy-MM-dd of an ISO instant in the browser's timezone. */
export async function localKeyOf(page: Page, iso: string): Promise<string> {
  return page.evaluate((s) => {
    const t = new Date(s);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }, iso);
}

/**
 * A week-32 account whose LMP is dated from the user's LOCAL calendar day in `tz`
 * (the app dates the pregnancy by local day), so "today" is day 1 of week 32 there.
 */
export async function newWeek32Account(scenario: string, tz = 'Europe/Paris', extra: Record<string, unknown> = {}): Promise<CreatedAccount> {
  const acct = await createAccount(newAccountEmail('B', scenario), E2E_PASSWORD);
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  const now = new Date(Date.UTC(y, m - 1, d));
  await seedProfile(acct.uid, acct.idToken, { week: 32, now, country: 'France', lastName: 'Testeur', firstName: 'Wave', ...extra });
  return acct;
}

// ── User-token REST writes (seeding; rules apply) ─────────────────────────────

type FsValue = Record<string, unknown>;
function toValue(v: unknown): FsValue {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  throw new Error(`unsupported value ${String(v)}`);
}
function toFields(o: Record<string, unknown>): Record<string, FsValue> {
  return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toValue(x)]));
}

/** Create/replace `collection/docId` as the user (Bearer idToken). Returns HTTP status. */
export async function userWrite(docPath: string, idToken: string, data: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${DOCS}/${docPath}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  return res.status;
}

/** Number of documents in a top-level collection (owner). */
export async function serverCollectionCount(collection: string): Promise<number> {
  const res = await fetch(`${DOCS}/${collection}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) throw new Error(`serverCollectionCount(${collection}): ${res.status}`);
  const body: any = await res.json();
  return Array.isArray(body.documents) ? body.documents.length : 0;
}

/** Poll an async predicate (server oracle eventual consistency after a UI write). */
export async function poll<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 8000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let v = await fn();
  while (!ok(v) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 400));
    v = await fn();
  }
  return v;
}
