/**
 * Play Console feature graphic — 1024x500, one per listing locale.
 *
 * Play requires exactly this asset and will not publish a listing without it. It
 * is the banner shown above the screenshots, and Play crops it in several
 * placements, so everything that matters stays inside a centred safe area.
 *
 * Rendered in Chromium rather than an image library for the same reason as the
 * screenshot framing: the Arabic tagline needs bidi + shaping, and the local PIL
 * build has no raqm.
 *
 * Unlike `capture-store-screenshots.ts`, this needs no dev server — it composes
 * brand assets that are already in the repo.
 *
 * Run:  npx tsx scripts/generate-feature-graphic.ts
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(APP_DIR, 'store', 'feature-graphic');

const WIDTH = 1024;
const HEIGHT = 500;
/** Play crops the outer band in some surfaces; keep content inside this margin. */
const SAFE_MARGIN_X = 96;

const LOCALES = ['fr', 'en', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

const RTL: Record<Locale, boolean> = { fr: false, en: false, ar: true };

/**
 * Short enough to stay legible at the cropped sizes Play renders. The French
 * line is the long one; it carries an explicit break so it reads as a balanced
 * two-line lockup instead of wrapping with "semaine" orphaned on line two.
 */
const TAGLINE: Record<Locale, string> = {
  fr: 'Votre compagnon de grossesse,\nsemaine après semaine',
  en: 'Your pregnancy companion, week by week',
  ar: 'رفيقتك في الحمل، أسبوعاً بعد أسبوع',
};

const dataUri = (relativePath: string) =>
  `data:image/png;base64,${readFileSync(path.join(APP_DIR, relativePath)).toString('base64')}`;

const html = (locale: Locale, markUri: string) => `<!doctype html>
<html lang="${locale}" dir="${RTL[locale] ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    /* Same pink-to-coral sweep as the app icon, so the listing reads as one set. */
    background: linear-gradient(115deg, #FA8EC0 0%, #FC8F96 52%, #FBA06E 100%);
    display: flex; align-items: center; justify-content: center;
    font-family: "Avenir Next", "Segoe UI", "Noto Sans Arabic", system-ui, sans-serif;
    position: relative;
  }
  /* A soft vignette keeps the white artwork readable over the lighter corner. */
  body::after {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 40%, rgba(122,39,64,0.18) 100%);
  }
  .stage {
    position: relative; z-index: 1;
    display: flex; flex-direction: column; align-items: center;
    padding: 0 ${SAFE_MARGIN_X}px;
    text-align: center;
  }
  .mark { height: 244px; margin-bottom: 30px; }
  .tagline {
    font-size: ${RTL[locale] ? 36 : 34}px;
    max-width: 760px;
    font-weight: 600;
    color: #FFFFFF;
    letter-spacing: ${RTL[locale] ? '0' : '0.01em'};
    text-shadow: 0 2px 10px rgba(122, 39, 64, 0.30);
    line-height: 1.3;
    white-space: pre-line;
  }
</style></head>
<body>
  <div class="stage">
    <img class="mark" src="${markUri}" alt="">
    <div class="tagline">${TAGLINE[locale]}</div>
  </div>
</body></html>`;

async function main() {
  // The trimmed wordmark, not `assets/splash-icon.png`: the splash asset keeps a
  // wide transparent margin by design, so sizing it by height renders the padding
  // and shrinks the artwork to an illegible smudge.
  const markUri = dataUri('store/brand/wordmark.png');
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const locale of LOCALES) {
      const htmlPath = path.join(OUT_DIR, `_${locale}.html`);
      writeFileSync(htmlPath, html(locale, markUri), 'utf8');

      const context = await browser.newContext({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
      await page.waitForTimeout(200);

      const out = path.join(OUT_DIR, `feature-graphic-${locale}-1024x500.png`);
      await page.screenshot({ path: out });
      await context.close();
      console.log(`  ${path.relative(APP_DIR, out)}  ${WIDTH}x${HEIGHT}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
