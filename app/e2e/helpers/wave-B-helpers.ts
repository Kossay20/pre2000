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
import { attachDialogRecorder, type DialogRecorder, type DialogRecord } from './dialog-recorder';
import { FIRESTORE_EMULATOR, PROJECT_ID } from './emulator-account';

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
  /** Quartet + strict-console slice (soft) + raw-key check (soft). */
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
  async function snap(name: string) {
    await mega.snap(name);
    const fresh = strict.slice(consumed);
    consumed = strict.length;
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
  return ((await page.locator('body').innerText().catch(() => '')) || '').replace(/[\u00a0\u202f]/g, ' ');
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

/** date-fns isToday / isTomorrow / isThisWeek (weekStartsOn 0) evaluated in the browser tz. */
export async function relDay(page: Page, iso: string): Promise<'today' | 'tomorrow' | 'thisWeek' | 'other'> {
  return page.evaluate((s) => {
    const d = new Date(s);
    const now = new Date();
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (same(d, now)) return 'today';
    const tm = new Date(now);
    tm.setDate(now.getDate() + 1);
    if (same(d, tm)) return 'tomorrow';
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end ? 'thisWeek' : 'other';
  }, iso);
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
