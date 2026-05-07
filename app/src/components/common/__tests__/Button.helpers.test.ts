import { resolveButtonSize, resolveButtonVariant } from '../Button.helpers';
import { theme } from '../../../theme';

describe('Button helpers', () => {
    describe('resolveButtonVariant', () => {
        it('returns primary palette by default', () => {
            const v = resolveButtonVariant('primary', false);
            expect(v.backgroundColor).toBe(theme.colors.primary);
            expect(v.textColor).toBe(theme.colors.white);
            expect(v.borderColor).toBeUndefined();
        });

        it('returns transparent + primary text + primary border for outline', () => {
            const v = resolveButtonVariant('outline', false);
            expect(v.backgroundColor).toBe('transparent');
            expect(v.textColor).toBe(theme.colors.primary);
            expect(v.borderColor).toBe(theme.colors.primary);
        });

        it('returns transparent + primary text without border for ghost', () => {
            const v = resolveButtonVariant('ghost', false);
            expect(v.backgroundColor).toBe('transparent');
            expect(v.textColor).toBe(theme.colors.primary);
            expect(v.borderColor).toBeUndefined();
        });

        it('returns error palette for destructive', () => {
            const v = resolveButtonVariant('destructive', false);
            expect(v.backgroundColor).toBe(theme.colors.error);
            expect(v.textColor).toBe(theme.colors.white);
        });

        it('returns success palette for success', () => {
            const v = resolveButtonVariant('success', false);
            expect(v.backgroundColor).toBe(theme.colors.success);
            expect(v.textColor).toBe(theme.colors.white);
        });

        it('returns disabled palette when disabled (filled variants)', () => {
            // Cycle 2 F301 fix : disabled text passe à neutral700 (~7:1 ratio)
            // au lieu de white (~1.4:1 fail WCAG AA).
            const v = resolveButtonVariant('primary', true);
            expect(v.backgroundColor).toBe(theme.colors.disabled);
            expect(v.textColor).toBe(theme.colors.neutral700);
        });

        it('returns transparent + placeholder text when disabled (outline)', () => {
            const v = resolveButtonVariant('outline', true);
            expect(v.backgroundColor).toBe('transparent');
            expect(v.textColor).toBe(theme.colors.placeholder);
            expect(v.borderColor).toBe(theme.colors.disabled);
        });

        it('returns transparent + placeholder text when disabled (ghost, no border)', () => {
            const v = resolveButtonVariant('ghost', true);
            expect(v.backgroundColor).toBe('transparent');
            expect(v.textColor).toBe(theme.colors.placeholder);
            expect(v.borderColor).toBeUndefined();
        });
    });

    describe('resolveButtonSize', () => {
        it('returns small dimensions (a11y compliant ≥ 44pt Apple HIG)', () => {
            // Cycle 2 F300 fix : small minHeight bumpé 36→44 pour passer Apple HIG
            // (44pt) et Material (48dp non atteint mais 44 acceptable iOS-first).
            const s = resolveButtonSize('small');
            expect(s.fontSize).toBe(14);
            expect(s.minHeight).toBeGreaterThanOrEqual(44);
        });

        it('returns medium dimensions by default', () => {
            const s = resolveButtonSize('medium');
            expect(s.fontSize).toBe(16);
            expect(s.minHeight).toBeGreaterThanOrEqual(44); // a11y tap target
        });

        it('returns large dimensions', () => {
            const s = resolveButtonSize('large');
            expect(s.fontSize).toBeGreaterThanOrEqual(17);
            expect(s.minHeight).toBeGreaterThanOrEqual(48);
        });
    });
});
