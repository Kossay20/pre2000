/**
 * Wave D — Account lifecycle & settings (AUDIT_PLAN final-release-2026-09-30 §5).
 *
 * Profile edit + persist, Settings toggles, live language switch, data export, guest →
 * account upgrade, logout/login round trip, account deletion (incl. the reauth path),
 * reset profile, privacy policy reachability — fr + ar.
 *
 * Contract-level: every assertion targets what the user sees and what the server holds,
 * never an implementation detail, so the spec stays valid while the deletion flow is
 * being reworked (reauth ordering, purge abort, Settings "delete" row).
 *
 * Oracles: server truth (serverDoc / serverQuery / authAccountExists, Bearer owner) AND a
 * fresh browser context. A same-context reload is a recorded state, never proof.
 * App-behaviour assertions are `expect.soft` (a failure = a finding); harness and
 * navigation steps are hard.
 *
 *   bash e2e/emulator-stack.sh status   # :9099 :8080 :8090 up
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-D \
 *   npx playwright test e2e/final-release-wave-D.spec.ts --reporter=list
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { RAW_KEY, attachConsoleStrict } from './helpers/audit-guards';
import { attachMegaAuditRecorder } from './helpers/mega-audit-snap';
import { attachDialogRecorder, type DialogRecord, type DialogRecorder } from './helpers/dialog-recorder';
import {
  AUTH_EMULATOR,
  E2E_BASE_URL,
  E2E_PASSWORD,
  FIRESTORE_EMULATOR,
  PROJECT_ID,
  authAccountExists,
  createAccount,
  newAccountEmail,
  seedProfile,
  serverDoc,
  serverQuery,
  uiLogin,
  waveUse,
  type AppLocale,
  type CreatedAccount,
} from './helpers/emulator-account';
import { lmpIsoForWeek } from './helpers/guest-profile';
import { tickHealthConsent } from './helpers/health-consent';
import { describeProblems, waitFrameClean } from './helpers/visual-settle';
import { PRIVATE_STORAGE_KEYS, PRIVATE_STORAGE_KEY_PREFIXES } from '../src/context/storageKeys';

test.use(waveUse('fr'));
test.setTimeout(360_000);

// Evidence the adversary needs beyond the quartets: every note() of every test.
test.afterEach(async ({}, testInfo) => {
  const dir = quartetDirs(testInfo)[0];
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    path.join(dir, 'wave-D-annotations.jsonl'),
    JSON.stringify({ test: testInfo.title, status: testInfo.status, errors: testInfo.errors.length, annotations: testInfo.annotations, at: new Date().toISOString() }) + '\n',
  );
});

const WAVE = 'D';
const DOCS = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Every top-level collection a user can write, read from firestore.rules itself — not copied
 * from gdprPurge's own list, which would make the purge its own oracle (a collection missing
 * from both would pass). users/ and userProfiles/ are covered by LEGACY_DOCS + the profile.
 */
const USER_COLLECTIONS: string[] = (() => {
  const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  const names = [...rules.matchAll(/^ {4}match \/(\w+)\/\{\w+\} \{(.*)$/gm)]
    .filter(([, , rest]) => !/allow write: if false/.test(rest))
    .map(([, name]) => name)
    // deletionRequests/{uid} is not user data keyed by user_id: it is the deletion marker
    // (id = uid, D-031), tracked on its own in footprint().marker and asserted absent after
    // every finished deletion.
    .filter((n) => n !== 'users' && n !== 'userProfiles' && n !== 'deletionRequests');
  if (!/match \/deletionRequests\/\{\w+\}/.test(rules)) throw new Error('firestore.rules has no deletionRequests match (old rules?)');
  if (names.length < 9) throw new Error(`firestore.rules parse found only ${names.length} user collections`);
  return names;
})();

/**
 * The only subcollection names firestore.rules accepts under users/{uid} and
 * userProfiles/{uid} (D-014), read from the rules file itself — not from gdprPurge's list.
 */
const LEGACY_SUBCOLLECTIONS: string[] = (() => {
  const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  const m = rules.match(/function isPurgedSubcollection\(sub\) \{\s*return sub in \[([^\]]+)\]/);
  if (!m) throw new Error('firestore.rules: isPurgedSubcollection list not found (old rules?)');
  const names = [...m[1].matchAll(/'(\w+)'/g)].map(([, n]) => n);
  if (names.length < 4) throw new Error(`firestore.rules: only ${names.length} purged subcollections`);
  return names;
})();
const LEGACY_PARENTS = ['userProfiles', 'users'] as const;

/** Every parent × subcollection pair the rules allow (incl. users/{uid}/weights), + users/{uid}. */
const LEGACY_DOCS = (uid: string) => [
  ...LEGACY_PARENTS.flatMap((parent) => LEGACY_SUBCOLLECTIONS.map((sub) => `${parent}/${uid}/${sub}/seed-d`)),
  `users/${uid}`,
];

const MARKER_DOC = (uid: string) => `deletionRequests/${uid}`;

/** French typography puts U+00A0 / U+202F before `: ; ? !` — compare on plain spaces. */
const norm = (s: string | null | undefined) => (s ?? '').replace(/[\u00A0\u202F]/g, ' ');

const PERMISSION_SIGNAL = /permission[-_ ]denied|insufficient permissions/i;

// ── Recorder plumbing ─────────────────────────────────────────────────────────

type Ctx = {
  page: Page;
  rec: ReturnType<typeof attachMegaAuditRecorder>;
  strict: string[];
  cursor: number;
  /** Every console line of ANY level (and page error) that smells of a rules refusal (D-014). */
  permission: string[];
  permCursor: number;
  dialogs: DialogRecorder;
  /** Where this test's quartets go: dialog text is written next to each PNG there (D-047). */
  dirs: string[];
  dialogCursor: number;
};

function quartetDirs(testInfo: TestInfo): string[] {
  const dirs = [process.env.E2E_QUARTET_DIR, process.env.E2E_QUARTET_DIR2].filter((d): d is string => !!d);
  return dirs.length ? dirs : [testInfo.outputPath('quartet')];
}

function instrument(page: Page, testInfo: TestInfo): Ctx {
  const strict = attachConsoleStrict(page);
  const rec = attachMegaAuditRecorder(page, quartetDirs(testInfo));
  const dialogs = attachDialogRecorder(page, rec);
  const permission: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (PERMISSION_SIGNAL.test(text)) permission.push(`${msg.type()}: ${text.slice(0, 400)}`);
  });
  page.on('pageerror', (err) => {
    if (PERMISSION_SIGNAL.test(err.message)) permission.push(`pageerror: ${err.message.slice(0, 400)}`);
  });
  return { page, rec, strict, cursor: 0, permission, permCursor: 0, dialogs, dirs: quartetDirs(testInfo), dialogCursor: 0 };
}

/**
 * Let finite animations (modal fade, screen transition) finish before a capture, so no state
 * is snapped mid-fade (D-025). Infinite ones (spinners) are ignored. A wait, not a check.
 */
async function settle(page: Page) {
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const timing = a.effect?.getComputedTiming();
          return a.playState !== 'running' || timing?.iterations === Infinity;
        }),
      null,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(350);
}

/**
 * `settle` only sees CSS/Web animations; react-native-web fades (Animated.timing) are
 * JS-driven opacity writes it cannot see, which is how Home was captured half transparent
 * (D-025). Poll the frame itself until nothing visible is mid-fade or displaced.
 */
async function settledFrame(page: Page) {
  await settle(page);
  return waitFrameClean(page, 8_000);
}

/**
 * Record a state: soft non-blank + no raw i18n key, the quartet, and every strict-console
 * error raised since the previous state of this context.
 */
async function state(ctx: Ctx, name: string, expectedNetworkErrors: RegExp[] = []) {
  const body = (await ctx.page.locator('body').innerText().catch(() => '')) || '';
  expect.soft(body.trim().length, `${name}: screen should not be blank`).toBeGreaterThan(0);
  const leak = body.split('\n').find((l) => RAW_KEY.test(l));
  expect.soft(leak, `${name}: raw i18n key leaked → "${leak}"`).toBeFalsy();
  const frame = await settledFrame(ctx.page);
  expect.soft(frame.ok, `${name} (D-025): frame captured mid-fade or displaced (${describeProblems(frame.problems)})`).toBe(true);
  // window.alert / confirm are native: no screenshot shows them. D-047: keep what was said (and
  // what was pressed) beside the PNG of the state it belongs to, so a state whose screen did not
  // change is still told apart from the one before it.
  const said = ctx.dialogs.dialogs.slice(ctx.dialogCursor);
  ctx.dialogCursor = ctx.dialogs.dialogs.length;
  if (said.length) {
    for (const dir of ctx.dirs) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.dialogs.txt`), said.map((d) => `[${d.type}:${d.action}] ${d.message}`).join('\n---\n') + '\n');
    }
  }
  // D-047: the visible text of the state goes beside its PNG too, so two states whose pixels are
  // identical (same screen, different dialog or toggle) still differ on disk and in review.
  for (const dir of ctx.dirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.text.txt`), `${body}\n`);
  }
  await ctx.rec.snap(name);
  // Only the browser's own resource-load line for a request the test itself provoked
  // (simulated CREDENTIAL_TOO_OLD refusal, deliberate wrong password) may be allowed —
  // never an app log line.
  const fresh = ctx.strict
    .slice(ctx.cursor)
    .filter((e) => !(/^Failed to load resource/.test(e) && expectedNetworkErrors.some((re) => re.test(e))));
  ctx.cursor = ctx.strict.length;
  expect.soft(fresh, `${name}: strict console errors: ${fresh.join(' | ')}`).toEqual([]);
  // D-014: the tightened rules must never refuse an ordinary flow — any level, any wording.
  const denied = ctx.permission.slice(ctx.permCursor);
  ctx.permCursor = ctx.permission.length;
  expect.soft(denied, `${name}: Firestore permission error in console: ${denied.join(' | ')}`).toEqual([]);
}

function note(testInfo: TestInfo, type: string, description: string) {
  testInfo.annotations.push({ type, description });
}

/** Click and wait for the next dialog (null when none appears within `timeout`). */
async function clickForDialog(ctx: Ctx, click: () => Promise<unknown>, timeout = 15_000): Promise<DialogRecord | null> {
  const next = ctx.dialogs.waitForNext(timeout).catch(() => null);
  await click();
  return next;
}

/** Poll a server read until `done(value)` or timeout; returns the last value read. */
async function pollServer<T>(read: () => Promise<T>, done: (v: T) => boolean, timeout = 15_000): Promise<T> {
  const until = Date.now() + timeout;
  let v = await read();
  while (!done(v) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 500));
    v = await read();
  }
  return v;
}

async function freshCtx(browser: Browser, acct: CreatedAccount, locale: AppLocale, testInfo: TestInfo): Promise<Ctx> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, ...waveUse(locale) });
  const page = await context.newPage();
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, locale);
  return ctx;
}

async function closeCtx(ctx: Ctx) {
  ctx.rec.dispose();
  ctx.dialogs.dispose();
  await ctx.page.context().close();
}

async function localKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage));
}

function privateKeysIn(keys: string[]): string[] {
  return keys.filter(
    (k) =>
      (PRIVATE_STORAGE_KEYS as readonly string[]).includes(k) ||
      (PRIVATE_STORAGE_KEY_PREFIXES as readonly string[]).some((p) => k.startsWith(p)),
  );
}

// ── Server seeding / truth (owner) ────────────────────────────────────────────

function enc(v: unknown): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, enc(x)])) } };
}

/** Create/overwrite a document as the emulator owner (bypasses rules — seeding only). */
async function ownerWrite(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, x]) => [k, enc(x)])) }),
  });
  if (!res.ok) throw new Error(`ownerWrite(${path}): ${res.status} ${await res.text()}`);
}

/** One realistic doc in every user collection + the legacy nested docs. */
async function seedEverything(uid: string) {
  const now = new Date();
  const iso = now.toISOString();
  const inTenDays = new Date(now.getTime() + 10 * 864e5).toISOString();
  const day = iso.slice(0, 10);
  const docs: Record<string, Record<string, unknown>> = {
    userEvents: { user_id: uid, title: 'RDV seed D', date: inTenDays, type: 'medical', location: 'Seed', createdAt: iso },
    userTasks: { user_id: uid, title: 'Tâche seed D', dueDate: inTenDays, completed: false, createdAt: iso },
    // The shapes the services read (healthService / weightService), so the Health, Weight and
    // journal screens render the seed instead of ignoring it. D-038: 0.92 was a g/L figure
    // stored as mmol/L and under the wrong field name — Health showed "Glycémie basse".
    // 4.5 mmol/L fasting sits inside the 3.5 – <5.1 target the app itself prints.
    healthMetrics: { user_id: uid, type: 'weight', value: 62, date: iso, week: 32, notes: '', created_at: iso },
    weight_entries: { user_id: uid, weight: 62, date: iso, week_of_pregnancy: 32, created_at: iso },
    glucoseMetrics: { user_id: uid, value: 4.5, meal_context: 'fasting', date: iso, week: 32, created_at: iso },
    symptomsLog: { user_id: uid, symptoms: ['nausea'], date: day, week: 32, notes: '', updated_at: iso },
    // The shape reminderPersistence writes (reminder_id / times_per_day / last_modified).
    userReminderSettings: { user_id: uid, reminder_id: 'rem_med_iron_supplement', enabled: true, times_per_day: 1, last_modified: iso },
    userTaskStatuses: { user_id: uid, taskId: 'seed-d', completed: true, updatedAt: iso },
    reminder_settings_v2: { user_id: uid, reminders: {}, updatedAt: iso },
  };
  // A collection the rules allow but this realistic map does not know yet still gets a
  // user-owned document, so the purge is tested against every collection that exists.
  for (const col of USER_COLLECTIONS) {
    await ownerWrite(`${col}/seed-d-${uid}`, docs[col] ?? { user_id: uid, seed: 'D', createdAt: iso, updatedAt: iso });
  }
  await ownerWrite(`users/${uid}`, { legacy: true });
  // D-014: one doc in EVERY parent × subcollection pair the rules allow (8 pairs).
  for (const parent of LEGACY_PARENTS)
    for (const sub of LEGACY_SUBCOLLECTIONS)
      await ownerWrite(`${parent}/${uid}/${sub}/seed-d`, { text: 'seed', title: 'seed', weight: 60, date: iso });
}

type ServerFootprint = {
  profile: boolean;
  counts: Record<string, number>;
  legacy: Record<string, boolean>;
  auth: boolean;
  /** deletionRequests/{uid} — the server-side deletion marker (D-031). Not part of totalDocs. */
  marker: boolean;
};

async function footprint(uid: string): Promise<ServerFootprint> {
  const counts: Record<string, number> = {};
  for (const c of USER_COLLECTIONS) counts[c] = (await serverQuery(c, 'user_id', uid)).length;
  const legacy: Record<string, boolean> = {};
  for (const p of LEGACY_DOCS(uid)) legacy[p] = (await serverDoc(p)) !== null;
  return {
    profile: (await serverDoc(`userProfiles/${uid}`)) !== null,
    counts,
    legacy,
    auth: await authAccountExists(uid),
    marker: (await serverDoc(MARKER_DOC(uid))) !== null,
  };
}

/** Deleted for good: no data, no login, no deletion marker. */
const fullyGone = (f: ServerFootprint) => totalDocs(f) === 0 && !f.auth && !f.marker;

const totalDocs = (f: ServerFootprint): number =>
  Object.values(f.counts).reduce((a, b) => a + b, 0) + Object.values(f.legacy).filter(Boolean).length + (f.profile ? 1 : 0);

/** Auth emulator user record (for the email attached after an upgrade). */
async function authLookup(uid: string): Promise<any | null> {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: [uid] }),
  });
  const body: any = await res.json();
  return body.users?.[0] ?? null;
}

/**
 * Make the account's last sign-in `ageMs` old ON THE AUTH EMULATOR. A token's `auth_time` is
 * the user's `lastLoginAt` and the app measures the sign-in age as (fresh token `iat` −
 * `auth_time`) on that one server clock (accountDeletion.isRecentLogin), so moving
 * `lastLoginAt` back is exactly what five real minutes would do — without the sleep. Every
 * later real sign-in (the re-auth password) sets it to now again, as in production.
 * Returns false when the emulator did not take the value (an older emulator): the caller then
 * falls back to really waiting.
 */
async function backdateLastLogin(uid: string, ageMs: number): Promise<boolean> {
  const target = Date.now() - ageMs;
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid, lastLoginAt: String(target) }),
  });
  if (!res.ok) return false;
  const rec = await authLookup(uid);
  return Math.abs(Number(rec?.lastLoginAt) - target) < 1_000;
}

async function newSeededAccount(scenario: string, fields: Record<string, unknown> = {}): Promise<CreatedAccount> {
  const acct = await createAccount(newAccountEmail(WAVE, scenario), E2E_PASSWORD);
  await seedProfile(acct.uid, acct.idToken, { week: 32, country: 'france', ...fields });
  return acct;
}

/** Password-reset mails the Auth emulator "sent" (server truth for the forgot-password path). */
async function passwordResetCodes(email: string): Promise<any[]> {
  const res = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/oobCodes`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) throw new Error(`oobCodes: ${res.status} ${await res.text()}`);
  const body: any = await res.json();
  return (body.oobCodes ?? []).filter((c: any) => c.email === email && c.requestType === 'PASSWORD_RESET');
}

/** A Firestore REST write/read AS THE USER (rules apply) — returns the HTTP status. */
async function userRest(method: 'GET' | 'PATCH', docPath: string, idToken: string): Promise<number> {
  const res = await fetch(`${DOCS}/${docPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    ...(method === 'PATCH' ? { body: JSON.stringify({ fields: { probe: { stringValue: 'wave-D' } } }) } : {}),
  });
  await res.text();
  return res.status;
}

/**
 * The login form in a context that has no session — for sign-ins that must NOT end on
 * MainTabs (consent sheet, pending deletion), where uiLogin's tablist wait does not apply.
 */
async function openLoginForm(page: Page, locale: AppLocale) {
  await page.addInitScript((l) => {
    try {
      if (sessionStorage.getItem('__e2e_waveD_locale') === '1') return;
      sessionStorage.setItem('__e2e_waveD_locale', '1');
      localStorage.setItem('app_locale', l);
      localStorage.setItem('@home_welcome_seen_v1', '1');
    } catch {
      /* storage blocked */
    }
  }, locale);
  await page.goto('/login', { waitUntil: 'load' });
  await expect(page.getByTestId('login_email_input'), 'login form').toBeVisible({ timeout: 60_000 });
}

async function submitLogin(page: Page, email: string, pw: string) {
  await page.getByTestId('login_email_input').fill(email);
  await page.getByTestId('login_password_input').fill(pw);
  await page.getByTestId('login_submit_button').click();
}

/**
 * D-020: record, from inside the page, whether the blocking "deleting…" modal was ever
 * mounted — independent of screenshot timing. Install before the click that starts the erase.
 */
async function watchDeletionProgress(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__waveDProgress = { seen: false };
    const check = () => {
      const el = document.querySelector('[data-testid="deletion_progress"]') as HTMLElement | null;
      if (!el || w.__waveDProgress.seen) return;
      w.__waveDProgress = {
        seen: true,
        text: el.innerText,
        role: el.getAttribute('role'),
        busy: el.getAttribute('aria-busy'),
        label: el.getAttribute('aria-label'),
        inModal: !!el.closest('[aria-modal="true"]'),
      };
    };
    w.__waveDProgressObs?.disconnect();
    w.__waveDProgressObs = new MutationObserver(check);
    w.__waveDProgressObs.observe(document.body, { childList: true, subtree: true });
    check();
  });
}

type ProgressSeen = { seen: boolean; text?: string; role?: string | null; busy?: string | null; label?: string | null; inModal?: boolean };

async function assertProgressSeen(page: Page, testInfo: TestInfo, name: string, label: RegExp) {
  const seen = (await page.evaluate(() => (window as any).__waveDProgress ?? { seen: false })) as ProgressSeen;
  note(testInfo, `${name}-progress-modal`, JSON.stringify(seen));
  expect.soft(seen.seen, `${name} (D-020): blocking progress modal mounted during the erase`).toBe(true);
  expect.soft(norm(seen.text) + ' | ' + norm(seen.label), `${name} (D-020): progress modal carries a label`).toMatch(label);
  expect.soft(seen.inModal, `${name} (D-020): progress is a modal (blocks the screen)`).toBe(true);
}

/** The Firestore backend becomes unreachable for this page (the app itself still loads). */
const FIRESTORE_TRAFFIC = /:8080\//;

// ── Stale-session simulation (auth/requires-recent-login) ─────────────────────

/**
 * The Auth emulator never enforces "recent login", so model a real stale session with
 * both of its real-world signals, whichever the build relies on:
 *  1. the browser clock is 10 min past the token's auth_time (a client-side age check);
 *  2. `accounts:delete` answers CREDENTIAL_TOO_OLD_LOGIN_AGAIN (what the production
 *     backend does) until the page re-authenticates (`accounts:signInWithPassword`).
 * Call after login; requires `page.clock.install()` before the first navigation.
 */
async function makeSessionStale(page: Page, opts: { waitMs?: number; shiftClock?: boolean; uid?: string } = {}) {
  let reauthenticated = false;
  const refusals: string[] = [];
  // Only a password the server ACCEPTED makes the session recent again — a wrong password
  // (400) must leave the simulation stale, or everything after 29b proves nothing.
  page.on('response', (r) => {
    if (/accounts:signInWithPassword/.test(r.url()) && r.request().method() === 'POST' && r.status() === 200) reauthenticated = true;
  });
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  await page.route(/accounts:delete/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (reauthenticated) return route.continue();
    refusals.push(new Date().toISOString());
    return route.fulfill({
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 400,
          message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN',
          errors: [{ message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN', domain: 'global', reason: 'invalid' }],
        },
      }),
    });
  });
  if (opts.shiftClock !== false) await page.clock.setSystemTime(new Date(Date.now() + 10 * 60_000));
  // 3. a build that measures the sign-in age on the SERVER clock (fresh token issuedAtTime
  //    vs authTime) cannot be fooled by the browser clock: let the session really age past
  //    Firebase's 5-minute window on the emulator clock, so every signal is consistent.
  //    waitMs 0 = the client pre-check passes and only the server refuses, AFTER the purge.
  //    Instead of sleeping, the sign-in is aged on the emulator itself (backdateLastLogin);
  //    the real wait stays as the fallback when no uid is given or the emulator refuses.
  const waitMs = opts.waitMs ?? Number(process.env.WAVE_D_STALE_WAIT_MS ?? 310_000);
  let aged = false;
  if (waitMs > 0 && opts.uid && process.env.WAVE_D_STALE_WAIT_MS === undefined) {
    aged = await backdateLastLogin(opts.uid, waitMs);
  }
  if (waitMs > 0 && !aged) await page.waitForTimeout(waitMs);
  return { refusals, aged };
}

// ── Common UI steps (fr) ──────────────────────────────────────────────────────

async function openProfile(page: Page) {
  await page.goto('/profile', { waitUntil: 'load' });
  await expect(page.getByRole('button', { name: 'Enregistrer les modifications' })).toBeVisible({ timeout: 30_000 });
}

async function openSettings(page: Page) {
  await page.goto('/settings', { waitUntil: 'load' });
  await expect(page.getByRole('switch').first()).toBeVisible({ timeout: 30_000 });
}

const firstNameBox = (p: Page) => p.getByRole('textbox', { name: 'Prénom', exact: true });
const lastNameBox = (p: Page) => p.getByRole('textbox', { name: 'Nom', exact: true }).first();

async function addContact(ctx: Ctx, name: string, number: string, type = 'Médecin'): Promise<DialogRecord | null> {
  const p = ctx.page;
  await p.getByRole('button', { name: 'Nouveau Contact' }).click();
  // The contact-type chips render after the country buttons ("Autre" exists in both).
  await p.getByRole('button', { name: type, exact: true }).last().click();
  await p.getByRole('textbox', { name: 'Nom', exact: true }).last().fill(name);
  await p.getByRole('textbox', { name: 'Numéro' }).fill(number);
  const d = await clickForDialog(ctx, () => p.getByRole('button', { name: 'Enregistrer', exact: true }).click(), 4_000);
  return d;
}

/**
 * Rappels text with every collapsible group expanded (the glucose reminder
 * "Contrôle glycémie" sits in the collapsed "Suivi Médical" group), plus the group headers
 * ("Suivi Médical 4 options") so an option-count change is visible too.
 */
async function remindersText(page: Page): Promise<{ text: string; groups: string[] }> {
  await page.goto('/reminders', { waitUntil: 'load' });
  await expect(page.getByRole('switch').first()).toBeVisible({ timeout: 30_000 });
  const groupBtns = page.getByRole('button', { name: /Suivi Médical|Bien-être & Famille/ });
  const groups: string[] = [];
  for (let i = 0; i < (await groupBtns.count()); i++) {
    groups.push(((await groupBtns.nth(i).innerText()) || '').replace(/\s+/g, ' ').trim());
    await groupBtns.nth(i).click();
  }
  await page.waitForTimeout(800);
  return { text: await page.locator('body').innerText(), groups };
}

const PRIVACY_SCREEN = (p: Page) => p.getByText('Confidentialité & CGU', { exact: true }).first();

const onAuthSurface = (url: string) => /\/(welcome|auth|login|Language|AuthChoice)(\b|$|\?)/.test(url);

// ── Journal (PDF) capture (D-039) ─────────────────────────────────────────────

/**
 * On web "Mon Journal (PDF)" writes the journal into a hidden iframe and calls its print()
 * (pdfExportService.printJournalOnWeb) — a native dialog no screenshot can show. Replace that
 * print() with a recorder so the generated document can be read and asserted. The native path
 * (expo-print on a device) stays a device check. Install on the loaded page, before the click.
 */
async function armJournalCapture(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__journalPrints = [];
    if (w.__journalCaptureArmed) return;
    w.__journalCaptureArmed = true;
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get(this: HTMLIFrameElement) {
        const win = desc.get!.call(this) as any;
        try {
          if (win && !win.__e2ePrintStub) {
            win.__e2ePrintStub = true;
            win.print = () => {
              const d = win.document as Document;
              w.__journalPrints.push({ html: d.documentElement.outerHTML, text: (d.body?.textContent ?? '').replace(/\s+/g, ' ').trim(), dir: d.documentElement.dir, lang: d.documentElement.lang });
            };
          }
        } catch {
          /* cross-origin frame: not ours */
        }
        return win;
      },
    });
  });
}

type JournalCapture = { html: string; text: string; dir: string; lang: string };

async function readJournal(page: Page, timeout = 20_000): Promise<JournalCapture | null> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const got = (await page.evaluate(() => (window as any).__journalPrints?.[0] ?? null)) as JournalCapture | null;
    if (got) return got;
    await page.waitForTimeout(300);
  }
  return null;
}

/** Render the captured journal in its own tab and save the PNG next to the quartets. */
async function snapJournal(page: Page, ctx: Ctx, name: string, journal: JournalCapture) {
  const view = await page.context().newPage();
  try {
    await view.setViewportSize({ width: 820, height: 1100 });
    // The journal @imports a web font: do not let an offline font fetch hold the capture.
    await view.setContent(journal.html, { waitUntil: 'domcontentloaded' });
    await view.waitForTimeout(600);
    for (const dir of ctx.dirs) {
      fs.mkdirSync(dir, { recursive: true });
      await view.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
      fs.writeFileSync(path.join(dir, `${name}.txt`), journal.text);
    }
  } finally {
    await view.close();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// D-profile — states 01-06 (SYNC-8, HYP-D1, HYP-D2)
// ══════════════════════════════════════════════════════════════════════════════

test('D-profile: load, save, empty last name, unsaved-edit wipe, emergency contacts', async ({ page, browser }, testInfo) => {
  const acct = await newSeededAccount('profile', { firstName: 'Leila', lastName: 'Ben' });
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  const seed = (await serverDoc(`userProfiles/${acct.uid}`))!;

  // 01 — fields prefilled from the server seed; DPA = LMP + 280 in fr.
  await openProfile(page);
  await expect.soft(firstNameBox(page)).toHaveValue('Leila', { timeout: 15_000 });
  await expect.soft(lastNameBox(page)).toHaveValue('Ben');
  await expect.soft(page.getByRole('button', { name: 'France', exact: true })).toHaveAttribute('aria-selected', 'true');
  const dpaExpected = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.parse(seed.lmp as string) + 280 * 864e5));
  await expect.soft(page.getByText(dpaExpected, { exact: true }), `01: DPA "${dpaExpected}"`).toBeVisible();
  // D-022: the French abbreviation is DDR; the English "LMP" must not be shown to her.
  const body01 = norm(await page.locator('body').innerText());
  note(testInfo, '01-ddr-lines', JSON.stringify(body01.split('\n').filter((l) => /DDR|LMP/.test(l))));
  expect.soft(/\bLMP\b/.test(body01), '01 (D-022): "LMP" shown on the French Profile').toBe(false);
  expect.soft(/\(DDR\)/.test(body01), '01 (D-022): the dating field is labelled "(DDR)"').toBe(true);
  expect.soft(/DDR \+ 280 jours/.test(body01), '01 (D-022): DPA hint reads "DDR + 280 jours"').toBe(true);
  await state(ctx, '01-profile-loaded');

  // 02 — first name → Amira (+ country → Tunisie, SYNC-16 D-side) → "Succès" + server + fresh context.
  await firstNameBox(page).fill('Amira');
  await page.getByRole('button', { name: 'Tunisie', exact: true }).click();
  const d02 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Enregistrer les modifications' }).click());
  expect.soft(d02?.message ?? '(no dialog)', '02: save feedback').toMatch(/^Succès/);
  const s02 = await pollServer(() => serverDoc(`userProfiles/${acct.uid}`), (d) => d?.firstName === 'Amira');
  expect.soft(s02?.firstName, '02: server userProfiles.firstName').toBe('Amira');
  expect.soft(s02?.country, '02: server userProfiles.country').toBe('tunisia');
  await state(ctx, '02-profile-save-with-lastname');
  {
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await openProfile(f.page);
    await expect.soft(firstNameBox(f.page), '02: fresh context first name').toHaveValue('Amira', { timeout: 15_000 });
    await expect.soft(f.page.getByRole('button', { name: 'Tunisie', exact: true })).toHaveAttribute('aria-selected', 'true');
    await state(f, '02b-profile-fresh-context');
    await closeCtx(f);
  }

  // 03 — HYP-D1: clear "Nom" → save. "Succès" must be shown iff the server changed.
  const before03 = (await serverDoc(`userProfiles/${acct.uid}`))!;
  await lastNameBox(page).fill('');
  const d03 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Enregistrer les modifications' }).click());
  const s03 = await pollServer(
    () => serverDoc(`userProfiles/${acct.uid}`),
    (d) => !!d && d.updatedAt !== before03.updatedAt,
    10_000,
  );
  const serverChanged = !!s03 && s03.updatedAt !== before03.updatedAt;
  const saidSuccess = /^Succès/.test(d03?.message ?? '');
  note(testInfo, '03-profile-save-empty-lastname', `dialog=${JSON.stringify(d03?.message)} serverChanged=${serverChanged} server.lastName=${JSON.stringify(s03?.lastName)}`);
  expect.soft(saidSuccess, `03 (HYP-D1/SYNC-8): "Succès" shown (${saidSuccess}) must equal server updated (${serverChanged})`).toBe(serverChanged);
  expect.soft(serverChanged, '03: an empty last name must still save (server updatedAt unchanged)').toBe(true);
  expect.soft(s03?.lastName ?? '', '03: server lastName cleared').toBe('');
  await state(ctx, '03-profile-save-empty-lastname');
  {
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await openProfile(f.page);
    await expect(firstNameBox(f.page)).not.toHaveValue('', { timeout: 15_000 });
    await expect.soft(lastNameBox(f.page), '03: fresh context last name must be empty').toHaveValue('');
    await state(f, '03b-profile-empty-lastname-fresh-context');
    await closeCtx(f);
  }

  // 04 — HYP-D2: an unsaved first-name edit must survive adding an emergency contact.
  await openProfile(page);
  await expect(firstNameBox(page)).not.toHaveValue('', { timeout: 15_000 });
  await firstNameBox(page).fill('Brouillon');
  const d04 = await addContact(ctx, 'Sage-femme', '0612345678');
  note(testInfo, '04-contact-add-dialog', JSON.stringify(d04?.message ?? null));
  await expect(page.getByRole('button', { name: 'Appeler Sage-femme' })).toBeVisible({ timeout: 10_000 });
  await expect.soft(firstNameBox(page), '04 (HYP-D2): unsaved first name wiped by the contact add').toHaveValue('Brouillon');
  await state(ctx, '04-profile-unsaved-edits-wiped');

  // 05 — contact persisted on the server + fresh context; "Appeler …" present.
  const s05 = await pollServer(
    () => serverDoc(`userProfiles/${acct.uid}`),
    (d) => Array.isArray(d?.emergencyContacts) && (d!.emergencyContacts as any[]).length > 0,
  );
  const contacts05 = (s05?.emergencyContacts as any[]) ?? [];
  expect.soft(contacts05.length, '05: server emergencyContacts length').toBe(1);
  expect.soft(contacts05[0]?.name, '05: server contact name').toBe('Sage-femme');
  expect.soft(String(contacts05[0]?.number ?? '').replace(/\s/g, ''), '05: server contact number').toBe('0612345678');
  await state(ctx, '05-emergency-contact-add');
  {
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await openProfile(f.page);
    await expect.soft(f.page.getByRole('button', { name: 'Appeler Sage-femme' }), '05: fresh context shows the contact').toBeVisible({ timeout: 15_000 });
    await state(f, '05b-emergency-contact-fresh-context');
    await closeCtx(f);
  }

  // 06 — delete → server array empty.
  await openProfile(page);
  await expect(page.getByRole('button', { name: 'Supprimer le contact Sage-femme' })).toBeVisible({ timeout: 15_000 });
  const d06 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le contact Sage-femme' }).click());
  note(testInfo, '06-contact-delete-confirm', JSON.stringify(d06?.message ?? null));
  await expect.soft(page.getByRole('button', { name: 'Appeler Sage-femme' })).toHaveCount(0, { timeout: 10_000 });
  const s06 = await pollServer(
    () => serverDoc(`userProfiles/${acct.uid}`),
    (d) => ((d?.emergencyContacts as any[]) ?? []).length === 0,
  );
  expect.soft(((s06?.emergencyContacts as any[]) ?? []).length, '06: server emergencyContacts after delete').toBe(0);
  await state(ctx, '06-emergency-contact-delete');
  {
    // D-040: the delete is proven on the server above; here also from a phone that has never seen her.
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await openProfile(f.page);
    await expect.soft(firstNameBox(f.page), '06: fresh context profile loaded').not.toHaveValue('', { timeout: 15_000 });
    await expect.soft(f.page.getByRole('button', { name: 'Appeler Sage-femme' }), '06 (D-040): fresh context no longer shows the deleted contact').toHaveCount(0);
    await expect.soft(f.page.getByRole('button', { name: 'Supprimer le contact Sage-femme' })).toHaveCount(0);
    await state(f, '06c-emergency-contact-delete-fresh-context');
    await closeCtx(f);
  }

  // 06b — max 10 contacts enforced at the 11th.
  for (let i = 0; i < 10; i++) await addContact(ctx, `Contact ${i}`, `06123456${String(i).padStart(2, '0')}`, 'Autre');
  const d06b = await addContact(ctx, 'Contact 11', '0612345699', 'Autre');
  expect.soft(d06b?.message ?? '(no dialog)', '06b: 11th contact refused with a message').toMatch(/10/);
  const s06b = await pollServer(
    () => serverDoc(`userProfiles/${acct.uid}`),
    (d) => ((d?.emergencyContacts as any[]) ?? []).length >= 10,
  );
  expect.soft(((s06b?.emergencyContacts as any[]) ?? []).length, '06b: server holds exactly 10 contacts').toBe(10);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click().catch(() => {});
  await state(ctx, '06b-emergency-contact-max10');
});

// ══════════════════════════════════════════════════════════════════════════════
// D-settings — states 07-13 (SYNC-15, HYP-D3, HYP-D4)
// ══════════════════════════════════════════════════════════════════════════════

test('D-settings: dev surfaces, medical flag, daily message, permissions, export, privacy', async ({ page, browser }, testInfo) => {
  const acct = await newSeededAccount('settings', { firstName: 'Salma', lastName: 'Settings' });
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');

  // 07 — no dev-only surface; /diagnostic falls back to Home.
  await openSettings(page);
  await expect.soft(page.getByText('Outils développeur')).toHaveCount(0);
  await expect.soft(page.getByText('Lancer le diagnostic')).toHaveCount(0);
  note(testInfo, '07-test-notifications-present', String(await page.getByRole('button', { name: 'Tester les notifications' }).count()));
  note(testInfo, '07-settings-delete-row-present', String(await page.getByRole('button', { name: /Supprimer (le|mon) compte/ }).count()));
  // D-026: a phone is touched, not clicked.
  const body07 = norm(await page.locator('body').innerText());
  expect.soft(/Cliquez ici/.test(body07), '07 (D-026): "Cliquez ici" on a phone screen').toBe(false);
  expect.soft(/Touchez ici si vous ne recevez pas/.test(body07), '07 (D-026): permission hint reads "Touchez ici…"').toBe(true);
  await state(ctx, '07-settings-loaded');
  await page.goto('/diagnostic', { waitUntil: 'load' });
  await expect.soft(page.getByRole('tablist').first(), '07: /diagnostic must land on the app (Home)').toBeVisible({ timeout: 20_000 });
  // D-025: Home's own content, not its skeleton (the tab bar alone proves nothing).
  await expect.soft(page.getByTestId('home_quick_search'), '07b: /diagnostic falls back to the real Home').toBeVisible({ timeout: 30_000 });
  await expect.soft(page.getByText('Lancer le diagnostic')).toHaveCount(0);
  note(testInfo, '07b-url', page.url());
  await state(ctx, '07b-diagnostic-deeplink');

  // 08 — medical flag on → server + fresh context; content effect (SYNC-15); off → gone.
  const remBefore = await remindersText(page);
  // D-028: an iron tablet is a pill, not a syringe.
  {
    const i = remBefore.text.indexOf('Fer (supplément)');
    const around = i < 0 ? '(row not found)' : remBefore.text.slice(Math.max(0, i - 14), i + 16);
    note(testInfo, '08a-iron-row', JSON.stringify(around));
    expect.soft(i, '08a (D-028): "Fer (supplément)" reminder listed').toBeGreaterThanOrEqual(0);
    expect.soft(around.includes('💊'), `08a (D-028): iron supplement icon is 💊 (${JSON.stringify(around)})`).toBe(true);
    expect.soft(around.includes('💉'), '08a (D-028): iron supplement still shows a syringe').toBe(false);
  }
  await state(ctx, '08a-reminders-baseline');
  await openSettings(page);
  const diabetes = page.getByRole('switch', { name: 'Diabète gestationnel' }).first();
  await expect.soft(diabetes).not.toBeChecked();
  const d08 = await clickForDialog(ctx, () => diabetes.click(), 5_000);
  note(testInfo, '08-toggle-dialog', JSON.stringify(d08?.message ?? null));
  await expect.soft(diabetes, '08: switch reflects the toggle').toBeChecked({ timeout: 10_000 });
  const s08 = await pollServer(() => serverDoc(`userProfiles/${acct.uid}`), (d) => d?.hasGestationalDiabetes === true);
  expect.soft(s08?.hasGestationalDiabetes, '08: server hasGestationalDiabetes').toBe(true);
  expect.soft(typeof s08?.medicalProfileAnsweredAt, '08: server medicalProfileAnsweredAt').toBe('string');
  await state(ctx, '08-settings-medical-flag-on');
  const remOn = await remindersText(page);
  const glyc = (t: string) => /Contrôle glycémie/.test(t);
  note(testInfo, '08-reminders-glyc', JSON.stringify({ before: glyc(remBefore.text), on: glyc(remOn.text), groupsBefore: remBefore.groups, groupsOn: remOn.groups }));
  expect.soft(glyc(remOn.text), '08 (SYNC-15): Rappels lists "Contrôle glycémie" once diabetes is declared').toBe(true);
  expect.soft(glyc(remBefore.text), '08 (SYNC-15): "Contrôle glycémie" offered before any diabetes was declared').toBe(false);
  await state(ctx, '08b-reminders-with-diabetes');
  {
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await openSettings(f.page);
    await expect.soft(f.page.getByRole('switch', { name: 'Diabète gestationnel' }).first(), '08: fresh context switch on').toBeChecked({ timeout: 15_000 });
    await state(f, '08c-medical-flag-fresh-context');
    await closeCtx(f);
  }
  await openSettings(page);
  await page.getByRole('switch', { name: 'Diabète gestationnel' }).first().click();
  const s08off = await pollServer(() => serverDoc(`userProfiles/${acct.uid}`), (d) => d?.hasGestationalDiabetes === false);
  expect.soft(s08off?.hasGestationalDiabetes, '08: server flag off').toBe(false);
  const remOff = await remindersText(page);
  note(testInfo, '08-reminders-off-groups', JSON.stringify(remOff.groups));
  expect.soft(glyc(remOff.text), '08: "Contrôle glycémie" removed when the flag is off').toBe(false);
  await state(ctx, '08d-medical-flag-off');
  {
    // D-040: switching the flag off must reach a new device too (08c proved the "on" half).
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await openSettings(f.page);
    await expect.soft(f.page.getByRole('switch', { name: 'Diabète gestationnel' }).first(), '08 (D-040): fresh context switch off after the flag was cleared').not.toBeChecked({ timeout: 15_000 });
    const remFresh = await remindersText(f.page);
    expect.soft(glyc(remFresh.text), '08 (D-040): fresh context does not list "Contrôle glycémie" once the flag is off').toBe(false);
    await state(f, '08e-medical-flag-off-fresh-context');
    await closeCtx(f);
  }

  // 09 — daily message: hour 11 + toggle → local keys; no console error.
  await openSettings(page);
  await page.getByRole('button', { name: "Sélectionner l'heure : 11 heures" }).click();
  await page.waitForTimeout(800);
  const hour = await page.evaluate(() => localStorage.getItem('@baby_message_hour_v1'));
  expect.soft(hour === null ? null : Number(JSON.parse(hour)), '09: @baby_message_hour_v1').toBe(11);
  const msgSwitch = page.getByRole('switch', { name: 'Activer ou désactiver le message quotidien' }).first();
  await msgSwitch.click();
  await page.waitForTimeout(800);
  const enabled = await page.evaluate(() => localStorage.getItem('@baby_message_enabled_v1'));
  expect.soft(enabled === null ? null : JSON.parse(enabled), '09: @baby_message_enabled_v1 after toggle off').toBe(false);
  await msgSwitch.click();
  await page.waitForTimeout(800);
  // D-040: same-context reload — hour 11 and the re-enabled switch must come back from storage,
  // not from React state. (Both live in device storage: a new phone starts from the defaults,
  // recorded below, not asserted — that is the storage contract, not a defect.)
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('switch').first()).toBeVisible({ timeout: 30_000 });
  await expect.soft(page.getByRole('button', { name: "Sélectionner l'heure : 11 heures" }).first(), '09 (D-040): hour 11 still selected after a reload').toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect.soft(page.getByRole('switch', { name: 'Activer ou désactiver le message quotidien' }).first(), '09 (D-040): daily message still on after a reload').toBeChecked();
  expect.soft(await page.evaluate(() => localStorage.getItem('@baby_message_hour_v1')), '09: stored hour after reload').not.toBeNull();
  {
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await openSettings(f.page);
    const sel = await f.page.getByRole('button', { name: "Sélectionner l'heure : 11 heures" }).first().getAttribute('aria-pressed');
    note(testInfo, '09-fresh-context-hour-11-selected', String(sel));
    await closeCtx(f);
  }
  await state(ctx, '09-settings-daily-message');

  // 10 — request permissions: a web failure dialog is fine; an uncaught exception is not.
  const dialogsBefore10 = ctx.dialogs.dialogs.length;
  await page.getByRole('button', { name: 'Demander les permissions' }).click();
  await page.waitForTimeout(3000);
  note(testInfo, '10-permission-dialogs', JSON.stringify(ctx.dialogs.dialogs.slice(dialogsBefore10).map((d) => d.message)));
  await expect.soft(page.getByRole('button', { name: 'Demander les permissions' }), '10: Settings still mounted (no ErrorBoundary)').toBeVisible();
  await state(ctx, '10-settings-request-permission');

  // 11 — JSON export (HYP-D3): confirm "Données sensibles", then SOME visible outcome.
  await openSettings(page);
  const dialogsBefore11 = ctx.dialogs.dialogs.length;
  const download11 = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
  const d11 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Exporter mes données' }).click());
  expect.soft(d11?.message ?? '(no dialog)', '11: sensitive-data confirm').toMatch(/^Données sensibles/);
  const dl = await download11;
  const after11 = ctx.dialogs.dialogs.slice(dialogsBefore11 + 1).map((d) => d.message);
  note(testInfo, '11-export-json', `download=${dl ? dl.suggestedFilename() : null} dialogs=${JSON.stringify(after11)}`);
  expect.soft(!!dl || after11.length > 0, '11 (HYP-D3): export ends with no download and no message (silent no-op)').toBe(true);
  await state(ctx, '11-export-json');

  // 12 — PDF export (HYP-D4): the Settings screen must not collapse into a skeleton, and (D-039)
  // the journal it generates must carry her data. Seeded here: one weighing, one appointment.
  const nowIso = new Date().toISOString();
  await ownerWrite(`weight_entries/journal-d-${acct.uid}`, { user_id: acct.uid, weight: 63.4, date: nowIso, week_of_pregnancy: 32, created_at: nowIso });
  await ownerWrite(`userEvents/journal-d-${acct.uid}`, {
    user_id: acct.uid, event_id: `journal-d-${acct.uid}`, title: 'RDV Journal D', date: new Date(Date.now() + 10 * 864e5).toISOString(), type: 'medical', notes: 'Note du journal D', createdAt: nowIso,
  });
  await openSettings(page);
  const dialogsBefore12 = ctx.dialogs.dialogs.length;
  await armJournalCapture(page);
  await page.evaluate(() => {
    (window as any).__settingsVanished = false;
    const obs = new MutationObserver(() => {
      if (!document.body.innerText.includes('Politique de Confidentialité')) (window as any).__settingsVanished = true;
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    (window as any).__settingsObs = obs;
  });
  await page.getByRole('button', { name: 'Mon Journal (PDF)' }).click();
  const journal12 = await readJournal(page);
  await page.waitForTimeout(1500);
  const vanished = await page.evaluate(() => {
    (window as any).__settingsObs?.disconnect();
    return (window as any).__settingsVanished as boolean;
  });
  note(testInfo, '12-export-pdf', `settingsVanished=${vanished} journal=${journal12 ? journal12.text.length : null} dialogs=${JSON.stringify(ctx.dialogs.dialogs.slice(dialogsBefore12).map((d) => d.message))}`);
  expect.soft(vanished, '12 (HYP-D4): Settings content disappeared (skeleton flash) during PDF export').toBe(false);
  expect.soft(journal12, '12 (D-039): the journal reached the print step (nothing generated = silent failure)').not.toBeNull();
  if (journal12) {
    const t12 = norm(journal12.text);
    expect.soft(journal12.lang, '12 (D-039): journal lang').toBe('fr');
    expect.soft(journal12.dir, '12 (D-039): journal dir').toBe('ltr');
    expect.soft(t12, '12 (D-039): journal title').toContain('Mon suivi de grossesse');
    expect.soft(t12, '12 (D-039): her name on the profile block').toContain('Salma Settings');
    expect.soft(t12, '12 (D-039): weight section heading').toContain('Historique du poids');
    expect.soft(t12, '12 (D-039): the seeded weighing is listed').toContain('63,4 kg'); // French decimal comma
    expect.soft(t12, '12 (D-039): the weight table is not the empty state').not.toContain('Aucune donnée de poids');
    expect.soft(t12, '12 (D-039): appointments heading').toContain('Rendez-vous');
    expect.soft(t12, '12 (D-039): the seeded appointment title is listed').toContain('RDV Journal D');
    expect.soft(t12, '12 (D-039): the appointment note is listed').toContain('Note du journal D');
    expect.soft(t12, '12 (D-039): the appointments table is not the empty state').not.toContain('Aucun rendez-vous');
    await snapJournal(page, ctx, '12b-export-pdf-journal', journal12);
  }
  await state(ctx, '12-export-pdf');

  // 13 — Privacy policy reachable from Settings and Profile; back works.
  await openSettings(page);
  await page.getByRole('button', { name: 'Politique de Confidentialité' }).click();
  await expect.soft(PRIVACY_SCREEN(page), '13: privacy screen from Settings').toBeVisible({ timeout: 15_000 });
  note(testInfo, '13-privacy-url', page.url());
  await state(ctx, '13-privacy-from-settings');
  const terms = page.getByText('CGU', { exact: true }).first();
  note(testInfo, '13-terms-tab-role', String(await page.getByRole('tab', { name: 'CGU' }).count() + await page.getByRole('button', { name: 'CGU' }).count()));
  // D-023: the three legal documents are a tab list with a selected tab, not bare divs.
  // Scoped to the legal tab list: the app's bottom tab bar is a tablist with its own
  // selected tab on this same screen, so a page-wide "selected" count would count both.
  await expect.soft(page.getByRole('tab', { name: 'CGU' }), '13: CGU is a tab').toHaveCount(1);
  const legalTabs = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: 'CGU' }) });
  await expect.soft(legalTabs, '13 (D-023): the legal documents sit in a tablist').toHaveCount(1);
  await expect.soft(legalTabs.getByRole('tab'), '13 (D-023): three legal tabs').toHaveCount(3);
  await expect.soft(legalTabs.getByRole('tab', { selected: true }), '13: exactly one legal tab is selected').toHaveCount(1);
  await expect.soft(legalTabs.getByRole('tab', { name: 'Confidentialité' }), '13 (D-023): the open document is the selected tab').toHaveAttribute('aria-selected', 'true');
  await expect.soft(legalTabs.getByRole('tab', { name: 'CGU' }), '13 (D-023): CGU not selected yet').toHaveAttribute('aria-selected', 'false');
  if (await terms.count()) {
    await terms.click();
    await expect.soft(page.getByText(/AVERTISSEMENT MÉDICAL/).first(), '13: Terms carry the medical disclaimer').toBeVisible({ timeout: 10_000 });
    await expect.soft(legalTabs.getByRole('tab', { name: 'CGU' }), '13b (D-023): selection follows the tap').toHaveAttribute('aria-selected', 'true');
    await expect.soft(legalTabs.getByRole('tab', { selected: true }), '13b: still exactly one legal tab selected').toHaveCount(1);
    await state(ctx, '13b-privacy-terms-tab');
  } else {
    expect.soft(false, '13: no Terms tab found on the privacy screen').toBe(true);
  }
  await page.goBack();
  await expect.soft(page.getByRole('button', { name: 'Mon Journal (PDF)' }), '13: back returns to Settings').toBeVisible({ timeout: 15_000 });
  await openProfile(page);
  await page.getByRole('button', { name: 'Politique de Confidentialité' }).click();
  await expect.soft(PRIVACY_SCREEN(page), '13: privacy from Profile').toBeVisible({ timeout: 15_000 });
  await state(ctx, '13c-privacy-from-profile');
  await page.goBack();
  await expect.soft(page.getByRole('button', { name: 'Enregistrer les modifications' }), '13: back returns to Profile').toBeVisible({ timeout: 15_000 });
});

// ══════════════════════════════════════════════════════════════════════════════
// D-lang — states 14-17 (SYNC-10, HYP-D5)
// ══════════════════════════════════════════════════════════════════════════════

async function pickLanguage(page: Page, label: string) {
  await page.getByRole('button', { name: /Choisir la langue|اختر اللغة|Choose language|Language/i }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(1500);
}

async function htmlDirLang(page: Page) {
  return page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, title: document.title }));
}

test('D-lang: live switch fr→ar→tn→fr, /language deep link, persistence', async ({ page, browser }, testInfo) => {
  const acct = await newSeededAccount('lang', { firstName: 'Nour', lastName: 'Lang' });
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);

  // 14 — العربية, no reload.
  const urlBefore14 = page.url();
  await page.evaluate(() => ((window as any).__waveDNoReload = true));
  await pickLanguage(page, 'العربية');
  const ar = await htmlDirLang(page);
  const survived = await page.evaluate(() => (window as any).__waveDNoReload === true);
  note(testInfo, '14-html', JSON.stringify({ ...ar, urlBefore: urlBefore14, urlAfter: page.url() }));
  expect.soft(survived, '14: the switch must not reload the page').toBe(true);
  expect.soft(ar.dir, '14: html dir').toBe('rtl');
  expect.soft(ar.lang, '14: html lang').toMatch(/^ar/);
  await expect.soft(page.getByRole('tab', { name: /الرئيسية/ }).first(), '14: tab bar in Arabic').toBeVisible();
  await expect.soft(page.getByRole('textbox', { name: 'الاسم الأول' }), '14: Profile form in Arabic').toBeVisible();
  expect.soft(/[؀-ۿ]/.test(ar.title), `14: document.title in Arabic ("${ar.title}")`).toBe(true);
  await state(ctx, '14-language-live-ar');
  // Home itself, proven by a Home-only element — Profile also prints the week.
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByTestId('home_quick_search')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('textbox', { name: 'الاسم الأول' })).toHaveCount(0);
  await page.waitForTimeout(1500);
  const homeAr = await page.locator('body').innerText();
  expect.soft(/Semaine 32/.test(homeAr), '14: Home still shows the French "Semaine 32"').toBe(false);
  expect.soft(/32/.test(homeAr) && /الأسبوع|أسبوع/.test(homeAr), '14: Home week text in Arabic').toBe(true);
  await state(ctx, '14b-home-ar');

  // 15 — العربية + الدارجة.
  await openProfile(page).catch(async () => {
    await page.goto('/profile', { waitUntil: 'load' });
  });
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 30_000 });
  await pickLanguage(page, 'العربية + الدارجة');
  const tn = await htmlDirLang(page);
  note(testInfo, '15-html', JSON.stringify(tn));
  expect.soft(tn.dir, '15: html dir').toBe('rtl');
  expect.soft(tn.lang, '15: html lang').toMatch(/tn|ar-TN/i);
  await state(ctx, '15-language-tn');

  // back to Français → ltr.
  await pickLanguage(page, 'Français');
  const fr = await htmlDirLang(page);
  expect.soft(fr.dir, '15b: back to fr → ltr').not.toBe('rtl');
  expect.soft(fr.lang, '15b: back to fr').toMatch(/^fr/);
  await expect.soft(page.getByRole('textbox', { name: 'Prénom', exact: true })).toBeVisible();
  await state(ctx, '15b-language-back-fr');

  // 16 — /language deep link → pick a card → "Continuer" (HYP-D5).
  await page.goto('/language', { waitUntil: 'load' });
  await expect(page.locator('[data-testid="lang_card_fr"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="lang_card_fr"]').click();
  await page.waitForTimeout(800);
  const urlBefore16 = page.url();
  await page.getByText('Continuer', { exact: true }).first().dispatchEvent('click');
  await page.waitForTimeout(3000);
  const stillOnLanguage = (await page.locator('[data-testid="lang_card_fr"]').count()) > 0 && page.url() === urlBefore16;
  note(testInfo, '16-language-continue', `url=${page.url()} stillOnLanguage=${stillOnLanguage}`);
  expect.soft(stillOnLanguage, '16 (HYP-D5): "Continuer" on /language does nothing').toBe(false);
  // D-033: Home's address is the root, not the internal route name.
  expect.soft(new URL(page.url()).pathname, '16 (D-033): Home URL path after "Continuer"').toBe('/');
  await expect.soft(page.getByTestId('home_quick_search'), '16: "Continuer" lands on Home').toBeVisible({ timeout: 20_000 });
  await state(ctx, '16-language-deeplink-continue');

  // 16b — D-033: that address survives a reload, works as a deep link, and the old
  // /HomeMain link (bookmarks, the previous build's address bar) still opens Home.
  await page.reload({ waitUntil: 'load' });
  await expect.soft(page.getByTestId('home_quick_search'), '16b (D-033): reload of "/" shows Home').toBeVisible({ timeout: 30_000 });
  expect.soft(new URL(page.url()).pathname, '16b (D-033): path after reload').toBe('/');
  await expect.soft(page.getByText('Semaine 32', { exact: true }).first(), '16b: Home content after reload').toBeVisible({ timeout: 20_000 });
  await state(ctx, '16b-home-root-reload');
  await page.goto('/profile', { waitUntil: 'load' });
  await expect(page.getByRole('button', { name: 'Enregistrer les modifications' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/', { waitUntil: 'load' });
  await expect.soft(page.getByTestId('home_quick_search'), '16c (D-033): deep link "/" opens Home').toBeVisible({ timeout: 30_000 });
  await page.goto('/HomeMain', { waitUntil: 'load' });
  await expect.soft(page.getByTestId('home_quick_search'), '16c (D-033): legacy /HomeMain link still opens Home').toBeVisible({ timeout: 30_000 });
  note(testInfo, '16c-legacy-homemain-url', page.url());
  await state(ctx, '16c-home-deeplinks');

  // 17 — persistence: local (same-context reload, recorded) and server (profile `locale`).
  await openProfile(page);
  await pickLanguage(page, 'العربية');
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
  const afterReload = await htmlDirLang(page);
  note(testInfo, '17-reload', JSON.stringify(afterReload));
  expect.soft(afterReload.lang, '17: same-context reload keeps ar (local app_locale)').toMatch(/^ar/);
  const s17 = await serverDoc(`userProfiles/${acct.uid}`);
  note(testInfo, '17-server-locale', JSON.stringify(s17?.locale ?? null));
  expect.soft(s17?.locale ?? null, '17 (P2): language is not synced to the account (another device resets it)').toBe('ar');
  await state(ctx, '17-language-persist');

  // 17b — D-025: the other half of the oracle. A new phone set to French signs in: the
  // account's language (ar) must follow her there.
  {
    const f = await freshCtx(browser, acct, 'fr', testInfo);
    await expect.soft(f.page.getByRole('tab', { name: /الرئيسية/ }).first(), '17b: account language applied on a new device').toBeVisible({ timeout: 20_000 });
    const fresh17 = await htmlDirLang(f.page);
    note(testInfo, '17b-fresh-context', JSON.stringify(fresh17));
    expect.soft(fresh17.lang, '17b: html lang on a new device').toMatch(/^ar/);
    expect.soft(fresh17.dir, '17b: html dir on a new device').toBe('rtl');
    // D-025: Home's own content (not the tab bar alone) before the capture.
    await expect.soft(f.page.getByTestId('home_quick_search'), '17b: the new device lands on Home').toBeVisible({ timeout: 30_000 });
    await state(f, '17b-language-fresh-context');
    await closeCtx(f);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// D-upgrade — states 18-22 (SYNC-11, HYP-D6, HYP-D7)
// ══════════════════════════════════════════════════════════════════════════════

test('D-upgrade: real anonymous guest → account keeps uid, data and a complete profile', async ({ page, browser }, testInfo) => {
  const ctx = instrument(page, testInfo);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('@home_welcome_seen_v1', '1');
    } catch {
      /* ignore */
    }
  });

  // 18 — cold funnel as a guest, week 32.
  await page.goto('/welcome', { waitUntil: 'load' });
  await page.locator('[data-testid="lang_card_fr"]').click({ timeout: 30_000 });
  await page.locator('text="✓"').first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText('Continuer', { exact: true }).first().dispatchEvent('click');
  await page.getByTestId('auth_guest_button').click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Je suis enceinte' }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: /Dernières règles/ }).click();
  await page.locator('input[type="date"]').fill(lmpIsoForWeek(32).slice(0, 10));
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre prénom (optionnel)' }).fill('Invitée');
  await page.getByRole('button', { name: '25-29', exact: true }).click();
  await page.getByRole('button', { name: 'France', exact: true }).click();
  await page.getByRole('button', { name: /Oui, c'est tout nouveau/ }).click();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  // Health-data consent: the step-4 save stays disabled until it is ticked.
  await tickHealthConsent(page);
  await page.getByTestId('onboarding_step4_skip').click({ timeout: 20_000 });
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
  await expect.soft(page.getByText('Semaine 32', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  const guest = await page.evaluate(() => JSON.parse(localStorage.getItem('user_profile') || '{}'));
  const guestUid: string = guest.uid;
  note(testInfo, '18-guest-uid', `${guestUid} isGuest=${guest.isGuest}`);
  expect(guestUid, 'guest uid').toBeTruthy();
  expect.soft(guestUid.startsWith('guest_'), '18: guest must be a real anonymous Firebase user (not a local guest_ uid)').toBe(false);
  expect.soft(await authAccountExists(guestUid), '18: anonymous auth user exists').toBe(true);

  // Guest actions.
  await page.goto('/reminders', { waitUntil: 'load' });
  const vit = page.getByRole('switch', { name: 'Vitamines prénatales' }).first();
  await expect(vit).toBeVisible({ timeout: 30_000 });
  const vitBefore = await vit.isChecked();
  await vit.click();
  await expect.soft(vit, '18: reminder toggled').toBeChecked({ checked: !vitBefore, timeout: 10_000 });
  await page.getByRole('tab').filter({ hasText: /Tâches/ }).first().click();
  const task = page.getByRole('checkbox', { name: /Consultation 7ème mois/ });
  await expect(task).toBeVisible({ timeout: 20_000 });
  // "Ma Journée" loads asynchronously ABOVE the weekly list and shifts it; let it settle
  // or the click lands on whichever row moved under the pointer.
  await page.waitForTimeout(3000);
  const taskLabel = (await task.getAttribute('aria-label')) || '';
  await task.scrollIntoViewIfNeeded();
  await task.click();
  await expect.soft(task, '18: weekly task completed').toBeChecked({ timeout: 10_000 });
  // D-032: the "remaining tasks" counter agrees in number ("1 tâche restante").
  {
    const counters = [...norm(await page.locator('body').innerText()).matchAll(/(\d+) (tâches? restantes?)/g)].map(([all, n, words]) => ({ all, n: Number(n), words }));
    note(testInfo, '18a-remaining-counters', JSON.stringify(counters.map((c) => c.all)));
    for (const c of counters) {
      const expected = c.n <= 1 ? 'tâche restante' : 'tâches restantes';
      expect.soft(c.words, `18a (D-032): "${c.all}" must read "${c.n} ${expected}"`).toBe(expected);
    }
    // Drive "Ma Journée" down to exactly one remaining item so the singular is really shown.
    const myDay = page.getByRole('checkbox', { checked: false });
    let guard = 12;
    let last = counters[0]?.n ?? -1;
    while (last > 1 && guard-- > 0) {
      const before = last;
      const boxes = await myDay.all();
      let moved = false;
      for (const box of boxes) {
        await box.scrollIntoViewIfNeeded();
        await box.click();
        await page.waitForTimeout(700);
        const m = norm(await page.locator('body').innerText()).match(/(\d+) tâches? restantes?/);
        last = m ? Number(m[1]) : -1;
        if (last !== before) {
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    const final = norm(await page.locator('body').innerText()).match(/(\d+) (tâches? restantes?)/);
    const singularSeen = counters.some((c) => c.n === 1) || final?.[1] === '1';
    note(testInfo, '18a-remaining-final', JSON.stringify({ final: final?.[0] ?? null, singularSeen }));
    // Only when the screen really shows one remaining task (it depends on the day's list).
    if (final?.[1] === '1') expect.soft(final[0], '18a (D-032): singular counter').toBe('1 tâche restante');
  }
  await state(ctx, '18a-guest-task-toggle');

  await page.goto('/weight', { waitUntil: 'load' });
  await page.getByRole('textbox', { name: 'Votre poids avant grossesse (kg)' }).fill('60');
  await page.getByRole('textbox', { name: 'Votre taille (cm)' }).fill('165');
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Enregistrer' }).click(), 5_000);
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click({ timeout: 15_000 });
  await page.getByRole('textbox', { name: /Ajouter mon poids/ }).fill('68');
  const dWeight = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Enregistrer', exact: true }).click(), 5_000);
  note(testInfo, '18-weight-dialog', JSON.stringify(dWeight?.message ?? null));
  await expect.soft(page.getByText(/68/).first(), '18: weight entry listed').toBeVisible({ timeout: 10_000 });

  await page.goto('/resources', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Nausées matinales' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).click({ timeout: 15_000 });
  await expect.soft(page.getByRole('button', { name: 'Enregistré', exact: true }), '18: bookmark button shows the saved state').toBeVisible({ timeout: 10_000 });
  const bookmarks18 = await page.evaluate(() => localStorage.getItem('@bookmarks_v1'));
  expect.soft(bookmarks18 ?? '', '18: bookmark stored').toMatch(/article/);
  await state(ctx, '18b-guest-bookmark');

  await openProfile(page);
  await addContact(ctx, 'Sage-femme', '0612345678');
  await expect.soft(page.getByRole('button', { name: 'Appeler Sage-femme' })).toBeVisible({ timeout: 10_000 });

  await page.goto('/hospital-bag', { waitUntil: 'load' });
  const bag = page.getByRole('checkbox');
  await expect(bag.first()).toBeVisible({ timeout: 20_000 });
  await bag.nth(0).click();
  await bag.nth(1).click();
  await expect.soft(bag.nth(1), '18: bag items packed').toBeChecked({ timeout: 5_000 });
  const localBefore = await localKeys(page);
  note(testInfo, '18-local-keys', JSON.stringify(localBefore.filter((k) => !k.startsWith('firestore'))));
  await state(ctx, '18-guest-start');

  // 19 — same-context reload: the guest's emergency contact must still be there (HYP-D6).
  await page.reload({ waitUntil: 'load' });
  await openProfile(page);
  await expect.soft(page.getByRole('button', { name: 'Appeler Sage-femme' }), '19 (HYP-D6): guest emergency contact lost on reload').toBeVisible({ timeout: 15_000 });
  // D-026: the guest is addressed in the feminine, like every other screen.
  {
    const body19 = norm(await page.locator('body').innerText());
    note(testInfo, '19-guest-copy', JSON.stringify(body19.split('\n').filter((l) => /invité/i.test(l))));
    expect.soft(/Utilisatrice invitée/.test(body19), '19 (D-026): "Utilisatrice invitée"').toBe(true);
    expect.soft(/Mode Invitée/.test(body19), '19 (D-026): "Mode Invitée"').toBe(true);
    expect.soft(/Utilisateur invité|Mode Invité(?!e)/.test(body19), '19 (D-026): masculine guest copy left').toBe(false);
  }
  await state(ctx, '19-guest-reload');

  // 20 — upgrade from Profile → /create-account → "Compte créé" → same uid + email.
  const email = newAccountEmail(WAVE, 'upgrade');
  await page.getByRole('button', { name: 'Créer un compte' }).first().click();
  await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 20_000 });
  // GuestUpgrade terms line → privacy (13, third entry point).
  const termsLine = page.getByText(/En créant un compte, vous acceptez/);
  await expect.soft(termsLine.first(), '13: GuestUpgrade shows its terms line (third privacy entry point)').toBeVisible();
  if (await termsLine.count()) {
    await termsLine.first().click();
    await expect.soft(PRIVACY_SCREEN(page), '13: privacy from GuestUpgrade').toBeVisible({ timeout: 15_000 });
    await state(ctx, '13d-privacy-from-guest-upgrade');
    await page.goBack();
    await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 20_000 });
  }
  await page.getByTestId('register_email_input').fill(email);
  await page.getByTestId('register_password_input').fill(E2E_PASSWORD);
  await page.getByTestId('register_confirm_input').fill(E2E_PASSWORD);
  await page.getByTestId('register_submit_button').click();
  await expect.soft(page.getByText('Compte créé', { exact: true }).first(), '20: upgrade toast').toBeVisible({ timeout: 20_000 });
  // D-026: one check mark, not "✅ Compte créé ✅".
  {
    const body20 = await page.locator('body').innerText();
    const i = body20.indexOf('Compte créé');
    const around = i < 0 ? '' : body20.slice(Math.max(0, i - 6), i + 16);
    note(testInfo, '20-toast-text', JSON.stringify(around));
    expect.soft((around.match(/✅/g) ?? []).length, `20 (D-026): check marks around the toast (${JSON.stringify(around)})`).toBeLessThanOrEqual(1);
  }
  await page.waitForTimeout(2000);
  const upgraded = await page.evaluate(() => JSON.parse(localStorage.getItem('user_profile') || '{}'));
  const rec20 = await authLookup(guestUid);
  note(testInfo, '20-upgrade', `localUid=${upgraded.uid} isGuest=${upgraded.isGuest} authEmail=${rec20?.email ?? null}`);
  expect.soft(upgraded.uid, '20: same uid after upgrade (linkWithCredential)').toBe(guestUid);
  expect.soft(rec20?.email, '20: email attached to the guest uid').toBe(email);
  await state(ctx, '20-guest-upgrade');

  // 21 — server truth under the same uid (HYP-D7).
  const prof21 = await pollServer(() => serverDoc(`userProfiles/${guestUid}`), (d) => !!d, 10_000);
  note(testInfo, '21-server-profile', JSON.stringify(prof21));
  expect.soft(prof21, '21 (HYP-D7): userProfiles/{uid} exists after upgrade').not.toBeNull();
  expect.soft(typeof prof21?.lmp, '21: server profile carries the LMP').toBe('string');
  expect.soft(prof21?.firstName, '21: server profile carries the first name').toBe('Invitée');
  const serverData21: Record<string, number> = {};
  for (const c of ['weight_entries', 'reminder_settings_v2', 'userTaskStatuses', 'healthMetrics'])
    serverData21[c] = (await serverQuery(c, 'user_id', guestUid)).length;
  note(testInfo, '21-server-collections', JSON.stringify(serverData21));
  expect.soft(serverData21.weight_entries + serverData21.healthMetrics, '21: guest weight entry on the server').toBeGreaterThan(0);
  expect.soft(serverData21.reminder_settings_v2, '21: guest reminder toggle on the server').toBeGreaterThan(0);
  expect.soft(serverData21.userTaskStatuses, `21: guest task status on the server (${taskLabel})`).toBeGreaterThan(0);
  // D-040: the weighing she entered as a guest is on the server with its value (68), and so is
  // the hospital bag she packed — not just "some row exists".
  const weightRows21 = [...(await serverQuery('weight_entries', 'user_id', guestUid)), ...(await serverQuery('healthMetrics', 'user_id', guestUid))];
  const weights21 = weightRows21.map((r) => Number(r.data.weight ?? r.data.value));
  note(testInfo, '21-server-weights', JSON.stringify(weights21));
  expect.soft(weights21, '21 (D-040): the guest weighing (68 kg) is on the server under the same uid').toContain(68);
  const bag21 = await pollServer(() => serverDoc(`hospitalBags/${guestUid}`), (d) => d !== null, 10_000);
  note(testInfo, '21-server-bag', JSON.stringify(bag21));
  expect.soft(bag21, '21 (D-040): hospitalBags/{uid} exists after the upgrade').not.toBeNull();
  expect.soft(Object.values((bag21?.checked as Record<string, unknown>) ?? {}).filter((v) => v === true).length, '21 (D-040): both packed bag items are on the server').toBeGreaterThanOrEqual(2);
  const localAfter = await localKeys(page);
  expect.soft(localAfter.includes('@bookmarks_v1'), '21: bookmarks survive the upgrade on this device').toBe(true);
  expect.soft(localAfter.includes('hospital_bag_v1'), '21: bag survives the upgrade on this device').toBe(true);
  await page.goto('/profile', { waitUntil: 'load' });
  await expect.soft(page.getByRole('button', { name: 'Supprimer le compte' }), '21: delete-account row visible once upgraded').toBeVisible({ timeout: 15_000 });
  await state(ctx, '21-upgrade-server-truth');

  // 22 — a fresh context (new phone) + login shows week 32 and the name.
  const acct: CreatedAccount = { uid: guestUid, idToken: '', email, password: E2E_PASSWORD };
  const f = await freshCtx(browser, acct, 'fr', testInfo);
  await expect.soft(f.page.getByText('Semaine 32', { exact: true }).first(), '22: fresh login keeps pregnancy dating (week 32)').toBeVisible({ timeout: 20_000 });
  // D-025: Home's own content, fully faded in, before the capture.
  await expect.soft(f.page.getByTestId('home_quick_search'), '22: fresh login lands on Home').toBeVisible({ timeout: 20_000 });
  await state(f, '22-upgrade-fresh-login');
  await openProfile(f.page);
  await expect.soft(firstNameBox(f.page), '22: fresh login keeps the first name').toHaveValue('Invitée', { timeout: 15_000 });
  await expect.soft(f.page.getByRole('button', { name: 'Appeler Sage-femme' }), '22: fresh login keeps the emergency contact').toBeVisible({ timeout: 10_000 });
  await state(f, '22b-upgrade-fresh-profile');
  // D-040: the bag follows her account to the new phone (server truth: hospitalBags/{uid}).
  await f.page.goto('/hospital-bag', { waitUntil: 'load' });
  await expect(f.page.getByRole('checkbox').first()).toBeVisible({ timeout: 20_000 });
  await expect.soft(f.page.getByRole('checkbox').nth(0), '22 (D-040): fresh login keeps bag item 1 packed').toBeChecked({ timeout: 15_000 });
  await expect.soft(f.page.getByRole('checkbox').nth(1), '22 (D-040): fresh login keeps bag item 2 packed').toBeChecked({ timeout: 15_000 });
  // Bookmarks are device-local by design (@bookmarks_v1 in storage, no Firestore collection):
  // recorded, so a change of contract shows up here.
  note(testInfo, '22-fresh-device-bookmarks', String(await f.page.evaluate(() => localStorage.getItem('@bookmarks_v1'))));
  await state(f, '22c-upgrade-fresh-bag');
  await closeCtx(f);
});

// ══════════════════════════════════════════════════════════════════════════════
// D-logout — states 23-25 (SYNC-12, HYP-D8, HYP-D9)
// ══════════════════════════════════════════════════════════════════════════════

test('D-logout: logout wipes private data, no cross-user leak, relogin restores server data', async ({ page }, testInfo) => {
  const x = await newSeededAccount('logout-x', { firstName: 'Xaviere', lastName: 'Logout' });
  const y = await newSeededAccount('logout-y', { firstName: 'Yasmine', lastName: 'Other' });
  const ctx = instrument(page, testInfo);
  await uiLogin(page, x.email, x.password, 'fr');

  // X: an unsaved appointment draft + a local tool entry.
  await page.goto('/appointment/add', { waitUntil: 'load' });
  await page.getByRole('textbox', { name: 'Titre *' }).fill('Privé X');
  await page.waitForTimeout(1000);
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  await page.getByRole('checkbox').first().click({ timeout: 20_000 });
  await page.waitForTimeout(500);

  // 23 — logout → /welcome, no private key left.
  await openProfile(page);
  const dialogsBefore23 = ctx.dialogs.dialogs.length;
  const d23 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Se déconnecter' }).click());
  expect.soft(d23?.message ?? '(no dialog)', '23: logout confirm').toMatch(/^Déconnexion/);
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  note(testInfo, '23-landing', page.url());
  // B-018: online, everything was sent — a plain logout stays ONE confirmation.
  const dialogs23 = ctx.dialogs.dialogs.slice(dialogsBefore23).map((d) => norm(d.message));
  note(testInfo, '23-dialogs', JSON.stringify(dialogs23));
  expect.soft(dialogs23.length, `23 (B-018): online logout asks once (${JSON.stringify(dialogs23)})`).toBe(1);
  // …and what she packed before logging out reached the server first.
  const bag23 = await pollServer(() => serverDoc(`hospitalBags/${x.uid}`), (d) => d !== null, 5_000);
  expect.soft(bag23, '23 (B-018): the bag edit made before logout is on the server').not.toBeNull();
  expect.soft(new URL(page.url()).pathname, '23: lands on the sign-in choice (A-043: not the cold language picker)').toBe('/auth');
  await page.waitForTimeout(1500);
  const leftover = privateKeysIn(await localKeys(page));
  expect.soft(leftover, '23: private keys left after logout').toEqual([]);
  await expect.soft(page.getByRole('tablist'), '23: MainTabs still mounted after logout (signed-out user resurrected)').toHaveCount(0);
  await state(ctx, '23-logout');

  // Harness recovery (the 23 failure above is already recorded): if the app came back to
  // MainTabs, log out once more so the cross-user checks below can still run.
  if ((await page.getByRole('tablist').count()) > 0) {
    note(testInfo, '23-logout-retry', `stuck at ${page.url()} keys=${JSON.stringify(leftover)}`);
    await openProfile(page);
    await clickForDialog(ctx, () => page.getByRole('button', { name: 'Se déconnecter' }).click());
    await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await state(ctx, '23b-logout-retry');
  }

  // 24 — Y on the same device must not see X's draft (HYP-D9).
  await uiLogin(page, y.email, y.password, 'fr');
  await page.goto('/appointment/add', { waitUntil: 'load' });
  const title = page.getByRole('textbox', { name: 'Titre *' });
  await expect(title).toBeVisible({ timeout: 20_000 });
  await expect.soft(title, '24 (HYP-D9): X draft leaked to Y').not.toHaveValue(/Privé X/);
  await expect.soft(page.getByText('Privé X')).toHaveCount(0);
  await state(ctx, '24-logout-draft-leak');

  // 25 — Y out, X back: Firestore data restored, local tools gone (recorded, R6).
  await openProfile(page);
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Se déconnecter' }).click());
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const yLoggedOut = (await page.getByRole('tablist').count()) === 0;
  expect.soft(yLoggedOut, '25: Y logout left MainTabs mounted (signed-out user resurrected)').toBe(true);
  if (!yLoggedOut) {
    await state(ctx, '25a-y-logout-stuck');
    await openProfile(page);
    await clickForDialog(ctx, () => page.getByRole('button', { name: 'Se déconnecter' }).click());
    await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  }
  await uiLogin(page, x.email, x.password, 'fr');
  await expect.soft(page.getByText('Semaine 32', { exact: true }).first(), '25: X week restored').toBeVisible({ timeout: 20_000 });
  await openProfile(page);
  await expect.soft(firstNameBox(page), '25: X profile restored').toHaveValue('Xaviere', { timeout: 15_000 });
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  await expect(page.getByRole('checkbox').first()).toBeVisible({ timeout: 20_000 });
  note(testInfo, '25-local-bag-after-relogin', `firstItemChecked=${await page.getByRole('checkbox').first().isChecked()}`);
  await state(ctx, '25-relogin');
});

// ══════════════════════════════════════════════════════════════════════════════
// D-delete-A — states 26-28 (SYNC-13)
// ══════════════════════════════════════════════════════════════════════════════

test('D-delete-A: cancel keeps everything; confirm leaves zero server data and no auth user', async ({ page }, testInfo) => {
  const acct = await newSeededAccount('delete-a', { firstName: 'Dalia', lastName: 'Delete' });
  await seedEverything(acct.uid);
  const seeded = await footprint(acct.uid);
  expect(totalDocs(seeded), 'seed: every collection + legacy + profile').toBe(USER_COLLECTIONS.length + LEGACY_DOCS(acct.uid).length + 1);
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);

  // 26 — dismiss the confirm → nothing deleted.
  ctx.dialogs.next('dismiss');
  const d26 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  expect.soft(d26?.message ?? '(no dialog)', '26: delete confirm').toMatch(/^Supprimer le compte\n\n.*irréversible/s);
  // From Profile the export lives in Settings — the confirm must say so (and not "on this screen").
  expect.soft(norm(d26?.message), '26: confirm points to the Settings export').toMatch(/Paramètres → « Exporter mes données »/);
  await page.waitForTimeout(3000);
  const after26 = await footprint(acct.uid);
  expect.soft(after26, '26: cancel must leave the server untouched').toEqual(seeded);
  await expect.soft(page.getByRole('button', { name: 'Enregistrer les modifications' }), '26: still on Profile').toBeVisible();
  await state(ctx, '26-delete-confirm-cancel');

  // 27a — D-020: the blocking "Suppression en cours…" modal. The last step of the erase (the
  // Auth delete) is held at the network so the modal can be captured while the deletion is
  // really in flight; nothing is faked, the request is released untouched afterwards.
  let releaseAuthDelete!: () => void;
  const authDeleteGate = new Promise<void>((r) => (releaseAuthDelete = r));
  let authDeleteHeld = false;
  await page.route(/accounts:delete/, async (route) => {
    if (route.request().method() === 'POST') {
      authDeleteHeld = true;
      await authDeleteGate;
    }
    await route.continue();
  });
  await watchDeletionProgress(page);
  const dialogsBefore27 = ctx.dialogs.dialogs.length;
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  const progress = page.getByTestId('deletion_progress');
  await expect.soft(progress, '27a (D-020): blocking progress modal while the account is being erased').toBeVisible({ timeout: 20_000 });
  await expect.soft(progress.getByText('Suppression en cours…'), '27a (D-020): the modal says what is happening').toBeVisible();
  await expect.soft(progress, '27a (D-020): announced as a progress indicator').toHaveAttribute('role', 'progressbar');
  await expect.soft(progress, '27a (D-020): the indicator is labelled').toHaveAttribute('aria-label', 'Suppression en cours…');
  // aria-busy is recorded, not asserted (react-native-web drops accessibilityState.busy).
  note(testInfo, '27a-aria-busy', String(await progress.getAttribute('aria-busy').catch(() => null)));
  await expect.poll(() => authDeleteHeld, { message: '27a: the Auth delete request was reached and held', timeout: 30_000 }).toBe(true);
  // Server truth at that instant: data erased, the login is all that is left.
  const mid27 = await footprint(acct.uid);
  note(testInfo, '27a-footprint-mid-deletion', JSON.stringify(mid27));
  expect.soft(totalDocs(mid27), '27a: data erased before the Auth delete').toBe(0);
  expect.soft(mid27.auth, '27a: Auth user not deleted yet (request held)').toBe(true);
  // The modal blocks the screen: the delete row under it cannot be pressed again.
  const blocked = await page
    .getByRole('button', { name: 'Supprimer le compte' })
    .click({ trial: true, timeout: 1_500 })
    .then(() => false, () => true);
  expect.soft(blocked, '27a (D-020): the screen under the progress modal is not clickable').toBe(true);
  await state(ctx, '27a-delete-progress-modal');
  releaseAuthDelete();

  // 27 — zero server docs, no auth user, no marker, auth surface, no private local keys.
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 30_000 }).catch(() => {});
  const after27 = await pollServer(() => footprint(acct.uid), fullyGone, 20_000);
  await page.unroute(/accounts:delete/);
  await assertProgressSeen(page, testInfo, '27', /Suppression en cours/);
  await expect.soft(page.getByTestId('deletion_progress'), '27 (D-020): progress modal gone once the deletion is finished').toHaveCount(0, { timeout: 10_000 });
  const dialogs27 = ctx.dialogs.dialogs.slice(dialogsBefore27).map((d) => norm(d.message));
  note(testInfo, '27-dialogs', JSON.stringify(dialogs27));
  expect.soft(dialogs27.some((m) => /^Compte supprimé/.test(m)), '27 (D-019): the finished deletion is confirmed').toBe(true);
  expect.soft(after27.marker, '27 (D-031): deletionRequests/{uid} left behind after a finished deletion').toBe(false);
  note(testInfo, '27-footprint', JSON.stringify(after27));
  for (const c of USER_COLLECTIONS) expect.soft(after27.counts[c], `27: ${c} docs left`).toBe(0);
  for (const [p, exists] of Object.entries(after27.legacy)) expect.soft(exists, `27: legacy ${p} left`).toBe(false);
  expect.soft(after27.profile, '27: userProfiles/{uid} left').toBe(false);
  expect.soft(after27.auth, '27: auth user still exists').toBe(false);
  note(testInfo, '27-landing', page.url());
  expect.soft(onAuthSurface(new URL(page.url()).pathname), `27: lands on an auth surface (${page.url()})`).toBe(true);
  expect.soft(privateKeysIn(await localKeys(page)), '27: private keys left after delete').toEqual([]);
  expect.soft(ctx.dialogs.dialogs.slice(-1)[0]?.message ?? '', '27: no error dialog after delete').not.toMatch(/Erreur/);
  await state(ctx, '27-delete-full');

  // 28 — the deleted credentials no longer sign in.
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByTestId('login_email_input').fill(acct.email, { timeout: 30_000 });
  await page.getByTestId('login_password_input').fill(acct.password);
  await page.getByTestId('login_submit_button').click();
  await expect.soft(page.getByText('Email ou mot de passe incorrect').first(), '28: deleted account cannot log in').toBeVisible({ timeout: 15_000 });
  await expect.soft(page.getByRole('tablist')).toHaveCount(0);
  await state(ctx, '28-delete-relogin', [/status of 400/]);
});

// ══════════════════════════════════════════════════════════════════════════════
// D-reauth — states 29-30 (HYP-D10)
// ══════════════════════════════════════════════════════════════════════════════

const reauthField = (p: Page) => p.getByRole('textbox', { name: /retape ton mot de passe|mot de passe/i }).last();

test('D-reauth-cancel: cancelling the re-auth prompt must not leave a half-purged account', async ({ page }, testInfo) => {
  // Only the fallback (emulator refused the backdate) really waits 5 min; normally this is seconds.
  test.setTimeout(720_000);
  const acct = await newSeededAccount('reauth-cancel', { firstName: 'Rania', lastName: 'Cancel' });
  await seedEverything(acct.uid);
  const seeded = await footprint(acct.uid);
  const ctx = instrument(page, testInfo);
  await page.clock.install();
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  const stale = await makeSessionStale(page, { uid: acct.uid });
  note(testInfo, '30-stale-by', stale.aged ? 'emulator lastLoginAt backdated' : 'real wait (fallback)');

  // 30 — delete → re-auth prompt → Annuler.
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  await expect(reauthField(page), '30: re-auth prompt shown for a stale session').toBeVisible({ timeout: 20_000 });
  await state(ctx, '30-delete-reauth-prompt', [/status of 400/]);
  await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await expect.soft(reauthField(page)).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(2000);
  const after30 = await footprint(acct.uid);
  note(testInfo, '30-footprint', JSON.stringify({ refusals: stale.refusals.length, after30 }));
  // Coherent = nothing happened (account + all data) — or everything happened. Never half.
  expect.soft(after30.auth, '30: cancel keeps the account').toBe(true);
  expect.soft(after30, '30 (HYP-D10): cancel after re-auth prompt left a half-purged account').toEqual(seeded);
  expect.soft(after30.marker, '30 (D-031): a cancelled, never-started deletion must leave no deletion request').toBe(false);
  await state(ctx, '30-delete-reauth-cancel');

  // Cold start: what the (possibly zombie) account now sees.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const cachedProfile = await page.evaluate(() => localStorage.getItem('user_profile'));
  note(testInfo, '30b-coldstart', `url=${page.url()} tablist=${await page.getByRole('tablist').count()} cachedProfile=${!!cachedProfile} serverProfile=${after30.profile}`);
  // The account she kept is still hers after a cold start: nothing "finishes" a deletion she cancelled.
  await expect.soft(page.getByRole('tablist').first(), '30b: cold start reopens the kept account').toBeVisible({ timeout: 30_000 });
  expect.soft(await footprint(acct.uid), '30b: cold start after a cancelled deletion changes nothing on the server').toEqual(seeded);
  await state(ctx, '30b-reauth-cancel-coldstart');
});

test('D-reauth: wrong password → localized error; right password completes the deletion', async ({ page }, testInfo) => {
  // Only the fallback (emulator refused the backdate) really waits 5 min; normally this is seconds.
  test.setTimeout(720_000);
  const acct = await newSeededAccount('reauth', { firstName: 'Rim', lastName: 'Reauth' });
  await seedEverything(acct.uid);
  const seeded = await footprint(acct.uid);
  const ctx = instrument(page, testInfo);
  await page.clock.install();
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  const stale29 = await makeSessionStale(page, { uid: acct.uid });
  note(testInfo, '29-stale-by', stale29.aged ? 'emulator lastLoginAt backdated' : 'real wait (fallback)');

  // 29 — prompt with a labelled password field.
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  const field = reauthField(page);
  await expect(field, '29: re-auth prompt').toBeVisible({ timeout: 20_000 });
  const label = await field.getAttribute('aria-label');
  expect.soft(label ?? '', '29: password field is labelled').not.toBe('');
  await expect.soft(page.getByText('Confirmez votre identité', { exact: true }), '29: prompt title').toBeVisible();
  await state(ctx, '29-delete-reauth-required', [/status of 400/]);

  // 29a — D-018: she can check what she typed, and has a way out if she forgot the password.
  await field.fill('Visible-Passw0rd9');
  await expect.soft(field, '29a (D-018): password hidden by default').toHaveAttribute('type', 'password');
  const eye = page.getByRole('button', { name: 'Afficher', exact: true });
  await expect.soft(eye, '29a (D-018): show-password toggle on the re-auth prompt').toBeVisible();
  if (await eye.count()) {
    await eye.click();
    await expect.soft(field, '29a (D-018): the toggle reveals the password').not.toHaveAttribute('type', 'password');
    await expect.soft(page.getByRole('button', { name: 'Masquer', exact: true }), '29a (D-018): the toggle label flips').toBeVisible();
    await state(ctx, '29a-reauth-password-shown');
    await page.getByRole('button', { name: 'Masquer', exact: true }).click();
    await expect.soft(field, '29a (D-018): hidden again').toHaveAttribute('type', 'password');
  }
  const forgot = page.getByRole('link', { name: /Mot de passe oublié/ });
  await expect.soft(forgot, '29a (D-018): forgot-password path on the re-auth prompt').toBeVisible();
  if (await forgot.count()) {
    const resetsBefore = (await passwordResetCodes(acct.email)).length;
    const dForgot = await clickForDialog(ctx, () => forgot.click(), 15_000);
    note(testInfo, '29a-forgot-dialog', JSON.stringify(dForgot?.message ?? null));
    expect.soft(norm(dForgot?.message), '29a (D-018): forgot-password feedback').toMatch(/^Mot de passe oublié \?\n\nSi un compte existe/);
    const resets = await pollServer(() => passwordResetCodes(acct.email), (c) => c.length > resetsBefore, 10_000);
    expect.soft(resets.length, '29a (D-018): the Auth server issued a password-reset mail for her address').toBe(resetsBefore + 1);
    expect.soft(await footprint(acct.uid), '29a: asking for a reset link erases nothing').toEqual(seeded);
    await expect.soft(field, '29a: the prompt is still open after the reset request').toBeVisible();
    await state(ctx, '29a-reauth-forgot-password');
  }

  // Wrong password → a French error, prompt stays, nothing deleted.
  await field.fill('Wrong-Passw0rd9');
  const dWrong = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer définitivement', exact: true }).last().click());
  note(testInfo, '29-wrong-password', JSON.stringify(dWrong?.message ?? null));
  expect.soft(dWrong?.message ?? '(no dialog)', '29: wrong password shows an error').toMatch(/Erreur|incorrect|mot de passe/i);
  expect.soft(dWrong?.message ?? '', '29: error is localized, no raw Firebase code').not.toMatch(/auth\/|Firebase|INVALID_/);
  expect.soft(await authAccountExists(acct.uid), '29: wrong password must not delete the account').toBe(true);
  expect.soft(await footprint(acct.uid), '29: wrong password must not erase any data').toEqual(seeded);
  await state(ctx, '29b-reauth-wrong-password', [/status of 400/]);

  // Right password → deletion completes.
  if (!(await field.isVisible())) {
    await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
    await expect(field).toBeVisible({ timeout: 20_000 });
  }
  await field.fill(acct.password);
  await page.getByRole('button', { name: 'Supprimer définitivement', exact: true }).last().click();
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 30_000 }).catch(() => {});
  const after = await pollServer(() => footprint(acct.uid), fullyGone, 20_000);
  note(testInfo, '29-footprint', JSON.stringify(after));
  expect.soft(totalDocs(after), '29: server docs left after re-auth deletion').toBe(0);
  expect.soft(after.auth, '29: auth user still exists after re-auth deletion').toBe(false);
  expect.soft(after.marker, '29 (D-031): deletion request left after re-auth deletion').toBe(false);
  expect.soft(onAuthSurface(new URL(page.url()).pathname), `29: lands on an auth surface (${page.url()})`).toBe(true);
  expect.soft(privateKeysIn(await localKeys(page)), '29: private keys left').toEqual([]);
  await state(ctx, '29c-reauth-delete-complete');
});

// D-011: the server refuses the Auth delete only AFTER the purge (no client-side wait, so the
// pre-check passes). The emptied account must never be left open: the prompt says the data is
// gone, cancelling signs out, and the next sign-in finishes the deletion.
test('D-reauth-after-purge: a refusal after the erase never leaves an emptied account signed in', async ({ page }, testInfo) => {
  const acct = await newSeededAccount('reauth-late', { firstName: 'Lina', lastName: 'Late' });
  await seedEverything(acct.uid);
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  const stale = await makeSessionStale(page, { waitMs: 0, shiftClock: false });

  // 35 — delete → purge → accounts:delete refused → "finish" prompt.
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  await expect(reauthField(page), '35: finish-deletion prompt').toBeVisible({ timeout: 30_000 });
  expect(stale.refusals.length, '35: the forced CREDENTIAL_TOO_OLD refusal actually fired').toBeGreaterThan(0);
  await expect.soft(page.getByText(/Vos données ont déjà été effacées/).first(), '35: the prompt says the data is already erased').toBeVisible();
  const after35 = await footprint(acct.uid);
  note(testInfo, '35-footprint', JSON.stringify({ refusals: stale.refusals.length, after35 }));
  expect.soft(totalDocs(after35), '35: data erased before the refusal').toBe(0);
  expect.soft(after35.auth, '35: the Auth user is what is left').toBe(true);
  // D-031: the request is on the SERVER, so any device she signs in on can finish it.
  const marker35 = await pollServer(() => serverDoc(MARKER_DOC(acct.uid)), (d) => d !== null, 10_000);
  note(testInfo, '35-server-marker', JSON.stringify(marker35));
  expect.soft(marker35, '35 (D-031): deletionRequests/{uid} exists while only the login is left').not.toBeNull();
  expect.soft(Object.keys(marker35 ?? {}), '35 (D-031): the marker holds only when she asked').toEqual(['requestedAt']);
  await state(ctx, '35-delete-refused-after-purge', [/status of 400/]);

  // 35b — cancel → signed out (not the emptied account), marker kept for the next sign-in.
  await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await expect.soft(page.getByRole('tablist'), '35b: cancel left the emptied account open').toHaveCount(0);
  const marker = await page.evaluate(() => localStorage.getItem('@account_deletion_pending_v1'));
  expect.soft(marker, '35b: pending-deletion marker survives the logout').toBe(acct.uid);
  expect.soft(await serverDoc(MARKER_DOC(acct.uid)), '35b (D-031): server marker survives the logout').not.toBeNull();
  await state(ctx, '35b-cancel-signs-out');

  // 35c — sign in again → the deletion finishes and says so.
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByTestId('login_email_input').fill(acct.email, { timeout: 30_000 });
  await page.getByTestId('login_password_input').fill(acct.password);
  const done = await clickForDialog(ctx, () => page.getByTestId('login_submit_button').click(), 30_000);
  note(testInfo, '35c-dialog', JSON.stringify(done?.message ?? null));
  expect.soft(done?.message ?? '(no dialog)', '35c: deletion confirmed').toMatch(/^Compte supprimé/);
  const after = await pollServer(() => footprint(acct.uid), fullyGone, 20_000);
  expect.soft(after.auth, '35c: auth user deleted on the next sign-in').toBe(false);
  expect.soft(totalDocs(after), '35c: server docs').toBe(0);
  expect.soft(after.marker, '35c (D-031): server marker removed once the login is deleted').toBe(false);
  await expect.soft(page.getByRole('tablist')).toHaveCount(0);
  expect.soft(await page.evaluate(() => localStorage.getItem('@account_deletion_pending_v1')), '35c: marker cleared').toBeNull();
  // D-034: the deleted account's credentials must not stay in the form (it read as "try again").
  await expect.soft(page.getByTestId('login_email_input'), '35c (D-034): e-mail cleared').toHaveValue('');
  await expect.soft(page.getByTestId('login_password_input'), '35c (D-034): password cleared').toHaveValue('');
  await state(ctx, '35c-deletion-finished-on-sign-in');
});

// D-031: the same refusal, but she never comes back to that phone. The request recorded on
// the server must let ANY device finish the deletion at sign-in — a second phone has no
// local marker, and used to walk her into Onboarding inside the account she asked to delete.
test('D-delete-second-phone: a deletion left unfinished on one phone is finished at sign-in on another', async ({ page, browser }, testInfo) => {
  const acct = await newSeededAccount('second-phone', { firstName: 'Dorra', lastName: 'Deux' });
  await seedEverything(acct.uid);
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  const stale = await makeSessionStale(page, { waitMs: 0, shiftClock: false });

  // 38 — phone 1: purge runs, the Auth delete is refused, she abandons the prompt.
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  await expect(reauthField(page), '38: finish-deletion prompt on phone 1').toBeVisible({ timeout: 30_000 });
  expect(stale.refusals.length, '38: the forced CREDENTIAL_TOO_OLD refusal actually fired').toBeGreaterThan(0);
  const marker38 = await pollServer(() => serverDoc(MARKER_DOC(acct.uid)), (d) => d !== null, 10_000);
  const after38 = await footprint(acct.uid);
  note(testInfo, '38-footprint', JSON.stringify({ refusals: stale.refusals.length, after38, marker38 }));
  expect.soft(totalDocs(after38), '38: clean purge before the refusal').toBe(0);
  expect.soft(after38.auth, '38: the login survived the refused delete').toBe(true);
  expect.soft(marker38, '38 (D-031): server-side deletion marker exists').not.toBeNull();
  await state(ctx, '38-phone1-delete-refused', [/status of 400/]);
  await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await expect.soft(page.getByRole('tablist'), '38b: phone 1 signed out').toHaveCount(0);
  expect.soft(await serverDoc(MARKER_DOC(acct.uid)), '38b (D-031): marker still on the server after phone 1 signed out').not.toBeNull();
  expect.soft(await authAccountExists(acct.uid), '38b: login still exists (nothing finished yet)').toBe(true);
  await state(ctx, '38b-phone1-abandoned');

  // 38c — phone 2: a brand-new context, no local storage, no device marker.
  const context2 = await browser.newContext({ baseURL: E2E_BASE_URL, ...waveUse('fr') });
  const page2 = await context2.newPage();
  const phone2 = instrument(page2, testInfo);
  await openLoginForm(page2, 'fr');
  expect(await page2.evaluate(() => localStorage.getItem('@account_deletion_pending_v1')), '38c: phone 2 has no device marker').toBeNull();
  await page2.getByTestId('login_email_input').fill(acct.email);
  await page2.getByTestId('login_password_input').fill(acct.password);
  const done = await clickForDialog(phone2, () => page2.getByTestId('login_submit_button').click(), 30_000);
  note(testInfo, '38c-dialog', JSON.stringify(done?.message ?? null));
  expect.soft(norm(done?.message) || '(no dialog)', '38c (D-031): the second phone says the account is deleted').toMatch(/^Compte supprimé\n\nVotre compte et toutes vos données ont été supprimés définitivement/);
  const after = await pollServer(() => footprint(acct.uid), fullyGone, 20_000);
  note(testInfo, '38c-footprint', JSON.stringify(after));
  expect.soft(after.auth, '38c (D-031): Auth account gone (accounts:lookup) after the sign-in on phone 2').toBe(false);
  expect.soft(after.marker, '38c (D-031): deletion marker gone').toBe(false);
  expect.soft(totalDocs(after), '38c (D-031): zero server docs').toBe(0);
  await page2.waitForTimeout(1500);
  note(testInfo, '38c-landing', page2.url());
  // Never inside the account: no tabs, no Onboarding, no consent sheet.
  await expect.soft(page2.getByRole('tablist'), '38c: MainTabs opened on the deleted account').toHaveCount(0);
  expect.soft(new URL(page2.url()).pathname, '38c (D-031): she must never land in Onboarding inside that account').not.toMatch(/onboarding/i);
  await expect.soft(page2.getByRole('button', { name: 'Je suis enceinte' }), '38c (D-031): Onboarding shown on the deleted account').toHaveCount(0);
  await expect.soft(page2.getByTestId('health_consent_continue'), '38c: consent sheet shown on the deleted account').toHaveCount(0);
  // D-034: the form is cleared.
  await expect.soft(page2.getByTestId('login_email_input'), '38c (D-034): e-mail cleared').toHaveValue('');
  await expect.soft(page2.getByTestId('login_password_input'), '38c (D-034): password cleared').toHaveValue('');
  expect.soft(privateKeysIn(await localKeys(page2)), '38c: private keys left on phone 2').toEqual([]);
  expect.soft(await page2.evaluate(() => localStorage.getItem('@account_deletion_pending_v1')), '38c: no device marker left on phone 2').toBeNull();
  await state(phone2, '38c-phone2-deletion-finished');

  // 38d — the credentials are dead everywhere.
  await expect.soft(page2.getByTestId('login_email_input'), '38d: the login form is shown again after the deletion finished').toBeVisible({ timeout: 15_000 });
  if (await page2.getByTestId('login_email_input').count()) {
    await submitLogin(page2, acct.email, acct.password);
    await expect.soft(page2.getByText('Email ou mot de passe incorrect').first(), '38d: the deleted account cannot sign in again').toBeVisible({ timeout: 15_000 });
    await expect.soft(page2.getByRole('tablist')).toHaveCount(0);
    await state(phone2, '38d-phone2-relogin-refused', [/status of 400/]);
  }
  await closeCtx(phone2);
});

// The second deletion entry point named by the privacy policy: Settings → Data & Privacy.
test('D-delete-settings: deleting from Settings erases everything and confirms it', async ({ page }, testInfo) => {
  const acct = await newSeededAccount('delete-settings', { firstName: 'Sana', lastName: 'Settings' });
  await seedEverything(acct.uid);
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openSettings(page);
  const row = page.getByRole('button', { name: 'Supprimer mon compte' }).first();
  await row.scrollIntoViewIfNeeded();
  // No network hold here: the modal must show on its own during an ordinary erase (D-020).
  await watchDeletionProgress(page);
  const confirm = await clickForDialog(ctx, () => row.click());
  expect.soft(confirm?.message ?? '(no dialog)', '36: confirm names what is erased and offers the export').toMatch(/irréversible[\s\S]*Exporter mes données/);
  const doneDialog = await ctx.dialogs.waitForNext(30_000).catch(() => null);
  note(testInfo, '36-done', JSON.stringify(doneDialog?.message ?? null));
  expect.soft(doneDialog?.message ?? '(no dialog)', '36: a finished deletion is confirmed (not just a logout)').toMatch(/^Compte supprimé/);
  const after = await pollServer(() => footprint(acct.uid), fullyGone, 20_000);
  note(testInfo, '36-footprint', JSON.stringify(after));
  expect.soft(totalDocs(after), '36: server docs left').toBe(0);
  for (const [p, exists] of Object.entries(after.legacy)) expect.soft(exists, `36 (D-014): legacy ${p} left`).toBe(false);
  expect.soft(after.auth, '36: auth user left').toBe(false);
  expect.soft(after.marker, '36 (D-031): deletion request left').toBe(false);
  await assertProgressSeen(page, testInfo, '36', /Suppression en cours/);
  expect.soft(privateKeysIn(await localKeys(page)), '36: private keys left').toEqual([]);
  await state(ctx, '36-delete-from-settings');
});

// ══════════════════════════════════════════════════════════════════════════════
// D-reset — state 31
// ══════════════════════════════════════════════════════════════════════════════

test('D-reset: "Réinitialiser mon profil" must not orphan server data', async ({ page, browser }, testInfo) => {
  const acct = await newSeededAccount('reset', { firstName: 'Reem', lastName: 'Reset' });
  await seedEverything(acct.uid);
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  const reset = page.getByRole('button', { name: 'Réinitialiser mon profil' });
  // D-047: a missing row is a failure, never a quiet early return that records a state anyway.
  await expect(reset, '31: "Réinitialiser mon profil" row on Profile').toBeVisible({ timeout: 15_000 });
  await watchDeletionProgress(page);
  const d31 = await clickForDialog(ctx, () => reset.click());
  note(testInfo, '31-confirm', JSON.stringify(d31?.message ?? null));
  expect.soft(norm(d31?.message), '31: the reset confirm says the account is kept').toMatch(/Votre compte est conservé/);
  await page.waitForTimeout(4000);
  const after = await pollServer(() => footprint(acct.uid), (f) => totalDocs(f) === 0, 15_000);
  note(testInfo, '31-footprint', JSON.stringify(after) + ` url=${page.url()} dialogs=${JSON.stringify(ctx.dialogs.messages())}`);
  const orphans = Object.entries(after.counts).filter(([, n]) => n > 0).map(([c]) => c);
  if (!after.profile) {
    expect.soft(orphans, '31: reset deleted the profile but orphaned these collections').toEqual([]);
    expect.soft(Object.values(after.legacy).some(Boolean), '31: reset orphaned legacy docs').toBe(false);
  }
  // D-014: after a reset every allowed subcollection (all 8 parent × name pairs) and every
  // collection is empty; the account itself is kept, with no deletion request against it.
  for (const c of USER_COLLECTIONS) expect.soft(after.counts[c], `31 (D-014): ${c} docs left after reset`).toBe(0);
  for (const [p, exists] of Object.entries(after.legacy)) expect.soft(exists, `31 (D-014): legacy ${p} left after reset`).toBe(false);
  expect.soft(after.profile, '31: profile document left after reset').toBe(false);
  expect.soft(after.auth, '31: reset keeps the account (login still exists)').toBe(true);
  expect.soft(after.marker, '31 (D-031): reset left a deletion request against the kept account').toBe(false);
  await assertProgressSeen(page, testInfo, '31', /Suppression en cours|en cours/);
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await expect.soft(page.getByRole('tablist'), '31: signed out after the reset').toHaveCount(0);
  expect.soft(privateKeysIn(await localKeys(page)), '31: private keys left after reset').toEqual([]);
  await state(ctx, '31-reset-profile');

  // 31b — D-031 counter-case: a reset account has no profile either, which is what a pending
  // deletion looks like. Signing in on another device must start her over (Onboarding),
  // never "finish a deletion" she did not ask for.
  const context2 = await browser.newContext({ baseURL: E2E_BASE_URL, ...waveUse('fr') });
  const page2 = await context2.newPage();
  const f = instrument(page2, testInfo);
  await openLoginForm(page2, 'fr');
  await submitLogin(page2, acct.email, acct.password);
  await expect.soft(page2.getByRole('button', { name: 'Je suis enceinte' }), '31b: a reset account signs in to a fresh start (Onboarding)').toBeVisible({ timeout: 30_000 });
  await page2.waitForTimeout(2500);
  note(testInfo, '31b-relogin', `url=${page2.url()} dialogs=${JSON.stringify(f.dialogs.messages())}`);
  expect.soft(f.dialogs.messages().some((m) => /Compte supprimé/.test(m)), '31b (D-031): a reset account was deleted at sign-in').toBe(false);
  expect.soft(await authAccountExists(acct.uid), '31b (D-031): the kept account still exists after signing in again').toBe(true);
  await state(f, '31b-reset-relogin-fresh-start');
  await closeCtx(f);
});


// ══════════════════════════════════════════════════════════════════════════════
// D-consent — states 37 (D-030, D-035): the health-data consent sheet, decline path
// ══════════════════════════════════════════════════════════════════════════════

/** Top edge of each decline-block control, to prove their order on screen. */
async function consentLayout(page: Page) {
  return page.evaluate(() => {
    const box = (id: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        top: Math.round(r.top + window.scrollY),
        text: (el.innerText || '').trim(),
        border: cs.borderTopWidth,
        borderColor: cs.borderTopColor,
        background: cs.backgroundColor,
        disabled: el.getAttribute('aria-disabled'),
      };
    };
    return {
      continue: box('health_consent_continue'),
      export: box('health_consent_export'),
      logout: box('health_consent_logout'),
      note: box('health_consent_logout_note'),
      erase: box('health_consent_erase'),
    };
  });
}

test('D-consent: declining health-data consent — export on the sheet, logout keeps server data, delete is secondary', async ({ page }, testInfo) => {
  // A profile saved before the consent question existed.
  const acct = await newSeededAccount('consent', { firstName: 'Chadia', lastName: 'Consent', consent: false });
  await seedEverything(acct.uid);
  const seeded = await footprint(acct.uid);
  const ctx = instrument(page, testInfo);
  await openLoginForm(page, 'fr');
  await submitLogin(page, acct.email, acct.password);

  // 37 — the sheet replaces the app until she answers.
  await expect(page.getByTestId('health_consent_continue'), '37: consent sheet shown to a profile without consent').toBeVisible({ timeout: 60_000 });
  await expect.soft(page.getByRole('tablist'), '37: the app is not reachable before she answers').toHaveCount(0);
  await expect.soft(page.getByTestId('health_consent_checkbox'), '37: unticked by default').toHaveAttribute('aria-checked', 'false');
  await expect.soft(page.getByTestId('health_consent_continue'), '37: "Continuer" disabled until ticked').toHaveAttribute('aria-disabled', 'true');
  await state(ctx, '37-consent-sheet');

  // 37b — the decline block: export, logout + note, delete last and quiet.
  const layout = await consentLayout(page);
  note(testInfo, '37b-consent-layout', JSON.stringify(layout));
  await expect.soft(page.getByText('Vous ne souhaitez pas donner votre accord', { exact: false }), '37b: decline heading').toBeVisible();
  expect.soft(layout.export?.text, '37b (D-030): export offered on the sheet itself').toBe('Exporter mes données');
  expect.soft(layout.logout?.text, '37b: logout offered').toBe('Se déconnecter');
  expect.soft(norm(layout.note?.text), '37b (D-035): the note says signing out keeps the data on the servers').toMatch(/Vous déconnecter ne supprime rien : vos données restent enregistrées sur nos serveurs\. Pour les effacer, choisissez « Supprimer mon compte » ci-dessous\./);
  expect.soft(layout.erase?.text, '37b: delete offered').toBe('Supprimer mon compte');
  const tops = [layout.export?.top ?? -1, layout.logout?.top ?? -1, layout.note?.top ?? -1, layout.erase?.top ?? -1];
  expect.soft(tops.every((t, i) => t >= 0 && (i === 0 || t > tops[i - 1])), `37b (D-030): order export → logout → note → delete (tops ${JSON.stringify(tops)})`).toBe(true);
  // Delete is the secondary action: no outline, unlike the export button (the old sheet made
  // it the only outlined, enabled control).
  expect.soft(parseFloat(layout.export?.border ?? '0'), '37b: export is the outlined button').toBeGreaterThan(0);
  expect.soft(parseFloat(layout.erase?.border ?? '1'), '37b (D-030): delete is not an outlined call-to-action').toBe(0);
  await page.getByTestId('health_consent_erase').scrollIntoViewIfNeeded();
  await state(ctx, '37b-consent-decline-block');

  // 37c — the export works from here (Settings is unreachable): confirm + a real file with her data.
  const download = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  const dExport = await clickForDialog(ctx, () => page.getByTestId('health_consent_export').click());
  expect.soft(norm(dExport?.message) || '(no dialog)', '37c: sensitive-data confirm').toMatch(/^Données sensibles/);
  const dl = await download;
  note(testInfo, '37c-export', `download=${dl ? dl.suggestedFilename() : null}`);
  expect.soft(dl?.suggestedFilename() ?? '(no download)', '37c (D-030): the sheet export produces her file').toMatch(/^mama-bebe-export-.*\.json$/);
  if (dl) {
    const file = await dl.path();
    const raw = fs.readFileSync(file, 'utf8');
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* asserted below */
    }
    expect.soft(parsed, '37c: the export is valid JSON').not.toBeNull();
    expect.soft(raw.includes('Chadia'), '37c: the export carries her profile').toBe(true);
    expect.soft(raw.includes('RDV seed D'), '37c: the export carries her appointments').toBe(true);
    note(testInfo, '37c-export-size', String(raw.length));
  }
  await expect.soft(page.getByTestId('health_consent_continue'), '37c: still on the sheet after the export').toBeVisible();
  expect.soft(await footprint(acct.uid), '37c: exporting changes nothing on the server').toEqual(seeded);
  await state(ctx, '37c-consent-export');

  // 37d — delete → the confirm points to the export ON THIS SCREEN, not to Settings. Dismissed.
  ctx.dialogs.next('dismiss');
  const dDel = await clickForDialog(ctx, () => page.getByTestId('health_consent_erase').click());
  note(testInfo, '37d-confirm', JSON.stringify(dDel?.message ?? null));
  expect.soft(norm(dDel?.message) || '(no dialog)', '37d: delete confirm').toMatch(/^Supprimer le compte\n\n[\s\S]*irréversible/);
  expect.soft(norm(dDel?.message), '37d (D-030): the confirm points to the export on this screen').toMatch(/annulez et touchez d'abord « Exporter mes données » sur cet écran\.$/);
  expect.soft(norm(dDel?.message), '37d (D-030): the confirm must not send her to Settings (unreachable here)').not.toMatch(/Paramètres/);
  await page.waitForTimeout(2500);
  expect.soft(await footprint(acct.uid), '37d: a dismissed confirm erases nothing').toEqual(seeded);
  await expect.soft(page.getByTestId('health_consent_continue'), '37d: still on the sheet').toBeVisible();
  await state(ctx, '37d-consent-delete-cancelled');

  // 37e — logout: signed out, device wiped, and — as the note says — everything still on the servers.
  const dialogsBefore = ctx.dialogs.dialogs.length;
  await page.getByTestId('health_consent_logout').click();
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  note(testInfo, '37e-logout', `url=${page.url()} dialogs=${JSON.stringify(ctx.dialogs.dialogs.slice(dialogsBefore).map((d) => d.message))}`);
  expect.soft(onAuthSurface(new URL(page.url()).pathname), `37e: logout from the sheet lands on an auth surface (${page.url()})`).toBe(true);
  await expect.soft(page.getByTestId('health_consent_continue'), '37e: sheet gone after logout').toHaveCount(0);
  expect.soft(privateKeysIn(await localKeys(page)), '37e: private keys left after logout').toEqual([]);
  const after37e = await footprint(acct.uid);
  expect.soft(after37e, '37e (D-035): logout keeps every document on the server (what the note says)').toEqual(seeded);
  expect.soft((await serverDoc(`userProfiles/${acct.uid}`))?.healthDataConsent ?? null, '37e: logging out is not consent').toBeNull();
  await state(ctx, '37e-consent-logout');

  // 37f — signing in again asks again (declining was not remembered as consent).
  await page.goto('/login', { waitUntil: 'load' });
  await expect(page.getByTestId('login_email_input')).toBeVisible({ timeout: 30_000 });
  await submitLogin(page, acct.email, acct.password);
  await expect(page.getByTestId('health_consent_continue'), '37f: the sheet is shown again').toBeVisible({ timeout: 60_000 });
  await expect.soft(page.getByRole('tablist')).toHaveCount(0);
  await state(ctx, '37f-consent-sheet-again');

  // 37g — delete for real, from the sheet.
  await watchDeletionProgress(page);
  const dDel2 = await clickForDialog(ctx, () => page.getByTestId('health_consent_erase').click());
  expect.soft(norm(dDel2?.message) || '(no dialog)', '37g: delete confirm').toMatch(/^Supprimer le compte/);
  const doneDialog = await ctx.dialogs.waitForNext(30_000).catch(() => null);
  note(testInfo, '37g-done', JSON.stringify(doneDialog?.message ?? null));
  expect.soft(norm(doneDialog?.message) || '(no dialog)', '37g: the deletion is confirmed').toMatch(/^Compte supprimé/);
  const gone = await pollServer(() => footprint(acct.uid), fullyGone, 20_000);
  note(testInfo, '37g-footprint', JSON.stringify(gone));
  expect.soft(totalDocs(gone), '37g: server docs left').toBe(0);
  expect.soft(gone.auth, '37g: auth user left').toBe(false);
  expect.soft(gone.marker, '37g (D-031): deletion request left').toBe(false);
  await assertProgressSeen(page, testInfo, '37g', /Suppression en cours/);
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await expect.soft(page.getByTestId('health_consent_continue'), '37g: sheet gone').toHaveCount(0);
  expect.soft(privateKeysIn(await localKeys(page)), '37g: private keys left').toEqual([]);
  await state(ctx, '37g-consent-delete-done');
});

// ══════════════════════════════════════════════════════════════════════════════
// D-rules — states 40 (D-014): the tightened rules in ordinary use
// ══════════════════════════════════════════════════════════════════════════════

test('D-rules: tightened subcollection rules refuse unknown names and never disturb ordinary screens', async ({ page }, testInfo) => {
  const acct = await newSeededAccount('rules', { firstName: 'Rahma', lastName: 'Rules' });
  const other = await createAccount(newAccountEmail(WAVE, 'rules-other'), E2E_PASSWORD);
  await seedEverything(acct.uid);

  // Premise (hard): the emulator really runs the NEW rules.
  const probes = {
    allowedUsersWeights: await userRest('PATCH', `users/${acct.uid}/weights/rules-probe`, acct.idToken),
    allowedProfileHistory: await userRest('PATCH', `userProfiles/${acct.uid}/chatbot_history/rules-probe`, acct.idToken),
    unknownUnderUsers: await userRest('PATCH', `users/${acct.uid}/notes/rules-probe`, acct.idToken),
    unknownUnderProfile: await userRest('PATCH', `userProfiles/${acct.uid}/notes/rules-probe`, acct.idToken),
    strangerSubcollection: await userRest('PATCH', `users/${acct.uid}/weights/stranger`, other.idToken),
    ownMarkerRead: await userRest('GET', MARKER_DOC(acct.uid), acct.idToken),
    strangerMarkerRead: await userRest('GET', MARKER_DOC(acct.uid), other.idToken),
    forgedMarker: await userRest('PATCH', MARKER_DOC(acct.uid), acct.idToken),
  };
  note(testInfo, '40-rules-probes', JSON.stringify(probes));
  expect(probes.allowedUsersWeights, 'rules: users/{uid}/weights is writable by its owner').toBe(200);
  expect(probes.allowedProfileHistory, 'rules: userProfiles/{uid}/chatbot_history is writable by its owner').toBe(200);
  expect(probes.unknownUnderUsers, 'rules (D-014): an unlisted subcollection under users/{uid} is refused').toBe(403);
  expect(probes.unknownUnderProfile, 'rules (D-014): an unlisted subcollection under userProfiles/{uid} is refused').toBe(403);
  expect(probes.strangerSubcollection, 'rules: another user cannot write her subcollections').toBe(403);
  expect(probes.ownMarkerRead, 'rules (D-031): she can read her own (absent) deletion request').toBe(404);
  expect(probes.strangerMarkerRead, 'rules (D-031): nobody else can read it').toBe(403);
  expect(probes.forgedMarker, 'rules (D-031): a marker with arbitrary fields is refused').toBe(403);
  expect(await serverDoc(`users/${acct.uid}/notes/rules-probe`), 'rules: the refused write left nothing').toBeNull();

  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');

  // Every account screen, read path: any permission error (any console level) fails the state.
  const screens: Array<[string, string, (p: Page) => Promise<unknown>]> = [
    ['40-rules-home', '/', (p) => expect(p.getByTestId('home_quick_search')).toBeVisible({ timeout: 30_000 })],
    ['40-rules-weight', '/weight', (p) => expect(p.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-calendar', '/calendar', (p) => expect(p.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-health', '/health', (p) => expect(p.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-reminders', '/reminders', (p) => expect(p.getByRole('switch').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-chatbot', '/chatbot', (p) => expect(p.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-hospital-bag', '/hospital-bag', (p) => expect(p.getByRole('checkbox').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-kick-counter', '/kick-counter', (p) => expect(p.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-contraction-timer', '/contraction-timer', (p) => expect(p.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 })],
    ['40-rules-profile', '/profile', (p) => expect(p.getByRole('button', { name: 'Enregistrer les modifications' })).toBeVisible({ timeout: 30_000 })],
    ['40-rules-settings', '/settings', (p) => expect(p.getByRole('switch').first()).toBeVisible({ timeout: 30_000 })],
  ];
  for (const [name, url, ready] of screens) {
    await page.goto(url, { waitUntil: 'load' });
    await ready(page);
    // Let the screen's own Firestore reads come back before judging its console.
    await page.waitForTimeout(2500);
    if (name === '40-rules-health') {
      // D-038: the seeded fasting glucose is inside the target, so the card must say so — and
      // must not raise the low / high alert the old 0.92 seed provoked.
      const healthBody = norm(await page.locator('body').innerText());
      note(testInfo, '40-health-glucose-lines', JSON.stringify(healthBody.split('\n').filter((l) => /lyc[ée]mie|mmol|objectif/i.test(l))));
      expect.soft(healthBody, '40 (D-038): the seeded 4,5 mmol/L reading is shown').toMatch(/4,5/);
      expect.soft(healthBody, '40 (D-038): an in-target fasting glucose is reported as in range').toContain("Mesures du mois dans l'objectif");
      expect.soft(healthBody, '40 (D-038): no low-glucose alert on a normal reading').not.toMatch(/Glycémie basse/);
      expect.soft(healthBody, '40 (D-038): no out-of-range banner on a normal reading').not.toContain('hors objectif');
    }
    await state(ctx, name);
  }

  // Write paths under the new rules, proven on the server.
  // Weight: a weighing.
  await page.goto('/weight', { waitUntil: 'load' });
  const pre = page.getByRole('textbox', { name: 'Votre poids avant grossesse (kg)' });
  await expect(pre.or(page.getByRole('button', { name: 'Ajouter une pesée' })).first()).toBeVisible({ timeout: 30_000 });
  if (await pre.count()) {
    await pre.fill('60');
    await page.getByRole('textbox', { name: 'Votre taille (cm)' }).fill('165');
    await clickForDialog(ctx, () => page.getByRole('button', { name: 'Enregistrer' }).click(), 5_000);
  }
  await page.getByRole('button', { name: 'Ajouter une pesée' }).click({ timeout: 15_000 });
  await page.getByRole('textbox', { name: /Ajouter mon poids/ }).fill('68.4');
  const dW = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Enregistrer', exact: true }).click(), 5_000);
  note(testInfo, '40-weight-dialog', JSON.stringify(dW?.message ?? null));
  const weights = await pollServer(
    () => serverQuery('weight_entries', 'user_id', acct.uid),
    (rows) => rows.some((r) => Number(r.data.weight) === 68.4),
    15_000,
  );
  expect.soft(weights.some((r) => Number(r.data.weight) === 68.4), `40 (D-014): weighing saved on the server (${JSON.stringify(weights.map((r) => r.data.weight))})`).toBe(true);
  await state(ctx, '40-rules-weight-write');

  // Hospital bag: one item packed.
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  await page.getByRole('checkbox').first().click({ timeout: 20_000 });
  const bag = await pollServer(() => serverDoc(`hospitalBags/${acct.uid}`), (d) => d !== null, 15_000);
  expect.soft(bag, '40 (D-014): hospital bag saved on the server').not.toBeNull();

  // Chatbot: one question asked and answered. Product contract (D-037): the conversation lives
  // in the screen's memory only — there is no chatbot_history feature, nothing is written for
  // it, and a reload starts a new conversation. Both halves are asserted below.
  await page.goto('/chatbot', { waitUntil: 'load' });
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const chatInput = page.getByRole('textbox').last();
  note(testInfo, '40-chatbot-input', String(await chatInput.count()));
  expect.soft(await chatInput.count(), '40 (D-050): the chatbot input exists').toBeGreaterThan(0);
  const greeting = page.getByText(/Je suis votre assistante grossesse/).first();
  await expect.soft(greeting, '40: the chat opens on the assistant greeting').toBeVisible();
  const question = 'Puis-je manger du fromage ?';
  if (await chatInput.count()) {
    await chatInput.fill(question);
    await chatInput.press('Enter');
  }
  // D-036: a named food is answered from the foods-to-avoid data, not with an unrelated article.
  // The phrase appears nowhere on the screen except in the assistant's reply bubble.
  const cheeseAnswer = page.getByText(/Fromages au lait cru/).first();
  await expect.soft(cheeseAnswer, '40 (D-036): the assistant answer to the cheese question lists raw-milk cheeses').toBeVisible({ timeout: 15_000 });
  await expect.soft(page.getByText(question, { exact: true }), '40: her question is echoed in the thread').toBeVisible();
  const chatBody = await page.locator('body').innerText();
  expect.soft(chatBody, '40 (D-036): no unrelated "Je pense qu\'il répond" article offer').not.toContain("Je pense qu'il répond");
  await state(ctx, '40-rules-chatbot-question');
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  // D-037: history is NOT persisted (no chatbot_history feature): a reload is a new conversation.
  await expect.soft(page.getByText(/Je suis votre assistante grossesse/).first(), '40 (D-037): after a reload the chat is back to the greeting').toBeVisible();
  await expect.soft(page.getByText(/Fromages au lait cru/), '40 (D-037): the previous answer is not restored — history is not persisted').toHaveCount(0);
  await expect.soft(page.getByText(question, { exact: true }), '40 (D-037): the previous question is not restored').toHaveCount(0);
  await state(ctx, '40-rules-chatbot-reload-no-history');

  // Journal (PDF) from Settings.
  await openSettings(page);
  await armJournalCapture(page);
  await page.getByRole('button', { name: 'Mon Journal (PDF)' }).click();
  const journal40 = await readJournal(page);
  expect.soft(journal40, '40 (D-039): the journal is generated under the tightened rules').not.toBeNull();
  if (journal40) {
    const t40 = norm(journal40.text);
    note(testInfo, '40-journal-text-length', String(t40.length));
    expect.soft(t40, '40 (D-039): the journal lists her seeded appointment').toContain('RDV seed D');
    // The fr journal writes the French decimal comma (pdfExportService localises the kg figures).
    expect.soft(t40, '40 (D-039): the journal lists a weighing (latest of the day: the 68,4 just saved, or the 62 seed)').toMatch(/(68,4|62) kg/);
    expect.soft(t40, '40 (D-039): the weight table is not the empty state').not.toContain('Aucune donnée de poids');
    await snapJournal(page, ctx, '40-rules-journal-pdf-content', journal40);
  }
  await state(ctx, '40-rules-journal-pdf');

  // Medical flag (profile write through validMedicalFlags).
  await openSettings(page);
  await page.getByRole('switch', { name: /Hypertension/ }).first().click({ timeout: 15_000 });
  const prof = await pollServer(() => serverDoc(`userProfiles/${acct.uid}`), (d) => d?.hasHypertension === true, 15_000);
  expect.soft(prof?.hasHypertension, '40 (D-014): profile write accepted').toBe(true);
  await state(ctx, '40-rules-profile-write');

  note(testInfo, '40-permission-lines', JSON.stringify(ctx.permission));
  expect.soft(ctx.permission, '40 (D-014): Firestore permission errors over the whole account tour').toEqual([]);
});

// ══════════════════════════════════════════════════════════════════════════════
// D-logout-unsynced — states 41 (B-018, lives on the Profile logout)
// ══════════════════════════════════════════════════════════════════════════════

// What the test's own disconnection provokes: the browser's failed-request lines and the
// Firestore SDK's "backend unreachable" notice. Nothing else is excused.
const OFFLINE_CONSOLE = [/net::ERR_INTERNET_DISCONNECTED/, /Could not reach Cloud Firestore backend/];

/** state() for a deliberately disconnected page. */
async function offlineState(ctx: Ctx, name: string) {
  const fresh = ctx.strict.splice(ctx.cursor);
  ctx.strict.push(...fresh.filter((e) => !OFFLINE_CONSOLE.some((re) => re.test(e))));
  await state(ctx, name);
}

test('D-logout-unsynced: logging out with unsent tracker records asks first; she can stay and nothing is lost', async ({ page }, testInfo) => {
  const acct = await newSeededAccount('logout-unsynced', { firstName: 'Ons', lastName: 'Offline' });
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  const firstItem = page.getByRole('checkbox').first();
  await expect(firstItem).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(await serverDoc(`hospitalBags/${acct.uid}`), 'harness: no bag on the server yet').toBeNull();

  // The server becomes unreachable (the app itself still loads) → the edit stays on the device.
  await page.route(FIRESTORE_TRAFFIC, (route) => route.abort('internetdisconnected'));
  const itemLabel = (await firstItem.getAttribute('aria-label')) || '';
  await firstItem.click();
  await expect.soft(firstItem, '41: item packed on the device').toBeChecked({ timeout: 5_000 });
  await page.waitForTimeout(1000);
  expect.soft(await serverDoc(`hospitalBags/${acct.uid}`), '41: harness — the edit did not reach the server').toBeNull();
  await offlineState(ctx, '41-unsynced-bag-edit');

  // 41a — logout: the usual confirm, then a second one that says what would be lost. She stays.
  await openProfile(page);
  const before = ctx.dialogs.dialogs.length;
  const second = ctx.dialogs.waitForNext(30_000).then(async (first) => {
    ctx.dialogs.next('dismiss');
    return { first, second: await ctx.dialogs.waitForNext(20_000).catch(() => null) };
  });
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  const asked = await second;
  note(testInfo, '41a-dialogs', JSON.stringify(ctx.dialogs.dialogs.slice(before).map((d) => ({ m: d.message, a: d.action }))));
  expect.soft(norm(asked.first.message), '41a: ordinary logout confirm first').toMatch(/^Déconnexion/);
  expect.soft(norm(asked.second?.message) || '(no second dialog)', '41a (B-018): unsent records → a second confirmation that counts them').toMatch(/^Données pas encore sauvegardées\n\nEnregistrements pas encore sauvegardés en ligne : 1 \(/);
  expect.soft(norm(asked.second?.message), '41a (B-018): it says they would be lost').toMatch(/Ils risquent d.être perdus si vous vous déconnectez maintenant/);
  await page.waitForTimeout(2000);
  await expect.soft(page.getByRole('button', { name: 'Enregistrer les modifications' }), '41a (B-018): declining keeps her signed in, on Profile').toBeVisible();
  await expect.soft(page.getByRole('tablist').first(), '41a: session untouched').toBeVisible();
  expect.soft(await authAccountExists(acct.uid)).toBe(true);
  await offlineState(ctx, '41a-logout-unsynced-declined');

  // 41b — back online: the record she kept goes up (server truth), and logout is one confirm again.
  await page.unroute(FIRESTORE_TRAFFIC);
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  await expect.soft(page.getByRole('checkbox').first(), '41b: the packed item survived').toBeChecked({ timeout: 20_000 });
  const bag = await pollServer(() => serverDoc(`hospitalBags/${acct.uid}`), (d) => d !== null, 30_000);
  note(testInfo, '41b-server-bag', JSON.stringify({ item: itemLabel, checked: bag?.checked ?? null }));
  expect.soft(bag, '41b (B-018): the unsent record reached the server once online').not.toBeNull();
  expect.soft(Object.values((bag?.checked as Record<string, unknown>) ?? {}).filter((v) => v === true).length, '41b: the packed item is on the server').toBe(1);
  await offlineState(ctx, '41b-back-online-synced');
  await openProfile(page);
  const before41c = ctx.dialogs.dialogs.length;
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Se déconnecter' }).click());
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const dialogs41c = ctx.dialogs.dialogs.slice(before41c).map((d) => norm(d.message));
  expect.soft(dialogs41c.length, `41c (B-018): synced → a single confirm (${JSON.stringify(dialogs41c)})`).toBe(1);
  expect.soft(new URL(page.url()).pathname, '41c: lands on the sign-in choice').toBe('/auth');
  await expect.soft(page.getByRole('tablist')).toHaveCount(0);
  expect.soft(privateKeysIn(await localKeys(page)), '41c: private keys left after logout').toEqual([]);
  await state(ctx, '41c-logout-synced-single-confirm');

  // 41d — "Se déconnecter quand même": told, she may still leave; the device is wiped.
  const acct2 = await newSeededAccount('logout-anyway', { firstName: 'Olfa', lastName: 'Anyway' });
  await uiLogin(page, acct2.email, acct2.password, 'fr');
  await page.goto('/hospital-bag', { waitUntil: 'load' });
  await expect(page.getByRole('checkbox').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.route(FIRESTORE_TRAFFIC, (route) => route.abort('internetdisconnected'));
  await page.getByRole('checkbox').first().click();
  await page.waitForTimeout(1000);
  await openProfile(page);
  const before41d = ctx.dialogs.dialogs.length;
  const both = ctx.dialogs.waitForNext(30_000).then(async (first) => ({ first, second: await ctx.dialogs.waitForNext(20_000).catch(() => null) }));
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  const anyway = await both;
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  note(testInfo, '41d-dialogs', JSON.stringify(ctx.dialogs.dialogs.slice(before41d).map((d) => ({ m: d.message, a: d.action }))));
  expect.soft(norm(anyway.second?.message) || '(no second dialog)', '41d (B-018): second confirmation').toMatch(/^Données pas encore sauvegardées/);
  expect.soft(new URL(page.url()).pathname, '41d: "log out anyway" signs her out (sign-in choice)').toBe('/auth');
  await expect.soft(page.getByRole('tablist')).toHaveCount(0);
  expect.soft(privateKeysIn(await localKeys(page)), '41d: private keys left after logout').toEqual([]);
  await page.unroute(FIRESTORE_TRAFFIC);
  await offlineState(ctx, '41d-logout-anyway');
});

// ══════════════════════════════════════════════════════════════════════════════
// D-logout-onboarding — state 42 (D-044): the onboarding header's "Se déconnecter"
// ══════════════════════════════════════════════════════════════════════════════

test('D-logout-onboarding: the onboarding header logout asks, then warns about an unsent bag edit; she can stay', async ({ page }, testInfo) => {
  // A signed-in account with no profile lands on Onboarding (ProfileSetupStack): the header link
  // used to call logout() bare, with no confirm and no unsent-records guard.
  const acct = await createAccount(newAccountEmail(WAVE, 'logout-onboarding'), E2E_PASSWORD);
  const ctx = instrument(page, testInfo);
  await openLoginForm(page, 'fr');
  await submitLogin(page, acct.email, acct.password);
  await expect(page.getByRole('button', { name: 'Je suis enceinte' }), '42: a profile-less account signs in to Onboarding').toBeVisible({ timeout: 30_000 });
  const headerLogout = page.getByRole('button', { name: 'Se déconnecter' });
  await expect(headerLogout, '42 (D-044): the Onboarding header offers "Se déconnecter"').toBeVisible({ timeout: 15_000 });

  // An unsent bag edit on the device, the server unreachable → the edit cannot be flushed.
  await page.route(FIRESTORE_TRAFFIC, (route) => route.abort('internetdisconnected'));
  await page.evaluate(() => {
    localStorage.setItem('hospital_bag_v1', JSON.stringify({ items: [], checked: { e2e_unsent_item: true }, updatedAt: Date.now(), synced: false }));
  });
  await offlineState(ctx, '42-onboarding-unsent-bag-edit');

  // 42a — first press: the usual confirm, then the unsent-records one; she answers "Annuler" to the second.
  const before = ctx.dialogs.dialogs.length;
  const asked = ctx.dialogs.waitForNext(30_000).then(async (first) => {
    ctx.dialogs.next('dismiss');
    return { first, second: await ctx.dialogs.waitForNext(20_000).catch(() => null) };
  });
  await headerLogout.click();
  const a = await asked;
  note(testInfo, '42a-dialogs', JSON.stringify(ctx.dialogs.dialogs.slice(before).map((d) => ({ m: d.message, a: d.action }))));
  expect.soft(norm(a.first.message), '42a (D-044): the header logout asks "Déconnexion" first (no bare logout)').toMatch(/^Déconnexion/);
  expect.soft(norm(a.second?.message) || '(no second dialog)', '42a (D-044): an unsent bag edit → a second confirmation that counts it').toMatch(/^Données pas encore sauvegardées\n\nEnregistrements pas encore sauvegardés en ligne : 1 \(/);
  expect.soft(norm(a.second?.message), '42a (D-044): it says they would be lost').toMatch(/Ils risquent d.être perdus si vous vous déconnectez maintenant/);
  await page.waitForTimeout(2000);
  await expect.soft(page.getByRole('button', { name: 'Je suis enceinte' }), '42a: declining keeps her on Onboarding, signed in').toBeVisible();
  expect.soft(await authAccountExists(acct.uid), '42a: the account is untouched').toBe(true);
  expect.soft(await page.evaluate(() => localStorage.getItem('hospital_bag_v1')), '42a: the unsent bag edit is still on the device').toContain('e2e_unsent_item');
  await offlineState(ctx, '42a-onboarding-logout-declined');

  // 42b — "Se déconnecter quand même": both confirms accepted, she is signed out and the device is wiped.
  const before42b = ctx.dialogs.dialogs.length;
  const both = ctx.dialogs.waitForNext(30_000).then(async (first) => ({ first, second: await ctx.dialogs.waitForNext(20_000).catch(() => null) }));
  await headerLogout.click();
  const accepted = await both;
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  note(testInfo, '42b-dialogs', JSON.stringify(ctx.dialogs.dialogs.slice(before42b).map((d) => ({ m: d.message, a: d.action }))));
  expect.soft(norm(accepted.first.message), '42b: ordinary confirm first').toMatch(/^Déconnexion/);
  expect.soft(norm(accepted.second?.message) || '(no second dialog)', '42b (D-044): second confirmation').toMatch(/^Données pas encore sauvegardées/);
  // Signed out. The URL may stay /onboarding: that path also exists in the signed-out stack (guest
  // start), so the router keeps it and shows a fresh step 1 — the proof of sign-out is that the
  // header logout link is gone, not the path.
  expect.soft(['/auth', '/onboarding'], '42b: "log out anyway" lands on a signed-out surface').toContain(new URL(page.url()).pathname);
  await expect.soft(headerLogout, '42b: the signed-in header logout is gone (she is signed out)').toHaveCount(0);
  expect.soft(privateKeysIn(await localKeys(page)), '42b: private keys left after logout').toEqual([]);
  await page.unroute(FIRESTORE_TRAFFIC);
  await offlineState(ctx, '42b-onboarding-logout-anyway');
});

// ══════════════════════════════════════════════════════════════════════════════
// D-ar — states 32-34
// ══════════════════════════════════════════════════════════════════════════════

test.describe('ar', () => {
  test.use(waveUse('ar'));

  test('D-ar: Profile, Settings and the delete confirm in Arabic, RTL', async ({ page }, testInfo) => {
    const acct = await newSeededAccount('ar', { firstName: 'Amal', lastName: 'Arabic' });
    const ctx = instrument(page, testInfo);
    await uiLogin(page, acct.email, acct.password, 'ar');

    // 32 — Profile in Arabic, labels aligned to the right edge of their inputs.
    await page.goto('/profile', { waitUntil: 'load' });
    const firstAr = page.getByRole('textbox', { name: 'الاسم الأول' });
    await expect(firstAr).toBeVisible({ timeout: 30_000 });
    const html = await htmlDirLang(page);
    expect.soft(html.dir, '32: html dir').toBe('rtl');
    await expect.soft(firstAr).toHaveValue('Amal', { timeout: 15_000 });
    const align = await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="الاسم الأول"]') as HTMLElement | null;
      const label = Array.from(document.querySelectorAll('div,span')).find(
        (e) => e.childElementCount === 0 && (e.textContent || '').trim().startsWith('الاسم الأول'),
      ) as HTMLElement | undefined;
      if (!input || !label) return null;
      const range = document.createRange();
      range.selectNodeContents(label);
      const t = range.getBoundingClientRect();
      const i = input.getBoundingClientRect();
      return { textLeft: t.left, textRight: t.right, inputLeft: i.left, inputRight: i.right };
    });
    note(testInfo, '32-label-geometry', JSON.stringify(align));
    expect.soft(align && Math.abs(align.textRight - align.inputRight) < 32, '32: RTL label hugs the right edge of its input').toBe(true);
    await expect.soft(page.getByRole('button', { name: 'حفظ التغييرات' })).toBeVisible();
    await state(ctx, '32-ar-profile');

    // 33 — Settings in Arabic.
    await page.goto('/settings', { waitUntil: 'load' });
    await expect(page.getByRole('switch').first()).toBeVisible({ timeout: 30_000 });
    await expect.soft(page.getByRole('switch', { name: 'سكّري الحمل' }).first(), '33: medical switch label in Arabic').toBeVisible();
    const settingsText = await page.locator('body').innerText();
    expect.soft(/Paramètres|Diabète|Exporter/.test(settingsText), '33: French strings left on the ar Settings screen').toBe(false);
    await state(ctx, '33-ar-settings');

    // 33a — D-039: the journal in Arabic: RTL document, Arabic headings, her data.
    {
      const nowIso = new Date().toISOString();
      await ownerWrite(`weight_entries/journal-ar-${acct.uid}`, { user_id: acct.uid, weight: 63.4, date: nowIso, week_of_pregnancy: 32, created_at: nowIso });
      await ownerWrite(`userEvents/journal-ar-${acct.uid}`, {
        user_id: acct.uid, event_id: `journal-ar-${acct.uid}`, title: 'Rendez-vous Journal AR', date: new Date(Date.now() + 10 * 864e5).toISOString(), type: 'medical', createdAt: nowIso,
      });
      await armJournalCapture(page);
      await page.getByRole('button', { name: 'تصدير PDF' }).click();
      const journalAr = await readJournal(page);
      expect.soft(journalAr, '33a (D-039): the Arabic journal reached the print step').not.toBeNull();
      if (journalAr) {
        note(testInfo, '33a-journal-ar', JSON.stringify({ dir: journalAr.dir, lang: journalAr.lang, text: journalAr.text.slice(0, 300) }));
        expect.soft(journalAr.dir, '33a (D-039): the Arabic journal is rtl').toBe('rtl');
        expect.soft(journalAr.lang, '33a (D-039): the Arabic journal lang').toBe('ar');
        expect.soft(journalAr.text, '33a (D-039): Arabic title').toContain('مذكرات الحمل');
        expect.soft(journalAr.text, '33a (D-039): Arabic weight heading').toContain('متابعة الوزن');
        expect.soft(journalAr.text, '33a (D-039): the seeded weighing is listed').toContain('63.4 kg');
        expect.soft(journalAr.text, '33a (D-039): Arabic appointments heading').toContain('مواعيدي');
        expect.soft(journalAr.text, '33a (D-039): the seeded appointment title is listed').toContain('Rendez-vous Journal AR');
        expect.soft(/Historique du poids|Mon suivi de grossesse|Rendez-vous\b(?! Journal)/.test(journalAr.text), '33a (D-039): French headings left in the Arabic journal').toBe(false);
        await snapJournal(page, ctx, '33a-ar-journal-pdf', journalAr);
      }
      await state(ctx, '33a-ar-journal-requested');
    }

    // 33b — D-025: the privacy policy in Arabic, with its legal tab list (D-023).
    await page.getByRole('button', { name: 'سياسة الخصوصية' }).first().click();
    const arLegalTabs = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: 'الشروط' }) });
    await expect.soft(arLegalTabs, '33b: legal tablist in Arabic').toHaveCount(1, { timeout: 15_000 });
    await expect.soft(arLegalTabs.getByRole('tab', { selected: true }), '33b (D-023): one legal tab selected').toHaveCount(1);
    await expect.soft(arLegalTabs.getByRole('tab', { name: 'الخصوصية' }), '33b (D-023): privacy tab selected').toHaveAttribute('aria-selected', 'true');
    expect.soft((await htmlDirLang(page)).dir, '33b: rtl').toBe('rtl');
    await state(ctx, '33b-ar-privacy');
    await page.getByRole('tab', { name: 'الشروط' }).click();
    await expect.soft(arLegalTabs.getByRole('tab', { name: 'الشروط' }), '33c (D-023): selection follows the tap').toHaveAttribute('aria-selected', 'true');
    await state(ctx, '33c-ar-privacy-terms');

    // 34 — delete confirm text in Arabic (dismissed → server intact).
    await page.goto('/profile', { waitUntil: 'load' });
    await expect(firstAr).toBeVisible({ timeout: 30_000 });
    // 34a — the danger zone itself, in view (reset, delete), RTL.
    const arDelete = page.getByRole('button', { name: 'حذف الحساب' });
    await arDelete.scrollIntoViewIfNeeded();
    await expect.soft(page.getByText('منطقة الخطر', { exact: true }), '34a: danger zone title in Arabic').toBeVisible();
    const dangerText = await page.locator('body').innerText();
    expect.soft(/Zone de danger|Supprimer|Réinitialiser|Se déconnecter/.test(dangerText), '34a: French strings left in the ar danger zone').toBe(false);
    await state(ctx, '34a-ar-danger-zone');

    ctx.dialogs.next('dismiss');
    const d34 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'حذف الحساب' }).click());
    expect.soft(d34?.message ?? '(no dialog)', '34: delete confirm in Arabic').toMatch(/حذف الحساب[\s\S]*هل أنت متأكد/);
    await page.waitForTimeout(1500);
    expect.soft(await authAccountExists(acct.uid), '34: dismissed confirm keeps the account').toBe(true);
    expect.soft(await serverDoc(`userProfiles/${acct.uid}`), '34: dismissed confirm keeps the profile').not.toBeNull();
    await state(ctx, '34-ar-delete-dialog');

    // 34b — D-025: the logout confirm in Arabic, then the Arabic welcome screen.
    const d34b = await clickForDialog(ctx, () => page.getByRole('button', { name: 'تسجيل الخروج' }).first().click());
    expect.soft(d34b?.message ?? '(no dialog)', '34b: logout confirm in Arabic').toMatch(/^تسجيل الخروج\n\nهل أنت متأكدة/);
    await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    expect.soft(new URL(page.url()).pathname, '34b: lands on the sign-in choice').toBe('/auth');
    await expect.soft(page.getByRole('tablist')).toHaveCount(0);
    expect.soft((await htmlDirLang(page)).dir, '34b: still rtl after logout').toBe('rtl');
    expect.soft(await authAccountExists(acct.uid), '34b: logout keeps the account').toBe(true);
    await state(ctx, '34b-ar-logout');
  });

  // D-025 / D-018: the re-auth modal in Arabic (the "finish deletion" variant: the server
  // refuses the Auth delete after the purge), then the deletion completes with the password.
  test('D-ar-reauth: the re-auth prompt in Arabic, with show-password and forgot-password', async ({ page }, testInfo) => {
    const acct = await newSeededAccount('ar-reauth', { firstName: 'Abir', lastName: 'Reauth' });
    await seedEverything(acct.uid);
    const ctx = instrument(page, testInfo);
    await uiLogin(page, acct.email, acct.password, 'ar');
    await page.goto('/profile', { waitUntil: 'load' });
    await expect(page.getByRole('textbox', { name: 'الاسم الأول' })).toBeVisible({ timeout: 30_000 });
    const stale = await makeSessionStale(page, { waitMs: 0, shiftClock: false });
    await watchDeletionProgress(page);
    await clickForDialog(ctx, () => page.getByRole('button', { name: 'حذف الحساب' }).click());
    const field = page.getByRole('textbox', { name: 'كلمة المرور' }).last();
    await expect(field, '34c: re-auth prompt in Arabic').toBeVisible({ timeout: 30_000 });
    expect(stale.refusals.length, '34c: the forced refusal fired').toBeGreaterThan(0);
    await expect.soft(page.getByText('تأكيد الهوية', { exact: true }), '34c: prompt title in Arabic').toBeVisible();
    await expect.soft(page.getByText(/تم مسح بياناتك مسبقاً/).first(), '34c: the prompt says the data is already erased').toBeVisible();
    await expect.soft(page.getByRole('button', { name: 'إظهار', exact: true }), '34c (D-018): show-password toggle (ar)').toBeVisible();
    await expect.soft(page.getByRole('link', { name: /هل نسيت كلمة المرور/ }), '34c (D-018): forgot-password link (ar)').toBeVisible();
    await expect.soft(page.getByRole('button', { name: 'حذف نهائياً', exact: true }).last(), '34c: destructive button in Arabic').toBeVisible();
    expect.soft((await htmlDirLang(page)).dir, '34c: rtl').toBe('rtl');
    await assertProgressSeen(page, testInfo, '34c', /جارٍ الحذف/);
    expect.soft(await serverDoc(MARKER_DOC(acct.uid)), '34c (D-031): server marker while only the login is left').not.toBeNull();
    await state(ctx, '34c-ar-reauth-modal', [/status of 400/]);

    await field.fill(acct.password);
    const done = await clickForDialog(ctx, () => page.getByRole('button', { name: 'حذف نهائياً', exact: true }).last().click(), 30_000);
    note(testInfo, '34d-done', JSON.stringify(done?.message ?? null));
    expect.soft(done?.message ?? '(no dialog)', '34d: deletion confirmed in Arabic').toMatch(/^تم حذف الحساب/);
    const after = await pollServer(() => footprint(acct.uid), fullyGone, 20_000);
    note(testInfo, '34d-footprint', JSON.stringify(after));
    expect.soft(totalDocs(after), '34d: server docs left').toBe(0);
    expect.soft(after.auth, '34d: auth user left').toBe(false);
    expect.soft(after.marker, '34d (D-031): deletion request left').toBe(false);
    await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
    await expect.soft(page.getByRole('tablist')).toHaveCount(0);
    await state(ctx, '34d-ar-reauth-delete-complete');
  });

  // D-030 / D-035 in Arabic, and the accept path (server + fresh context).
  test('D-ar-consent: the consent sheet in Arabic — decline block, then agreeing opens the app', async ({ page, browser }, testInfo) => {
    const acct = await newSeededAccount('ar-consent', { firstName: 'Asma', lastName: 'Consent', consent: false });
    const ctx = instrument(page, testInfo);
    await openLoginForm(page, 'ar');
    await submitLogin(page, acct.email, acct.password);
    await expect(page.getByTestId('health_consent_continue'), '39: consent sheet (ar)').toBeVisible({ timeout: 60_000 });
    expect.soft((await htmlDirLang(page)).dir, '39: rtl').toBe('rtl');
    await expect.soft(page.getByRole('tablist')).toHaveCount(0);
    await state(ctx, '39-ar-consent-sheet');

    const layout = await consentLayout(page);
    note(testInfo, '39b-consent-layout', JSON.stringify(layout));
    expect.soft(layout.export?.text, '39b (D-030): export on the sheet (ar)').toBe('تصدير بياناتي');
    expect.soft(layout.logout?.text, '39b: logout (ar)').toBe('تسجيل الخروج');
    expect.soft(layout.note?.text ?? '', '39b (D-035): logout note (ar)').toMatch(/تسجيل الخروج لا يحذف شيئاً: تبقى بياناتكِ محفوظة على خوادمنا/);
    expect.soft(layout.erase?.text, '39b: delete (ar)').toBe('حذف حسابي');
    const tops = [layout.export?.top ?? -1, layout.logout?.top ?? -1, layout.note?.top ?? -1, layout.erase?.top ?? -1];
    expect.soft(tops.every((t, i) => t >= 0 && (i === 0 || t > tops[i - 1])), `39b: order export → logout → note → delete (${JSON.stringify(tops)})`).toBe(true);
    expect.soft(parseFloat(layout.erase?.border ?? '1'), '39b (D-030): delete is not an outlined call-to-action').toBe(0);
    const sheetText = await page.locator('body').innerText();
    expect.soft(/Exporter|Supprimer|déconnecter|Continuer/.test(sheetText), '39b: French strings left on the ar sheet').toBe(false);
    await page.getByTestId('health_consent_erase').scrollIntoViewIfNeeded();
    await state(ctx, '39b-ar-consent-decline-block');

    ctx.dialogs.next('dismiss');
    const dDel = await clickForDialog(ctx, () => page.getByTestId('health_consent_erase').click());
    note(testInfo, '39c-confirm', JSON.stringify(dDel?.message ?? null));
    expect.soft(dDel?.message ?? '(no dialog)', '39c: delete confirm in Arabic').toMatch(/^حذف الحساب\n\nهل أنت متأكدة/);
    expect.soft(dDel?.message ?? '', '39c (D-030): the confirm points to the export on this screen (ar)').toMatch(/اضغطي أولاً على «تصدير بياناتي» في هذه الشاشة\.$/);
    expect.soft(dDel?.message ?? '', '39c (D-030): no pointer to Settings').not.toMatch(/الإعدادات/);
    await page.waitForTimeout(1500);
    expect.soft(await authAccountExists(acct.uid), '39c: dismissed confirm keeps the account').toBe(true);
    expect.soft(await serverDoc(`userProfiles/${acct.uid}`), '39c: dismissed confirm keeps the profile').not.toBeNull();
    await state(ctx, '39c-ar-consent-delete-cancelled');

    // Agreeing: recorded on the server, Home opens, and a new device no longer asks.
    await tickHealthConsent(page);
    await expect.soft(page.getByTestId('health_consent_continue'), '39d: "continue" enabled once ticked').not.toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('health_consent_continue').click();
    await expect.soft(page.getByRole('tablist').first(), '39d: agreeing opens the app').toBeVisible({ timeout: 30_000 });
    await expect.soft(page.getByTestId('home_quick_search'), '39d: agreeing lands on Home (its own content, fully faded in)').toBeVisible({ timeout: 30_000 });
    const prof = await pollServer(() => serverDoc(`userProfiles/${acct.uid}`), (d) => !!d?.healthDataConsent, 15_000);
    note(testInfo, '39d-server-consent', JSON.stringify(prof?.healthDataConsent ?? null));
    expect.soft(typeof (prof?.healthDataConsent as any)?.at, '39d: consent timestamp on the server').toBe('string');
    expect.soft(typeof (prof?.healthDataConsent as any)?.version, '39d: consent version on the server').toBe('string');
    await state(ctx, '39d-ar-consent-accepted');
    const f = await freshCtx(browser, acct, 'ar', testInfo);
    await expect.soft(f.page.getByTestId('health_consent_continue'), '39e: a new device does not ask again').toHaveCount(0);
    await expect.soft(f.page.getByTestId('home_quick_search'), '39e: the new device lands on Home').toBeVisible({ timeout: 30_000 });
    await state(f, '39e-ar-consent-fresh-context');
    await closeCtx(f);
  });
});
