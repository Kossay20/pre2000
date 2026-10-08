import { test, expect, type Page } from '@playwright/test';

/**
 * CHATBOT abuse E2E (goal: "chatbot" + "abuse-e2e", in every language).
 *
 * The chatbot runs fully OFFLINE — analyzeMessage uses LocalChatbotRepository over the static
 * chatbot_data.ts (the failing SQLite/wasm path is unused) — so we can drive it end-to-end.
 *
 * Per language (FR/EN/AR/TN) we prove the single most important behavior LIVE through the real UI:
 * a described emergency escalates and surfaces the emergency-call button. Plus an abuse battery
 * (very long / emoji / script-injection / whitespace / symbols / mixed-language) must never crash
 * the app (no global error boundary; input stays usable).
 */
const SHOT = 'audit-screenshots/chatbot-abuse';

type Lang = { code: string; send: string; emergency: string; ask: string; emergencyPhrase: string };
const LANGS: Lang[] = [
  { code: 'fr', send: 'Envoyer le message', emergency: 'Contactez immédiatement un professionnel de santé', ask: 'Posez votre question...', emergencyPhrase: "j'ai des saignements abondants" },
  { code: 'en', send: 'Send message', emergency: 'Contact a healthcare professional immediately', ask: 'Ask your question...', emergencyPhrase: 'I have heavy bleeding' },
  { code: 'ar', send: 'إرسال الرسالة', emergency: 'اتصلي فوراً بأخصائي رعاية صحية', ask: 'اطرحي سؤالك...', emergencyPhrase: 'عندي نزيف' },
  { code: 'tn', send: 'ابعث الرسالة', emergency: 'اتصلي فوراً بأخصائي رعاية صحية', ask: 'اطرحي سؤالك...', emergencyPhrase: '3andi nzif' },
];

async function gotoChatbot(page: Page) {
  await page.goto('/HomeMain', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const tabs = page.getByRole('tab');
  await expect(tabs.first()).toBeVisible({ timeout: 30_000 });
  await tabs.nth(4).click(); // Home(0) Calendar(1) Reminders(2) Resources(3) Chatbot(4)
  await page.waitForTimeout(1200);
}

/**
 * Returns true if the message was actually sent. The app DISABLES the send button on
 * empty/whitespace input and the handler silently ignores >500-char input (ChatbotScreen
 * MAX_INPUT_LENGTH) — both are correct no-ops, NOT crashes, so we don't force a click then.
 */
async function sendMessage(page: Page, L: Lang, text: string): Promise<boolean> {
  const input = page.getByPlaceholder(L.ask).first();
  await input.fill(text);
  const btn = page.getByRole('button', { name: L.send }).first();
  if (!(await btn.isEnabled().catch(() => false))) return false; // app correctly refuses empty/whitespace
  await btn.click();
  await page.waitForTimeout(2200); // let analyzeMessage (static data) + render settle; loading clears
  return true;
}

async function assertNotCrashed(page: Page, L: Lang) {
  // A real crash trips the GLOBAL ErrorBoundary, which REPLACES the whole app (no input, no tabs).
  // So the chatbot input + the bottom tablist both still being present is the precise no-crash
  // proof. (We deliberately do NOT text-match "Oops" — the Home tab stays mounted in the tab
  // navigator and its offline week-content card shows a localized error card in every language,
  // which is an expected harness artifact, not a chatbot crash.)
  await expect(page.getByPlaceholder(L.ask).first()).toBeVisible();
  await expect(page.getByRole('tablist').first()).toBeVisible();
}

for (const L of LANGS) {
  test.describe(`chatbot abuse — ${L.code}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((l) => { try { localStorage.setItem('app_locale', l as string); } catch { /* noop */ } }, L.code);
    });

    test(`${L.code}: a described emergency escalates LIVE (emergency-call button appears)`, async ({ page }) => {
      await gotoChatbot(page);
      await sendMessage(page, L, L.emergencyPhrase);
      await expect(page.getByRole('button', { name: L.emergency }).first()).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: `${SHOT}/${L.code}-emergency.png`, fullPage: true });
    });

    test(`${L.code}: abuse inputs never crash the chatbot`, async ({ page }) => {
      await gotoChatbot(page);
      const abuses = [
        '😀😀😀🤰🍼',                       // emoji only
        'a'.repeat(2000),                    // oversized (app silently ignores >500)
        '<script>alert(1)</script>',         // injection-like (must be escaped, not executed)
        '   ',                               // whitespace only (send disabled — correct no-op)
        '!!!@@@###$$$%%%^^^&&&***',           // symbols
        '北京 bébé حمل pregnancy',            // mixed scripts
      ];
      for (const a of abuses) {
        await sendMessage(page, L, a); // returns false for the no-op cases; either way must not crash
        await assertNotCrashed(page, L);
      }
      // sanity: a real emergency still escalates AFTER the abuse barrage (no corrupted state)
      await sendMessage(page, L, L.emergencyPhrase);
      await expect(page.getByRole('button', { name: L.emergency }).first()).toBeVisible({ timeout: 15_000 });
    });
  });
}
