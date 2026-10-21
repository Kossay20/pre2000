import { hexToRgba } from '../hexToRgba';

/**
 * Unit tests for hexToRgba — pure color conversion helper.
 *
 * Source: src/utils/hexToRgba.ts
 * Behavior:
 *  - Trims input.
 *  - Accepts `#RGB` (3 hex digits) and `#RRGGBB` (6 hex digits), case-insensitive.
 *  - 3-digit form is expanded by duplicating each nibble (#abc -> #aabbcc).
 *  - Produces `rgba(r,g,b,opacity)` with the opacity value interpolated verbatim.
 *  - Any non-matching input falls back to `rgba(0,0,0,opacity)`.
 *
 * NOTE on __DEV__: jest.config.js sets `globals: { __DEV__: true }`, so the
 * dev-time `console.warn` branch fires for every invalid input. Tests that pass
 * invalid input therefore spy on / silence console.warn.
 */
describe('hexToRgba', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    describe('6-digit hex (#RRGGBB) — happy path', () => {
        it('converts pure white', () => {
            expect(hexToRgba('#FFFFFF', 1)).toBe('rgba(255,255,255,1)');
        });

        it('converts pure black', () => {
            expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
        });

        it('converts pure red', () => {
            expect(hexToRgba('#FF0000', 1)).toBe('rgba(255,0,0,1)');
        });

        it('converts pure green', () => {
            expect(hexToRgba('#00FF00', 1)).toBe('rgba(0,255,0,1)');
        });

        it('converts pure blue', () => {
            expect(hexToRgba('#0000FF', 1)).toBe('rgba(0,0,255,1)');
        });

        it('converts an arbitrary mixed value', () => {
            expect(hexToRgba('#123456', 1)).toBe('rgba(18,52,86,1)');
        });

        it('does not emit a dev warning for valid 6-digit input', () => {
            hexToRgba('#123456', 1);
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    describe('3-digit hex (#RGB) — shorthand expansion', () => {
        it('expands #fff to white', () => {
            expect(hexToRgba('#fff', 1)).toBe('rgba(255,255,255,1)');
        });

        it('expands #000 to black', () => {
            expect(hexToRgba('#000', 1)).toBe('rgba(0,0,0,1)');
        });

        it('expands #F00 to red (each nibble duplicated)', () => {
            expect(hexToRgba('#F00', 1)).toBe('rgba(255,0,0,1)');
        });

        it('expands #abc to the duplicated-nibble value (aa,bb,cc)', () => {
            // a->aa=170, b->bb=187, c->cc=204
            expect(hexToRgba('#abc', 0.3)).toBe('rgba(170,187,204,0.3)');
        });

        it('does not emit a dev warning for valid 3-digit input', () => {
            hexToRgba('#abc', 1);
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    describe('case-insensitivity', () => {
        it('accepts lowercase 6-digit hex', () => {
            expect(hexToRgba('#aabbcc', 1)).toBe('rgba(170,187,204,1)');
        });

        it('accepts uppercase 6-digit hex', () => {
            expect(hexToRgba('#AABBCC', 1)).toBe('rgba(170,187,204,1)');
        });

        it('accepts mixed-case 6-digit hex identically', () => {
            expect(hexToRgba('#AaBbCc', 1)).toBe('rgba(170,187,204,1)');
        });

        it('treats lower and upper case as equal output', () => {
            expect(hexToRgba('#ff8800', 1)).toBe(hexToRgba('#FF8800', 1));
        });
    });

    describe('whitespace handling (trim)', () => {
        it('trims leading and trailing whitespace before parsing', () => {
            expect(hexToRgba('  #123456  ', 1)).toBe('rgba(18,52,86,1)');
        });

        it('trims surrounding whitespace on a 3-digit value', () => {
            expect(hexToRgba('\t#fff\n', 1)).toBe('rgba(255,255,255,1)');
        });

        it('does not warn when trimming yields a valid hex', () => {
            hexToRgba('   #abc   ', 1);
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    describe('opacity is interpolated verbatim', () => {
        it('passes through opacity 1', () => {
            expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
        });

        it('passes through opacity 0', () => {
            expect(hexToRgba('#FFFFFF', 0)).toBe('rgba(255,255,255,0)');
        });

        it('passes through a fractional opacity', () => {
            expect(hexToRgba('#FFFFFF', 0.5)).toBe('rgba(255,255,255,0.5)');
        });

        it('passes through opacity on the fallback path too', () => {
            expect(hexToRgba('not-a-color', 0.42)).toBe('rgba(0,0,0,0.42)');
        });

        it('interpolates an out-of-range opacity unchanged (no clamping)', () => {
            expect(hexToRgba('#000000', 2)).toBe('rgba(0,0,0,2)');
            expect(hexToRgba('#000000', -1)).toBe('rgba(0,0,0,-1)');
        });
    });

    describe('boundary values per channel', () => {
        it('handles the minimum channel value (00)', () => {
            expect(hexToRgba('#00FFFF', 1)).toBe('rgba(0,255,255,1)');
        });

        it('handles the maximum channel value (FF)', () => {
            expect(hexToRgba('#FF00FF', 1)).toBe('rgba(255,0,255,1)');
        });

        it('handles a mid-range value (80 = 128)', () => {
            expect(hexToRgba('#808080', 1)).toBe('rgba(128,128,128,1)');
        });

        it('handles value 0x01 in each channel', () => {
            expect(hexToRgba('#010101', 1)).toBe('rgba(1,1,1,1)');
        });
    });

    describe('invalid input — black fallback', () => {
        it('falls back to black for a named color', () => {
            expect(hexToRgba('blue', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for an empty string', () => {
            expect(hexToRgba('', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for a whitespace-only string', () => {
            expect(hexToRgba('   ', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for hex missing the leading #', () => {
            expect(hexToRgba('123456', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for a 4-digit hex (not 3 or 6)', () => {
            expect(hexToRgba('#1234', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for a 5-digit hex', () => {
            expect(hexToRgba('#12345', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for a 7-digit hex', () => {
            expect(hexToRgba('#1234567', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for an 8-digit hex (#RRGGBBAA not supported)', () => {
            expect(hexToRgba('#11223344', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for non-hex letters (G..Z)', () => {
            expect(hexToRgba('#GGGGGG', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for a hash-only string', () => {
            expect(hexToRgba('#', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for an rgb() string', () => {
            expect(hexToRgba('rgb(1,2,3)', 1)).toBe('rgba(0,0,0,1)');
        });

        it('falls back to black for internal whitespace (only trims edges)', () => {
            // `# 123456` does not match after trimming because the space is internal.
            expect(hexToRgba('# 123456', 1)).toBe('rgba(0,0,0,1)');
        });
    });

    describe('dev-time warning branch (__DEV__ is true in jest globals)', () => {
        it('warns once on invalid input', () => {
            hexToRgba('nope', 1);
            expect(warnSpy).toHaveBeenCalledTimes(1);
        });

        it('includes the JSON-stringified original input and a black-fallback hint in the warning', () => {
            hexToRgba('nope', 1);
            const msg = String(warnSpy.mock.calls[0][0]);
            expect(msg).toContain('[hexToRgba]');
            expect(msg).toContain('"nope"'); // JSON.stringify quotes the value
            expect(msg).toContain('black fallback');
        });

        it('warns using the ORIGINAL (untrimmed) input in the message', () => {
            hexToRgba('  bad value  ', 1);
            const msg = String(warnSpy.mock.calls[0][0]);
            // JSON.stringify of the raw arg keeps the surrounding spaces.
            expect(msg).toContain('"  bad value  "');
        });

        it('warns for whitespace-only input', () => {
            hexToRgba('   ', 1);
            expect(warnSpy).toHaveBeenCalledTimes(1);
        });

        it('does not warn for any valid hex form', () => {
            hexToRgba('#fff', 1);
            hexToRgba('#FFFFFF', 1);
            hexToRgba('  #abc  ', 1);
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    describe('output shape invariants', () => {
        it('always returns a string beginning with "rgba(" and ending with ")"', () => {
            const samples = ['#fff', '#FF8800', 'invalid', '', '#1234'];
            for (const s of samples) {
                const out = hexToRgba(s, 0.7);
                expect(out.startsWith('rgba(')).toBe(true);
                expect(out.endsWith(')')).toBe(true);
            }
        });

        it('always produces exactly three comma-separated channels plus opacity', () => {
            // rgba(r,g,b,a) => 4 comma-separated parts inside the parens.
            const inner = hexToRgba('#123456', 0.5).slice('rgba('.length, -1);
            expect(inner.split(',')).toHaveLength(4);
        });

        it('keeps every channel within the 0..255 range for valid input', () => {
            const inner = hexToRgba('#FFFFFF', 1).slice('rgba('.length, -1);
            const [r, g, b] = inner.split(',').map(Number);
            for (const v of [r, g, b]) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(255);
            }
        });
    });
});
