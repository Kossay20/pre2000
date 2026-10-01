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
    .filter((n) => n !== 'users' && n !== 'userProfiles');
  if (names.length < 9) throw new Error(`firestore.rules parse found only ${names.length} user collections`);
  return names;
})();

/** Legacy nested docs the purge must also sweep (users/{uid}/events is still written by DemoDataService). */
const LEGACY_DOCS = (uid: string) => [
  `userProfiles/${uid}/weights/seed-d`,
  `userProfiles/${uid}/chatbot_history/seed-d`,
  `users/${uid}/journal/seed-d`,
  `users/${uid}/events/seed-d`,
  `users/${uid}`,
];

// ── Recorder plumbing ─────────────────────────────────────────────────────────

type Ctx = {
  page: Page;
  rec: ReturnType<typeof attachMegaAuditRecorder>;
  strict: string[];
  cursor: number;
  dialogs: DialogRecorder;
};

function quartetDirs(testInfo: TestInfo): string[] {
  const dirs = [process.env.E2E_QUARTET_DIR, process.env.E2E_QUARTET_DIR2].filter((d): d is string => !!d);
  return dirs.length ? dirs : [testInfo.outputPath('quartet')];
}

function instrument(page: Page, testInfo: TestInfo): Ctx {
  const strict = attachConsoleStrict(page);
  const rec = attachMegaAuditRecorder(page, quartetDirs(testInfo));
  const dialogs = attachDialogRecorder(page, rec);
  return { page, rec, strict, cursor: 0, dialogs };
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
  await ctx.rec.snap(name);
  // Only the browser's own resource-load line for a request the test itself provoked
  // (simulated CREDENTIAL_TOO_OLD refusal, deliberate wrong password) may be allowed —
  // never an app log line.
  const fresh = ctx.strict
    .slice(ctx.cursor)
    .filter((e) => !(/^Failed to load resource/.test(e) && expectedNetworkErrors.some((re) => re.test(e))));
  ctx.cursor = ctx.strict.length;
  expect.soft(fresh, `${name}: strict console errors: ${fresh.join(' | ')}`).toEqual([]);
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
    healthMetrics: { user_id: uid, type: 'weight', value: 62, date: iso, createdAt: iso },
    weight_entries: { user_id: uid, weight: 62, date: iso, createdAt: iso },
    glucoseMetrics: { user_id: uid, value: 0.92, context: 'fasting', date: iso, createdAt: iso },
    symptomsLog: { user_id: uid, symptoms: ['nausea'], date: day, createdAt: iso },
    userReminderSettings: { user_id: uid, enabled: true, updatedAt: iso },
    userTaskStatuses: { user_id: uid, taskId: 'seed-d', completed: true, updatedAt: iso },
    reminder_settings_v2: { user_id: uid, reminders: {}, updatedAt: iso },
  };
  // A collection the rules allow but this realistic map does not know yet still gets a
  // user-owned document, so the purge is tested against every collection that exists.
  for (const col of USER_COLLECTIONS) {
    await ownerWrite(`${col}/seed-d-${uid}`, docs[col] ?? { user_id: uid, seed: 'D', createdAt: iso, updatedAt: iso });
  }
  await ownerWrite(`users/${uid}`, { legacy: true });
  await ownerWrite(`userProfiles/${uid}/weights/seed-d`, { weight: 60, date: iso });
  await ownerWrite(`userProfiles/${uid}/chatbot_history/seed-d`, { text: 'seed', date: iso });
  await ownerWrite(`users/${uid}/journal/seed-d`, { text: 'seed', date: iso });
  await ownerWrite(`users/${uid}/events/seed-d`, { title: 'seed', date: iso });
}

type ServerFootprint = { profile: boolean; counts: Record<string, number>; legacy: Record<string, boolean>; auth: boolean };

async function footprint(uid: string): Promise<ServerFootprint> {
  const counts: Record<string, number> = {};
  for (const c of USER_COLLECTIONS) counts[c] = (await serverQuery(c, 'user_id', uid)).length;
  const legacy: Record<string, boolean> = {};
  for (const p of LEGACY_DOCS(uid)) legacy[p] = (await serverDoc(p)) !== null;
  return { profile: (await serverDoc(`userProfiles/${uid}`)) !== null, counts, legacy, auth: await authAccountExists(uid) };
}

const totalDocs = (f: ServerFootprint) =>
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

async function newSeededAccount(scenario: string, fields: Record<string, unknown> = {}): Promise<CreatedAccount> {
  const acct = await createAccount(newAccountEmail(WAVE, scenario), E2E_PASSWORD);
  await seedProfile(acct.uid, acct.idToken, { week: 32, country: 'france', ...fields });
  return acct;
}

// ── Stale-session simulation (auth/requires-recent-login) ─────────────────────

/**
 * The Auth emulator never enforces "recent login", so model a real stale session with
 * both of its real-world signals, whichever the build relies on:
 *  1. the browser clock is 10 min past the token's auth_time (a client-side age check);
 *  2. `accounts:delete` answers CREDENTIAL_TOO_OLD_LOGIN_AGAIN (what the production
 *     backend does) until the page re-authenticates (`accounts:signInWithPassword`).
 * Call after login; requires `page.clock.install()` before the first navigation.
 */
async function makeSessionStale(page: Page, opts: { waitMs?: number; shiftClock?: boolean } = {}) {
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
  const waitMs = opts.waitMs ?? Number(process.env.WAVE_D_STALE_WAIT_MS ?? 310_000);
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  return { refusals };
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

const PRIVACY_SCREEN = (p: Page) => p.getByText('Mentions Légales & CGU', { exact: true }).first();

const onAuthSurface = (url: string) => /\/(welcome|auth|login|Language|AuthChoice)(\b|$|\?)/.test(url);

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
  const dpaExpected = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date(Date.parse(seed.lmp as string) + 280 * 864e5));
  await expect.soft(page.getByText(dpaExpected, { exact: true }), `01: DPA "${dpaExpected}"`).toBeVisible();
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
  await state(ctx, '07-settings-loaded');
  await page.goto('/diagnostic', { waitUntil: 'load' });
  await expect.soft(page.getByRole('tablist').first(), '07: /diagnostic must land on the app (Home)').toBeVisible({ timeout: 20_000 });
  await expect.soft(page.getByText('Lancer le diagnostic')).toHaveCount(0);
  await state(ctx, '07b-diagnostic-deeplink');

  // 08 — medical flag on → server + fresh context; content effect (SYNC-15); off → gone.
  const remBefore = await remindersText(page);
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
  const d11 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Exporter mes données (JSON)' }).click());
  expect.soft(d11?.message ?? '(no dialog)', '11: sensitive-data confirm').toMatch(/^Données sensibles/);
  const dl = await download11;
  const after11 = ctx.dialogs.dialogs.slice(dialogsBefore11 + 1).map((d) => d.message);
  note(testInfo, '11-export-json', `download=${dl ? dl.suggestedFilename() : null} dialogs=${JSON.stringify(after11)}`);
  expect.soft(!!dl || after11.length > 0, '11 (HYP-D3): export ends with no download and no message (silent no-op)').toBe(true);
  await state(ctx, '11-export-json');

  // 12 — PDF export (HYP-D4): the Settings screen must not collapse into a skeleton.
  await openSettings(page);
  const dialogsBefore12 = ctx.dialogs.dialogs.length;
  await page.evaluate(() => {
    (window as any).__settingsVanished = false;
    const obs = new MutationObserver(() => {
      if (!document.body.innerText.includes('Politique de Confidentialité')) (window as any).__settingsVanished = true;
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    (window as any).__settingsObs = obs;
  });
  await page.getByRole('button', { name: 'Mon Journal (PDF)' }).click();
  await page.waitForTimeout(6000);
  const vanished = await page.evaluate(() => {
    (window as any).__settingsObs?.disconnect();
    return (window as any).__settingsVanished as boolean;
  });
  note(testInfo, '12-export-pdf', `settingsVanished=${vanished} dialogs=${JSON.stringify(ctx.dialogs.dialogs.slice(dialogsBefore12).map((d) => d.message))}`);
  expect.soft(vanished, '12 (HYP-D4): Settings content disappeared (skeleton flash) during PDF export').toBe(false);
  await state(ctx, '12-export-pdf');

  // 13 — Privacy policy reachable from Settings and Profile; back works.
  await openSettings(page);
  await page.getByRole('button', { name: 'Politique de Confidentialité' }).click();
  await expect.soft(PRIVACY_SCREEN(page), '13: privacy screen from Settings').toBeVisible({ timeout: 15_000 });
  note(testInfo, '13-privacy-url', page.url());
  await state(ctx, '13-privacy-from-settings');
  const terms = page.getByText('CGU', { exact: true }).first();
  note(testInfo, '13-terms-tab-role', String(await page.getByRole('tab', { name: 'CGU' }).count() + await page.getByRole('button', { name: 'CGU' }).count()));
  if (await terms.count()) {
    await terms.click();
    await expect.soft(page.getByText(/AVERTISSEMENT MÉDICAL/).first(), '13: Terms carry the medical disclaimer').toBeVisible({ timeout: 10_000 });
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

test('D-lang: live switch fr→ar→tn→fr, /language deep link, persistence', async ({ page }, testInfo) => {
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
  await state(ctx, '16-language-deeplink-continue');

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
  const consent = page.getByTestId('health_consent_checkbox');
  await expect(consent).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
  await consent.click();
  await expect(consent).toHaveAttribute('aria-checked', 'true');
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
  await state(ctx, '19-guest-reload');

  // 20 — upgrade from Profile → /create-account → "Compte créé ✅" → same uid + email.
  const email = newAccountEmail(WAVE, 'upgrade');
  await page.getByRole('button', { name: 'Créer un compte' }).first().click();
  await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 20_000 });
  // GuestUpgrade terms line → privacy (13, third entry point).
  const termsLine = page.getByText(/En créant un compte, vous acceptez/);
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
  await expect.soft(page.getByText('Compte créé ✅').first(), '20: upgrade toast').toBeVisible({ timeout: 20_000 });
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
  await state(f, '22-upgrade-fresh-login');
  await openProfile(f.page);
  await expect.soft(firstNameBox(f.page), '22: fresh login keeps the first name').toHaveValue('Invitée', { timeout: 15_000 });
  await expect.soft(f.page.getByRole('button', { name: 'Appeler Sage-femme' }), '22: fresh login keeps the emergency contact').toBeVisible({ timeout: 10_000 });
  await state(f, '22b-upgrade-fresh-profile');
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
  const d23 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'Se déconnecter' }).click());
  expect.soft(d23?.message ?? '(no dialog)', '23: logout confirm').toMatch(/^Déconnexion/);
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  note(testInfo, '23-landing', page.url());
  expect.soft(new URL(page.url()).pathname, '23: lands on the welcome/language screen').toBe('/welcome');
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
  await page.waitForTimeout(3000);
  const after26 = await footprint(acct.uid);
  expect.soft(after26, '26: cancel must leave the server untouched').toEqual(seeded);
  await expect.soft(page.getByRole('button', { name: 'Enregistrer les modifications' }), '26: still on Profile').toBeVisible();
  await state(ctx, '26-delete-confirm-cancel');

  // 27 — accept → zero server docs, no auth user, auth surface, no private local keys.
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 30_000 }).catch(() => {});
  const after27 = await pollServer(() => footprint(acct.uid), (f) => totalDocs(f) === 0 && !f.auth, 20_000);
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
  test.setTimeout(720_000);
  const acct = await newSeededAccount('reauth-cancel', { firstName: 'Rania', lastName: 'Cancel' });
  await seedEverything(acct.uid);
  const seeded = await footprint(acct.uid);
  const ctx = instrument(page, testInfo);
  await page.clock.install();
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  const stale = await makeSessionStale(page);

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
  await state(ctx, '30-delete-reauth-cancel');

  // Cold start: what the (possibly zombie) account now sees.
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const cachedProfile = await page.evaluate(() => localStorage.getItem('user_profile'));
  note(testInfo, '30b-coldstart', `url=${page.url()} tablist=${await page.getByRole('tablist').count()} cachedProfile=${!!cachedProfile} serverProfile=${after30.profile}`);
  await state(ctx, '30b-reauth-cancel-coldstart');
});

test('D-reauth: wrong password → localized error; right password completes the deletion', async ({ page }, testInfo) => {
  test.setTimeout(720_000);
  const acct = await newSeededAccount('reauth', { firstName: 'Rim', lastName: 'Reauth' });
  await seedEverything(acct.uid);
  const seeded = await footprint(acct.uid);
  const ctx = instrument(page, testInfo);
  await page.clock.install();
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  await makeSessionStale(page);

  // 29 — prompt with a labelled password field.
  await clickForDialog(ctx, () => page.getByRole('button', { name: 'Supprimer le compte' }).click());
  const field = reauthField(page);
  await expect(field, '29: re-auth prompt').toBeVisible({ timeout: 20_000 });
  const label = await field.getAttribute('aria-label');
  expect.soft(label ?? '', '29: password field is labelled').not.toBe('');
  await state(ctx, '29-delete-reauth-required', [/status of 400/]);

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
  const after = await pollServer(() => footprint(acct.uid), (f) => totalDocs(f) === 0 && !f.auth, 20_000);
  note(testInfo, '29-footprint', JSON.stringify(after));
  expect.soft(totalDocs(after), '29: server docs left after re-auth deletion').toBe(0);
  expect.soft(after.auth, '29: auth user still exists after re-auth deletion').toBe(false);
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
  await state(ctx, '35-delete-refused-after-purge', [/status of 400/]);

  // 35b — cancel → signed out (not the emptied account), marker kept for the next sign-in.
  await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await page.waitForURL((u) => onAuthSurface(u.pathname), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await expect.soft(page.getByRole('tablist'), '35b: cancel left the emptied account open').toHaveCount(0);
  const marker = await page.evaluate(() => localStorage.getItem('@account_deletion_pending_v1'));
  expect.soft(marker, '35b: pending-deletion marker survives the logout').toBe(acct.uid);
  await state(ctx, '35b-cancel-signs-out');

  // 35c — sign in again → the deletion finishes and says so.
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByTestId('login_email_input').fill(acct.email, { timeout: 30_000 });
  await page.getByTestId('login_password_input').fill(acct.password);
  const done = await clickForDialog(ctx, () => page.getByTestId('login_submit_button').click(), 30_000);
  note(testInfo, '35c-dialog', JSON.stringify(done?.message ?? null));
  expect.soft(done?.message ?? '(no dialog)', '35c: deletion confirmed').toMatch(/^Compte supprimé/);
  const after = await pollServer(() => footprint(acct.uid), (f) => totalDocs(f) === 0 && !f.auth, 20_000);
  expect.soft(after.auth, '35c: auth user deleted on the next sign-in').toBe(false);
  expect.soft(totalDocs(after), '35c: server docs').toBe(0);
  await expect.soft(page.getByRole('tablist')).toHaveCount(0);
  expect.soft(await page.evaluate(() => localStorage.getItem('@account_deletion_pending_v1')), '35c: marker cleared').toBeNull();
  await state(ctx, '35c-deletion-finished-on-sign-in');
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
  const confirm = await clickForDialog(ctx, () => row.click());
  expect.soft(confirm?.message ?? '(no dialog)', '36: confirm names what is erased and offers the export').toMatch(/irréversible[\s\S]*Exporter mes données/);
  const doneDialog = await ctx.dialogs.waitForNext(30_000).catch(() => null);
  note(testInfo, '36-done', JSON.stringify(doneDialog?.message ?? null));
  expect.soft(doneDialog?.message ?? '(no dialog)', '36: a finished deletion is confirmed (not just a logout)').toMatch(/^Compte supprimé/);
  const after = await pollServer(() => footprint(acct.uid), (f) => totalDocs(f) === 0 && !f.auth, 20_000);
  note(testInfo, '36-footprint', JSON.stringify(after));
  expect.soft(totalDocs(after), '36: server docs left').toBe(0);
  expect.soft(after.auth, '36: auth user left').toBe(false);
  expect.soft(privateKeysIn(await localKeys(page)), '36: private keys left').toEqual([]);
  await state(ctx, '36-delete-from-settings');
});

// ══════════════════════════════════════════════════════════════════════════════
// D-reset — state 31
// ══════════════════════════════════════════════════════════════════════════════

test('D-reset: "Réinitialiser mon profil" must not orphan server data', async ({ page }, testInfo) => {
  const acct = await newSeededAccount('reset', { firstName: 'Reem', lastName: 'Reset' });
  await seedEverything(acct.uid);
  const ctx = instrument(page, testInfo);
  await uiLogin(page, acct.email, acct.password, 'fr');
  await openProfile(page);
  const reset = page.getByRole('button', { name: 'Réinitialiser mon profil' });
  if (!(await reset.count())) {
    note(testInfo, '31-reset', 'row absent');
    await state(ctx, '31-reset-profile');
    return;
  }
  const d31 = await clickForDialog(ctx, () => reset.click());
  note(testInfo, '31-confirm', JSON.stringify(d31?.message ?? null));
  await page.waitForTimeout(4000);
  const after = await footprint(acct.uid);
  note(testInfo, '31-footprint', JSON.stringify(after) + ` url=${page.url()} dialogs=${JSON.stringify(ctx.dialogs.messages())}`);
  const orphans = Object.entries(after.counts).filter(([, n]) => n > 0).map(([c]) => c);
  if (!after.profile) {
    expect.soft(orphans, '31: reset deleted the profile but orphaned these collections').toEqual([]);
    expect.soft(Object.values(after.legacy).some(Boolean), '31: reset orphaned legacy docs').toBe(false);
  }
  await state(ctx, '31-reset-profile');
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

    // 34 — delete confirm text in Arabic (dismissed → server intact).
    await page.goto('/profile', { waitUntil: 'load' });
    await expect(firstAr).toBeVisible({ timeout: 30_000 });
    ctx.dialogs.next('dismiss');
    const d34 = await clickForDialog(ctx, () => page.getByRole('button', { name: 'حذف الحساب' }).click());
    expect.soft(d34?.message ?? '(no dialog)', '34: delete confirm in Arabic').toMatch(/حذف الحساب[\s\S]*هل أنت متأكد/);
    await page.waitForTimeout(1500);
    expect.soft(await authAccountExists(acct.uid), '34: dismissed confirm keeps the account').toBe(true);
    expect.soft(await serverDoc(`userProfiles/${acct.uid}`), '34: dismissed confirm keeps the profile').not.toBeNull();
    await state(ctx, '34-ar-delete-dialog');
  });
});
