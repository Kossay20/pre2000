/**
 * Round-11 regression guards: page-side measurements shared by wave C and wave E.
 *
 * Each function returns plain data (no assertions) so the caller records it next to its
 * state and asserts with the finding id. They exist because the round-10 fix wave changed
 * these surfaces and the specs had nothing that could fail when they broke again:
 *
 *  - babyEvolutionDots   C-058 / B-046: the nine month dots share one row
 *  - greetingVsAvatar    C-057 / A-049: the Home greeting never runs under the avatar (ltr + rtl)
 *  - headingAudit        E-057 / A-048 / A-051 / E-058: one non-empty heading, no blank header band
 *  - pillContainment     B-045: the Home pill's content stays inside its border
 *  - placeholderEmoji    C-059 / B-030: cards carry no placeholder emoji (📰 📚 💊 …)
 */
import type { Page } from '@playwright/test';

export type DotsReport = {
  vw: number;
  count: number;
  names: string[];
  tops: number[];
  lefts: number[];
  rights: number[];
  distinctTops: number;
  insideViewport: boolean;
};

/** The nine "Mois n" progress dots of Baby Evolution (buttons whose label starts with the month label). */
export async function babyEvolutionDots(page: Page, monthLabelRe: string): Promise<DotsReport> {
  return page.evaluate((reSrc) => {
    const re = new RegExp(reSrc);
    const vw = window.innerWidth;
    const dots = (Array.from(document.querySelectorAll('[role=button],button')) as HTMLElement[])
      .filter((e) => !e.closest('[aria-hidden=true]') && e.getBoundingClientRect().width > 0 && re.test((e.getAttribute('aria-label') || '').trim()))
      .map((e) => ({ name: (e.getAttribute('aria-label') || '').trim(), r: e.getBoundingClientRect() }))
      .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    const tops = dots.map((d) => Math.round(d.r.top));
    return {
      vw,
      count: dots.length,
      names: dots.map((d) => d.name),
      tops,
      lefts: dots.map((d) => Math.round(d.r.left)),
      rights: dots.map((d) => Math.round(d.r.right)),
      distinctTops: new Set(tops).size,
      insideViewport: dots.every((d) => d.r.left >= -0.5 && d.r.right <= vw + 0.5),
    };
  }, monthLabelRe);
}

export type GreetingReport =
  | { found: false; greeting: boolean; avatar: boolean }
  | {
      found: true;
      text: string;
      ink: { left: number; right: number; top: number; bottom: number };
      avatar: { left: number; right: number; top: number; bottom: number };
      overlapArea: number;
      /** horizontal gap between the text ink and the avatar (negative = overlap) */
      gapPx: number;
      insideViewport: boolean;
      vw: number;
      dir: string | null;
    };

/**
 * Ink of the greeting (Range over the text that contains `name`) against the avatar: the
 * button whose whole text is the name's capital initial, in the top 160 px of the page.
 * Physical coordinates, so it holds for ltr and for rtl (web: dir=rtl, forceRTL skipped).
 */
export async function greetingVsAvatar(page: Page, name: string): Promise<GreetingReport> {
  return page.evaluate((n) => {
    const norm = (t: string) => (t || '').replace(/[\s  ]+/g, ' ').trim();
    const initial = n.charAt(0).toUpperCase();
    const vw = window.innerWidth;
    const visible = (e: Element) => !e.closest('[aria-hidden=true]') && (e as HTMLElement).getBoundingClientRect().width > 0;
    const greet = (Array.from(document.body.querySelectorAll('*')) as HTMLElement[]).find(
      (e) => visible(e) && e.getBoundingClientRect().top < 260 && norm(Array.from(e.childNodes).filter((x) => x.nodeType === 3).map((x) => x.textContent || '').join('')).includes(n),
    );
    const avatar = (Array.from(document.querySelectorAll('[role=button],button')) as HTMLElement[]).find(
      (e) => visible(e) && e.getBoundingClientRect().top < 160 && norm(e.innerText) === initial,
    );
    if (!greet || !avatar) return { found: false as const, greeting: !!greet, avatar: !!avatar };
    const range = document.createRange();
    range.selectNodeContents(greet);
    const t = range.getBoundingClientRect();
    const a = avatar.getBoundingClientRect();
    const w = Math.min(t.right, a.right) - Math.max(t.left, a.left);
    const h = Math.min(t.bottom, a.bottom) - Math.max(t.top, a.top);
    const gapPx = t.right <= a.left ? a.left - t.right : t.left >= a.right ? t.left - a.right : -(Math.max(0, w));
    const rnd = (v: number) => Math.round(v * 10) / 10;
    return {
      found: true as const,
      text: norm(greet.innerText),
      ink: { left: rnd(t.left), right: rnd(t.right), top: rnd(t.top), bottom: rnd(t.bottom) },
      avatar: { left: rnd(a.left), right: rnd(a.right), top: rnd(a.top), bottom: rnd(a.bottom) },
      overlapArea: w > 0 && h > 0 ? Math.round(w * h) : 0,
      gapPx: rnd(h > 0 ? gapPx : 9999),
      insideViewport: t.left >= -0.5 && t.right <= vw + 0.5,
      vw,
      dir: document.documentElement.getAttribute('dir'),
    };
  }, name);
}

export type HeadingReport = {
  headings: Array<{ tag: string; level: string | null; text: string; top: number; bottom: number }>;
  nonEmpty: number;
  empty: number;
  /** a full-width box pinned to the top (40-90 px high) with neither text nor a control inside */
  blankHeaderBand: { height: number } | null;
  band: { height: number; hasContent: boolean } | null;
};

/** Visible headings (h1-h6 / role=heading) and whether the top header band carries anything. */
export async function headingAudit(page: Page): Promise<HeadingReport> {
  return page.evaluate(() => {
    const norm = (t: string) => (t || '').replace(/[\s  ]+/g, ' ').trim();
    const vw = window.innerWidth;
    const visible = (e: Element) => !e.closest('[aria-hidden=true]') && (e as HTMLElement).getBoundingClientRect().width > 0;
    const headings = (Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')) as HTMLElement[])
      // an empty heading has no ink and often no height: keep it (that is the defect), drop only the hidden ones
      .filter((e) => !e.closest('[aria-hidden=true]') && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        level: e.getAttribute('aria-level'),
        text: norm(e.innerText || e.textContent || '') || norm(e.getAttribute('aria-label') || ''),
        top: Math.round(e.getBoundingClientRect().top),
        bottom: Math.round(e.getBoundingClientRect().bottom),
      }));
    // The header band: boxes touching the top edge, nearly full width, 40-90 px high.
    const all = Array.from(document.body.querySelectorAll('*')) as HTMLElement[];
    const bands = all.filter((e) => {
      if (!visible(e)) return false;
      const r = e.getBoundingClientRect();
      return r.top <= 2 && r.top >= -2 && r.width >= vw - 2 && r.height >= 40 && r.height <= 90;
    });
    let band: { height: number; hasContent: boolean } | null = null;
    if (bands.length) {
      const bottom = Math.max(...bands.map((b) => b.getBoundingClientRect().bottom));
      const hasContent = all.some((e) => {
        if (!visible(e)) return false;
        const r = e.getBoundingClientRect();
        if (r.top < -1 || r.bottom > bottom + 2) return false;
        const isControl = e.matches('button,[role=button],a[href],[role=link]');
        const ownText = norm(Array.from(e.childNodes).filter((x) => x.nodeType === 3).map((x) => x.textContent || '').join(''));
        return isControl || ownText.length > 0;
      });
      band = { height: Math.round(bottom), hasContent };
    }
    return {
      headings,
      nonEmpty: headings.filter((h) => h.text.length > 0).length,
      empty: headings.filter((h) => h.text.length === 0).length,
      blankHeaderBand: band && !band.hasContent ? { height: band.height } : null,
      band,
    };
  });
}

export type PillReport = {
  found: boolean;
  pill?: { left: number; right: number; top: number; bottom: number };
  rows: string[];
  /** descendants (visible) that stick out of the pill's box horizontally */
  outside: Array<{ what: string; left: number; right: number; overflowPx: number }>;
};

/**
 * The Home pill (DailyRoutinesTracker): the bordered container of the "Ma Journée n/m" and / or
 * "Vous avez n rendez-vous ..." rows. Everything drawn in it (icon, text, chevron) must sit
 * inside its own border, in ltr and rtl.
 */
export async function pillContainment(page: Page, rowLabelRe: string): Promise<PillReport> {
  return page.evaluate((reSrc) => {
    const re = new RegExp(reSrc);
    const rows = (Array.from(document.querySelectorAll('[role=button],button')) as HTMLElement[]).filter(
      (e) => !e.closest('[aria-hidden=true]') && e.getBoundingClientRect().width > 0 && re.test((e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()),
    );
    if (!rows.length) return { found: false, rows: [], outside: [] };
    // the bordered ancestor that holds the rows
    let pill: HTMLElement | null = null;
    for (let a: HTMLElement | null = rows[0].parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const bw = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      if (bw > 0 && a.contains(rows[rows.length - 1])) {
        pill = a;
        break;
      }
    }
    if (!pill) pill = rows[0].parentElement;
    const pr = pill!.getBoundingClientRect();
    const outside: Array<{ what: string; left: number; right: number; overflowPx: number }> = [];
    for (const d of Array.from(pill!.querySelectorAll('*')) as HTMLElement[]) {
      const r = d.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || d.closest('[aria-hidden=true]')) continue;
      const over = Math.max(pr.left - r.left, r.right - pr.right);
      if (over > 1) {
        outside.push({
          what: (d.getAttribute('aria-label') || d.innerText || d.tagName).replace(/\s+/g, ' ').trim().slice(0, 50),
          left: Math.round(r.left),
          right: Math.round(r.right),
          overflowPx: Math.round(over),
        });
      }
    }
    return {
      found: true,
      pill: { left: Math.round(pr.left), right: Math.round(pr.right), top: Math.round(pr.top), bottom: Math.round(pr.bottom) },
      rows: rows.map((r) => (r.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()),
      outside,
    };
  }, rowLabelRe);
}

export const PLACEHOLDER_EMOJI = '📰|📚|💊|📖|📄|🗞️?';

/**
 * Card buttons (a title + more than 20 characters of text) that draw one of the stand-in
 * emoji as a leaf of their own — the flat thumbnail glyph the category icons replaced.
 */
export async function placeholderEmojiCards(page: Page): Promise<Array<{ card: string; glyph: string }>> {
  return page.evaluate((glyphs) => {
    const re = new RegExp(`^(${glyphs})$`, 'u');
    const norm = (t: string) => (t || '').replace(/[\s  ]+/g, ' ').trim();
    const cards = (Array.from(document.querySelectorAll('[role=button],button,a[href]')) as HTMLElement[]).filter(
      (e) => !e.closest('[aria-hidden=true]') && e.getBoundingClientRect().width > 0,
    );
    const out: Array<{ card: string; glyph: string }> = [];
    for (const c of cards) {
      const leaves = (Array.from(c.querySelectorAll('*')) as HTMLElement[]).filter((e) => e.children.length === 0);
      const hit = leaves.find((l) => re.test(norm(l.textContent || '')));
      if (!hit) continue;
      const rest = norm((c.innerText || '').replace(norm(hit.textContent || ''), ''));
      if (rest.length > 20) out.push({ card: (c.getAttribute('aria-label') || rest).slice(0, 70), glyph: norm(hit.textContent || '') });
    }
    return out;
  }, PLACEHOLDER_EMOJI);
}
