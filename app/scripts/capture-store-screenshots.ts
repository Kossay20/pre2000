/**
 * Produce the App Store / Play Console screenshot sets, at the exact pixel sizes
 * both consoles enforce, in every listing locale.
 *
 * Two passes, both in Chromium:
 *
 *  1. CAPTURE — drive the static web export at a viewport x deviceScaleFactor
 *     chosen so the raw capture lands on the store size with no resampling
 *     (430x932 @3 = 1290x2796, and so on).
 *  2. FRAME — lay each capture inside a device bezel on a brand background with
 *     a localized caption, and screenshot that at the store size.
 *
 * The framing pass runs in the browser rather than in an image library on
 * purpose: the Arabic captions need bidi + shaping, and the PIL build available
 * here has no raqm, so it would render Arabic unshaped and left-to-right.
 * Chromium gets it right for free.
 *
 * Prerequisites (the Playwright harness already does this for e2e):
 *   npx expo export --platform web --output-dir dist
 *   npx serve dist -l 8099 --single
 *
 * Run:
 *   npx tsx scripts/capture-store-screenshots.ts
 *   BASE_URL=http://localhost:8099 npx tsx scripts/capture-store-screenshots.ts
 *
 * Honest limitation: these are captures of the same code running on RN-Web, not
 * of a native binary. The UI is the app's own, but status bar and safe-area
 * chrome differ — which is exactly why every shot is framed in a bezel with a
 * synthetic status bar. Re-shoot on a simulator once an EAS build exists (see
 * docs/GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md, T7.6) and swap them in if the
 * two sets diverge visibly.
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8099';
const APP_DIR = path.resolve(__dirname, '..');
const RAW_DIR = path.join(APP_DIR, 'store', 'screenshots', '_raw');
const OUT_DIR = path.join(APP_DIR, 'store', 'screenshots');

/** Store-enforced output sizes. viewport x scale must equal the target exactly. */
interface DeviceProfile {
  id: string;
  store: 'apple' | 'play';
  /** What App Store Connect / Play call this slot. */
  slot: string;
  viewport: { width: number; height: number };
  scale: number;
  /** Corner radius of the drawn bezel, in output pixels. */
  bezelRadius: number;
  notch: 'dynamic-island' | 'punch-hole' | 'none';
}

const DEVICES: DeviceProfile[] = [
  {
    id: 'ios-6.9',
    store: 'apple',
    slot: 'iPhone 6.9" (1290x2796) — required',
    viewport: { width: 430, height: 932 },
    scale: 3,
    bezelRadius: 150,
    notch: 'dynamic-island',
  },
  {
    id: 'ipad-13',
    store: 'apple',
    slot: 'iPad 13" (2064x2752) — required while supportsTablet is true',
    viewport: { width: 1032, height: 1376 },
    scale: 2,
    bezelRadius: 90,
    notch: 'none',
  },
  {
    id: 'android-phone',
    store: 'play',
    slot: 'Play phone (1080x1920) — 2 to 8 required',
    viewport: { width: 360, height: 640 },
    scale: 3,
    bezelRadius: 96,
    notch: 'punch-hole',
  },
];

/**
 * App Store and Play both localize a listing, but neither has a Tunisian Arabic
 * locale — the app's `tn` folds into the single Arabic listing.
 */
const LOCALES = ['fr', 'en', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

const RTL: Record<Locale, boolean> = { fr: false, en: false, ar: true };

interface ScreenSpec {
  id: string;
  route: string;
  /** Marketing caption drawn above the device. Sales copy, not UI strings. */
  caption: Record<Locale, string>;
  /** Extra settle time for screens that animate in (charts, carousels). */
  settleMs?: number;
  /** Optional driving before the shot — e.g. asking the assistant a question. */
  interact?: (page: Page, locale: Locale) => Promise<void>;
}

/** Question typed into the assistant so the shot shows a conversation, not an empty shell. */
const ASSISTANT_QUESTION: Record<Locale, string> = {
  fr: 'Quels aliments éviter au 2e trimestre ?',
  en: 'Which foods should I avoid in the 2nd trimester?',
  ar: 'ما الأطعمة التي يجب تجنبها في الثلث الثاني؟',
};

/**
 * Ordered by selling power — the first shot is the one most people ever see.
 *
 * `route` values are the paths from App.tsx's linking config, not React
 * Navigation route names. That distinction bit the first run of this script:
 * `getStateFromPath` has a catch-all that sends anything unresolvable to Home, so
 * `/BabyEvolution`, `/CalendarMain` and friends did not fail — they silently
 * produced five identical screenshots of the home screen.
 */
const SCREENS: ScreenSpec[] = [
  {
    id: '1-home',
    route: '/',
    caption: {
      fr: 'Votre grossesse,\nsemaine après semaine',
      en: 'Your pregnancy,\nweek by week',
      ar: 'حملك،\nأسبوعاً بعد أسبوع',
    },
  },
  {
    id: '2-baby',
    route: '/baby-evolution',
    caption: {
      fr: 'Voyez grandir\nvotre bébé',
      en: 'Watch your baby\ngrow',
      ar: 'شاهدي طفلك\nينمو',
    },
    settleMs: 1500,
  },
  // The Calendar screen is deliberately absent. Guests cannot hold appointments
  // at all — `calendarService.loadUserEvents` returns [] and `saveUserEvent`
  // throws for a guest uid, by design, with an in-app upgrade path — so every
  // guest capture of it reads "No appointments this week". Shoot it in W7 against
  // a seeded live backend and add it there rather than advertise an empty state.
  {
    id: '3-resources',
    route: '/resources',
    caption: {
      // Not "trusted"/"fiables": no article has been clinically reviewed yet
      // (docs/clinical-review/README.md), and a caption is a store claim like any other.
      fr: 'Des articles à lire,\nclassés par thème',
      en: 'Articles to read,\nsorted by topic',
      ar: 'مقالات للقراءة،\nمرتّبة حسب الموضوع',
    },
  },
  {
    id: '4-reminders',
    route: '/reminders',
    caption: {
      fr: 'Des rappels doux,\nau bon moment',
      en: 'Gentle reminders,\nright on time',
      ar: 'تذكيرات لطيفة\nفي وقتها',
    },
  },
  {
    id: '5-chatbot',
    route: '/chatbot',
    caption: {
      fr: 'Vos questions,\ndans votre langue',
      en: 'Your questions,\nin your language',
      ar: 'أسئلتك،\nبلغتك',
    },
    settleMs: 1200,
    interact: async (page, locale) => {
      // One TextInput on this screen, so `input` is unambiguous. Typing beats
      // clicking a suggestion chip: chip labels are localized and come from data,
      // whereas this keeps the same question across all three listings.
      const field = page.locator('input').first();
      await field.waitFor({ state: 'visible', timeout: 15_000 });
      await field.fill(ASSISTANT_QUESTION[locale]);
      await field.press('Enter');
      await page.waitForTimeout(2500);
    },
  },
  {
    id: '6-foods',
    route: '/forbidden-foods',
    caption: {
      // The screen lists foods to avoid; it cannot promise that the rest is safe.
      fr: 'Les aliments à éviter,\net pourquoi',
      en: 'Foods to avoid,\nand why',
      ar: 'أطعمة يُنصح بتجنّبها،\nولماذا',
    },
  },
];

const GUEST_PROFILE = {
  // The `guest_` prefix is load-bearing, not cosmetic: 23 call sites across
  // healthService / calendarService / remindersV2Service / taskService branch on
  // `uid.startsWith('guest_')` to choose local storage over Firestore. A fixture
  // uid without it takes the authenticated path, hits a backend that is not there
  // in an offline export, and silently renders every list empty — which is how
  // the seeded reminder switches first came out off.
  uid: 'guest_store_capture',
  firstName: 'Amira',
  lastName: '',
  pregnancyStartDate: '',
  lmp: '',
  currentWeek: 24,
  country: 'France',
  ageRange: '25-29',
  isFirstPregnancy: true,
  isGuest: true,
  // Recorded by onboarding's last step; without it the app opens on the consent sheet.
  healthDataConsent: { version: '2026-09-30', at: '2026-09-30T08:00:00.000Z' },
};

/** A due date that puts the fixture profile in a visually rich mid-pregnancy week. */
const withComputedDates = () => {
  const daysPregnant = GUEST_PROFILE.currentWeek * 7 + 2;
  const start = new Date(Date.now() - daysPregnant * 24 * 60 * 60 * 1000);
  return {
    ...GUEST_PROFILE,
    pregnancyStartDate: start.toISOString(),
    lmp: start.toISOString(),
  };
};

/** Shape from `hydrationService.HydrationData`. Resets daily, so stamp today. */
const hydrationFixture = () => ({
  currentIntake: 1750,
  dailyGoal: 3000,
  lastUpdated: new Date().toISOString(),
  reminderEnabled: true,
  reminderFrequency: 8,
  reminderStartHour: 8,
  reminderEndHour: 22,
});

/** Shape from `types/remindersV2.ReminderUserSetting`, keyed by reminder id. */
const reminderSettingsFixture = () => {
  const stamp = new Date().toISOString();
  const enable = (id: string, times: string[]) => ({
    reminder_id: id,
    user_id: GUEST_PROFILE.uid,
    enabled: true,
    intensity: times.length,
    times,
    origin: 'user',
    priority: 'normal',
    last_modified_at: stamp,
  });
  return {
    rem_hyd_water: enable('rem_hyd_water', ['08:00', '13:00', '18:00']),
    rem_med_prenatal_vitamins: enable('rem_med_prenatal_vitamins', ['09:00', '20:00']),
    rem_act_walk: enable('rem_act_walk', ['18:00']),
    rem_nut_fruits: enable('rem_nut_fruits', ['10:00', '17:00']),
  };
};

async function capture(browser: Browser, device: DeviceProfile, locale: Locale, screen: ScreenSpec) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    locale: locale === 'ar' ? 'ar-TN' : locale,
    isMobile: device.id !== 'ipad-13',
    hasTouch: true,
    reducedMotion: 'reduce',
    // The Reminders screen shows a "turn on notifications" nag bar until the
    // permission is granted. A real user on a phone has already answered that
    // prompt by the time the screen is worth photographing.
    permissions: ['notifications'],
  });

  await context.addInitScript(
    ({ profile, lang, hydration, reminderSettings }) => {
      try {
        localStorage.setItem('app_locale', lang);
        localStorage.setItem('user_profile', JSON.stringify(profile));
        localStorage.setItem('onboarding_completed', 'true');
        // HomeScreen's first-run welcome card (HOME_WELCOME_SEEN_KEY) covers the
        // top third of Home. Real users see it once; a store screenshot must show
        // the product, not the onboarding nudge.
        localStorage.setItem('@home_welcome_seen_v1', 'true');
        // Without these the Reminders screen advertises "0 L of 3 L — 0%" and a
        // column of off switches, which sells nothing. A mid-afternoon state is
        // what the feature actually looks like in use.
        localStorage.setItem('hydration_data_v1', JSON.stringify(hydration));
        localStorage.setItem('reminders_v2_settings_guest', JSON.stringify(reminderSettings));
      } catch {
        /* storage disabled — the capture will simply show the language picker */
      }
    },
    {
      profile: withComputedDates(),
      lang: locale,
      hydration: hydrationFixture(),
      reminderSettings: reminderSettingsFixture(),
    },
  );

  const page: Page = await context.newPage();
  await page.goto(`${BASE_URL}${screen.route}`, { waitUntil: 'load', timeout: 90_000 });

  // Wait for the app shell rather than a fixed sleep: RN-Web mounts the tab bar
  // last, so its presence means the screen underneath has already painted.
  await page
    .waitForSelector('[role="tablist"], [data-testid="screen-root"]', { timeout: 45_000 })
    .catch(() => undefined);
  await page.waitForTimeout(screen.settleMs ?? 900);

  if (screen.interact) {
    await screen.interact(page, locale).catch(() => undefined);
  }

  const target = path.join(RAW_DIR, `${device.id}_${locale}_${screen.id}.png`);
  mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, scale: 'device' });
  await context.close();
  return target;
}

const FRAME_HTML = (opts: {
  shotDataUri: string;
  caption: string;
  rtl: boolean;
  width: number;
  height: number;
  bezelRadius: number;
  notch: DeviceProfile['notch'];
}) => {
  // The capture has the same aspect ratio as the output canvas (both are
  // viewport x scale), so a device sized purely by width overflows the canvas
  // once the caption is stacked above it — which is how the first pass clipped
  // the bottom tab bar off every shot. Budget the height first, then take
  // whichever of the two constraints binds.
  const aspect = opts.height / opts.width;
  const captionTop = Math.round(opts.height * 0.05);
  const captionFont = Math.round(opts.width * 0.058);
  const captionBlock = Math.round(captionFont * 1.24 * 2); // captions are two lines
  const gap = Math.round(opts.height * 0.035);
  const bottom = Math.round(opts.height * 0.05);
  const bezelPad = Math.round(opts.width * 0.011);

  // RN-Web reports zero safe-area insets, so the capture puts the tab bar flush
  // against the bottom edge — where a realistic corner radius then slices the
  // outer tab labels in half. Real devices keep a home-indicator strip under it.
  // Reproduce that strip in the tab bar's own colour and account for it when
  // sizing, so the frame stays inside the canvas.
  const homeIndicatorRatio = 0.028;
  // Same problem at the top: with no inset, a screen's own navigation header sits
  // at y=0 and the drawn notch lands on top of its title. Real devices reserve a
  // status bar there, so reserve one and tint it to match whatever the capture
  // starts with (pink hero on Home, white header elsewhere) — see the inline
  // script below, which samples row 0 of the capture.
  const statusBarRatio = 0.045;
  const chromeRatio = 1 + homeIndicatorRatio + statusBarRatio;

  const availableHeight = opts.height - captionTop - captionBlock - gap - bottom;
  const deviceWidth = Math.floor(
    Math.min(opts.width * 0.84, availableHeight / (aspect * chromeRatio)) - bezelPad * 2,
  );
  const homeIndicatorPx = Math.round(deviceWidth * aspect * homeIndicatorRatio);
  const statusBarPx = Math.round(deviceWidth * aspect * statusBarRatio);

  return `<!doctype html>
<html lang="x" dir="${opts.rtl ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; }
  body {
    background: linear-gradient(160deg, #FFF2F5 0%, #FDD9E2 45%, #FCB3C4 100%);
    display: flex; flex-direction: column; align-items: center;
    font-family: "Avenir Next", "Segoe UI", "Noto Sans Arabic", system-ui, sans-serif;
  }
  .caption {
    margin-top: ${captionTop}px;
    padding: 0 ${Math.round(opts.width * 0.07)}px;
    font-size: ${captionFont}px;
    line-height: 1.24;
    font-weight: 700;
    color: #7A2740;
    text-align: center;
    white-space: pre-line;
    letter-spacing: ${opts.rtl ? '0' : '-0.01em'};
  }
  .device {
    position: relative;
    margin-top: ${gap}px;
    width: ${deviceWidth + bezelPad * 2}px;
    border-radius: ${opts.bezelRadius}px;
    background: #1B1016;
    padding: ${bezelPad}px;
    box-shadow: 0 ${Math.round(opts.height * 0.018)}px ${Math.round(opts.height * 0.045)}px rgba(122, 39, 64, 0.28);
  }
  .screen {
    position: relative;
    border-radius: ${opts.bezelRadius - bezelPad}px;
    overflow: hidden;
    display: block;
    background: #FFFFFF;
    padding-bottom: ${homeIndicatorPx}px;
    padding-top: ${statusBarPx}px;
  }
  .screen img { display: block; width: 100%; height: auto; }
  .status-bar {
    position: absolute; top: 0; left: 0; right: 0; height: ${statusBarPx}px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 ${Math.round(deviceWidth * 0.07)}px;
    font-size: ${Math.round(statusBarPx * 0.42)}px;
    font-weight: 600; font-variant-numeric: tabular-nums;
    direction: ltr;
  }
  .status-bar .indicators { display: flex; align-items: center; gap: ${Math.round(deviceWidth * 0.014)}px; }
  .status-bar .bars { display: flex; align-items: flex-end; gap: ${Math.round(deviceWidth * 0.005)}px; }
  .status-bar .bars i { width: ${Math.round(deviceWidth * 0.008)}px; background: currentColor; border-radius: 1px; }
  .status-bar .bars i:nth-child(1) { height: ${Math.round(statusBarPx * 0.16)}px; }
  .status-bar .bars i:nth-child(2) { height: ${Math.round(statusBarPx * 0.24)}px; }
  .status-bar .bars i:nth-child(3) { height: ${Math.round(statusBarPx * 0.32)}px; }
  .status-bar .bars i:nth-child(4) { height: ${Math.round(statusBarPx * 0.4)}px; }
  .status-bar .battery {
    width: ${Math.round(deviceWidth * 0.045)}px; height: ${Math.round(statusBarPx * 0.36)}px;
    border: ${Math.max(1, Math.round(deviceWidth * 0.003))}px solid currentColor;
    border-radius: ${Math.round(statusBarPx * 0.1)}px; padding: ${Math.max(1, Math.round(deviceWidth * 0.003))}px;
  }
  .status-bar .battery span { display: block; height: 100%; width: 78%; background: currentColor; border-radius: 1px; }
  .home-indicator {
    position: absolute; bottom: ${Math.round(homeIndicatorPx * 0.35)}px; left: 50%;
    transform: translateX(-50%);
    width: ${Math.round(deviceWidth * 0.34)}px;
    height: ${Math.max(3, Math.round(homeIndicatorPx * 0.16))}px;
    border-radius: 999px; background: #1B1016; opacity: 0.28;
  }
  .notch {
    position: absolute; top: ${Math.round(opts.width * 0.022)}px; left: 50%;
    transform: translateX(-50%);
    background: #1B1016; border-radius: 999px; z-index: 2;
  }
  .notch.dynamic-island { width: ${Math.round(opts.width * 0.2)}px; height: ${Math.round(opts.width * 0.052)}px; }
  .notch.punch-hole { width: ${Math.round(opts.width * 0.05)}px; height: ${Math.round(opts.width * 0.05)}px; }
  .notch.none { display: none; }
</style></head>
<body>
  <div class="caption">${opts.caption.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
  <div class="device">
    <div class="screen">
      <div class="status-bar">
        <span class="clock">9:41</span>
        <span class="indicators">
          <span class="bars"><i></i><i></i><i></i><i></i></span>
          <span class="battery"><span></span></span>
        </span>
      </div>
      <div class="notch ${opts.notch}"></div>
      <img src="${opts.shotDataUri}" alt="">
      <div class="home-indicator"></div>
    </div>
  </div>
  <script>
    // Tint the status bar with whatever the capture starts with, so it reads as
    // part of the screen instead of a grey band pasted on top. Averaging row 0
    // handles both the pink hero on Home and the white headers elsewhere.
    (function () {
      var img = document.querySelector('.screen img');
      var bar = document.querySelector('.status-bar');
      function paint() {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = 1;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, img.naturalWidth, 1, 0, 0, img.naturalWidth, 1);
        var d = ctx.getImageData(0, 0, img.naturalWidth, 1).data;
        var r = 0, g = 0, b = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        bar.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
        var luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        bar.style.color = luminance > 0.6 ? '#1B1016' : '#FFFFFF';
        document.body.dataset.ready = '1';
      }
      // The data: URI can finish decoding before this script runs.
      if (img.complete && img.naturalWidth) paint(); else img.onload = paint;
    })();
  </script>
</body></html>`;
};

async function frame(
  browser: Browser,
  device: DeviceProfile,
  locale: Locale,
  screen: ScreenSpec,
  rawPath: string,
) {
  const width = device.viewport.width * device.scale;
  const height = device.viewport.height * device.scale;
  const dataUri = `data:image/png;base64,${readFileSync(rawPath).toString('base64')}`;

  const html = FRAME_HTML({
    shotDataUri: dataUri,
    caption: screen.caption[locale],
    rtl: RTL[locale],
    width,
    height,
    bezelRadius: device.bezelRadius,
    notch: device.notch,
  });

  const htmlPath = path.join(RAW_DIR, `frame_${device.id}_${locale}_${screen.id}.html`);
  writeFileSync(htmlPath, html, 'utf8');

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
  // The status bar is tinted from the capture's own pixels; shoot only once that
  // has happened, otherwise it lands as an untinted band.
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(250);

  const outDir = path.join(OUT_DIR, device.id, locale);
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${screen.id}.png`);
  await page.screenshot({ path: out });
  await context.close();
  return { out, width, height };
}

/** Comma-separated allow-lists so a single combination can be re-shot cheaply. */
const only = (name: string): string[] =>
  (process.env[name] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

async function main() {
  const onlyDevices = only('ONLY_DEVICE');
  const onlyLocales = only('ONLY_LOCALE');
  const onlyScreens = only('ONLY_SCREEN');

  const devices = DEVICES.filter((d) => !onlyDevices.length || onlyDevices.includes(d.id));
  const locales = LOCALES.filter((l) => !onlyLocales.length || onlyLocales.includes(l));
  const screens = SCREENS.filter((s) => !onlyScreens.length || onlyScreens.includes(s.id));

  const browser = await chromium.launch();
  const produced: string[] = [];

  try {
    for (const device of devices) {
      for (const locale of locales) {
        for (const screen of screens) {
          const raw = await capture(browser, device, locale, screen);
          const { out, width, height } = await frame(browser, device, locale, screen, raw);
          produced.push(`${width}x${height}  ${path.relative(APP_DIR, out)}`);
          process.stdout.write(`  ${path.relative(APP_DIR, out)}\n`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${produced.length} screenshots written under store/screenshots/`);
  for (const device of devices) {
    console.log(`  ${device.id.padEnd(14)} -> ${device.slot}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
