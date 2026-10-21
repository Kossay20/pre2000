/**
 * WCAG AA contrast of the palette's text-bearing pairs (final-release Wave E).
 *
 * The Wave E sweep measured the rendered pages: white on the pink header / pills
 * (#FF6B9D, 2.68:1), the brown caption token on the app's tinted surfaces (4.33:1),
 * the grey hint text (#999, 2.85:1), the danger-zone red (#E57373, 2.99:1) and the
 * success-toast green (2.78:1) all failed. The fix lives in the tokens, so this test
 * locks the pairs the screens actually render instead of each screen's hex.
 */
import { theme } from '..';

const c = theme.colors;

/** Relative luminance of an opaque #RRGGBB colour (WCAG 2.x). */
function luminance(hex: string): number {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
    const [a, b] = [luminance(fg), luminance(bg)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Composite an `rgba(r, g, b, a)` wash over an opaque hex background. */
function over(rgba: string, bg: string): string {
    const m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (!m) throw new Error(`not an rgba() token: ${rgba}`);
    const a = Number(m[4]);
    const base = bg.replace('#', '');
    return '#' + [1, 2, 3].map((i, k) => {
        const v = Math.round(Number(m[i]) * a + parseInt(base.slice(k * 2, k * 2 + 2), 16) * (1 - a));
        return v.toString(16).padStart(2, '0');
    }).join('');
}

const AA = 4.5;
const AA_LARGE = 3;

describe('palette contrast — normal-size text pairs (AA 4.5:1)', () => {
    it.each<[string, string, string]>([
        ['white on primaryStrong (header start, pink buttons)', c.white, c.primaryStrong],
        ['white on a header chip (primaryStrong + headerChipBg)', c.white, over(c.headerChipBg, c.primaryStrong)],
        ['white on accent', c.white, c.accent],
        ['textLight on background', c.textLight, c.background],
        ['textLight on surface', c.textLight, c.surface],
        ['textLight on surfaceAmberTint', c.textLight, c.surfaceAmberTint],
        ['textLight on lavenderBlush', c.textLight, c.lavenderBlush],
        ['textLight on surfacePinkWash', c.textLight, c.surfacePinkWash],
        ['textMuted on white', c.textMuted, c.white],
        ['textMuted on surface', c.textMuted, c.surface],
        ['textMuted on neutral100', c.textMuted, c.neutral100],
        ['textMuted on background', c.textMuted, c.background],
        ['textMuted on lavenderBlush', c.textMuted, c.lavenderBlush],
        ['neutral400 placeholders / inactive top tab on white', c.neutral400, c.white],
        ['neutral400 placeholders on neutral25 inputs', c.neutral400, c.neutral25],
        ['error on white', c.error, c.white],
        ['error on surface', c.error, c.surface],
        ['error on feedbackErrorBg', c.error, c.feedbackErrorBg],
        ['white on error', c.white, c.error],
        ['white on success (success toast / button)', c.white, c.success],
        ['success on white', c.success, c.white],
        ['info on white', c.info, c.white],
        ['info on surfaceBlueTint', c.info, c.surfaceBlueTint],
        ['deepOrange900 on surfaceAmberTint', c.deepOrange900, c.surfaceAmberTint],
        ['deepOrange900 on white', c.deepOrange900, c.white],
        ['green800 on surfaceGreenTint (supplement "safe" badge)', c.green800, c.surfaceGreenTint],
        ['deepOrange900 on surfaceOrangeTint (supplement "with caution" badge)', c.deepOrange900, c.surfaceOrangeTint],
        ['red800 on surfaceRose (supplement "avoid" badge)', c.red800, c.surfaceRose],
        ['red800 on surfaceRose (food "forbidden" badge)', c.red800, c.surfaceRose],
        ['deepOrange900 on surfaceOrangeTint (food "avoid" badge)', c.deepOrange900, c.surfaceOrangeTint],
        ['warningTextDark on surfaceAmberTint (food "limit" badge)', c.warningTextDark, c.surfaceAmberTint],
        ['green800 on surfaceGreenTint (food "moderate" badge)', c.green800, c.surfaceGreenTint],
        ['text on the amber suggestions badge', c.text, over(c.amber500Alpha90, c.primaryStrong)],
        ['textSecondary on gradientPinkStart', c.textSecondary, c.gradientPinkStart],
    ])('%s', (_label, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
    });
});

describe('palette contrast — large display figures only (AA 3:1)', () => {
    it('coral (≥22px bold baby-size figures) on white', () => {
        expect(contrast(c.coral, c.white)).toBeGreaterThanOrEqual(AA_LARGE);
    });
});

describe('palette contrast — graphical objects (WCAG 1.4.11, 3:1)', () => {
    // The supplement icon on the week-recommendation cards sits on the block coloured by
    // the safety level; white fails on the amber and pale-pink blocks (1.9 and 2.2:1).
    it.each<[string, string, string]>([
        ['white on success (supplement "safe" block)', c.white, c.success],
        ['white on error (supplement "avoid" block)', c.white, c.error],
        ['deepOrange900 on warning (supplement "with caution" block)', c.deepOrange900, c.warning],
        ['text on secondary (supplement with no safety level)', c.text, c.secondary],
    ])('%s', (_label, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_LARGE);
    });
});

describe('the decorative pink stays the brand pink', () => {
    it('primary is unchanged; only the text-bearing variant is darker', () => {
        expect(c.primary).toBe('#FF6B9D');
        expect(luminance(c.primaryStrong)).toBeLessThan(luminance(c.primary));
    });
});
