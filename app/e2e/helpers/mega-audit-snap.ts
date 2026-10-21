import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';

type ConsoleEntry = {
  level: string;
  text: string;
  location?: { url?: string; lineNumber?: number; columnNumber?: number };
  stack?: string;
  /** Dialog entries only (see `recordEvent` / dialog-recorder.ts). */
  type?: string;
  message?: string;
  action?: string;
  ts: number;
};

/** What `attachDialogRecorder` (and any other side channel) needs to write into the quartet. */
export type QuartetEventSink = {
  recordEvent: (entry: Omit<ConsoleEntry, 'ts'> & { ts?: number }) => void;
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
  /** Requests whose duration was measured; a run with 0 means the recorder is blind (A-042). */
  let durationsSeen = 0;
  let requestsSeen = 0;

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
  // Playwright reports a request's timing only once it has finished (inside the
  // "response" event responseEnd is still -1), so the clock is ours: start on "request",
  // stop on "requestfinished" / "requestfailed".
  const startedAt = new WeakMap<object, number>();
  const onRequest = (req: object) => {
    requestsSeen++;
    startedAt.set(req, Date.now());
  };
  const SLOW_MS = 2000;
  type Req = { method: () => string; url: () => string; response: () => Promise<{ status: () => number } | null>; failure?: () => { errorText: string } | null };
  const record = async (req: Req, failed: boolean) => {
    try {
      const t0 = startedAt.get(req);
      const duration = t0 === undefined ? null : Date.now() - t0;
      startedAt.delete(req);
      const resp = failed ? null : await req.response().catch(() => null);
      const status = resp ? resp.status() : 0;
      durationsSeen += duration === null ? 0 : 1;
      // Aborted/failed requests (status 0) are page-lifecycle noise unless slow; HTTP errors and slow calls are evidence.
      if (status >= 400 || (duration !== null && duration > SLOW_MS)) {
        networkBuffer.push({
          url: req.url().substring(0, 400),
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
  const onRequestFinished = (req: Req) => void record(req, false);
  const onRequestFailed = (req: Req) => void record(req, true);

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('request', onRequest);
  page.on('requestfinished', onRequestFinished);
  page.on('requestfailed', onRequestFailed);

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
    page.off('request', onRequest);
    page.off('requestfinished', onRequestFinished);
    page.off('requestfailed', onRequestFailed);
  }

  /**
   * Append an out-of-band entry (e.g. a window.confirm/alert/prompt message) to the
   * buffer, so it lands in the NEXT snap's console.json.
   */
  const recordEvent: QuartetEventSink['recordEvent'] = (entry) => {
    consoleBuffer.push({
      ...entry,
      text: String(entry.text || '').substring(0, 2000),
      ts: entry.ts ?? Date.now(),
    });
  };

  /** Requests seen vs. requests with a measured duration (a run with requests > 0 and measured 0 means the recorder is blind). */
  const measuredDurations = () => ({ requests: requestsSeen, measured: durationsSeen });

  return { snap, dispose, recordEvent, measuredDurations };
}
