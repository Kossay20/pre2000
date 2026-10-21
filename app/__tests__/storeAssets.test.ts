/**
 * Store-asset invariants.
 *
 * Icons are the one part of a release that no unit test used to touch and that
 * every reviewer looks at first. The set shipped before this guard existed was
 * wrong in three independent ways:
 *
 *   - `icon.png` was a pre-rounded tile with flat corner fill (white at the top,
 *     a leftover drop shadow at the bottom). iOS masks the icon itself and asks
 *     for a full square, so the fill showed as slivers.
 *   - `adaptive-icon.png` was a byte-for-byte copy of it, so Android's adaptive
 *     mask — which keeps only the inner 66dp of 108dp — cropped the silhouette.
 *   - the expo-notifications plugin pointed at the full-colour icon; Android
 *     keeps only the alpha channel of a status-bar icon, so it rendered as a
 *     solid white square.
 *
 * Everything here is read straight from the PNG header (no image library, no new
 * dependency): 8-byte signature, then the IHDR chunk carrying width, height and
 * colour type.
 */
import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '..');

/** PNG colour types that carry an alpha channel. */
const COLOUR_TYPE = {
  GREY: 0,
  RGB: 2,
  PALETTE: 3,
  GREY_ALPHA: 4,
  RGBA: 6,
} as const;

const WITH_ALPHA: number[] = [COLOUR_TYPE.GREY_ALPHA, COLOUR_TYPE.RGBA];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  hasAlpha: boolean;
}

const readPngHeader = (relativePath: string): PngHeader => {
  const absolute = path.join(APP_DIR, relativePath);
  const buf = fs.readFileSync(absolute);

  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${relativePath} is not a PNG`);
  }
  // Bytes 8..11 = chunk length, 12..15 = chunk type — IHDR must come first.
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`${relativePath}: first chunk is not IHDR`);
  }

  const colourType = buf.readUInt8(25);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf.readUInt8(24),
    colourType,
    hasAlpha: WITH_ALPHA.includes(colourType),
  };
};

const appJson = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'app.json'), 'utf8')).expo;

describe('store assets', () => {
  describe('iOS / generic app icon', () => {
    it('is 1024x1024', () => {
      const { width, height } = readPngHeader('assets/icon.png');
      expect([width, height]).toEqual([1024, 1024]);
    });

    it('carries no alpha channel — App Store Connect rejects transparency', () => {
      expect(readPngHeader('assets/icon.png').hasAlpha).toBe(false);
    });
  });

  describe('Android adaptive icon', () => {
    it.each([
      ['assets/adaptive-icon.png', true],
      ['assets/adaptive-icon-monochrome.png', true],
      ['assets/adaptive-icon-background.png', false],
    ])('%s is 1024x1024 with alpha=%s', (file, expectAlpha) => {
      const header = readPngHeader(file);
      expect([header.width, header.height]).toEqual([1024, 1024]);
      expect(header.hasAlpha).toBe(expectAlpha);
    });

    it('is not the app icon reused — the mask would crop the artwork', () => {
      const icon = fs.readFileSync(path.join(APP_DIR, 'assets/icon.png'));
      const foreground = fs.readFileSync(path.join(APP_DIR, 'assets/adaptive-icon.png'));
      expect(foreground.equals(icon)).toBe(false);
    });

    it('declares all three layers plus a fallback colour', () => {
      const adaptive = appJson.android.adaptiveIcon;
      expect(adaptive.foregroundImage).toBe('./assets/adaptive-icon.png');
      expect(adaptive.backgroundImage).toBe('./assets/adaptive-icon-background.png');
      expect(adaptive.monochromeImage).toBe('./assets/adaptive-icon-monochrome.png');
      expect(adaptive.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  describe('Android notification icon', () => {
    const notificationPlugin = () => {
      const entry = appJson.plugins.find(
        (p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications',
      );
      if (!entry) throw new Error('expo-notifications plugin entry missing from app.json');
      return entry[1] as { icon: string; color: string };
    };

    it('is a dedicated asset, not the full-colour app icon', () => {
      expect(notificationPlugin().icon).toBe('./assets/notification-icon.png');
    });

    it('has an alpha channel — Android keeps nothing else', () => {
      expect(readPngHeader('assets/notification-icon.png').hasAlpha).toBe(true);
    });

    it('is at least the 96x96 mdpi baseline', () => {
      const { width, height } = readPngHeader('assets/notification-icon.png');
      expect(width).toBeGreaterThanOrEqual(96);
      expect(width).toBe(height);
    });
  });

  describe('Play Console listing icon', () => {
    it('is exactly 512x512, 32-bit', () => {
      const header = readPngHeader('store/icons/play-icon-512.png');
      expect([header.width, header.height]).toEqual([512, 512]);
      expect(header.hasAlpha).toBe(true);
      expect(header.bitDepth).toBe(8);
    });
  });

  describe('splash screen', () => {
    it('is a transparent mark, not a pre-composited mock-up', () => {
      const header = readPngHeader('assets/splash-icon.png');
      expect(header.hasAlpha).toBe(true);
    });

    it('resizeMode contain letterboxes with a colour taken from the artwork', () => {
      // The mock-up sat on a pale pink panel while backgroundColor was #FF6B9D,
      // so every cold start framed it with two vivid bands.
      expect(appJson.splash.resizeMode).toBe('contain');
      expect(appJson.splash.backgroundColor.toUpperCase()).toBe('#FDADBB');
    });
  });

  describe('the generator stays rerunnable', () => {
    it.each(['assets/icon-source.png', 'assets/splash-source.png'])(
      'keeps %s, the pinned input of scripts/generate-brand-assets.py',
      (file) => {
        expect(fs.existsSync(path.join(APP_DIR, file))).toBe(true);
      },
    );
  });

  it('every image path app.json references exists on disk', () => {
    const referenced = [
      appJson.icon,
      appJson.splash.image,
      appJson.web?.favicon,
      appJson.android.adaptiveIcon.foregroundImage,
      appJson.android.adaptiveIcon.backgroundImage,
      appJson.android.adaptiveIcon.monochromeImage,
      ...appJson.plugins
        .filter((p: unknown): p is [string, { icon?: string }] => Array.isArray(p))
        .map((entry: [string, { icon?: string }]) => entry[1]?.icon),
    ].filter((p): p is string => typeof p === 'string');

    const missing = referenced.filter((p) => !fs.existsSync(path.join(APP_DIR, p)));
    expect(missing).toEqual([]);
  });
});
