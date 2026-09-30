import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';

type ConsoleEntry = {
  level: string;
  text: string;
  location?: { url?: string; lineNumber?: number; columnNumber?: number };
  stack?: string;
  ts: number;
};

type NetworkEntry = {
  url: string;
  method: string;
  status: number;
  duration_ms: number | null;
  ts: number;
};

/**
 * Artifact quartet recorder: PNG + DOM HTML + console JSON + network JSON per state.
 * Extra dirs (scratch + reports) get a copy of each snap when provided.
 */
export function attachMegaAuditRecorder(page: Page, screenshotDirs: string | string[]) {
  const dirs = (Array.isArray(screenshotDirs) ? screenshotDirs : [screenshotDirs]).filter(Boolean);
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });

  let consoleBuffer: ConsoleEntry[] = [];
  let networkBuffer: NetworkEntry[] = [];

  const onConsole = (msg: { type: () => string; text: () => string; location: () => ConsoleEntry['location'] }) => {
    try {
      consoleBuffer.push({
        level: msg.type(),
        text: String(msg.text() || '').substring(0, 2000),
        location: msg.location(),
        ts: Date.now(),
      });
    } catch {
      /* ignore serialize errors */
    }
  };
  const onPageError = (err: Error) => {
    consoleBuffer.push({
      level: 'pageerror',
      text: String(err.message || err).substring(0, 2000),
      stack: String(err.stack || '').substring(0, 4000),
      ts: Date.now(),
    });
  };
  const onResponse = (resp: { status: () => number; url: () => string; request: () => { method: () => string; timing: () => { responseEnd?: number } } }) => {
    try {
      const req = resp.request();
      const timing = req.timing();
      const duration = timing && typeof timing.responseEnd === 'number' && timing.responseEnd >= 0
        ? Math.round(timing.responseEnd)
        : null;
      const status = resp.status();
      if (status >= 400 || (duration !== null && duration > 2000)) {
        networkBuffer.push({
          url: resp.url().substring(0, 400),
          method: req.method(),
          status,
          duration_ms: duration,
          ts: Date.now(),
        });
      }
    } catch {
      /* ignore */
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  async function snap(name: string) {
    const html = await page.content().catch(() => '');
    const consoleJson = JSON.stringify(consoleBuffer, null, 2);
    const networkJson = JSON.stringify(networkBuffer, null, 2);
    for (const dir of dirs) {
      const base = path.join(dir, name);
      await page.screenshot({ path: `${base}.png`, fullPage: false });
      fs.writeFileSync(`${base}.dom.html`, html.substring(0, 500_000));
      fs.writeFileSync(`${base}.console.json`, consoleJson);
      fs.writeFileSync(`${base}.network.json`, networkJson);
    }
    networkBuffer = [];
    consoleBuffer = [];
  }

  function dispose() {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }

  return { snap, dispose };
}
