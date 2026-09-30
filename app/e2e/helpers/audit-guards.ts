import { expect, type Page } from '@playwright/test';

/** Visible-text leak of a namespaced i18n key (e.g. `home.foods`). */
export const RAW_KEY =
  /(^|\s)(common|dashboard|home|calendar|reminders|tasks|profile|onboarding|auth|weight|article|babyGrowth|babyEvolution|forbiddenFoods|notifications|cycle8|support|ui|addAppointment|settings)\.[a-zA-Z][a-zA-Z0-9_.]+/;

/**
 * Console noise that is NOT an app defect on the offline static-export harness:
 * RN-web deprecations + Firestore permission-denied (no anonymous session) +
 * `serve --single` returning index.html for chatbot wasm (MIME).
 */
export const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /expo-notifications/i,
  /AsyncStorage has been extracted/i,
  /\[expo-av\]/i,
  /Setting a timer/i,
  /findDOMNode is deprecated/i,
  /useNativeDriver/i,
  /shadow\* style props are deprecated|"shadow"/i,
  /props\.pointerEvents is deprecated/i,
  /style\.resizeMode is deprecated/i,
  /Image: style\.tintColor/i,
  /accessibilityLabel/i,
  /Missing or insufficient permissions/i,
  /FirebaseError/i,
  /permission-denied/i,
  /WebAssembly|wasm|MIME type|application\/wasm/i,
  /falling back to ArrayBuffer|ArrayBuffer instantiation/i,
  /DatabaseService|DB Init Error|Failed to initialize database/i,
  /Aborted\(/i,
  /Failed to execute 'compile'/i,
  /Failed to fetch|NetworkError|net::ERR/i,
];

export function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORE_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export async function waitBodyPopulated(page: Page, minChars = 40) {
  await page.waitForFunction(
    (n) => ((document.body && document.body.innerText) || '').trim().length > n,
    minChars,
    { timeout: 60_000, polling: 250 },
  );
}

export async function gotoHydrated(page: Page, path: string, minChars = 40) {
  await page.goto(path, { waitUntil: 'load' });
  await waitBodyPopulated(page, minChars);
}

export async function assertNonBlankNoRawKey(page: Page, name: string) {
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(bodyText.trim().length, `${name}: screen should not be blank`).toBeGreaterThan(0);
  const leak = bodyText.split('\n').find((l) => RAW_KEY.test(l));
  expect(leak, `${name}: raw i18n key leaked → "${leak}"`).toBeFalsy();
  return bodyText;
}

export function assertNoAppConsole(name: string, errors: string[]) {
  expect(errors, `${name}: console errors: ${errors.join(' | ')}`).toEqual([]);
}
