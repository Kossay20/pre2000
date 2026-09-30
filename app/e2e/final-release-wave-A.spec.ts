/**
 * Wave A — Cold funnel + auth (AUDIT_PLAN final-release-2026-09-30 §2).
 *
 * Language → AuthChoice → Privacy → Register (validation + success) → Onboarding
 * (steps 1-4, create-account + skip-as-guest) → Login (errors, rate limit, forgot
 * password, success). Full run in fr, full run in ar (RTL), en selector smoke.
 * Carried-over residuals: GJ-006 (Language Continue below the fold) and GJ-008
 * (duplicate in-body back chevron on Register / Login).
 * Priority risk R1 / HYP-A1: a newly registered user skips onboarding and is never
 * dated — proven or refuted here with SERVER truth (serverDoc) + a fresh context.
 *
 * Requires the emulator stack (`bash e2e/emulator-stack.sh status` → 3 up):
 *   E2E_BASE_URL=http://localhost:8090 \
 *   E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-A \
 *   timeout 900 npx playwright test e2e/final-release-wave-A.spec.ts --reporter=list
 *
 * App-behaviour assertions are `expect.soft` (a real bug must not hide the rest of
 * the wave); harness / navigation steps are hard `expect`.
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { attachConsoleStrict, RAW_KEY } from './helpers/audit-guards';
import { attachMegaAuditRecorder } from './helpers/mega-audit-snap';
import { attachDialogRecorder, type DialogRecorder } from './helpers/dialog-recorder';
import {
  AUTH_EMULATOR,
  E2E_BASE_URL,
  E2E_PASSWORD,
  PROJECT_ID,
  authAccountExists,
  createAccount,
  newAccountEmail,
  seedProfile,
  serverDoc,
  uiLogin,
  waveUse,
  type AppLocale,
} from './helpers/emulator-account';
import { lmpIsoForWeek } from './helpers/guest-profile';

// A-021a: the file-level test.setTimeout(300_000) did not apply in round 1 (test 1 hit
// the 120 s default); every describe below configures its own timeout instead.
const WAVE_TIMEOUT = 300_000;

// ── Copy (resolved from src/i18n/locales/<L> with the index.ts merge layout) ──

type Copy = {
  langContinue: string;
  signup: string;
  login: string;
  guest: string;
  privacyLink: string;
  termsTab: string;
  medicalDisclaimer: RegExp;
  createMyAccount: string;
  emailRequired: string;
  invalidEmail: string;
  pwLength: string;
  pwUpper: string;
  pwMismatch: string;
  emailInUse: string;
  badCredentials: string;
  tooMany: RegExp;
  forgot: string;
  forgotEmpty: RegExp;
  resetSent: RegExp;
  pregnant: string;
  stepper: (n: number) => string;
  methodDdr: string;
  onbContinue: string;
  onbBackA11y: string;
  firstNameLabel: string;
  firstPregYes: string;
  medicalTitle: string;
  hypertension: string;
  countries: Record<string, string>;
  step4Start: string;
  step4Finalize: string;
  step4Skip: string;
  /** Step-2 preview for LMP = today − 31 w exactly (A-009: completed days, pluralised). */
  sa31plus0: string;
  weekLabel32: string;
  invalidDate: string;
  postTermNote: RegExp;
  countryHint: RegExp;
  headerBack: string;
  emergencyFallbackNote: string;
  existingProfileTitle: string;
  week: string;
  trimester3: string;
  completeProfileCta: string;
  titles: { language: string; authChoice: string; register: string; login: string; onboarding: string; home: string; privacy: string };
};

const BRAND = 'Mama & Bébé';

const COPY: Record<'fr' | 'ar' | 'en', Copy> = {
  fr: {
    langContinue: 'Continuer',
    signup: 'Créer un compte',
    login: 'Se connecter',
    guest: 'Continuer en invité →',
    privacyLink: 'Politique de Confidentialité',
    termsTab: 'CGU',
    medicalDisclaimer: /AVERTISSEMENT MÉDICAL/,
    createMyAccount: 'Créer mon compte',
    emailRequired: "L'email est requis",
    invalidEmail: 'Email invalide',
    pwLength: 'Au moins 10 caractères',
    pwUpper: 'Au moins 1 majuscule',
    pwMismatch: 'Les mots de passe ne correspondent pas',
    emailInUse: 'Cet email est déjà utilisé',
    badCredentials: 'Email ou mot de passe incorrect',
    tooMany: /Trop de tentatives/,
    forgot: 'Mot de passe oublié ?',
    forgotEmpty: /Veuillez (entrer|saisir) votre email/,
    resetSent: /Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé/,
    pregnant: 'Je suis enceinte',
    stepper: (n) => `Étape ${n} sur 4`,
    methodDdr: '📆 Dernières règles',
    onbContinue: 'Continuer',
    onbBackA11y: 'Étape précédente',
    firstNameLabel: 'Votre prénom (optionnel)',
    firstPregYes: "Oui, c'est tout nouveau ! 🌟",
    medicalTitle: 'Votre médecin vous a-t-il signalé quelque chose ?',
    hypertension: 'Hypertension de la grossesse',
    countries: { tunisia: 'Tunisie', france: 'France', belgium: 'Belgique', morocco: 'Maroc', algeria: 'Algérie', switzerland: 'Suisse', canada: 'Canada', usa: 'États-Unis', uk: 'Royaume-Uni', other: 'Autre pays (112, international)' },
    step4Start: 'Créer mon compte & Démarrer',
    step4Finalize: 'Finaliser mon profil',
    step4Skip: 'Continuer sans compte',
    sa31plus0: 'Soit 31 SA + 0 jour',
    weekLabel32: 'Semaine 32',
    invalidDate: 'Plus de 42 semaines depuis cette date : vérifiez la date saisie.',
    postTermNote: /la date prévue d'accouchement est passée/,
    countryHint: /Obligatoire : sert à afficher le bon numéro d'urgence/,
    headerBack: 'Retour',
    emergencyFallbackNote: "112 est le numéro d'urgence international.",
    existingProfileTitle: 'Ce compte a déjà un profil',
    week: 'Semaine',
    trimester3: '3ème Trimestre',
    completeProfileCta: 'Compléter mon profil',
    titles: {
      language: `Choisir la langue · ${BRAND}`,
      authChoice: `Commençons · ${BRAND}`,
      register: `Créer un compte · ${BRAND}`,
      login: `Se connecter · ${BRAND}`,
      onboarding: `Bienvenue · ${BRAND}`,
      home: `Accueil · ${BRAND}`,
      privacy: `Mentions Légales · ${BRAND}`,
    },
  },
  ar: {
    langContinue: 'متابعة',
    signup: 'إنشاء حساب',
    login: 'تسجيل الدخول',
    guest: 'المتابعة كضيف ←',
    privacyLink: 'سياسة الخصوصية',
    termsTab: 'الشروط',
    medicalDisclaimer: /تنبيه طبي/,
    createMyAccount: 'إنشاء حسابي',
    emailRequired: 'البريد الإلكتروني مطلوب',
    invalidEmail: 'بريد إلكتروني غير صالح',
    pwLength: '10 أحرف على الأقل',
    pwUpper: 'حرف كبير واحد على الأقل',
    pwMismatch: 'كلمات المرور غير متطابقة',
    emailInUse: 'عنوان البريد الإلكتروني هذا مستخدم بالفعل',
    badCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    tooMany: /محاولات كثيرة جداً/,
    forgot: 'هل نسيت كلمة المرور؟',
    forgotEmpty: /يرجى إدخال بريدك الإلكتروني/,
    resetSent: /فقد أُرسل رابط لإعادة التعيين/,
    pregnant: 'أنا حامل',
    stepper: (n) => `الخطوة ${n} من 4`,
    methodDdr: '📆 آخر دورة',
    onbContinue: 'متابعة',
    onbBackA11y: 'الخطوة السابقة',
    firstNameLabel: 'اسمك الأول (اختياري)',
    firstPregYes: 'نعم، تجربة جديدة! 🌟',
    medicalTitle: 'هل ذكر لكِ طبيبكِ أمرًا معيّنًا؟',
    hypertension: 'ارتفاع ضغط الدم أثناء الحمل',
    countries: { tunisia: 'تونس', france: 'فرنسا', belgium: 'بلجيكا', morocco: 'المغرب', algeria: 'الجزائر', switzerland: 'سويسرا', canada: 'كندا', usa: 'الولايات المتحدة', uk: 'المملكة المتحدة', other: 'بلد آخر (112، دولي)' },
    step4Start: 'إنشاء حسابي والبدء',
    step4Finalize: 'إكمال الملف الشخصي',
    step4Skip: 'المتابعة كضيف',
    sa31plus0: 'أي 31 أسبوعًا + 0 يوم',
    weekLabel32: 'الأسبوع 32',
    invalidDate: 'مرّ أكثر من 42 أسبوعًا على هذا التاريخ. يرجى التحقق منه.',
    postTermNote: /لقد تجاوزتِ موعد الولادة المتوقع/,
    countryHint: /إجباري: يُستخدم لعرض رقم الطوارئ الصحيح/,
    headerBack: 'رجوع',
    emergencyFallbackNote: '112 هو رقم الطوارئ الدولي.',
    existingProfileTitle: 'هذا الحساب لديه ملف بالفعل',
    week: 'الأسبوع',
    trimester3: 'الثلث الثالث',
    completeProfileCta: 'أكملي ملفي الشخصي',
    titles: {
      language: `اختر اللغة · ${BRAND}`,
      authChoice: `هيا نبدأ · ${BRAND}`,
      register: `إنشاء حساب · ${BRAND}`,
      login: `تسجيل الدخول · ${BRAND}`,
      onboarding: `أهلاً · ${BRAND}`,
      home: `الرئيسية · ${BRAND}`,
      privacy: `الإشعار القانوني · ${BRAND}`,
    },
  },
  en: {
    langContinue: 'Continue',
    signup: 'Create account',
    login: 'Sign in',
    guest: 'Continue as guest →',
    privacyLink: 'Privacy Policy',
    termsTab: 'Terms',
    medicalDisclaimer: /MEDICAL/i,
    createMyAccount: 'Create my account',
    emailRequired: 'Email is required',
    invalidEmail: 'Invalid email',
    pwLength: 'At least 10 characters',
    pwUpper: 'At least 1 uppercase letter',
    pwMismatch: 'Passwords do not match',
    emailInUse: '',
    badCredentials: '',
    tooMany: /Too many attempts/,
    forgot: 'Forgot password?',
    forgotEmpty: /Please enter your email/,
    resetSent: /If an account exists for this email, a reset link has been sent/,
    pregnant: 'I am pregnant',
    stepper: (n) => `Step ${n} of 4`,
    methodDdr: '',
    onbContinue: 'Continue',
    onbBackA11y: 'Previous step',
    firstNameLabel: 'Your first name (optional)',
    firstPregYes: "Yes, it's all new! 🌟",
    medicalTitle: '',
    hypertension: '',
    countries: { tunisia: 'Tunisia', france: 'France', belgium: 'Belgium', morocco: 'Morocco', algeria: 'Algeria', switzerland: 'Switzerland', canada: 'Canada', usa: 'United States', uk: 'United Kingdom', other: 'Other country (112, international)' },
    step4Start: '',
    step4Finalize: '',
    step4Skip: '',
    sa31plus0: 'That is 31 weeks + 0 days',
    weekLabel32: 'Week 32',
    invalidDate: 'More than 42 weeks since this date. Please check it.',
    postTermNote: /your due date has passed/,
    countryHint: /Required: used to show the right emergency number/,
    headerBack: 'Back',
    emergencyFallbackNote: '112 is the international emergency number.',
    existingProfileTitle: 'This account already has a profile',
    week: 'Week',
    trimester3: '',
    completeProfileCta: '',
    titles: { language: '', authChoice: `Let's start · ${BRAND}`, register: '', login: '', onboarding: '', home: '', privacy: '' },
  },
};

/** French strings that must never leak into the Arabic UI (Latin fallback). */
const FR_LEAK = /Créer un compte|Se connecter|Continuer|Email invalide|L'email est requis|Mot de passe|Semaine|Étape/;

// ── Quartet + console plumbing ────────────────────────────────────────────────

function quartetDirs(testInfo: TestInfo): string[] {
  const dirs = [process.env.E2E_QUARTET_DIR, process.env.E2E_QUARTET_DIR2].filter((d): d is string => !!d);
  return dirs.length ? dirs : [testInfo.outputPath('quartet')];
}

/** Console errors that are the EXPECTED transport of a deliberate auth failure (emulator 400). */
const AUTH_400 = /Failed to load resource: the server responded with a status of 400/;
/**
 * The app's own `log.error` for a deliberate, user-caused auth failure (wrong password,
 * unknown user, email in use). These are now logged at warn (silent in production) —
 * A-006 — so the tolerance is OFF by default in every state; a snap may still opt in.
 */
const APP_AUTH_FAILURE_LOG =
  /\[(AuthContext|LoginScreen|RegisterScreen)\].*(Login|Registration) error: FirebaseError: Firebase: Error \(auth\/(wrong-password|user-not-found|invalid-credential|email-already-in-use)\)/;

type Rig = {
  page: Page;
  strict: string[];
  dialogs: DialogRecorder;
  snap: (name: string, opts?: { allowAuth400?: boolean; allowAppAuthLog?: boolean; checkConsole?: boolean }) => Promise<void>;
  note: (name: string, data: unknown) => void;
  dispose: () => void;
};

const NOTES: Record<string, unknown> = {};

function rig(page: Page, testInfo: TestInfo): Rig {
  const dirs = quartetDirs(testInfo);
  const strict = attachConsoleStrict(page);
  const mega = attachMegaAuditRecorder(page, dirs);
  const dialogs = attachDialogRecorder(page, mega);
  let cursor = 0;
  return {
    page,
    strict,
    dialogs,
    note: (name, data) => {
      NOTES[name] = data;
      for (const d of dirs) {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, `${name}.notes.json`), JSON.stringify(data, null, 2));
      }
      testInfo.annotations.push({ type: name, description: JSON.stringify(data).slice(0, 900) });
    },
    snap: async (name, opts = {}) => {
      const { allowAuth400 = false, allowAppAuthLog = false, checkConsole = true } = opts;
      // Raw-key / blank check (soft: app behaviour).
      const body = (await page.locator('body').innerText().catch(() => '')) || '';
      expect.soft(body.trim().length, `${name}: screen must not be blank`).toBeGreaterThan(0);
      const leak = body.split('\n').find((l) => RAW_KEY.test(l));
      expect.soft(leak, `${name}: raw i18n key leaked → "${leak}"`).toBeFalsy();
      // A-012: capture after fade-ins have finished, not at 10-30 % opacity.
      await settleVisuals(page);
      await mega.snap(name);
      const fresh = strict.slice(cursor);
      cursor = strict.length;
      if (checkConsole) {
        const offending = fresh.filter(
          (e) => !(allowAuth400 && AUTH_400.test(e)) && !(allowAppAuthLog && APP_AUTH_FAILURE_LOG.test(e)),
        );
        expect.soft(offending, `${name}: strict console errors: ${offending.join(' | ')}`).toEqual([]);
      }
    },
    dispose: () => {
      mega.dispose();
      dialogs.dispose();
    },
  };
}

/**
 * A-012: Playwright "visible" ignores opacity, so Home was captured at the start of
 * its fade-in (ancestor opacity ≈ 0.1). Wait until the opacity of every element that
 * carries one inline (RN-web Animated writes it there) is stable across two samples
 * 250 ms apart, up to 4 s. Stable-not-1 on purpose: a disabled button's 0.5 is design.
 */
async function settleVisuals(page: Page, timeoutMs = 4_000) {
  const sample = () =>
    page
      .evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[style*="opacity"]'))
          .map((el) => getComputedStyle(el).opacity)
          .join(','),
      )
      .catch(() => '');
  const t0 = Date.now();
  let prev = await sample();
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(250);
    const next = await sample();
    if (next === prev) return;
    prev = next;
  }
}

/**
 * A-013: the "language updated" toast (3 s, global overlay) followed the user across
 * the next 2-4 screens and hid the top band in half of the captures. It hides on tap.
 */
async function dismissLanguageToast(page: Page) {
  const toast = page.getByText(/Langue mise à jour|تم تحديث اللغة|Language updated/).first();
  if (await toast.isVisible().catch(() => false)) {
    await toast.click().catch(() => {});
    await toast.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

// ── Small server helpers (spec-local, pure REST like the harness) ─────────────

async function uidForEmail(email: string): Promise<string | null> {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ email: [email] }),
  });
  if (!res.ok) return null;
  const body: any = await res.json();
  return body.users?.[0]?.localId ?? null;
}

async function pollServerDoc(docPath: string, until: (d: Record<string, unknown> | null) => boolean, ms = 15_000) {
  const t0 = Date.now();
  let d = await serverDoc(docPath);
  while (!until(d) && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 750));
    d = await serverDoc(docPath);
  }
  return d;
}

async function localProfile(page: Page): Promise<any> {
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('user_profile') || 'null');
    } catch {
      return null;
    }
  });
}

const ymd = (iso: string) => iso.slice(0, 10);
const lmpWeek = (w: number) => ymd(lmpIsoForWeek(w));
const lmpDaysAgo = (days: number) => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return ymd(d.toISOString());
};
/** A-010: 43+0 SA — beyond 42+0, the one range onboarding must refuse. */
const lmp43wAgo = () => lmpDaysAgo(43 * 7);
/** A-010: 40+3 SA — past the due date, still a pregnancy: accepted, with a post-term note. */
const lmp40w3dAgo = () => lmpDaysAgo(40 * 7 + 3);

// ── UI helpers ────────────────────────────────────────────────────────────────

async function htmlDirLang(page: Page) {
  return page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
}

/** Cold start on /welcome, pick a language card, wait for its ✓. */
async function pickLanguage(page: Page, code: AppLocale) {
  await page.goto('/welcome', { waitUntil: 'load' });
  const card = page.getByTestId(`lang_card_${code}`);
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();
  await expect(card.getByText('✓')).toBeVisible({ timeout: 10_000 });
  await dismissLanguageToast(page);
}

function langContinue(page: Page, c: Copy) {
  return page.getByText(c.langContinue, { exact: true }).last();
}

async function toAuthChoice(page: Page, code: 'fr' | 'ar' | 'en') {
  await pickLanguage(page, code);
  await langContinue(page, COPY[code]).dispatchEvent('click');
  await expect(page.getByTestId('auth_signup_button')).toBeVisible({ timeout: 20_000 });
}

/**
 * Interactive elements whose vertical centre sits in the top band (stack header +
 * the in-body absolute back button at top:54 inside the scroll view). Nested
 * matches are collapsed so one control counts once.
 */
async function topBandControls(page: Page, band = 200) {
  return page.evaluate((maxY) => {
    const sel = '[role="button"], [role="link"], a[href], button';
    const all = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.top + r.height / 2 < maxY && r.bottom > 0;
    });
    // The language toast (role=button, tap-to-dismiss) can still be on screen from
    // /welcome — it is not a back affordance; excluded and reported separately.
    const TOAST = /Langue mise à jour|تم تحديث اللغة|Language updated/;
    const top = all
      .filter((el) => !all.some((o) => o !== el && o.contains(el)))
      .filter((el) => !TOAST.test(el.innerText || ''));
    return top.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label') || (el.innerText || '').trim().slice(0, 40),
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        inHeader: !!el.closest('header, [role="banner"]') || r.top < 64,
      };
    });
  }, band);
}

/** Header back glyph horizontal mirroring (RTL must point right). */
async function headerBackTransform(page: Page) {
  return page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll<HTMLElement>('[role="button"], a[href], [role="link"]')).filter(
      (el) => el.getBoundingClientRect().top < 64 && el.getBoundingClientRect().height > 0,
    );
    const el = cands[0];
    if (!el) return null;
    const img = el.querySelector('img') as HTMLElement | null;
    const target = img || el;
    let node: HTMLElement | null = target;
    const transforms: string[] = [];
    while (node && node !== el.parentElement) {
      const t = getComputedStyle(node).transform;
      if (t && t !== 'none') transforms.push(t);
      node = node.parentElement;
    }
    return { label: el.getAttribute('aria-label'), x: Math.round(el.getBoundingClientRect().left), transforms };
  });
}

/**
 * The number the ContractionTimer call row dials — the user-visible end of the
 * emergency-number contract (profile country → device region → 112).
 */
async function contractionEmergencyNumber(page: Page): Promise<string | null> {
  await page.goto('/contraction-timer', { waitUntil: 'load' });
  // "(15)" for a known country, "(112, international)" for the fallback (A-008).
  const row = page.getByText(/📞.*\(\d+/).first();
  const ok = await row.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false);
  if (!ok) return null;
  const txt = (await row.innerText()).trim();
  return txt.match(/\((\d+)/)?.[1] ?? null;
}

/**
 * A-011: the contraction timer's compact EmptyState collapsed to its padding on web and
 * its text ran under the emergency call row. Returns how far (px) any text that comes
 * BEFORE the call row in the document reaches below the row's top edge (≤ 1 is clean).
 */
async function callRowOverlap(page: Page): Promise<{ overlapPx: number; culprit: string | null }> {
  return page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll<HTMLElement>('div[dir], span')).filter(
      (el) => el.children.length === 0 && (el.innerText || '').trim().length > 0,
    );
    const call = leaves.find((el) => (el.innerText || '').includes('📞'));
    if (!call) return { overlapPx: 0, culprit: null };
    const top = call.getBoundingClientRect().top;
    let worst = 0;
    let culprit: string | null = null;
    for (const el of leaves) {
      if (el === call) continue;
      if (!(el.compareDocumentPosition(call) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      const over = r.bottom - top;
      if (over > worst) {
        worst = over;
        culprit = (el.innerText || '').trim().slice(0, 60);
      }
    }
    return { overlapPx: Math.round(worst), culprit };
  });
}

async function registerViaUi(page: Page, email: string, pw: string, confirm = pw) {
  await page.getByTestId('register_email_input').fill(email);
  await page.getByTestId('register_password_input').fill(pw);
  await page.getByTestId('register_confirm_input').fill(confirm);
  await page.getByTestId('register_submit_button').click();
}

/** Drive onboarding steps 1-3 (pregnant, LMP = week 32, personalization). Snaps each step. */
async function onboardingSteps1to3(
  r: Rig,
  c: Copy,
  prefix: string,
  opts: {
    firstName: string;
    age: string;
    tickHypertension: boolean;
    tryInvalidDate: boolean;
    /** Country to tap when none is pre-selected (A-008: the question is required). Default 'other'. */
    country?: string;
    /** A signed-in account finishing its profile: step 4 has no account fields and no "without account" link. */
    signedIn?: boolean;
  },
) {
  const page = r.page;
  // Step 1
  const pregnant = page.getByRole('button', { name: c.pregnant, exact: true });
  await expect(pregnant).toBeVisible({ timeout: 30_000 });
  await expect.soft(page.getByText(c.stepper(1), { exact: true }), `${prefix} step1: stepper`).toBeVisible();
  await r.snap(`${prefix}-step1`);
  await pregnant.click();

  // Step 2 (auto-advance after 220 ms)
  const dateInput = page.locator('input[type="date"]');
  await expect(dateInput).toBeVisible({ timeout: 15_000 });
  await expect.soft(page.getByText(c.stepper(2), { exact: true }), `${prefix} step2: stepper`).toBeVisible();
  const cont = page.getByRole('button', { name: c.onbContinue, exact: true });
  if (opts.tryInvalidDate) {
    // A-010: beyond 42+0 is refused with a specific message …
    await dateInput.fill(lmp43wAgo());
    await expect.soft(cont, `${prefix} step2: Continue must be disabled for LMP today−43w (> 42+0)`).toBeDisabled();
    await expect.soft(page.getByText(c.invalidDate, { exact: true }), `${prefix} step2: > 42 w message`).toBeVisible();
    await r.snap(`${prefix}-step2-invalid-43w`);
    // … while 40+3 (past the due date) is a pregnancy: accepted, with a gentle note.
    await dateInput.fill(lmp40w3dAgo());
    await expect.soft(cont, `${prefix} step2: Continue enabled for LMP today−40w3d (post-term)`).toBeEnabled();
    await expect.soft(page.getByTestId('onboarding_postterm_note'), `${prefix} step2: post-term note`).toContainText(c.postTermNote);
    await r.snap(`${prefix}-step2-postterm-40w3d`);
  }
  await dateInput.fill(lmpWeek(32));
  await expect.soft(dateInput).toHaveValue(lmpWeek(32));
  // A-021d / A-009: exact texts, not a "32" substring. LMP = today − 31 w exactly.
  await expect.soft(page.getByText(c.weekLabel32, { exact: true }).first(), `${prefix} step2: preview "${c.weekLabel32}"`).toBeVisible();
  await expect.soft(page.getByText(c.sa31plus0, { exact: true }), `${prefix} step2: "${c.sa31plus0}" (completed days, pluralised)`).toBeVisible();
  await expect.soft(cont, `${prefix} step2: Continue enabled for today−31w`).toBeEnabled();
  await r.snap(`${prefix}-step2`);
  await cont.click();

  // Step 3
  const firstName = page.getByRole('textbox', { name: c.firstNameLabel });
  await expect(firstName).toBeVisible({ timeout: 15_000 });
  await expect.soft(page.getByText(c.stepper(3), { exact: true }), `${prefix} step3: stepper`).toBeVisible();
  // Which country is PRE-selected (derived from the device locale, OnboardingScreen.tsx:129-151)?
  // RN-web does not expose accessibilityState.selected as aria-selected on these
  // buttons, so the pre-selection is read from the selected style (the one country
  // whose border/background differs from the others).
  const countrySel = await page.evaluate((labels: Record<string, string>) => {
    const styles: Record<string, string> = {};
    for (const [k, lbl] of Object.entries(labels)) {
      const el = Array.from(document.querySelectorAll<HTMLElement>('[role="button"]')).find((e) => e.getAttribute('aria-label') === lbl);
      if (!el) {
        styles[k] = 'absent';
        continue;
      }
      const cs = getComputedStyle(el);
      styles[k] = `${cs.backgroundColor}|${cs.borderTopColor}`;
      styles[`${k}:aria-selected`] = String(el.getAttribute('aria-selected'));
    }
    const vals = Object.entries(styles).filter(([k, v]) => !k.includes(':') && v !== 'absent').map(([, v]) => v);
    const counts = vals.reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] || 0) + 1), a), {});
    const selected = Object.entries(styles)
      .filter(([k, v]) => !k.includes(':') && v !== 'absent' && counts[v] === 1 && vals.length > 2)
      .map(([k]) => k);
    return { selected, styles };
  }, c.countries);
  const allCountryButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="button"][aria-selected]')).map((e) => ({
      label: e.getAttribute('aria-label'),
      selected: e.getAttribute('aria-selected'),
    })),
  );
  const navLang = await page.evaluate(() => ({ language: navigator.language, languages: navigator.languages }));
  const pressed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="button"][aria-pressed="true"]')).map((e) => e.getAttribute('aria-label')),
  );
  r.note(`${prefix}-step3-country-derivation`, { navLang, countrySel, allSelectable: allCountryButtons, pressed });
  // A-008: the hint says why the country matters, and Continue waits for an answer.
  await expect.soft(page.getByTestId('onboarding_country_hint'), `${prefix} step3: country hint`).toContainText(c.countryHint);
  const step3Continue = page.getByTestId('onboarding_step3_continue');
  if (countrySel.selected.length === 0) {
    await expect.soft(step3Continue, `${prefix} step3: Continue disabled until a country is chosen`).toBeDisabled();
    await r.snap(`${prefix}-step3-country-required`);
    const pick = opts.country ?? 'other';
    await page.getByRole('button', { name: c.countries[pick], exact: true }).click();
    await expect.soft(page.getByRole('button', { name: c.countries[pick], exact: true }), `${prefix} step3: chosen country is aria-pressed`).toHaveAttribute('aria-pressed', 'true');
  }
  await expect.soft(step3Continue, `${prefix} step3: Continue enabled once a country is set`).toBeEnabled();
  await firstName.fill(opts.firstName);
  await page.getByRole('button', { name: opts.age, exact: true }).click();
  await page.getByRole('button', { name: c.firstPregYes, exact: true }).click();
  if (opts.tickHypertension) {
    await page.getByRole('button', { name: c.medicalTitle }).click();
    const hyp = page.getByRole('checkbox', { name: c.hypertension });
    await expect(hyp).toBeVisible({ timeout: 5_000 });
    await hyp.click();
    await expect.soft(hyp).toHaveAttribute('aria-checked', 'true');
  }
  await r.snap(`${prefix}-step3`);
  await page.getByRole('button', { name: c.onbContinue, exact: true }).last().click();

  // Step 4
  await expect(page.getByTestId('onboarding_step4_submit')).toBeVisible({ timeout: 15_000 });
  if (opts.signedIn) {
    // "Continuer sans compte" was offered to a user who already has an account.
    await expect.soft(page.getByTestId('onboarding_step4_skip'), `${prefix} step4: no "without account" link when signed in`).toHaveCount(0);
    await expect.soft(page.getByTestId('onboarding_step4_submit'), `${prefix} step4: finalize label`).toContainText(c.step4Finalize);
  } else {
    await expect(page.getByTestId('onboarding_step4_skip')).toBeVisible({ timeout: 15_000 });
  }
  await expect
    .soft(page.getByText(/(Étape|Step|الخطوة) \d/), `${prefix} step4: stepper must be hidden on the last step`)
    .toHaveCount(0);
  return { countrySel, navLang };
}

async function waitForLanding(page: Page, c: Copy) {
  const tablist = page.getByRole('tablist').first();
  const step1 = page.getByRole('button', { name: c.pregnant, exact: true });
  await expect(tablist.or(step1).first()).toBeVisible({ timeout: 45_000 });
  // Give a racing navigate('Onboarding') a moment to land before we decide.
  await page.waitForTimeout(1500);
  const onOnboarding = await step1.isVisible().catch(() => false);
  const onTabs = await tablist.isVisible().catch(() => false);
  return { onOnboarding, onTabs, url: page.url() };
}

// ═════════════════════════════════════════════════════════════════════════════
// fr — cold funnel display (01-04, 22)
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Wave A — fr', () => {
  test.use(waveUse('fr'));
  test.describe.configure({ timeout: WAVE_TIMEOUT });

  test('A-fr cold funnel: language, fold, AuthChoice, privacy/terms', async ({ page }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.fr;

    // 01 — Language (fresh): 4 cards, ltr.
    await page.goto('/welcome', { waitUntil: 'load' });
    for (const code of ['fr', 'ar', 'tn', 'en']) {
      await expect(page.getByTestId(`lang_card_${code}`)).toBeVisible({ timeout: 60_000 });
    }
    const dl = await htmlDirLang(page);
    expect.soft(dl.dir, '01: html[dir]').toBe('ltr');
    r.note('01-language-fr-html', { ...dl, title: await page.title() });
    await r.snap('01-language-fr');

    // 02 — GJ-006: Continue visible without scrolling at 390×844.
    await page.getByTestId('lang_card_fr').click();
    await expect(page.getByTestId('lang_card_fr').getByText('✓')).toBeVisible({ timeout: 10_000 });
    await dismissLanguageToast(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await langContinue(page, c).boundingBox();
    const scrollInfo = await page.evaluate(() => ({ scrollY: window.scrollY, docH: document.documentElement.scrollHeight }));
    r.note('02-language-continue-fold', { continueTextBox: box, viewportH: 844, ...scrollInfo });
    expect(box, '02: Continue text must be laid out').not.toBeNull();
    expect.soft(box!.y + box!.height, '02 GJ-006: Continue must sit within the 844 px fold (no scroll)').toBeLessThanOrEqual(844);
    expect.soft(await page.title(), '22: /welcome document.title').toBe(c.titles.language);
    await r.snap('02-language-continue-fold');

    // 03 — AuthChoice.
    await langContinue(page, c).dispatchEvent('click');
    const guest = page.getByTestId('auth_guest_button');
    await expect(guest).toBeVisible({ timeout: 20_000 });
    await expect.soft(page.getByTestId('auth_signup_button')).toContainText(c.signup);
    await expect.soft(page.getByTestId('auth_login_button')).toContainText(c.login);
    await expect.soft(guest).toContainText(c.guest);
    const privacy = page.getByRole('link', { name: c.privacyLink });
    await expect.soft(privacy).toBeVisible();
    const toast = page.getByRole('status');
    let overlap = false;
    if ((await toast.count()) > 0 && (await toast.first().isVisible().catch(() => false))) {
      const g = await guest.boundingBox();
      const t = await toast.first().boundingBox();
      if (g && t) overlap = !(g.y + g.height <= t.y || t.y + t.height <= g.y || g.x + g.width <= t.x || t.x + t.width <= g.x);
    }
    expect.soft(overlap, '03: language toast must not cover the guest CTA').toBe(false);
    expect.soft(await page.title(), '22: AuthChoice document.title').toBe(c.titles.authChoice);
    await r.snap('03-authchoice-fr');

    // 04 — Privacy from AuthChoice → Terms tab → medical disclaimer → back.
    await privacy.click();
    await expect(page.getByText(c.termsTab, { exact: true })).toBeVisible({ timeout: 15_000 });
    expect.soft(await page.title(), '22: Privacy document.title').toBe(c.titles.privacy);
    await r.snap('04a-privacy-tab');
    await expect.soft(page.getByText(c.medicalDisclaimer), '04: disclaimer is Terms-only').toHaveCount(0);
    await page.getByText(c.termsTab, { exact: true }).click();
    await expect.soft(page.getByText(c.medicalDisclaimer).first(), '04: Terms tab shows AVERTISSEMENT MÉDICAL').toBeVisible();
    await r.snap('04b-privacy-terms-tab');
    // A-021c: the in-app header back, not the browser's history back.
    await page.getByRole('button', { name: c.headerBack, exact: true }).first().click();
    await expect.soft(page.getByTestId('auth_guest_button'), '04: header back returns to AuthChoice').toBeVisible({ timeout: 15_000 });
    await r.snap('04c-privacy-back-to-authchoice');
    r.dispose();
  });

  // ─── Register display + validation (05-10) ─────────────────────────────────
  test('A-fr register: display (GJ-008) + validation errors + email in use', async ({ page }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.fr;
    await toAuthChoice(page, 'fr');
    await page.getByTestId('auth_signup_button').click();
    await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 15_000 });

    // 05 — exactly one back affordance.
    const band = await topBandControls(page);
    r.note('05-register-top-band-controls', band);
    expect.soft(band.length, `05 GJ-008: Register must expose exactly ONE back affordance, got ${JSON.stringify(band)}`).toBe(1);
    expect
      .soft(band.find((b) => b.inHeader)?.label ?? '', '05: header back aria-label must be localized, not the raw route name')
      .not.toMatch(/AuthChoice|, back$/);
    expect.soft(await page.title(), '22: Register document.title').toBe(c.titles.register);
    await r.snap('05-register-display');

    // 06 — empty submit.
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.emailRequired);
    await expect.soft(page.getByRole('alert').first()).toContainText('⚠️');
    await r.snap('06-register-empty-submit');

    // 07 — invalid email.
    await page.getByTestId('register_email_input').fill('not-an-email');
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.invalidEmail);
    await r.snap('07-register-invalid-email');

    // 08 — weak password: too short, then no uppercase.
    await page.getByTestId('register_email_input').fill('valid.user@e2e.test');
    await page.getByTestId('register_password_input').fill('abc1');
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.pwLength);
    await r.snap('08a-register-weak-password-length');
    await page.getByTestId('register_password_input').fill('abcdefghij1');
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.pwUpper);
    await r.snap('08b-register-weak-password-upper');

    // 09 — mismatch.
    await page.getByTestId('register_password_input').fill(E2E_PASSWORD);
    await page.getByTestId('register_confirm_input').fill(E2E_PASSWORD + 'x');
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.pwMismatch);
    await r.snap('09-register-mismatch');

    // 10 — email already in use (pre-created over REST).
    const taken = newAccountEmail('A', 'fr-inuse');
    await createAccount(taken, E2E_PASSWORD);
    await registerViaUi(page, taken, E2E_PASSWORD);
    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect.soft(alert).toContainText(c.emailInUse);
    await expect.soft(alert, '10: no raw auth/ code').not.toContainText('auth/');
    await expect.soft(page.getByTestId('register_email_input'), '10: still on Register').toBeVisible();
    await r.snap('10-register-email-in-use', { allowAuth400: true });
    r.dispose();
  });

  // ─── HYP-A1 — register success landing (11) — 2 runs in fr ────────────────
  for (const run of [1, 2]) {
    test(`A-fr register success → landing (HYP-A1, run ${run})`, async ({ page, browser }, testInfo) => {
      const r = rig(page, testInfo);
      const c = COPY.fr;
      await toAuthChoice(page, 'fr');
      await page.getByTestId('auth_signup_button').click();
      await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 15_000 });
      const email = newAccountEmail('A', `fr-register-${run}`);
      await registerViaUi(page, email, E2E_PASSWORD);
      const landing = await waitForLanding(page, c);
      const uid = await uidForEmail(email);
      expect(uid, '11: Auth emulator must hold the new account').toBeTruthy();
      const ls = await localProfile(page);
      const docAtLanding = await serverDoc(`userProfiles/${uid}`);
      const homeEmpty = await page.getByText(c.completeProfileCta).first().isVisible().catch(() => false);
      const weekShown = await page.getByText(new RegExp(`^${c.week} \\d+$`)).first().isVisible().catch(() => false);
      r.note(`11-register-success-landing-fr-run${run}`, {
        email,
        uid,
        landing,
        title: await page.title(),
        localProfile: ls,
        serverUserProfile: docAtLanding,
        homeShowsCompleteProfile: homeEmpty,
        homeShowsWeek: weekShown,
      });
      expect.soft(landing.onOnboarding, `11 HYP-A1: a new registrant must land on Onboarding step 1 (landed: ${JSON.stringify(landing)})`).toBe(true);
      await r.snap(`11-register-success-landing-fr-run${run}`);

      if (landing.onOnboarding) {
        // 12 via Register — finish onboarding as the signed-in user.
        await onboardingSteps1to3(r, c, `12r-fr-run${run}-onboarding`, { firstName: 'Registrante', age: '25-29', tickHypertension: false, tryInvalidDate: false, signedIn: true });
        await r.snap(`12r-fr-run${run}-onboarding-step4`);
        await page.getByTestId('onboarding_step4_submit').click();
        await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
      } else {
        // Record the stranded state: does Home offer any way to give an LMP?
        await expect.soft(page.getByText(c.completeProfileCta).first(), '11: stranded Home must at least offer "Compléter mon profil"').toBeVisible();
      }

      // Server truth: every created account must end with a userProfiles doc carrying lmp.
      const doc = await pollServerDoc(`userProfiles/${uid}`, (d) => !!d?.lmp, landing.onOnboarding ? 15_000 : 5_000);
      r.note(`11-register-server-truth-fr-run${run}`, { uid, doc });
      expect.soft(doc?.lmp, `11 HYP-A1 server truth: userProfiles/${uid}.lmp must exist after signup`).toBeTruthy();

      // Fresh context: what does a returning device see?
      const fresh = await freshLogin(browser, email, 'fr');
      const fr = rig(fresh, testInfo);
      // isVisible() does not wait (its timeout is ignored) — it raced Home's first render.
      const freshWeek = await fresh
        .getByText(`${c.week} 32`, { exact: true })
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => true, () => false);
      const freshEmpty = await fresh.getByText(c.completeProfileCta).first().isVisible().catch(() => false);
      r.note(`11-register-fresh-context-fr-run${run}`, { freshWeek, freshEmpty, localProfile: await localProfile(fresh) });
      if (landing.onOnboarding) expect.soft(freshWeek, '11: fresh context shows Semaine 32').toBe(true);
      else expect.soft(freshEmpty, '11: a returning device must not be stranded on "Compléter mon profil" (no LMP on server)').toBe(false);
      await fr.snap(`11-register-fresh-context-fr-run${run}`);
      if (run === 1) {
        // The register path now runs onboarding: fr-FR device → France pre-selected → 15.
        const num = await contractionEmergencyNumber(fresh);
        const overlap = await callRowOverlap(fresh);
        r.note('11-register-contraction-emergency-number-fr', { profileCountry: (await localProfile(fresh))?.country ?? null, number: num, overlap });
        expect.soft(num, '11: France → 15, never 190').toBe('15');
        await expect.soft(fresh.getByTestId('emergency_number_note'), '11: a profile country needs no fallback disclosure').toHaveCount(0);
        expect.soft(overlap.overlapPx, `11 A-011: nothing above the call row may run under it (${overlap.culprit})`).toBeLessThanOrEqual(1);
        await fr.snap('11-register-contraction-emergency-number-fr');
      }
      fr.dispose();
      await fresh.context().close();
      r.dispose();
    });
  }

  // ─── Onboarding via AuthChoice guest path + create account (12, 13) ────────
  test('A-fr onboarding steps 1-4 → create account → server truth → fresh context (12, 13)', async ({ page, browser }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.fr;
    await toAuthChoice(page, 'fr');
    await page.getByTestId('auth_guest_button').click();
    const { countrySel } = await onboardingSteps1to3(r, c, '12-fr-onboarding', {
      firstName: 'Amina',
      age: '30-34',
      tickHypertension: true,
      tryInvalidDate: true,
    });
    expect.soft(await page.title(), '22: Onboarding document.title').toBe(c.titles.onboarding);
    expect.soft(countrySel.selected, '12 step3: fr-FR device → "France" pre-selected (derived country)').toEqual(['france']);

    // A-015: the stack header back goes to the previous step and keeps the answers.
    await page.getByRole('button', { name: c.headerBack, exact: true }).first().click();
    const firstNameBox = page.getByRole('textbox', { name: c.firstNameLabel });
    await expect.soft(firstNameBox, '12 A-015: header back from step 4 → step 3').toBeVisible({ timeout: 10_000 });
    await expect.soft(firstNameBox, '12 A-015: answers survive the header back').toHaveValue('Amina');
    await r.snap('12-fr-onboarding-header-back-step3');
    await page.getByTestId('onboarding_step3_continue').click();
    await expect(page.getByTestId('onboarding_step4_submit')).toBeVisible({ timeout: 15_000 });

    // Step 4 — submit disabled until the password is valid.
    const email = newAccountEmail('A', 'fr-onboarding-create');
    const submit = page.getByTestId('onboarding_step4_submit');
    await expect.soft(submit, '12 step4: submit disabled while empty').toBeDisabled();
    await page.getByTestId('onboarding_step4_email').fill(email);
    await page.getByTestId('onboarding_step4_password').fill('weakpass1');
    await expect.soft(submit, '12 step4: submit disabled with a weak password').toBeDisabled();
    await page.getByTestId('onboarding_step4_password').fill(E2E_PASSWORD);
    await expect.soft(submit).toBeEnabled();
    await expect.soft(submit).toContainText(c.step4Start);
    await r.snap('12-fr-onboarding-step4');

    // 13 — create account.
    await submit.click();
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
    await expect.soft(page.getByText(`${c.week} 32`, { exact: true }).first(), '13: Home Semaine 32').toBeVisible({ timeout: 30_000 });
    await expect.soft(page.getByText(c.trimester3).first()).toBeVisible();
    expect.soft(await page.title(), '22: Home document.title').toBe(c.titles.home);
    await r.snap('13-onboarding-step4-create-account');

    const uid = await uidForEmail(email);
    expect(uid).toBeTruthy();
    const doc = await pollServerDoc(`userProfiles/${uid}`, (d) => !!d?.lmp);
    r.note('13-fr-server-userProfile', { uid, doc });
    expect.soft(doc, '13: server userProfiles doc exists').not.toBeNull();
    expect.soft(doc && ymd(String(doc.lmp)), '13: server lmp = today−31w').toBe(lmpWeek(32));
    expect.soft(doc?.firstName).toBe('Amina');
    expect.soft(doc?.ageRange).toBe('30-34');
    expect.soft(doc?.isFirstPregnancy).toBe(true);
    expect.soft(doc?.hasHypertension, '13: declared hypertension reached the server').toBe(true);
    expect.soft(doc?.country, '13: server country = the derived France for an fr-FR device').toBe('france');

    const fresh = await freshLogin(browser, email, 'fr');
    const fr = rig(fresh, testInfo);
    await expect.soft(fresh.getByText(`${c.week} 32`, { exact: true }).first(), '13: fresh context Semaine 32').toBeVisible({ timeout: 30_000 });
    await expect.soft(fresh.getByText(c.trimester3).first()).toBeVisible();
    await fr.snap('13-fresh-context-week32');
    fr.dispose();
    await fresh.context().close();
    r.dispose();
  });

  // ─── A-023: step-4 email of an EXISTING account — asked, never silently merged ──
  test('A-fr onboarding with an existing account email → asked; "keep" leaves the server profile (A-023)', async ({ page }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.fr;
    const email = newAccountEmail('A', 'fr-existing');
    const acct = await createAccount(email, E2E_PASSWORD);
    const seeded = await seedProfile(acct.uid, acct.idToken, { week: 20, firstName: 'Existante' });

    await toAuthChoice(page, 'fr');
    await page.getByTestId('auth_guest_button').click();
    await onboardingSteps1to3(r, c, '12x-fr-existing', { firstName: 'Nouvelle', age: '25-29', tickHypertension: false, tryInvalidDate: false });
    await page.getByTestId('onboarding_step4_email').fill(email);
    await page.getByTestId('onboarding_step4_password').fill(E2E_PASSWORD);
    // On web the question is a window.confirm: OK = replace, Cancel = keep. Keep.
    r.dialogs.next('dismiss');
    const asked = r.dialogs.waitForNext(45_000);
    await page.getByTestId('onboarding_step4_submit').click();
    const dialog = await asked.catch(() => null);
    r.note('12x-fr-existing-dialog', dialog);
    expect.soft(dialog?.message ?? '', 'A-023: the user is asked before her existing profile is touched').toContain(c.existingProfileTitle);
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
    await expect.soft(page.getByText(`${c.week} 20`, { exact: true }).first(), 'A-023: "keep" shows the existing week 20').toBeVisible({ timeout: 30_000 });
    await r.snap('12x-fr-existing-kept-home', { allowAuth400: true });
    const after = await serverDoc(`userProfiles/${acct.uid}`);
    r.note('12x-fr-existing-server-truth', { seededLmp: seeded.lmp, serverLmp: after?.lmp, firstName: after?.firstName });
    expect.soft(after?.lmp, 'A-023: "keep" must not change the server lmp').toBe(seeded.lmp);
    expect.soft(after?.firstName, 'A-023: "keep" must not change the server name').toBe('Existante');
    r.dispose();
  });

  // ─── Onboarding skip → anonymous guest (14) ─────────────────────────────────
  test('A-fr onboarding step4 skip → guest with a real anonymous uid (14)', async ({ page }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.fr;
    await toAuthChoice(page, 'fr');
    await page.getByTestId('auth_guest_button').click();
    await onboardingSteps1to3(r, c, '14-fr-guest', { firstName: 'Invitée', age: '25-29', tickHypertension: false, tryInvalidDate: false });
    const skip = page.getByTestId('onboarding_step4_skip');
    await expect.soft(skip).toHaveText(c.step4Skip);
    await skip.click();
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
    await expect.soft(page.getByText(`${c.week} 32`, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    const ls = await localProfile(page);
    const uid: string = ls?.uid ?? '';
    const exists = uid ? await authAccountExists(uid) : false;
    const doc = uid ? await serverDoc(`userProfiles/${uid}`) : null;
    r.note('14-guest-identity', { uid, isGuest: ls?.isGuest, anonymousAuthUserExists: exists, serverUserProfile: doc, country: ls?.country });
    expect.soft(uid.startsWith('guest_'), `14: guest uid must be a Firebase anonymous uid, not "${uid}"`).toBe(false);
    expect.soft(exists, '14: anonymous Auth user exists on the emulator').toBe(true);
    expect.soft(ls?.isGuest, '14: local profile is flagged guest').toBe(true);
    await r.snap('14-onboarding-step4-skip-guest');
    r.dispose();
  });

  // ─── Login (15-21) ──────────────────────────────────────────────────────────
  test('A-fr login: display, wrong pw, unknown user, rate limit, forgot pw, success (15-22)', async ({ page, browser }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.fr;
    const email = newAccountEmail('A', 'fr-login');
    const acct = await createAccount(email, E2E_PASSWORD);
    const seeded = await seedProfile(acct.uid, acct.idToken, { week: 32, firstName: 'Loginne' });

    await toAuthChoice(page, 'fr');
    await page.getByTestId('auth_login_button').click();
    await expect(page.getByTestId('login_email_input')).toBeVisible({ timeout: 15_000 });

    // 15 — display: one back affordance.
    const band = await topBandControls(page);
    r.note('15-login-top-band-controls', band);
    expect.soft(band.length, `15 GJ-008: Login must expose exactly ONE back affordance, got ${JSON.stringify(band)}`).toBe(1);
    expect.soft(await page.title(), '22: Login document.title').toBe(c.titles.login);
    await r.snap('15-login-display');

    // 16 — wrong password (attempt 1).
    await page.getByTestId('login_email_input').fill(email);
    await page.getByTestId('login_password_input').fill('Wrong-Passw0rd9');
    await page.getByTestId('login_submit_button').click();
    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect.soft(alert).toContainText(c.badCredentials);
    await expect.soft(alert).not.toContainText('auth/');
    await expect.soft(page.getByTestId('login_password_input'), '16: password field still editable').toBeEditable();
    await r.snap('16-login-wrong-password', { allowAuth400: true, allowAppAuthLog: false });

    // 17 — unknown user (attempt 2): identical message, no enumeration.
    await page.getByTestId('login_email_input').fill(newAccountEmail('A', 'fr-nobody'));
    await page.getByTestId('login_password_input').fill(E2E_PASSWORD);
    await page.getByTestId('login_submit_button').click();
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30_000 });
    await expect.soft(page.getByRole('alert').first()).toContainText(c.badCredentials);
    await r.snap('17-login-unknown-user', { allowAuth400: true });

    // 18 — attempts 3-5 wrong, 6th → rate limited, interpolated.
    await page.getByTestId('login_email_input').fill(email);
    for (let i = 3; i <= 5; i++) {
      await page.getByTestId('login_password_input').fill(`Wrong-Passw0rd${i}`);
      await page.getByTestId('login_submit_button').click();
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('login_submit_button')).toBeEnabled({ timeout: 30_000 });
    }
    await page.getByTestId('login_password_input').fill('Wrong-Passw0rd6');
    await page.getByTestId('login_submit_button').click();
    await expect.soft(page.getByRole('alert').first(), '18: 6th attempt → rate limited').toContainText(c.tooMany, { timeout: 15_000 });
    await expect.soft(page.getByRole('alert').first(), '18: {{minutes}} interpolated').not.toContainText('{{');
    await r.snap('18-login-rate-limit', { allowAuth400: true });

    // 19 — forgot password with an empty email.
    await page.getByTestId('login_email_input').fill('');
    await page.getByTestId('forgot_password_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.forgotEmpty);
    await r.snap('19-forgot-password-empty');

    // 20 — forgot password sent; observe the in-flight label (HYP-A2).
    await page.getByTestId('login_email_input').fill(email);
    await page.route('**/accounts:sendOobCode**', async (route) => {
      await new Promise((res) => setTimeout(res, 2500));
      await route.continue();
    });
    await page.getByTestId('forgot_password_button').click();
    await page.waitForTimeout(400);
    const sendingLabel = (await page.getByTestId('forgot_password_button').innerText().catch(() => '')).trim();
    r.note('20-forgot-password-inflight-label', { sendingLabel });
    await r.snap('20a-forgot-password-sending', { checkConsole: false });
    expect.soft(sendingLabel, '20 HYP-A2: in-flight label must be a localized word, not a bare "…"').not.toBe('…');
    await expect.soft(page.getByRole('alert').first()).toContainText(c.resetSent, { timeout: 20_000 });
    await expect.soft(page.getByRole('alert').first()).toContainText('✓');
    await r.snap('20b-forgot-password-sent');
    await page.unroute('**/accounts:sendOobCode**');

    // 20c — A-021e: an unknown email gets the SAME neutral answer (no "incorrect
    // password" in a reset form, no account-existence oracle).
    await page.getByTestId('login_email_input').fill(newAccountEmail('A', 'fr-reset-nobody'));
    await page.getByTestId('forgot_password_button').click();
    await expect.soft(page.getByRole('alert').first(), '20c: unknown email → neutral reset message').toContainText(c.resetSent, { timeout: 20_000 });
    await expect.soft(page.getByRole('alert').first(), '20c: never "incorrect" in a reset form').not.toContainText(c.badCredentials);
    await r.snap('20c-forgot-password-unknown-email', { allowAuth400: true });

    // 21 — login success in a fresh context (the limiter above is per-page memory).
    const fresh = await freshLogin(browser, email, 'fr');
    const fr = rig(fresh, testInfo);
    await expect.soft(fresh.getByText(`${c.week} 32`, { exact: true }).first(), '21: Home Semaine 32').toBeVisible({ timeout: 30_000 });
    await expect.soft(fresh.getByText(c.trimester3).first(), '21: 3ème Trimestre').toBeVisible();
    expect.soft(await fresh.title(), '22: Home document.title (not HomeMain)').toBe(c.titles.home);
    await fr.snap('21-login-success');
    const after = await serverDoc(`userProfiles/${acct.uid}`);
    r.note('21-login-server-truth', { seededLmp: seeded.lmp, serverLmp: after?.lmp, currentWeek: after?.currentWeek });
    expect.soft(after?.lmp, '21: login must not overwrite server lmp').toBe(seeded.lmp);
    fr.dispose();
    await fresh.context().close();
    r.dispose();
  });
});

async function freshLogin(browser: Browser, email: string, locale: AppLocale): Promise<Page> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, ...waveUse(locale), storageState: { cookies: [], origins: [] } });
  const p = await context.newPage();
  await uiLogin(p, email, E2E_PASSWORD, locale);
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
// ar — RTL repeat (23-30)
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Wave A — ar (RTL)', () => {
  test.use(waveUse('ar'));
  test.describe.configure({ timeout: WAVE_TIMEOUT });

  test('A-ar cold funnel + register display/validation (23-26)', async ({ page }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.ar;

    // 23 — Language in ar.
    await pickLanguage(page, 'ar');
    await expect(langContinue(page, c)).toBeAttached({ timeout: 10_000 });
    const dl = await htmlDirLang(page);
    expect.soft(dl, '23: html[dir=rtl][lang=ar]').toEqual({ dir: 'rtl', lang: 'ar' });
    const box = await langContinue(page, c).boundingBox();
    r.note('23-ar-language-continue-fold', { box, html: dl });
    expect.soft(box && box.y + box.height, '23 GJ-006 (ar font re-layout): Continue within 844 px').toBeLessThanOrEqual(844);
    expect.soft(await page.title(), '22-ar: /welcome title').toBe(c.titles.language);
    await r.snap('23-ar-language');

    // 24 — AuthChoice ar.
    await langContinue(page, c).dispatchEvent('click');
    await expect(page.getByTestId('auth_signup_button')).toBeVisible({ timeout: 20_000 });
    await expect.soft(page.getByTestId('auth_signup_button')).toContainText(c.signup);
    await expect.soft(page.getByTestId('auth_login_button')).toContainText(c.login);
    await expect.soft(page.getByTestId('auth_guest_button')).toContainText(c.guest);
    await expect.soft(page.getByRole('link', { name: c.privacyLink })).toBeVisible();
    const body24 = await page.locator('body').innerText();
    expect.soft(body24.match(FR_LEAK)?.[0] ?? null, '24: no French fallback in ar').toBeNull();
    expect.soft(await page.title(), '22-ar: AuthChoice title').toBe(c.titles.authChoice);
    await r.snap('24-ar-authchoice');

    // 25 — Register display ar: one back affordance, header chevron points right.
    await page.getByTestId('auth_signup_button').click();
    await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 15_000 });
    const band = await topBandControls(page);
    const hdr = await headerBackTransform(page);
    r.note('25-ar-register-top-band', { band, headerBack: hdr, html: await htmlDirLang(page) });
    expect.soft(band.length, `25 GJ-008 (ar): exactly one back affordance, got ${JSON.stringify(band)}`).toBe(1);
    expect
      .soft(band.find((b) => b.inHeader)?.label ?? '', '25: header back aria-label must be localized, not the raw route name')
      .not.toMatch(/AuthChoice|, back$/);
    expect.soft(await page.title(), '22-ar: Register title').toBe(c.titles.register);
    await r.snap('25-ar-register-display');

    // 26 — empty submit in Arabic (A-021b: captured before the next fill overwrites it).
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.emailRequired);
    await r.snap('26a-ar-register-empty-submit');
    await page.getByTestId('register_email_input').fill('not-an-email');
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.invalidEmail);
    await r.snap('26-ar-register-invalid-email');
    await page.getByTestId('register_email_input').fill('valid.user@e2e.test');
    await page.getByTestId('register_password_input').fill('abc1');
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.pwLength);
    await page.getByTestId('register_password_input').fill(E2E_PASSWORD);
    await page.getByTestId('register_confirm_input').fill('mismatch-X1aaaa');
    await page.getByTestId('register_submit_button').click();
    await expect.soft(page.getByRole('alert').first()).toContainText(c.pwMismatch);
    const body26 = await page.locator('body').innerText();
    expect.soft(body26.match(FR_LEAK)?.[0] ?? null, '26: no French fallback in ar errors').toBeNull();
    await r.snap('26-ar-register-mismatch');
    r.dispose();
  });

  test('A-ar register success → landing (HYP-A1, run 3) (27)', async ({ page, browser }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.ar;
    await toAuthChoice(page, 'ar');
    await page.getByTestId('auth_signup_button').click();
    await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 15_000 });
    const email = newAccountEmail('A', 'ar-register');
    await registerViaUi(page, email, E2E_PASSWORD);
    const landing = await waitForLanding(page, c);
    const uid = await uidForEmail(email);
    expect(uid).toBeTruthy();
    const emptyCta = await page.getByText(c.completeProfileCta).first().isVisible().catch(() => false);
    r.note('27-ar-register-success-landing', { uid, landing, localProfile: await localProfile(page), homeShowsCompleteProfile: emptyCta, html: await htmlDirLang(page) });
    expect.soft(landing.onOnboarding, `27 HYP-A1 (ar): a new registrant must land on Onboarding (landed: ${JSON.stringify(landing)})`).toBe(true);
    await r.snap('27-ar-register-success-landing');
    if (landing.onOnboarding) {
      await onboardingSteps1to3(r, c, '27r-ar-onboarding', { firstName: 'مريم', age: '25-29', tickHypertension: false, tryInvalidDate: false, signedIn: true });
      await page.getByTestId('onboarding_step4_submit').click();
      await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
    }
    const doc = await pollServerDoc(`userProfiles/${uid}`, (d) => !!d?.lmp, landing.onOnboarding ? 15_000 : 5_000);
    r.note('27-ar-register-server-truth', { uid, doc });
    expect.soft(doc?.lmp, `27 HYP-A1 server truth (ar): userProfiles/${uid}.lmp`).toBeTruthy();
    void browser;
    r.dispose();
  });

  test('A-ar onboarding step1 + step4 → create account → server country (28)', async ({ page, browser }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.ar;
    await toAuthChoice(page, 'ar');
    await page.getByTestId('auth_guest_button').click();
    const { countrySel, navLang } = await onboardingSteps1to3(r, c, '28-ar-onboarding', {
      firstName: 'مريم',
      age: '35-39',
      tickHypertension: false,
      tryInvalidDate: true,
    });
    const email = newAccountEmail('A', 'ar-onboarding-create');
    await page.getByTestId('onboarding_step4_email').fill(email);
    await page.getByTestId('onboarding_step4_password').fill(E2E_PASSWORD);
    await expect.soft(page.getByTestId('onboarding_step4_submit')).toContainText(c.step4Start);
    const body = await page.locator('body').innerText();
    expect.soft(body.match(FR_LEAK)?.[0] ?? null, '28 step4: no French fallback in ar').toBeNull();
    expect.soft(await htmlDirLang(page), '28: rtl').toEqual({ dir: 'rtl', lang: 'ar' });
    await r.snap('28-ar-onboarding-step4');
    await page.getByTestId('onboarding_step4_submit').click();
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
    await expect.soft(page.getByText(`${c.week} 32`, { exact: true }).first(), '28: Home الأسبوع 32').toBeVisible({ timeout: 30_000 });
    await r.snap('28-ar-onboarding-create-account-home');
    const uid = await uidForEmail(email);
    const doc = await pollServerDoc(`userProfiles/${uid}`, (d) => !!d?.lmp);
    r.note('28-ar-server-userProfile', { uid, doc, preselectedCountry: countrySel, navLang });
    expect.soft(doc?.lmp && ymd(String(doc.lmp)), '28: server lmp').toBe(lmpWeek(32));
    expect.soft(doc?.firstName).toBe('مريم');
    // Emergency-number contract: an ar device with no region is NOT Tunisian by
    // default, and an unknown country resolves to 112.
    expect.soft(countrySel.selected, '28 step3: ar device without region → no Tunisia default').not.toContain('tunisia');
    const num = await contractionEmergencyNumber(page);
    r.note('28-ar-contraction-emergency-number', { serverCountry: doc?.country ?? null, number: num });
    await r.snap('28-ar-contraction-emergency-number');
    if (!doc?.country || doc.country === 'other') {
      expect.soft(num, '28: unknown country + unknown region → 112').toBe('112');
      // A-008: the fallback owns up to being one, and offers the fix.
      await expect.soft(page.getByText(/📞.*\(112، دولي\)/).first(), '28: call row labels 112 as international').toBeVisible();
      await expect.soft(page.getByTestId('emergency_number_note'), '28: fallback disclosure').toContainText(c.emergencyFallbackNote);
      await expect.soft(page.getByTestId('emergency_number_choose_country'), '28: link to set the country').toBeVisible();
    }
    const overlap = await callRowOverlap(page);
    r.note('28-ar-contraction-layout', overlap);
    expect.soft(overlap.overlapPx, `28 A-011: nothing above the call row may run under it (${overlap.culprit})`).toBeLessThanOrEqual(1);
    expect.soft(num, '28: never 190 for a user who did not choose Tunisia').not.toBe('190');
    void browser;
    r.dispose();
  });

  test('A-ar login wrong password + success (29, 30)', async ({ page, browser }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.ar;
    const email = newAccountEmail('A', 'ar-login');
    const acct = await createAccount(email, E2E_PASSWORD);
    const seeded = await seedProfile(acct.uid, acct.idToken, { week: 32, firstName: 'Loginne' });
    await toAuthChoice(page, 'ar');
    await page.getByTestId('auth_login_button').click();
    await expect(page.getByTestId('login_email_input')).toBeVisible({ timeout: 15_000 });
    const band = await topBandControls(page);
    r.note('29-ar-login-top-band', { band, headerBack: await headerBackTransform(page) });
    expect.soft(band.length, `29 GJ-008 (ar Login): exactly one back affordance, got ${JSON.stringify(band)}`).toBe(1);
    expect.soft(await page.title(), '22-ar: Login title').toBe(c.titles.login);
    await page.getByTestId('login_email_input').fill(email);
    await page.getByTestId('login_password_input').fill('Wrong-Passw0rd9');
    await page.getByTestId('login_submit_button').click();
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30_000 });
    await expect.soft(page.getByRole('alert').first()).toContainText(c.badCredentials);
    expect.soft(await htmlDirLang(page)).toEqual({ dir: 'rtl', lang: 'ar' });
    await r.snap('29-ar-login-wrong-password', { allowAuth400: true });

    const fresh = await freshLogin(browser, email, 'ar');
    const fr = rig(fresh, testInfo);
    await expect.soft(fresh.getByText(`${c.week} 32`, { exact: true }).first(), '30: Home الأسبوع 32').toBeVisible({ timeout: 30_000 });
    await expect.soft(fresh.getByText(c.trimester3).first(), '30: الثلث الثالث').toBeVisible();
    expect.soft(await htmlDirLang(fresh), '30: rtl').toEqual({ dir: 'rtl', lang: 'ar' });
    expect.soft(await fresh.title(), '22-ar: Home title').toBe(c.titles.home);
    await fr.snap('30-ar-login-success');
    const after = await serverDoc(`userProfiles/${acct.uid}`);
    expect.soft(after?.lmp, '30: login must not overwrite server lmp').toBe(seeded.lmp);
    fr.dispose();
    await fresh.context().close();
    r.dispose();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// en — selector smoke
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Wave A — en smoke', () => {
  test.use(waveUse('en'));
  test.describe.configure({ timeout: WAVE_TIMEOUT });

  test('A-en language → AuthChoice selectors (31)', async ({ page }, testInfo) => {
    const r = rig(page, testInfo);
    const c = COPY.en;
    await toAuthChoice(page, 'en');
    await expect.soft(page.getByTestId('auth_signup_button')).toContainText(c.signup);
    await expect.soft(page.getByTestId('auth_login_button')).toContainText(c.login);
    await expect.soft(page.getByTestId('auth_guest_button')).toContainText(c.guest);
    await expect.soft(page.getByRole('link', { name: c.privacyLink })).toBeVisible();
    expect.soft(await htmlDirLang(page)).toEqual({ dir: 'ltr', lang: 'en' });
    expect.soft(await page.title()).toBe(c.titles.authChoice);
    await r.snap('31-en-authchoice');

    // 32 — country derivation for an en-US device (region US is not in the
    // OnboardingScreen regionMap): record what the pre-fix build pre-selects.
    await page.getByTestId('auth_guest_button').click();
    await page.getByRole('button', { name: c.pregnant, exact: true }).click();
    await expect(page.locator('input[type="date"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: c.onbContinue, exact: true }).click();
    await expect(page.getByRole('textbox', { name: c.firstNameLabel })).toBeVisible({ timeout: 15_000 });
    const sel = await page.evaluate((labels: Record<string, string>) => {
      const out: Record<string, string> = {};
      for (const [k, lbl] of Object.entries(labels)) {
        const el = Array.from(document.querySelectorAll<HTMLElement>('[role="button"]')).find((e) => e.getAttribute('aria-label') === lbl);
        out[k] = el ? `${getComputedStyle(el).backgroundColor}|${getComputedStyle(el).borderTopColor}` : 'absent';
      }
      return out;
    }, c.countries);
    const present = Object.values(sel).filter((x) => x !== 'absent');
    const selected = Object.entries(sel)
      .filter(([, v]) => v !== 'absent' && present.filter((x) => x === v).length === 1 && present.length > 2)
      .map(([k]) => k);
    expect.soft(selected, '32: en-US device (region US) → no Tunisia default').not.toContain('tunisia');
    r.note('32-en-US-step3-country-derivation', {
      navLang: await page.evaluate(() => ({ language: navigator.language, languages: navigator.languages })),
      selected,
      styles: sel,
    });
    await r.snap('32-en-US-onboarding-step3-country');

    // 33 — finish as guest without touching the country; read the dialled number.
    await page.getByRole('button', { name: c.onbContinue, exact: true }).last().click();
    await expect(page.getByTestId('onboarding_step4_skip')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('onboarding_step4_skip').click();
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 45_000 });
    const ls = await localProfile(page);
    const num = await contractionEmergencyNumber(page);
    r.note('33-en-US-contraction-emergency-number', { profileCountry: ls?.country ?? null, number: num });
    expect.soft(num, '33: en-US user must not be told to call 190').not.toBe('190');
    if (!ls?.country || ls.country === 'other') expect.soft(num, '33: unknown country → region/112').toMatch(/^(911|112)$/);
    await r.snap('33-en-US-contraction-emergency-number');
    r.dispose();
  });
});
