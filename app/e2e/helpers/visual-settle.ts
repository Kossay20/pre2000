import type { Page } from '@playwright/test';

/**
 * What a "settled" frame must satisfy beyond "two samples look alike". A stalled frame
 * (long task, throttled rAF) is identical to itself, so frame-to-frame equality alone
 * accepted a hero at opacity 0.185 (A-012) and a whole screen sitting 98 px left (B-032).
 */
export type FrameProblems = {
  /** Visible, non-disabled blocks of text still below full opacity (mid fade-in). */
  lowOpacity: string[];
  /** Finite CSS/Web animations still running (fade/slide that has not finished). */
  runningAnimations: number;
  /** Horizontal displacement: document scrolled, or a tab bar / the app root not inside the viewport. */
  offsets: string[];
};

export type FrameCheck = { ok: boolean; problems: FrameProblems };

/** One in-page pass over the current frame. Cheap (no screenshot). */
export async function inspectFrame(page: Page, opts: { opacity?: boolean } = {}): Promise<FrameCheck> {
  const checkOpacity = opts.opacity !== false;
  const problems = await page
    .evaluate((withOpacity): FrameProblems => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const label = (el: Element) => {
        const h = el as HTMLElement;
        const t = (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}"${t}"`;
      };
      const lowOpacity: string[] = [];
      if (withOpacity) {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('[style*="opacity"]'))) {
          const o = parseFloat(getComputedStyle(el).opacity);
          // Below 0.05 is a parked/hidden screen (RN-web keeps blurred stack screens mounted);
          // a disabled control's dim opacity is design, not a fade.
          if (!(o >= 0.05 && o < 0.99)) continue;
          if (el.closest('[aria-disabled="true"],[disabled],[aria-hidden="true"]')) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 150 || r.height < 48) continue;
          if (r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh) continue;
          if (!(el.innerText || '').trim()) continue;
          lowOpacity.push(`${label(el)} opacity=${o.toFixed(3)}`);
        }
      }
      let runningAnimations = 0;
      try {
        runningAnimations = document
          .getAnimations()
          .filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity).length;
      } catch {
        /* getAnimations unsupported */
      }
      const offsets: string[] = [];
      const scroller = document.scrollingElement;
      if (scroller && scroller.scrollLeft !== 0) offsets.push(`document scrollLeft=${scroller.scrollLeft}`);
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"],[role="tab"]'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Fully off-screen = a parked screen, not this one; partially clipped = shifted.
        if (r.right <= 1 || r.left >= vw - 1 || r.bottom <= 0 || r.top >= vh) continue;
        if (r.left < -1 || r.right > vw + 1) offsets.push(`${label(el)} x=${Math.round(r.left)}..${Math.round(r.right)} (viewport ${vw})`);
      }
      const root = document.getElementById('root') || document.body;
      const rr = root.getBoundingClientRect();
      if (Math.abs(rr.left) > 1) offsets.push(`app root x=${Math.round(rr.left)}`);
      return { lowOpacity, runningAnimations, offsets };
    }, checkOpacity)
    .catch((): FrameProblems => ({ lowOpacity: [], runningAnimations: 0, offsets: [] }));
  const ok = problems.lowOpacity.length === 0 && problems.runningAnimations === 0 && problems.offsets.length === 0;
  return { ok, problems };
}

export function describeProblems(p: FrameProblems): string {
  const parts: string[] = [];
  if (p.lowOpacity.length) parts.push(`still fading: ${p.lowOpacity.slice(0, 3).join('; ')}`);
  if (p.runningAnimations) parts.push(`${p.runningAnimations} finite animation(s) running`);
  if (p.offsets.length) parts.push(`horizontal offset: ${p.offsets.slice(0, 3).join('; ')}`);
  return parts.join(' | ');
}

/**
 * Poll `inspectFrame` every 100 ms until the frame is clean, up to `timeoutMs`. The
 * caller records `!ok` as a failing (soft) assertion — a frame captured mid-fade or
 * offset is never silently accepted.
 */
export async function waitFrameClean(
  page: Page,
  timeoutMs = 4_000,
  opts: { opacity?: boolean } = {},
): Promise<FrameCheck & { ms: number }> {
  const t0 = Date.now();
  let check = await inspectFrame(page, opts);
  while (!check.ok && Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(100);
    check = await inspectFrame(page, opts);
  }
  return { ...check, ms: Date.now() - t0 };
}
