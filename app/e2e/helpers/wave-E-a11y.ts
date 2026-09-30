/**
 * Wave E (final-release-2026-09-30) — automated form-factor + accessibility probes.
 *
 * Everything here is MEASUREMENT: it reads the DOM / computed styles / the Chromium
 * accessibility tree and returns plain JSON. The spec decides what to assert, and
 * writes the JSON next to the quartet (`<state>.a11y.json`) so the adversarial
 * reviewer can re-check every number.
 *
 * Sources of truth:
 *  - accessible names + roles: Chromium's AX tree via CDP (`Accessibility.getPartialAXTree`),
 *    not a home-made name computation;
 *  - geometry: `getBoundingClientRect` (CSS px);
 *  - contrast: computed `color` / `background-color` / `opacity` along the ancestor
 *    chain, composited exactly for normal blending. A CSS linear-gradient is evaluated
 *    at the text's own position (worst of three points across the text box), not at its
 *    worst stop; a url() background image marks the sample `indeterminate`;
 *  - layering: an element whose screen/layer is painted over (a tab kept mounted behind
 *    the active one, the page under a modal scrim) is `covered` and left out of the
 *    target, name, overlap and contrast counts (it is counted in `summary.covered`);
 *  - hitSlop: RN-web does not render it, so the DOM box understates native targets.
 *    The React props of the pressable are read and `small44Native` uses the slop box.
 *
 * Strings are cut by code point (`cut`), never mid surrogate pair, so the JSON stays
 * valid for strict parsers.
 */
import fs from 'fs';
import path from 'path';
import type { CDPSession, Page } from '@playwright/test';

export const TARGET_MIN = 44; // Apple HIG / WCAG 2.5.5 (AAA) — plan acceptance
export const TARGET_WCAG_258 = 24; // WCAG 2.2 2.5.8 (AA) minimum

export type Rect = { x: number; y: number; w: number; h: number };

export type InteractiveEl = {
  idx: number;
  tag: string;
  domRole: string | null;
  axRole: string | null;
  axName: string;
  testId: string | null;
  text: string;
  rect: Rect;
  inViewport: boolean;
  disabled: boolean;
  /** focusable div without an ARIA role (RN-web TouchableOpacity without accessibilityRole) */
  roleless: boolean;
  /** AX name empty */
  unnamed: boolean;
  /** AX name made only of emoji / symbols / private-use icon glyphs */
  symbolOnlyName: boolean;
  small44: boolean;
  below24: boolean;
  /** hitSlop read from the pressable's React props (native-only on RN-web) */
  hitSlop: { top: number; bottom: number; left: number; right: number } | null;
  /** small44 re-evaluated on the DOM box grown by hitSlop — the native touch area */
  small44Native: boolean;
  html: string;
};

export type ContrastSample = {
  text: string;
  fg: string;
  bg: string;
  ratio: number | null;
  fontSize: number;
  fontWeight: number;
  large: boolean;
  threshold: number;
  pass: boolean | null;
  indeterminate?: string;
  gradient?: string;
  disabled: boolean;
  placeholder?: boolean;
  count: number;
  rect: Rect;
  path: string;
};

export type LayoutProbe = {
  viewport: { w: number; h: number; dpr: number };
  doc: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
  horizontalScroll: boolean;
  /** visible elements whose box leaves the viewport horizontally (outside any horizontal scroller) */
  offscreenX: Array<{ text: string; rect: Rect; path: string }>;
  /** text inside a button/tab/link that is cut (ellipsis / overflow / line-clamp) */
  clippedLabels: Array<{ intentionalTruncation: boolean; text: string; role: string | null; scrollW: number; clientW: number; scrollH: number; clientH: number; rect: Rect; path: string }>;
  /** pairs of distinct, non-nested visible interactive elements whose boxes intersect */
  overlaps: Array<{ a: string; b: string; area: number; ra: Rect; rb: Rect }>;
  tablist: null | { rect: Rect; tabs: Array<{ name: string; rect: Rect; truncated: boolean }> ; fullyInViewport: boolean };
  htmlDir: string | null;
  htmlLang: string | null;
};

export type A11yReport = {
  state: string;
  url: string;
  ts: string;
  layout: LayoutProbe;
  interactive: InteractiveEl[];
  summary: {
    interactiveCount: number;
    /** interactive elements left out because their layer is painted over */
    covered: number;
    unnamed: number;
    /** unnamed AND no visible text — truly nameless (the rest are role-less divs with text) */
    unnamedNoText: number;
    /** role-less focusable divs that do show text (Chromium gives them no name) */
    rolelessWithText: number;
    small44Native: number;
    symbolOnlyName: number;
    roleless: number;
    small44: number;
    below24: number;
    contrastSamples: number;
    contrastFails: number;
    contrastIndeterminate: number;
    horizontalScroll: boolean;
    offscreenX: number;
    clippedLabels: number;
    overlaps: number;
  };
  contrast: ContrastSample[];
  extra?: Record<string, unknown>;
};

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type=hidden])',
  'textarea',
  'select',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=switch]',
  '[role=tab]',
  '[role=radio]',
  '[role=menuitem]',
  '[role=slider]',
  '[tabindex="0"]',
].join(',');

/**
 * In-page helpers shared by the probes (each page.evaluate body is serialised on its
 * own, so they live on window):
 *  - cut(s, n): first n code points — never splits a surrogate pair (E-025);
 *  - covered(el): is el's layer painted over? The layer is el's nearest ancestor at
 *    least half the viewport in both directions (a screen, a modal); it is covered
 *    when ≥4 of 5 sample points inside it hit something outside it (E-021);
 *  - gradientAt(bi, rect, x, y): colour of a CSS linear-gradient at a point (E-020);
 *  - hitSlopOf(el): hitSlop prop of the pressable that rendered el (E-023).
 */
async function installPageHelpers(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    if (w.__e2eA11y) return;
    const cut = (s: string, n: number) => Array.from(s || '').slice(0, n).join('');
    const covered = (el: Element) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let layer: Element | null = el;
      while (layer && layer !== document.body) {
        const r = layer.getBoundingClientRect();
        if (r.width >= vw * 0.5 && r.height >= vh * 0.5) break;
        layer = layer.parentElement;
      }
      if (!layer || layer === document.body) return false;
      const r = layer.getBoundingClientRect();
      const x0 = Math.max(0, r.left);
      const x1 = Math.min(vw, r.right);
      const y0 = Math.max(0, r.top);
      const y1 = Math.min(vh, r.bottom);
      if (x1 - x0 < 4 || y1 - y0 < 4) return false;
      const pts: Array<[number, number]> = [
        [(x0 + x1) / 2, (y0 + y1) / 2],
        [x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.25],
        [x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.25],
        [x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.75],
        [x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.75],
      ];
      let outside = 0;
      for (const [x, y] of pts) {
        const top = document.elementFromPoint(x, y);
        if (top && !layer.contains(top) && !top.contains(layer)) outside++;
      }
      return outside >= 4;
    };
    type C = { r: number; g: number; b: number; a: number };
    const parse = (c: string): C | null => {
      const m = c && c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map((x) => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    };
    // Split on commas that are not inside parentheses.
    const topLevel = (s: string) => {
      const out: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
          out.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    };
    const gradientAt = (bi: string, rect: DOMRect, x: number, y: number): C | null => {
      const m = bi.match(/linear-gradient\((.*)\)\s*$/);
      if (!m) return null;
      const parts = topLevel(m[1]);
      const W = rect.width;
      const H = rect.height;
      let dx = 0;
      let dy = 1; // CSS default: to bottom
      if (parts.length && !/^rgba?\(/.test(parts[0])) {
        const head = parts.shift()!;
        const deg = head.match(/^(-?[\d.]+)deg$/);
        if (deg) {
          const t = (parseFloat(deg[1]) * Math.PI) / 180;
          dx = Math.sin(t);
          dy = -Math.cos(t);
        } else {
          const right = /right/.test(head);
          const left = /left/.test(head);
          const top = /top/.test(head);
          const bottom = /bottom/.test(head);
          if ((right || left) && (top || bottom)) {
            // corner keyword: perpendicular to the diagonal joining the other two corners
            dx = (right ? 1 : -1) * H;
            dy = (bottom ? 1 : -1) * W;
            const n = Math.hypot(dx, dy) || 1;
            dx /= n;
            dy /= n;
          } else {
            dx = right ? 1 : left ? -1 : 0;
            dy = bottom ? 1 : top ? -1 : 0;
          }
        }
      }
      const stops = parts
        .map((p) => {
          const col = parse(p);
          const pos = p.match(/\)\s*(-?[\d.]+)%/);
          return col ? { col, pos: pos ? parseFloat(pos[1]) / 100 : NaN } : null;
        })
        .filter((z): z is { col: C; pos: number } => !!z);
      if (!stops.length) return null;
      if (isNaN(stops[0].pos)) stops[0].pos = 0;
      if (isNaN(stops[stops.length - 1].pos)) stops[stops.length - 1].pos = 1;
      for (let i = 1; i < stops.length - 1; i++) {
        if (!isNaN(stops[i].pos)) continue;
        let j = i;
        while (isNaN(stops[j].pos)) j++;
        const a = stops[i - 1].pos;
        const b = stops[j].pos;
        for (let k = i; k < j; k++) stops[k].pos = a + ((b - a) * (k - i + 1)) / (j - i + 1);
      }
      const L = Math.abs(W * dx) + Math.abs(H * dy) || 1;
      const cx = rect.left + W / 2;
      const cy = rect.top + H / 2;
      const t = Math.min(1, Math.max(0, 0.5 + ((x - cx) * dx + (y - cy) * dy) / L));
      if (t <= stops[0].pos) return stops[0].col;
      for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i].pos) {
          const a = stops[i - 1];
          const b = stops[i];
          const u = b.pos === a.pos ? 1 : (t - a.pos) / (b.pos - a.pos);
          return {
            r: a.col.r + (b.col.r - a.col.r) * u,
            g: a.col.g + (b.col.g - a.col.g) * u,
            b: a.col.b + (b.col.b - a.col.b) * u,
            a: a.col.a + (b.col.a - a.col.a) * u,
          };
        }
      }
      return stops[stops.length - 1].col;
    };
    const hitSlopOf = (el: Element) => {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      let fiber = key ? (el as any)[key] : null;
      // Walk up the composite fibers that rendered this host node (stop at the next DOM node).
      for (let i = 0; fiber && i < 8; i++) {
        const hs = fiber.memoizedProps?.hitSlop;
        if (hs != null) {
          if (typeof hs === 'number') return { top: hs, bottom: hs, left: hs, right: hs };
          return { top: hs.top || 0, bottom: hs.bottom || 0, left: hs.left || 0, right: hs.right || 0 };
        }
        fiber = fiber.return;
        if (fiber && fiber.stateNode instanceof Element && fiber.stateNode !== el) break;
      }
      return null;
    };
    w.__e2eA11y = { cut, covered, gradientAt, hitSlopOf };
  });
}

/** In-page: tag every visible interactive element and return raw geometry. */
async function collectInteractive(page: Page) {
  return page.evaluate((SEL) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const vis = (el: Element) => {
      const anyEl = el as any;
      if (typeof anyEl.checkVisibility === 'function') {
        if (!anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const H = (window as any).__e2eA11y;
    document.querySelectorAll('[data-e2e-a11y-idx]').forEach((e) => e.removeAttribute('data-e2e-a11y-idx'));
    // Off-canvas pager pages (x < 0 / x ≥ vw, e.g. the inactive Reminders/Tasks page) and
    // aria-hidden subtrees are not user-reachable: excluded, and counted in `skipped`.
    const reachable = Array.from(document.querySelectorAll(SEL))
      .filter(vis)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > 0 && r.left < vw && !el.closest('[aria-hidden=true]');
      });
    // A layer painted over (inactive tab kept mounted, page under a modal scrim) is not
    // what the user sees or touches: counted, not measured.
    const coveredCount = reachable.filter((el) => H.covered(el)).length;
    const all = reachable.filter((el) => !H.covered(el));
    // Drop an element if an interactive ancestor already covers it with the same box
    // (RN-web nests a tabindex div inside a button in a few components).
    const out: any[] = [];
    all.forEach((el, i) => {
      el.setAttribute('data-e2e-a11y-idx', String(i));
      const r = el.getBoundingClientRect();
      const disabled =
        el.getAttribute('aria-disabled') === 'true' ||
        (el as HTMLButtonElement).disabled === true ||
        !!el.closest('[aria-disabled=true]');
      const role = el.getAttribute('role');
      const tag = el.tagName.toLowerCase();
      out.push({
        idx: i,
        tag,
        domRole: role,
        testId: el.getAttribute('data-testid'),
        text: H.cut(((el as HTMLElement).innerText || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' '), 80),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
        inViewport: r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw,
        disabled,
        roleless: !role && tag === 'div' && el.getAttribute('tabindex') === '0',
        hitSlop: H.hitSlopOf(el),
        html: H.cut(el.outerHTML.replace(/\s+class="[^"]*"/g, ''), 220),
      });
    });
    return { items: out, coveredCount };
  }, INTERACTIVE_SELECTOR);
}

/** Chromium AX name + role for each tagged element (CDP partial AX tree). */
async function axNames(cdp: CDPSession): Promise<Map<number, { role: string | null; name: string }>> {
  const map = new Map<number, { role: string | null; name: string }>();
  const { root } = (await cdp.send('DOM.getDocument', { depth: 0 })) as any;
  const { nodeIds } = (await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: '[data-e2e-a11y-idx]',
  })) as any;
  for (const nodeId of nodeIds as number[]) {
    try {
      const desc = (await cdp.send('DOM.describeNode', { nodeId })) as any;
      const attrs: string[] = desc.node.attributes || [];
      const ai = attrs.indexOf('data-e2e-a11y-idx');
      const idx = ai >= 0 ? Number(attrs[ai + 1]) : NaN;
      const ax = (await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })) as any;
      const node = (ax.nodes || [])[0];
      const role = node?.role?.value ?? null;
      const name = String(node?.name?.value ?? '').trim();
      if (!Number.isNaN(idx)) map.set(idx, { role, name });
    } catch {
      /* node detached between calls */
    }
  }
  return map;
}

const SYMBOL_ONLY = /^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}\p{S}\p{P}\u{E000}-\u{F8FF}\u{FE0F}\u{200D}\u{20E3}]+$/u;

async function layoutProbe(page: Page): Promise<LayoutProbe> {
  return page.evaluate(() => {
    const HP = (window as any).__e2eA11y;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const R = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    const vis = (el: Element) => {
      const anyEl = el as any;
      if (typeof anyEl.checkVisibility === 'function' && !anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const cssPath = (el: Element) => {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && parts.length < 5 && cur !== document.body) {
        const tid = cur.getAttribute('data-testid');
        const role = cur.getAttribute('role');
        const lab = cur.getAttribute('aria-label');
        parts.unshift(
          cur.tagName.toLowerCase() +
            (tid ? `[data-testid=${tid}]` : '') +
            (role ? `[role=${role}]` : '') +
            (lab ? `[aria-label="${HP.cut(lab, 30)}"]` : ''),
        );
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    };
    // horizontally scrolling / clipping ancestors
    const inHScroller = (el: Element) => {
      let cur = el.parentElement;
      while (cur && cur !== document.documentElement) {
        const cs = getComputedStyle(cur);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && cur.scrollWidth > cur.clientWidth + 1) return true;
        cur = cur.parentElement;
      }
      return false;
    };
    const clippedAway = (el: Element) => {
      // fully clipped by an overflow:hidden ancestor → not user-visible
      const r = el.getBoundingClientRect();
      let cur = el.parentElement;
      while (cur && cur !== document.documentElement) {
        const cs = getComputedStyle(cur);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const p = cur.getBoundingClientRect();
          if (r.right <= p.left + 0.5 || r.left >= p.right - 0.5 || r.bottom <= p.top + 0.5 || r.top >= p.bottom - 0.5) return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const de = document.documentElement;
    const offscreenX: any[] = [];
    const leafs = Array.from(document.body.querySelectorAll('*')).filter((el) => {
      if (!vis(el)) return false;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim());
      const interactive = el.matches('button,[role=button],[role=tab],[role=link],[role=checkbox],[role=switch],input,textarea,[tabindex="0"]');
      return hasText || interactive;
    });
    for (const el of leafs) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        if (inHScroller(el) || clippedAway(el)) continue;
        offscreenX.push({ text: HP.cut(((el as HTMLElement).innerText || '').trim(), 60), rect: R(r), path: cssPath(el) });
      }
    }

    // clipped labels inside controls
    const clippedLabels: any[] = [];
    const controls = Array.from(document.querySelectorAll('button,[role=button],[role=tab],[role=link],[role=checkbox],[role=switch],[role=radio]')).filter(vis);
    for (const c of controls) {
      const texts = [c, ...Array.from(c.querySelectorAll('*'))].filter((el) =>
        Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim()),
      );
      for (const t of texts) {
        const h = t as HTMLElement;
        const cs = getComputedStyle(h);
        const clipsX = cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
        const clipsY = cs.overflowY !== 'visible' || (cs as any).webkitLineClamp && (cs as any).webkitLineClamp !== 'none';
        const cutX = clipsX && h.scrollWidth > h.clientWidth + 2;
        const cutY = clipsY && h.scrollHeight > h.clientHeight + 2;
        if (cutX || cutY) {
          clippedLabels.push({
            intentionalTruncation: cs.textOverflow === 'ellipsis' || (!!(cs as any).webkitLineClamp && (cs as any).webkitLineClamp !== 'none'),
            text: HP.cut((h.textContent || '').trim(), 80),
            role: c.getAttribute('role'),
            scrollW: h.scrollWidth,
            clientW: h.clientWidth,
            scrollH: h.scrollHeight,
            clientH: h.clientHeight,
            rect: R(h.getBoundingClientRect()),
            path: cssPath(h),
          });
        }
      }
    }

    // overlaps between distinct interactive elements (in viewport, not nested)
    const inter = Array.from(document.querySelectorAll('button,[role=button],[role=tab],[role=link],[role=checkbox],[role=switch],[role=radio],input,textarea,[tabindex="0"]'))
      .filter(vis)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && !clippedAway(el) && !HP.covered(el);
      });
    const overlaps: any[] = [];
    const label = (el: Element) =>
      HP.cut((el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' '), 50);
    for (let i = 0; i < inter.length; i++) {
      for (let j = i + 1; j < inter.length; j++) {
        const a = inter[i];
        const b = inter[j];
        if (a.contains(b) || b.contains(a)) continue;
        // content scrolled under the fixed bottom tab bar is occlusion by design, not a collision
        const inTabBar = (e: Element) => !!e.closest('[role=tablist]') && e.closest('[role=tablist]')!.getBoundingClientRect().bottom >= vh - 2;
        if (inTabBar(a) !== inTabBar(b)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 2 && h > 2) {
          // Both elements' layers are uncovered (filtered above), so both are painted.
          overlaps.push({ a: label(a), b: label(b), area: Math.round(w * h), ra: R(ra), rb: R(rb) });
        }
      }
    }

    // bottom tab bar
    let tablist: any = null;
    const tls = Array.from(document.querySelectorAll('[role=tablist]')).filter(vis);
    // the bottom one = largest top
    const bottom = tls.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    if (bottom) {
      const r = bottom.getBoundingClientRect();
      const tabs = Array.from(bottom.querySelectorAll('[role=tab]')).filter(vis).map((t) => {
        const txt = Array.from(t.querySelectorAll('*')).filter((el) =>
          Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim()),
        ) as HTMLElement[];
        const truncated = txt.some((h) => h.scrollWidth > h.clientWidth + 2 || h.scrollHeight > h.clientHeight + 2);
        return { name: HP.cut((t.getAttribute('aria-label') || (t as HTMLElement).innerText || '').trim(), 40), rect: R(t.getBoundingClientRect()), truncated };
      });
      tablist = { rect: R(r), tabs, fullyInViewport: r.top >= 0 && r.bottom <= vh + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5 };
    }

    return {
      viewport: { w: vw, h: vh, dpr: window.devicePixelRatio },
      doc: { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, scrollHeight: de.scrollHeight, clientHeight: de.clientHeight },
      horizontalScroll: de.scrollWidth > de.clientWidth || document.body.scrollWidth > de.clientWidth,
      offscreenX: offscreenX.slice(0, 40),
      clippedLabels: clippedLabels.slice(0, 40),
      overlaps: overlaps.slice(0, 40),
      tablist,
      htmlDir: de.getAttribute('dir'),
      htmlLang: de.getAttribute('lang'),
    };
  });
}

/** In-page contrast walker. Exact composition for normal blending along the ancestor chain. */
async function contrastProbe(page: Page): Promise<ContrastSample[]> {
  return page.evaluate(() => {
    const HP = (window as any).__e2eA11y;
    type C = { r: number; g: number; b: number; a: number };
    const parse = (c: string): C | null => {
      const m = c && c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map((s) => parseFloat(s));
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    };
    const over = (top: C, under: C): C => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const lerp = (a: C, b: C, t: number): C => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 });
    const lum = (c: C) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C) => {
      const l1 = lum(a);
      const l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const hex = (c: C) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const vis = (el: Element) => {
      const anyEl = el as any;
      if (typeof anyEl.checkVisibility === 'function' && !anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const cssPath = (el: Element) => {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && parts.length < 4 && cur !== document.body) {
        const tid = cur.getAttribute('data-testid');
        const role = cur.getAttribute('role');
        parts.unshift(cur.tagName.toLowerCase() + (tid ? `[data-testid=${tid}]` : '') + (role ? `[role=${role}]` : ''));
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    };
    const vw = window.innerWidth;

    function measure(el: HTMLElement, fgStr: string, placeholder = false) {
      const chain: HTMLElement[] = [];
      let cur: HTMLElement | null = el;
      while (cur) {
        chain.unshift(cur);
        cur = cur.parentElement;
      }
      // Gradients (expo-linear-gradient → CSS linear-gradient) are evaluated at the text's
      // own position: three points across the text box (start, centre, end), worst one
      // reported. Scoring against the gradient's worst stop flagged text that sits where
      // the gradient is already dark (E-020). A url() background image → indeterminate.
      let indeterminate: string | undefined;
      const gradAt = new Map<number, string>();
      chain.forEach((n, i) => {
        const bi = getComputedStyle(n).backgroundImage;
        if (!bi || bi === 'none') return;
        if (/url\(/.test(bi)) {
          indeterminate = `background url() image on ${n.tagName.toLowerCase()}`;
          return;
        }
        if (/linear-gradient/.test(bi)) gradAt.set(i, bi);
        else indeterminate = `unsupported background-image on ${n.tagName.toLowerCase()}`;
      });
      const fg = parse(fgStr) || { r: 0, g: 0, b: 0, a: 1 };
      const white: C = { r: 255, g: 255, b: 255, a: 1 };
      const tr = el.getBoundingClientRect();
      const pts: Array<[number, number]> = gradAt.size
        ? [
            [tr.left + Math.min(4, tr.width / 2), tr.top + tr.height / 2],
            [tr.left + tr.width / 2, tr.top + tr.height / 2],
            [tr.right - Math.min(4, tr.width / 2), tr.top + tr.height / 2],
          ]
        : [[tr.left + tr.width / 2, tr.top + tr.height / 2]];
      // f(i, backdrop, withText): group opacity lerps the backdrop with the group's content
      const f = (i: number, B: C, withText: boolean, pt: [number, number]): C => {
        const n = chain[i];
        const cs = getComputedStyle(n);
        const bg = parse(cs.backgroundColor);
        let c = bg && bg.a > 0 ? over(bg, B) : B;
        const bi = gradAt.get(i);
        if (bi) {
          const g = HP.gradientAt(bi, n.getBoundingClientRect(), pt[0], pt[1]);
          if (g) c = over(g, c);
        }
        const inner = i === chain.length - 1 ? (withText ? over(fg, c) : c) : f(i + 1, c, withText, pt);
        const op = placeholder && i === chain.length - 1 ? 1 : parseFloat(cs.opacity || '1');
        return lerp(B, inner, isNaN(op) ? 1 : op);
      };
      let bgPix: C = white;
      let txtPix: C = white;
      let worst = Infinity;
      for (const pt of pts) {
        const b0 = f(0, white, false, pt);
        const t0 = f(0, white, true, pt);
        const rr = ratio(t0, b0);
        if (rr < worst) {
          worst = rr;
          bgPix = b0;
          txtPix = t0;
        }
      }
      const gradient = gradAt.size ? `sampled at the text position (worst of ${pts.length} points)` : undefined;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const fw = parseInt(cs.fontWeight, 10) || 400;
      const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
      const threshold = large ? 3 : 4.5;
      const r = ratio(txtPix, bgPix);
      const disabled = !!el.closest('[aria-disabled=true],button[disabled],input[disabled]');
      const rect = tr;
      return {
        text: placeholder ? HP.cut(`[placeholder] ${(el as HTMLInputElement).placeholder}`, 80) : HP.cut((el.innerText || '').trim().replace(/\s+/g, ' '), 80),
        fg: hex(txtPix),
        bg: hex(bgPix),
        ratio: indeterminate ? null : Math.round(r * 100) / 100,
        fontSize: fs,
        fontWeight: fw,
        large,
        threshold,
        pass: indeterminate ? null : r >= threshold,
        ...(indeterminate ? { indeterminate } : {}),
        ...(gradient ? { gradient } : {}),
        disabled,
        ...(placeholder ? { placeholder: true } : {}),
        count: 1,
        rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
        path: cssPath(el),
      };
    }

    const samples: any[] = [];
    const els = Array.from(document.body.querySelectorAll('*')) as HTMLElement[];
    for (const el of els) {
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent || ''))) continue;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= 0 || r.left >= vw) continue; // off-canvas horizontally (carousel pages etc.)
      if (HP.covered(el)) continue; // a layer painted over (see installPageHelpers)
      samples.push(measure(el, getComputedStyle(el).color));
    }
    for (const inp of Array.from(document.querySelectorAll('input[placeholder],textarea[placeholder]')) as HTMLInputElement[]) {
      if (!vis(inp) || inp.value || HP.covered(inp)) continue;
      const pc = getComputedStyle(inp, '::placeholder').color;
      samples.push(measure(inp, pc, true));
    }
    // dedupe by text+fg+bg+size
    const byKey = new Map<string, any>();
    for (const s of samples) {
      const k = `${s.text}|${s.fg}|${s.bg}|${s.fontSize}|${s.fontWeight}`;
      const prev = byKey.get(k);
      if (prev) prev.count++;
      else byKey.set(k, s);
    }
    return Array.from(byKey.values());
  });
}

export async function measureA11y(page: Page, state: string, extra?: Record<string, unknown>): Promise<A11yReport> {
  await installPageHelpers(page);
  const { items: raw, coveredCount } = await collectInteractive(page);
  const cdp = await page.context().newCDPSession(page);
  let names = new Map<number, { role: string | null; name: string }>();
  try {
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    names = await axNames(cdp);
  } finally {
    await cdp.detach().catch(() => undefined);
  }
  const interactive: InteractiveEl[] = raw.map((e: any) => {
    const ax = names.get(e.idx) || { role: null, name: '' };
    const small44 = e.rect.w < TARGET_MIN || e.rect.h < TARGET_MIN;
    const below24 = e.rect.w < TARGET_WCAG_258 || e.rect.h < TARGET_WCAG_258;
    const hs = e.hitSlop as InteractiveEl['hitSlop'];
    const nw = e.rect.w + (hs ? hs.left + hs.right : 0);
    const nh = e.rect.h + (hs ? hs.top + hs.bottom : 0);
    return {
      ...e,
      axRole: ax.role,
      axName: ax.name,
      unnamed: ax.name.length === 0,
      symbolOnlyName: ax.name.length > 0 && SYMBOL_ONLY.test(ax.name),
      small44,
      below24,
      small44Native: nw < TARGET_MIN || nh < TARGET_MIN,
    };
  });
  const layout = await layoutProbe(page);
  const contrast = await contrastProbe(page);
  const fails = contrast.filter((c) => c.pass === false && !c.disabled);
  return {
    state,
    url: page.url(),
    ts: new Date().toISOString(),
    layout,
    interactive,
    summary: {
      interactiveCount: interactive.length,
      covered: coveredCount,
      unnamed: interactive.filter((i) => i.unnamed).length,
      unnamedNoText: interactive.filter((i) => i.unnamed && !i.text).length,
      rolelessWithText: interactive.filter((i) => i.roleless && !!i.text).length,
      symbolOnlyName: interactive.filter((i) => i.symbolOnlyName).length,
      roleless: interactive.filter((i) => i.roleless).length,
      small44: interactive.filter((i) => i.small44 && !i.disabled).length,
      small44Native: interactive.filter((i) => i.small44Native && !i.disabled).length,
      below24: interactive.filter((i) => i.below24 && !i.disabled).length,
      contrastSamples: contrast.length,
      contrastFails: fails.length,
      contrastIndeterminate: contrast.filter((c) => c.pass === null).length,
      horizontalScroll: layout.horizontalScroll,
      offscreenX: layout.offscreenX.length,
      clippedLabels: layout.clippedLabels.filter((c) => !c.intentionalTruncation).length,
      overlaps: layout.overlaps.length,
    },
    contrast,
    ...(extra ? { extra } : {}),
  };
}

export function writeA11yJson(dirs: string[], state: string, report: unknown) {
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${state}.a11y.json`), JSON.stringify(report, null, 2));
  }
}

/** Where a control sits relative to the fold, and whether a vertical scroll reaches it. */
export async function ctaFold(page: Page, locator: import('@playwright/test').Locator) {
  const vh = page.viewportSize()?.height ?? 0;
  const vw = page.viewportSize()?.width ?? 0;
  const count = await locator.count();
  if (count === 0) return { found: false as const };
  const el = locator.first();
  const before = await el.boundingBox();
  const visibleWithoutScroll = !!before && before.y >= 0 && before.y + before.height <= vh + 0.5 && before.x >= -0.5 && before.x + before.width <= vw + 0.5;
  let after = before;
  let reachableAfterScroll = visibleWithoutScroll;
  if (!visibleWithoutScroll) {
    await el.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    after = await el.boundingBox();
    reachableAfterScroll = !!after && after.y >= 0 && after.y + after.height <= vh + 0.5 && after.x >= -0.5 && after.x + after.width <= vw + 0.5;
  }
  return { found: true as const, before, after, visibleWithoutScroll, reachableAfterScroll, viewport: { w: vw, h: vh } };
}

/** iPad: the TabletFrame column (the bottom tablist lives inside it) + gutter paint. */
export async function tabletColumnProbe(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tls = Array.from(document.querySelectorAll('[role=tablist]')).map((t) => t.getBoundingClientRect()).filter((r) => r.width > 0);
    const bottom = tls.sort((a, b) => b.top - a.top)[0];
    // Find the widest element that is ≤ 780 wide (TabletFrame caps the column at
    // TABLET_CONTENT_MAX_WIDTH, 720), spans ≥ 90% of the height and is horizontally centred.
    let column: DOMRect | null = null;
    let columnEl: HTMLElement | null = null;
    for (const el of Array.from(document.body.querySelectorAll('div'))) {
      const r = el.getBoundingClientRect();
      if (r.width >= 300 && r.width <= 780 && r.width < vw - 20 && r.height >= vh * 0.9 && (!column || r.width > column.width)) {
        column = r;
        columnEl = el as HTMLElement;
      }
    }
    const ownPaint = (el: HTMLElement | null) => {
      let cur = el;
      while (cur) {
        const c = getComputedStyle(cur).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        cur = cur.parentElement;
      }
      return 'none';
    };
    const bgAt = (x: number, y: number) => {
      let el = document.elementFromPoint(x, y) as HTMLElement | null;
      while (el) {
        const c = getComputedStyle(el).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        el = el.parentElement;
      }
      return 'none';
    };
    const colR = column ? { x: Math.round(column.left), y: Math.round(column.top), w: Math.round(column.width), h: Math.round(column.height) } : null;
    return {
      viewport: { w: vw, h: vh },
      column: colR,
      tablist: bottom ? { x: Math.round(bottom.left), w: Math.round(bottom.width), y: Math.round(bottom.top) } : null,
      centered: colR ? Math.abs(colR.x - (vw - (colR.x + colR.w))) <= 2 : null,
      widthUtilisation: colR ? Math.round((colR.w / vw) * 1000) / 1000 : null,
      gutterBgLeft: bgAt(8, Math.round(vh / 2)),
      gutterBgRight: bgAt(vw - 8, Math.round(vh / 2)),
      columnBg: colR ? ownPaint(columnEl) : null,
      columnCentreHitBg: colR ? bgAt(colR.x + colR.w / 2, Math.round(vh / 2)) : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
}

/** Rect of the top-most dialog-ish layer (RN Modal on web → aria-modal / role=dialog, or a fixed full-screen overlay). */
export async function modalProbe(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const R = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    const dialogs = Array.from(document.querySelectorAll('[aria-modal=true],[role=dialog]')).filter((d) => d.getBoundingClientRect().width > 0);
    const d = dialogs[dialogs.length - 1] as HTMLElement | undefined;
    if (!d) return { found: false, vw, vh };
    // the visible "sheet" = the widest descendant with a non-transparent background that is not the full overlay
    let sheet: DOMRect | null = null;
    for (const el of Array.from(d.querySelectorAll('div'))) {
      const r = el.getBoundingClientRect();
      const bg = getComputedStyle(el).backgroundColor;
      if (r.width <= 0 || r.height < 60) continue;
      if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) continue;
      const a = (bg.match(/rgba?\(([^)]+)\)/)?.[1].split(',')[3]);
      if (a !== undefined && parseFloat(a) < 0.95) continue; // the scrim
      if (!sheet || r.width * r.height > sheet.width * sheet.height) sheet = r;
    }
    return { found: true, vw, vh, overlay: R(d.getBoundingClientRect()), sheet: sheet ? R(sheet) : null, ariaModal: d.getAttribute('aria-modal'), role: d.getAttribute('role') };
  });
}

/** Keyboard walk: press Tab n times and record what receives focus, and whether it is visibly indicated. */
export async function focusWalk(page: Page, n: number) {
  const steps: Array<{
    i: number;
    tag: string;
    role: string | null;
    name: string;
    rect: { x: number; y: number; w: number; h: number } | null;
    doc: { x: number; y: number };
    fixed: boolean;
    focusVisible: boolean;
    indicator: { outline: string; boxShadow: string; bg: string; border: string };
    indicatorDiffers: boolean;
  }> = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const now = { outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, boxShadow: cs.boxShadow, bg: cs.backgroundColor, border: `${cs.borderColor} ${cs.borderWidth}` };
      // compare with a non-focused clone's style: blur-free approach — clone the node, append hidden, read style
      const clone = el.cloneNode(false) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      el.parentElement?.appendChild(clone);
      const cc = getComputedStyle(clone);
      const base = { outline: `${cc.outlineStyle} ${cc.outlineWidth} ${cc.outlineColor}`, boxShadow: cc.boxShadow, bg: cc.backgroundColor, border: `${cc.borderColor} ${cc.borderWidth}` };
      clone.remove();
      const outlineOn = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        name: Array.from((el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || '').trim().replace(/\s+/g, ' ')).slice(0, 60).join(''),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        // content coordinates: undo every ancestor scroll, so the order check is not fooled
        // by the auto-scroll that follows focus
        doc: (() => {
          let dx = window.scrollX;
          let dy = window.scrollY;
          let cur = el.parentElement;
          while (cur) {
            dx += cur.scrollLeft;
            dy += cur.scrollTop;
            cur = cur.parentElement;
          }
          return { x: Math.round(r.left + dx), y: Math.round(r.top + dy) };
        })(),
        fixed: (() => {
          let cur: HTMLElement | null = el;
          while (cur) {
            const pos = getComputedStyle(cur).position;
            if (pos === 'fixed' || pos === 'sticky') return true;
            cur = cur.parentElement;
          }
          return !!el.closest('[role=tablist]');
        })(),
        focusVisible: el.matches(':focus-visible'),
        indicator: now,
        indicatorDiffers: outlineOn || now.boxShadow !== base.boxShadow || now.bg !== base.bg || now.border !== base.border,
      };
    });
    // Stop when focus leaves the document (body / browser chrome) or wraps back to an
    // element already visited: the rest of the walk would only repeat the cycle.
    if (!s) break;
    if (steps.some((p) => p.name === s.name && p.rect && s.rect && p.rect.x === s.rect.x && p.rect.y === s.rect.y)) break;
    steps.push({ i, ...s });
  }
  return steps;
}

/**
 * Visual-order check for a focus walk: consecutive steps that jump UP by more than
 * `tol` px (reading order is top→bottom), or — within the same row band — go the
 * wrong horizontal way (left→right in LTR, right→left in RTL).
 */
export function focusOrderViolations(steps: Awaited<ReturnType<typeof focusWalk>>, rtl: boolean, tol = 8) {
  const v: Array<{ from: string; to: string; why: string }> = [];
  // Fixed chrome (stack header, bottom tab bar) is compared in viewport space and only
  // with itself; scrolling content is compared in content coordinates.
  const real = steps.filter((s) => s.rect && !s.fixed);
  for (let i = 1; i < real.length; i++) {
    const a = real[i - 1];
    const b = real[i];
    const tag = (s: typeof a) => `${s.name}@${s.doc.x},${s.doc.y}`;
    if (b.doc.y + tol < a.doc.y) {
      v.push({ from: tag(a), to: tag(b), why: 'jumps up' });
    } else if (Math.abs(b.doc.y - a.doc.y) <= tol) {
      const wrong = rtl ? b.doc.x > a.doc.x + tol : b.doc.x + tol < a.doc.x;
      if (wrong) v.push({ from: tag(a), to: tag(b), why: rtl ? 'goes right in RTL row' : 'goes left in LTR row' });
    }
  }
  return v;
}

/** Live-region inventory. */
export async function liveRegions(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role=alert],[role=status],[aria-live]'))
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({
        role: el.getAttribute('role'),
        ariaLive: el.getAttribute('aria-live'),
        text: Array.from(((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ')).slice(0, 120).join(''),
      })),
  );
}

/** Style fingerprint for the dark-mode no-op check. */
export async function styleFingerprint(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*')).slice(0, 4000)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      out.push(`${cs.color}|${cs.backgroundColor}|${cs.borderColor}`);
    }
    return out;
  });
}

/**
 * Text-enlargement proxy (E-024). Narrowing the viewport at a higher DPR keeps text and
 * fixed boxes in proportion, so it never shows Dynamic Type / Android font-scale
 * overflow. This scales every rendered text node's font-size (and a px line-height) by
 * `factor` while leaving box sizes alone — which is what the OS setting does to RN text.
 * App.tsx caps `maxFontSizeMultiplier` at 1.4, hence the default.
 */
export async function enlargeText(page: Page, factor = 1.4) {
  return page.evaluate((k) => {
    let n = 0;
    for (const el of Array.from(document.body.querySelectorAll('*')) as HTMLElement[]) {
      if (el.dataset.e2eTextScaled) continue;
      // The tab bar opts out of OS text scaling (tabBarAllowFontScaling: false, App.tsx).
      if (el.closest('[role=tablist]')) continue;
      const hasText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent || '').trim());
      if (!hasText && !(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (!fs) continue;
      el.style.fontSize = `${fs * k}px`;
      const lh = parseFloat(cs.lineHeight);
      if (!isNaN(lh) && /px$/.test(cs.lineHeight)) el.style.lineHeight = `${lh * k}px`;
      el.dataset.e2eTextScaled = '1';
      n++;
    }
    return n;
  }, factor);
}
