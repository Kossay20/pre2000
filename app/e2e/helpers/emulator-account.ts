/**
 * Signed-in harness on the Firebase emulator stack (AUDIT_PLAN §0.2 items 2-6).
 * Pure REST against the local emulators — never a real project, never a
 * "clear all" endpoint (it would wipe concurrently running waves).
 *
 *   Auth      http://127.0.0.1:9099
 *   Firestore http://127.0.0.1:8080  (real firestore.rules)
 *   Web       E2E_BASE_URL (default http://localhost:8090)
 */
import fs from 'fs';
import path from 'path';
import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { lmpIsoForWeek } from './guest-profile';

// ── Config ────────────────────────────────────────────────────────────────────

function readProjectId(): string {
  const fromEnv = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (fromEnv) return fromEnv;
  const envFile = path.resolve(__dirname, '../../.env');
  const line = fs
    .readFileSync(envFile, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('EXPO_PUBLIC_FIREBASE_PROJECT_ID='));
  const pid = line?.split('=')[1]?.trim();
  if (!pid) throw new Error(`EXPO_PUBLIC_FIREBASE_PROJECT_ID missing from ${envFile}`);
  return pid;
}

export const PROJECT_ID = readProjectId();
export const AUTH_EMULATOR = 'http://127.0.0.1:9099';
export const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
export const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8090';
const DOCS = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** ≥10 chars, a digit, an uppercase (src/utils/validation.ts). */
export const E2E_PASSWORD = 'E2e-Passw0rd9';

export type AppLocale = 'fr' | 'en' | 'ar' | 'tn';

let lastTs = 0;
/** `fr0930-<wave>-<scenario>-<Date.now()>@e2e.test` — one account per wave/scenario, never shared. */
export function newAccountEmail(wave: string, scenario: string): string {
  let ts = Date.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `fr0930-${slug(wave)}-${slug(scenario)}-${ts}@e2e.test`;
}

// ── Firestore REST value codec ────────────────────────────────────────────────

type FsValue = Record<string, unknown>;

function toValue(v: unknown): FsValue {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  throw new Error(`unsupported Firestore value: ${String(v)}`);
}

function toFields(o: Record<string, unknown>): Record<string, FsValue> {
  return Object.fromEntries(
    Object.entries(o)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => [k, toValue(x)]),
  );
}

function fromValue(v: any): unknown {
  if (!v || typeof v !== 'object') return v;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return v;
}

function fromFields(fields: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, fromValue(x)]));
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type CreatedAccount = { uid: string; idToken: string; email: string; password: string };

/** POST accounts:signUp on the Auth emulator → `{uid, idToken}` (plus the credentials). */
export async function createAccount(email: string, pw: string = E2E_PASSWORD): Promise<CreatedAccount> {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }),
  });
  const body: any = await res.json();
  if (!res.ok) throw new Error(`createAccount(${email}): ${res.status} ${JSON.stringify(body)}`);
  return { uid: body.localId, idToken: body.idToken, email, password: pw };
}

/**
 * Does the Auth emulator know this uid? Uses `accounts:lookup` with `Bearer owner`.
 * (The plan's `GET /emulator/v1/projects/PID/accounts` answers 405 on the emulator.)
 */
export async function authAccountExists(uid: string): Promise<boolean> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: [uid] }),
    },
  );
  if (!res.ok) throw new Error(`authAccountExists(${uid}): ${res.status} ${await res.text()}`);
  const body: any = await res.json();
  return Array.isArray(body.users) && body.users.some((u: any) => u.localId === uid);
}

// ── Profile seed (as the user — rules apply) ──────────────────────────────────

/**
 * Fields accepted by `seedProfile`. `week` is converted into lmp/pregnancyStartDate/dpa;
 * everything else is written as-is (undefined keys are dropped, like the app does).
 */
export type ProfileSeed = {
  week?: number;
  now?: Date;
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  ageRange?: string;
  isFirstPregnancy?: boolean;
  hasGestationalDiabetes?: boolean;
  hasHypertension?: boolean;
  isTwinPregnancy?: boolean;
  medicalProfileAnsweredAt?: string;
  /**
   * Seed the health-data consent onboarding records (default true). `false` seeds a
   * profile saved before the question existed: the app then shows the consent sheet
   * instead of Home.
   */
  consent?: boolean;
  [extra: string]: unknown;
};

/**
 * PATCH userProfiles/{uid} with the USER's idToken (not `Bearer owner`), so the seed
 * itself must pass validProfileNames / validMedicalFlags / profileFieldCountSane.
 *
 * Mirrors the payload `AuthContext.loginAsGuest` builds for a permanent account at
 * the end of Onboarding (src/context/AuthContext.tsx:483-531, called from
 * OnboardingScreen.tsx:273-290): firstName, lmp, pregnancyStartDate, country,
 * createdAt, updatedAt, dpa (pregnant only), and — only when defined — lastName,
 * city, ageRange, isFirstPregnancy and the medical flags. Onboarding does NOT write
 * `pregnancyStatus` or `currentWeek` (the latter is added by the cold-start
 * reconcile, AuthContext.tsx:172-177), so neither does this seed.
 * Merge semantics (updateMask per key), like `setDoc(..., {merge:true})`.
 */
export async function seedProfile(
  uid: string,
  idToken: string,
  fields: ProfileSeed = {},
): Promise<Record<string, unknown>> {
  const { week = 32, now = new Date(), consent = true, ...rest } = fields;
  const lmp = lmpIsoForWeek(week, now);
  const stamp = new Date().toISOString();
  const data: Record<string, unknown> = {
    firstName: 'E2E',
    lmp,
    pregnancyStartDate: lmp,
    country: 'France',
    createdAt: stamp,
    updatedAt: stamp,
    dpa: new Date(new Date(lmp).getTime() + 280 * 24 * 60 * 60 * 1000).toISOString(),
    ageRange: '25-29',
    isFirstPregnancy: true,
    // Onboarding's last step records this with every profile; without it the app shows
    // the consent sheet instead of Home (see ProfileSeed.consent).
    healthDataConsent: consent ? { version: '2026-09-30', at: stamp } : undefined,
    ...rest,
  };
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];

  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const res = await fetch(`${DOCS}/userProfiles/${uid}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`seedProfile(${uid}): ${res.status} ${await res.text()}`);
  return data;
}

// ── Server truth (Bearer owner — the only valid persistence oracle) ───────────

/** GET a document as the emulator owner. `path` like `userProfiles/<uid>`. Null if absent. */
export async function serverDoc(docPath: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${DOCS}/${docPath.replace(/^\/+/, '')}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`serverDoc(${docPath}): ${res.status} ${await res.text()}`);
  const body: any = await res.json();
  return fromFields(body.fields || {});
}

export type ServerRow = { id: string; path: string; data: Record<string, unknown> };

/** runQuery `collection where field == value` as the emulator owner (top-level collections). */
export async function serverQuery(collection: string, field: string, value: unknown): Promise<ServerRow[]> {
  const res = await fetch(`${DOCS}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue(value) } },
      },
    }),
  });
  if (!res.ok) throw new Error(`serverQuery(${collection}.${field}): ${res.status} ${await res.text()}`);
  const rows: any[] = await res.json();
  return rows
    .filter((r) => r.document)
    .map((r) => {
      const name: string = r.document.name;
      const rel = name.split('/documents/')[1] ?? name;
      return { id: rel.split('/').pop() as string, path: rel, data: fromFields(r.document.fields || {}) };
    });
}

// ── Browser side ──────────────────────────────────────────────────────────────

const BCP47: Record<AppLocale, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar', tn: 'ar-TN' };

export const EMPTY_STORAGE_STATE = { cookies: [], origins: [] } as const;

/**
 * `test.use(waveUse('fr'))` — timezone pin, phone viewport, and NO inherited guest
 * storageState (the global one seeds a fake guest `user_profile`, global-setup.ts).
 */
export function waveUse(locale: AppLocale) {
  return {
    timezoneId: 'Europe/Paris',
    locale: BCP47[locale],
    viewport: { width: 390, height: 844 },
    storageState: { cookies: [], origins: [] },
  };
}

/**
 * Sign in through the real UI.
 * 1. init script: `app_locale` + `@home_welcome_seen_v1=1` (applied once per uiLogin
 *    call per tab — a later in-app language switch is not overwritten on reload);
 * 2. /login → fill login_email_input / login_password_input;
 * 3. login_submit_button → expect role=tablist.
 * The context must not carry a cached `user_profile` (use `waveUse` / fresh context).
 */
export async function uiLogin(page: Page, email: string, pw: string, locale: AppLocale): Promise<void> {
  const token = `${locale}:${Date.now()}:${Math.random()}`;
  await page.addInitScript(
    ({ locale: l, token: tk }) => {
      try {
        if (sessionStorage.getItem('__e2e_uiLogin_applied') === tk) return;
        sessionStorage.setItem('__e2e_uiLogin_applied', tk);
        localStorage.setItem('app_locale', l);
        localStorage.setItem('@home_welcome_seen_v1', '1');
      } catch {
        /* storage blocked */
      }
    },
    { locale, token },
  );
  await page.goto('/login', { waitUntil: 'load' });
  const emailInput = page.getByTestId('login_email_input');
  await expect(emailInput, 'uiLogin: /login did not render the login form (cached user_profile?)').toBeVisible({
    timeout: 60_000,
  });
  await emailInput.fill(email);
  await page.getByTestId('login_password_input').fill(pw);
  await page.getByTestId('login_submit_button').click();
  await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 60_000 });
}

/**
 * Persistence oracle (b): a brand-new context — empty localStorage AND IndexedDB,
 * so Firestore's persistentLocalCache cannot serve the value — then `uiLogin`.
 * Close it with `page.context().close()`.
 */
export async function freshContextLogin(
  browser: Browser,
  email: string,
  pw: string,
  locale: AppLocale,
  contextOptions: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    ...waveUse(locale),
    ...contextOptions,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await uiLogin(page, email, pw, locale);
  return page;
}
