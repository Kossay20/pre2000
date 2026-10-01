/**
 * Tests for styleUtils — cross-platform shadow / text-shadow helpers.
 *
 * The source imports `Platform` from 'react-native' (mapped to react-native-web
 * by jest.config.js). `Platform.OS` is a writable property on the live module
 * object, so we mutate it per-test and restore the original in afterEach.
 *
 * Branches under test:
 *  - getShadowStyle:     android | web | ios (default fallthrough)
 *  - getTextShadowStyle: web | non-web
 * Plus: default arguments, custom arguments, and hexToRgba color integration.
 */

import { Platform } from 'react-native';
import { getShadowStyle, getTextShadowStyle, hexToRgba, switchThumbProps } from '../styleUtils';
import { theme } from '../../theme';

// Mutable view of the Platform module so we can flip OS freely.
const mutablePlatform = Platform as unknown as { OS: string };

// Snapshot the real Platform.OS so we can flip it freely and restore it.
const ORIGINAL_OS = mutablePlatform.OS;

/** Force the active platform for a single test. */
function setOS(os: string) {
    mutablePlatform.OS = os;
}

afterEach(() => {
    // Restore the genuine platform after each test.
    mutablePlatform.OS = ORIGINAL_OS;
});

describe('styleUtils', () => {
    describe('hexToRgba re-export', () => {
        it('re-exports the hexToRgba helper as a callable function', () => {
            expect(typeof hexToRgba).toBe('function');
            expect(hexToRgba('#FF8800', 0.5)).toBe('rgba(255,136,0,0.5)');
        });

        it('re-export points to the same implementation (short + long hex)', () => {
            expect(hexToRgba('#abc', 0.3)).toBe('rgba(170,187,204,0.3)');
            expect(hexToRgba('#000000', 0.2)).toBe('rgba(0,0,0,0.2)');
        });
    });

    describe('getShadowStyle — android branch', () => {
        beforeEach(() => setOS('android'));

        it('returns elevation + shadowColor using defaults', () => {
            const style = getShadowStyle();
            expect(style).toEqual({
                elevation: 5,
                shadowColor: theme.colors.black,
            });
        });

        it('honors a custom elevation and color', () => {
            const style = getShadowStyle(12, '#FF0000');
            expect(style).toEqual({
                elevation: 12,
                shadowColor: '#FF0000',
            });
        });

        it('ignores opacity / radius / offset (android only uses elevation+color)', () => {
            const style = getShadowStyle(3, '#123456', 0.9, 20, { width: 9, height: 9 });
            expect(style).toEqual({ elevation: 3, shadowColor: '#123456' });
            // None of the iOS/web-specific keys should leak in.
            expect(style).not.toHaveProperty('boxShadow');
            expect(style).not.toHaveProperty('shadowOpacity');
            expect(style).not.toHaveProperty('shadowRadius');
            expect(style).not.toHaveProperty('shadowOffset');
        });

        it('accepts elevation 0 (does not fall back to default 5)', () => {
            const style = getShadowStyle(0);
            expect(style.elevation).toBe(0);
        });
    });

    describe('getShadowStyle — web branch', () => {
        beforeEach(() => setOS('web'));

        it('produces a boxShadow string with default offset/radius and rgba color', () => {
            const style = getShadowStyle() as any;
            // defaults: offset {0,2}, radius 4, color black, opacity 0.2
            expect(style.boxShadow).toBe(`0px 2px 4px ${hexToRgba(theme.colors.black, 0.2)}`);
            expect(style.boxShadow).toBe('0px 2px 4px rgba(0,0,0,0.2)');
        });

        it('embeds custom color + opacity via hexToRgba and custom offset/radius', () => {
            const style = getShadowStyle(5, '#FF8800', 0.5, 10, { width: 3, height: 7 }) as any;
            expect(style.boxShadow).toBe('3px 7px 10px rgba(255,136,0,0.5)');
        });

        it('only emits boxShadow (no native shadow keys) on web', () => {
            const style = getShadowStyle() as any;
            expect(Object.keys(style)).toEqual(['boxShadow']);
        });

        it('falls back to black rgba for an invalid color string', () => {
            const style = getShadowStyle(5, 'not-a-hex', 0.4) as any;
            expect(style.boxShadow).toBe('0px 2px 4px rgba(0,0,0,0.4)');
        });

        it('handles negative offset values in the boxShadow string', () => {
            const style = getShadowStyle(5, '#000000', 0.2, 4, { width: -2, height: -3 }) as any;
            expect(style.boxShadow).toBe('-2px -3px 4px rgba(0,0,0,0.2)');
        });
    });

    describe('getShadowStyle — ios (default) branch', () => {
        beforeEach(() => setOS('ios'));

        it('returns native iOS shadow props with defaults', () => {
            const style = getShadowStyle();
            expect(style).toEqual({
                shadowColor: theme.colors.black,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
            });
        });

        it('passes through fully custom shadow params', () => {
            const offset = { width: 1, height: 6 };
            const style = getShadowStyle(7, '#00FF00', 0.8, 15, offset);
            expect(style).toEqual({
                shadowColor: '#00FF00',
                shadowOffset: offset,
                shadowOpacity: 0.8,
                shadowRadius: 15,
            });
            // The exact offset object reference is forwarded (no copy).
            expect((style as any).shadowOffset).toBe(offset);
        });

        it('does not emit elevation or boxShadow on iOS', () => {
            const style = getShadowStyle() as any;
            expect(style).not.toHaveProperty('elevation');
            expect(style).not.toHaveProperty('boxShadow');
        });

        it('keeps the raw hex color (no rgba conversion) on iOS', () => {
            const style = getShadowStyle(5, '#ABCDEF') as any;
            expect(style.shadowColor).toBe('#ABCDEF');
        });

        it('accepts opacity 0', () => {
            const style = getShadowStyle(5, '#000000', 0) as any;
            expect(style.shadowOpacity).toBe(0);
        });
    });

    describe('getShadowStyle — unknown platform falls into iOS path', () => {
        it('treats a non-android/non-web OS like iOS', () => {
            setOS('windows');
            const style = getShadowStyle() as any;
            expect(style).toHaveProperty('shadowOpacity', 0.2);
            expect(style).toHaveProperty('shadowRadius', 4);
            expect(style).not.toHaveProperty('elevation');
            expect(style).not.toHaveProperty('boxShadow');
        });
    });

    describe('getTextShadowStyle — web branch', () => {
        beforeEach(() => setOS('web'));

        it('returns a textShadow string with defaults', () => {
            const style = getTextShadowStyle() as any;
            expect(style.textShadow).toBe(`0px 2px 4px ${hexToRgba(theme.colors.black, 0.2)}`);
            expect(style.textShadow).toBe('0px 2px 4px rgba(0,0,0,0.2)');
        });

        it('embeds custom color/opacity/radius/offset', () => {
            const style = getTextShadowStyle('#FF8800', 0.5, 10, { width: 3, height: 7 }) as any;
            expect(style.textShadow).toBe('3px 7px 10px rgba(255,136,0,0.5)');
        });

        it('only emits textShadow (no native textShadow* keys) on web', () => {
            const style = getTextShadowStyle() as any;
            expect(Object.keys(style)).toEqual(['textShadow']);
        });

        it('falls back to black rgba for invalid color', () => {
            const style = getTextShadowStyle('bad-color', 0.6) as any;
            expect(style.textShadow).toBe('0px 2px 4px rgba(0,0,0,0.6)');
        });
    });

    describe('getTextShadowStyle — native (non-web) branch', () => {
        it('returns native textShadow props on iOS with defaults', () => {
            setOS('ios');
            const style = getTextShadowStyle();
            expect(style).toEqual({
                textShadowColor: hexToRgba(theme.colors.black, 0.2),
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 4,
            });
            // Color is rgba-converted (unlike getShadowStyle iOS which keeps raw hex).
            expect((style as any).textShadowColor).toBe('rgba(0,0,0,0.2)');
        });

        it('returns native textShadow props on android', () => {
            setOS('android');
            const offset = { width: 2, height: 4 };
            const style = getTextShadowStyle('#00FF00', 0.8, 9, offset);
            expect(style).toEqual({
                textShadowColor: 'rgba(0,255,0,0.8)',
                textShadowOffset: offset,
                textShadowRadius: 9,
            });
            expect((style as any).textShadowOffset).toBe(offset);
        });

        it('does not emit a textShadow CSS string on native', () => {
            setOS('ios');
            const style = getTextShadowStyle() as any;
            expect(style).not.toHaveProperty('textShadow');
        });

        it('converts an invalid color to black rgba on native too', () => {
            setOS('android');
            const style = getTextShadowStyle('nope', 0.3) as any;
            expect(style.textShadowColor).toBe('rgba(0,0,0,0.3)');
        });
    });

    describe('cross-function consistency', () => {
        it('getShadowStyle(web) and getTextShadowStyle(web) build the same shadow geometry string', () => {
            setOS('web');
            const shadow = getShadowStyle(5, '#000000', 0.2, 4, { width: 0, height: 2 }) as any;
            const textShadow = getTextShadowStyle('#000000', 0.2, 4, { width: 0, height: 2 }) as any;
            expect(shadow.boxShadow).toBe(textShadow.textShadow);
        });
    });
});

describe('switchThumbProps', () => {
    afterEach(() => {
        mutablePlatform.OS = ORIGINAL_OS;
    });

    it('sets activeThumbColor on web, where thumbColor alone leaves the ON thumb teal', () => {
        mutablePlatform.OS = 'web';
        expect(switchThumbProps('#FFFFFF')).toEqual({ thumbColor: '#FFFFFF', activeThumbColor: '#FFFFFF' });
    });

    it('passes only thumbColor on native', () => {
        mutablePlatform.OS = 'ios';
        expect(switchThumbProps('#FFFFFF')).toEqual({ thumbColor: '#FFFFFF' });
        mutablePlatform.OS = 'android';
        expect(switchThumbProps('#FFFFFF')).toEqual({ thumbColor: '#FFFFFF' });
    });
});
