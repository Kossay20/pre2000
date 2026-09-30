import { test, expect, type Page } from '@playwright/test';
import {
  attachConsole,
  assertNoAppConsole,
  assertNonBlankNoRawKey,
  gotoHydrated,
} from './helpers/audit-guards';
import { attachMegaAuditRecorder } from './helpers/mega-audit-snap';

/**
 * Guest web parcours — AC1 surfaces from the real start state.
 *
 * Cold funnel uses empty storageState (Language → AuthChoice display).
 * Tabs + tools use the seeded guest (week 13, locale en) from global-setup.
 *
 * When E2E_QUARTET_DIR is set, each state writes PNG+DOM+console+network.
 * Extra copies: E2E_QUARTET_DIR2 (reports run dir).
 */

const QUARTET_DIRS = [process.env.E2E_QUARTET_DIR, process.env.E2E_QUARTET_DIR2].filter(
  (d): d is string => !!d,
);

type Recorder = ReturnType<typeof attachMegaAuditRecorder> | null;

function attachRecorder(page: Page): Recorder {
  if (QUARTET_DIRS.length === 0) return null;
  return attachMegaAuditRecorder(page, QUARTET_DIRS);
}

async function auditState(page: Page, name: string, errors: string[], recorder: Recorder) {
  await assertNonBlankNoRawKey(page, name);
  if (recorder) await recorder.snap(name);
  assertNoAppConsole(name, errors);
}

const DEEP_LINKS: { name: string; path: string; control: () => { role: string; name?: RegExp | string; testId?: string } }[] = [
  {
    name: 'appointment-add',
    path: '/appointment/add',
    control: () => ({ role: 'textbox' }),
  },
  {
    name: 'statistics',
    path: '/statistics',
    control: () => ({ role: 'button' }),
  },
  {
    name: 'health',
    path: '/health',
    control: () => ({ role: 'button' }),
  },
  {
    name: 'weight',
    path: '/weight',
    control: () => ({ role: 'textbox' }),
  },
  {
    name: 'kick-counter',
    path: '/kick-counter',
    control: () => ({ role: 'button', name: /Start a session/i }),
  },
  {
    name: 'contraction-timer',
    path: '/contraction-timer',
    control: () => ({ role: 'button', name: /Contraction start/i }),
  },
  {
    name: 'hospital-bag',
    path: '/hospital-bag',
    control: () => ({ role: 'checkbox' }),
  },
  {
    name: 'forbidden-foods',
    path: '/forbidden-foods',
    control: () => ({ role: 'textbox' }),
  },
  {
    name: 'baby-evolution',
    path: '/baby-evolution',
    control: () => ({ role: 'button' }),
  },
  {
    name: 'profile',
    path: '/profile',
    control: () => ({ role: 'textbox' }),
  },
  {
    name: 'settings',
    path: '/settings',
    control: () => ({ role: 'switch' }),
  },
  {
    name: 'recommendations',
    path: '/recommendations',
    control: () => ({
      role: 'button',
      name: /Explore resources|No recommendation|Exercise During Pregnancy|Recommended Articles/i,
    }),
  },
  {
    name: 'resources',
    path: '/resources',
    control: () => ({ role: 'tab' }),
  },
  {
    name: 'chatbot',
    path: '/chatbot',
    control: () => ({ role: 'textbox' }),
  },
];

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Guest journey — cold funnel (empty storage)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Language picker renders 4 locales + Continue', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/Language', 80);
    for (const code of ['fr', 'ar', 'tn', 'en']) {
      await expect(page.locator(`[data-testid="lang_card_${code}"]`)).toBeVisible();
    }
    await expect(page.getByText('Français', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('English', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Continuer').or(page.getByText('Continue')).first()).toBeVisible();
    await auditState(page, '01-language', errors, rec);
    rec?.dispose();
  });

  test('English → AuthChoice shows guest / login / register', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/Language', 80);
    await page.locator('[data-testid="lang_card_en"]').click();
    await page.locator('text="✓"').first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('Continue', { exact: true }).first().dispatchEvent('click');
    const guest = page.getByTestId('auth_guest_button');
    await expect(guest).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('auth_login_button')).toBeVisible();
    await expect(page.getByTestId('auth_signup_button')).toBeVisible();
    const toast = page.getByRole('status');
    if ((await toast.count()) > 0 && (await toast.first().isVisible().catch(() => false))) {
      const gBox = await guest.boundingBox();
      const tBox = await toast.first().boundingBox();
      if (gBox && tBox) {
        const overlap = !(
          gBox.y + gBox.height <= tBox.y ||
          tBox.y + tBox.height <= gBox.y ||
          gBox.x + gBox.width <= tBox.x ||
          tBox.x + tBox.width <= gBox.x
        );
        expect(overlap, 'language toast must not cover Continue as guest').toBeFalsy();
      }
    }
    await auditState(page, '02-authchoice', errors, rec);
    rec?.dispose();
  });

  test('Register form DISPLAY (no submit)', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/Language', 80);
    await page.locator('[data-testid="lang_card_en"]').click();
    await page.locator('text="✓"').first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('Continue', { exact: true }).first().dispatchEvent('click');
    await expect(page.getByTestId('auth_signup_button')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('auth_signup_button').click();
    await expect(page.getByTestId('register_email_input')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('register_password_input')).toBeVisible();
    await auditState(page, '03-register-display', errors, rec);
    rec?.dispose();
  });

  test('Login form DISPLAY (no submit)', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/Language', 80);
    await page.locator('[data-testid="lang_card_en"]').click();
    await page.locator('text="✓"').first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText('Continue', { exact: true }).first().dispatchEvent('click');
    await expect(page.getByTestId('auth_login_button')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('auth_login_button').click();
    await expect(page.getByTestId('login_email_input')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('login_password_input')).toBeVisible();
    await auditState(page, '04-login-display', errors, rec);
    rec?.dispose();
  });
});

test.describe('Guest journey — onboarded MainTabs + tools (seeded guest)', () => {
  test('Home tab renders; week-13 gates Kick / Contraction / HospitalBag cards', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/HomeMain');
    const tablist = page.getByRole('tablist').first();
    await expect(tablist).toBeVisible({ timeout: 30_000 });
    for (const name of ['Home', 'Calendar', 'Reminders', 'Resources', 'Chatbot']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Week 13/i).first()).toBeVisible({ timeout: 20_000 });
    // Week 13: Home cards for kick (≥16) and contraction/bag (≥28) stay hidden.
    await expect(page.getByText('Baby kick counter', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Contraction timer', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Hospital bag', { exact: true })).toHaveCount(0);
    await auditState(page, '05-home', errors, rec);
    rec?.dispose();
  });

  const TABS: { slug: string; label: string }[] = [
    { slug: '06-calendar', label: 'Calendar' },
    { slug: '07-reminders', label: 'Reminders' },
    { slug: '08-resources', label: 'Resources' },
    { slug: '09-chatbot', label: 'Chatbot' },
  ];

  for (const tab of TABS) {
    test(`${tab.label} tab select is interactive`, async ({ page }) => {
      const errors = attachConsole(page);
      const rec = attachRecorder(page);
      await gotoHydrated(page, '/HomeMain');
      await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
      const tabEl = page.getByRole('tab', { name: tab.label, exact: true }).first();
      await tabEl.click();
      await expect(tabEl).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
      if (tab.label === 'Chatbot') {
        await expect(page.getByPlaceholder(/Ask your question/i).first()).toBeVisible({ timeout: 15_000 });
      }
      if (tab.label === 'Reminders') {
        await expect(page.getByText(/Week 13/i).first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/Trimester 1/i).first()).toBeVisible();
        await expect(page.getByText(/Trimester 2/i)).toHaveCount(0);
      }
      if (tab.label === 'Calendar') {
        await expect(page.getByRole('button', { name: /^Month$/i }).first()).toBeVisible({ timeout: 20_000 });
      }
      await auditState(page, tab.slug, errors, rec);
      rec?.dispose();
    });
  }

  test('Resources → Articles + Supplements lists', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/resources');
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
    const articles = page.getByRole('tab', { name: /^Articles$/i }).last();
    await expect(articles).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Pregnancy Symptoms|symptômes de grossesse/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await auditState(page, '10-resources-articles', errors, rec);
    const supplements = page.getByRole('tab', { name: /^Supplements$/i }).last();
    await expect(supplements).toBeVisible();
    await supplements.click();
    await expect(supplements).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
    await expect(page.getByText(/Folic acid|Acide folique/i).first()).toBeVisible({ timeout: 20_000 });
    await auditState(page, '11-resources-supplements', errors, rec);
    rec?.dispose();
  });

  test('Baby evolution lands on current month (week 13 → month 3), not month 1', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/baby-evolution');
    await expect(page.getByText(/Month 3/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/You are here/i).first()).toBeVisible();
    await expect(page.getByText(/Poppy seed/i)).toHaveCount(0);
    await auditState(page, '14-baby-evolution-month3', errors, rec);
    rec?.dispose();
  });

  test('Article + supplement deep-link detail shells render', async ({ page }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, `/article/${encodeURIComponent('a01_symptômes_de_grossesse')}`);
    await expect(
      page.getByText(/Pregnancy Symptoms|symptômes de grossesse|Retry|Failed to load/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await auditState(page, '12-article-detail', errors, rec);
    await gotoHydrated(page, '/supplement/s01_acide_folique');
    await expect(
      page.getByText(/Folic acid|Acide folique|Retry|Failed to load|not found/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await auditState(page, '13-supplement-detail', errors, rec);
    rec?.dispose();
  });

  for (const link of DEEP_LINKS) {
    test(`deep link ${link.path} is non-blank with a real control`, async ({ page }) => {
      const errors = attachConsole(page);
      const rec = attachRecorder(page);
      await gotoHydrated(page, link.path);
      const ctrl = link.control();
      if (ctrl.testId) {
        await expect(page.getByTestId(ctrl.testId)).toBeVisible({ timeout: 15_000 });
      } else if (ctrl.role === 'textbox' && !ctrl.name) {
        await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 15_000 });
      } else if (ctrl.role === 'checkbox') {
        await expect(page.getByRole('checkbox').first()).toBeVisible({ timeout: 15_000 });
      } else if (ctrl.role === 'switch') {
        await expect(page.getByRole('switch').first()).toBeVisible({ timeout: 15_000 });
      } else if (ctrl.role === 'heading') {
        await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
      } else if (link.name === 'recommendations') {
        await expect(
          page.getByText(/Explore resources|No recommendation|Recommended Articles|Exercise During Pregnancy/i).first(),
        ).toBeVisible({ timeout: 20_000 });
      } else if (ctrl.name) {
        await expect(page.getByRole(ctrl.role as 'button', { name: ctrl.name }).first()).toBeVisible({
          timeout: 15_000,
        });
      } else {
        await expect(page.getByRole(ctrl.role as 'button').first()).toBeVisible({ timeout: 15_000 });
      }
      await auditState(page, `14-${link.name}`, errors, rec);
      rec?.dispose();
    });
  }

  test('interactive: Calendar Month, appointment title, chatbot type, kick start, contraction start, bag toggle', async ({
    page,
  }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);

    await gotoHydrated(page, '/calendar');
    const month = page.getByRole('button', { name: /^Month$/i }).first();
    await expect(month).toBeVisible({ timeout: 15_000 });
    await month.click();
    await expect(month).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
    await auditState(page, '15-calendar-month', errors, rec);

    await gotoHydrated(page, '/appointment/add');
    const title = page.getByRole('textbox').first();
    await expect(title).toBeVisible({ timeout: 15_000 });
    await title.fill('E2E midwife visit');
    await expect(title).toHaveValue('E2E midwife visit');
    await auditState(page, '16-appointment-filled', errors, rec);

    await gotoHydrated(page, '/chatbot');
    const ask = page.getByPlaceholder(/Ask your question/i).first();
    await expect(ask).toBeVisible({ timeout: 15_000 });
    await ask.fill('When is my next checkup?');
    await auditState(page, '17-chatbot-typed', errors, rec);

    await gotoHydrated(page, '/kick-counter');
    await expect(page.getByText(/Before 28 weeks/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/If fewer than 10 in 2h/i)).toHaveCount(0);
    await page.getByRole('button', { name: /Start a session/i }).first().click();
    await expect(page.getByRole('button', { name: /Tap to count/i }).first()).toBeVisible({ timeout: 10_000 });
    await auditState(page, '18-kick-active', errors, rec);

    await gotoHydrated(page, '/contraction-timer');
    await page.getByRole('button', { name: /Contraction start/i }).first().click();
    await expect(page.getByRole('button', { name: /Contraction end/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/No contractions logged/i)).toHaveCount(0);
    await auditState(page, '19-contraction-running', errors, rec);

    await gotoHydrated(page, '/hospital-bag');
    const box = page.getByRole('checkbox').first();
    await expect(box).toBeVisible({ timeout: 15_000 });
    const before = await box.getAttribute('aria-checked');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true', { timeout: 5_000 });
    await auditState(page, '20-hospital-bag-toggled', errors, rec);

    rec?.dispose();
  });

  test('interactive: weight setup field, profile name, settings switch, forbidden-foods search', async ({
    page,
  }) => {
    const errors = attachConsole(page);
    const rec = attachRecorder(page);

    await gotoHydrated(page, '/weight');
    const weightBox = page.getByRole('textbox').first();
    await expect(weightBox).toBeVisible({ timeout: 15_000 });
    await weightBox.fill('62');
    await auditState(page, '21-weight-typed', errors, rec);

    await gotoHydrated(page, '/profile');
    const nameBox = page.getByRole('textbox').first();
    await expect(nameBox).toBeVisible({ timeout: 15_000 });
    await nameBox.fill('E2E');
    await auditState(page, '22-profile-typed', errors, rec);

    await gotoHydrated(page, '/settings');
    const sw = page.getByRole('switch').first();
    await expect(sw).toBeVisible({ timeout: 15_000 });
    const before = await sw.getAttribute('aria-checked');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true', { timeout: 5_000 });
    await auditState(page, '23-settings-toggled', errors, rec);

    await gotoHydrated(page, '/forbidden-foods');
    const search = page.getByRole('textbox').first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('sushi');
    await auditState(page, '24-forbidden-search', errors, rec);

    rec?.dispose();
  });
});

test.describe('Guest journey — RTL primary path (ar / tn)', () => {
  for (const L of [
    { code: 'ar', dir: 'rtl' as const },
    { code: 'tn', dir: 'rtl' as const },
  ]) {
    test(`${L.code}: Home + kick-counter deep link is dir=rtl, mirrored, no raw keys`, async ({ page }) => {
      await page.addInitScript((locale) => {
        try {
          localStorage.setItem('app_locale', locale);
        } catch {
          /* noop */
        }
      }, L.code);
      const errors = attachConsole(page);
      const rec = attachRecorder(page);

      await gotoHydrated(page, '/HomeMain');
      await expect(page.locator('html')).toHaveAttribute('dir', L.dir, { timeout: 10_000 });
      await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/13/).first()).toBeVisible({ timeout: 20_000 });
      await auditState(page, `25-${L.code}-home`, errors, rec);

      await gotoHydrated(page, '/kick-counter');
      await expect(page.locator('html')).toHaveAttribute('dir', L.dir, { timeout: 10_000 });
      await expect(page.getByRole('button').first()).toBeVisible({ timeout: 15_000 });
      await auditState(page, `26-${L.code}-kick-counter`, errors, rec);

      await gotoHydrated(page, '/calendar');
      await expect(page.locator('html')).toHaveAttribute('dir', L.dir);
      await expect(page.getByRole('button', { name: /شهر|أسبوع|Month|Week/i }).first()).toBeVisible({
        timeout: 20_000,
      });
      await auditState(page, `27-${L.code}-calendar`, errors, rec);

      rec?.dispose();
    });
  }

  test('fr / en stay ltr on Home', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('app_locale', 'fr');
      } catch {
        /* noop */
      }
    });
    const errors = attachConsole(page);
    const rec = attachRecorder(page);
    await gotoHydrated(page, '/HomeMain');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr', { timeout: 10_000 });
    await expect(page.getByRole('tablist').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Semaine 13|Week 13/i).first()).toBeVisible({ timeout: 20_000 });
    await auditState(page, '28-fr-home-ltr', errors, rec);
    rec?.dispose();
  });
});
