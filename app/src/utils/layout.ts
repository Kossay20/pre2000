import { Dimensions } from 'react-native';

/**
 * The width screens should lay themselves out against.
 *
 * `app.json` sets `ios.supportsTablet: true`, so on an iPad the window is 1032pt
 * wide in portrait while every screen here is designed for a phone. `TabletFrame`
 * therefore centres the app in a phone-width column — but a component that sizes
 * itself from `Dimensions.get('window').width` still computes against the full
 * 1032pt and overflows that column. That is exactly what happened to the baby
 * evolution carousel: cards laid out for a 1032pt viewport inside a 520pt
 * container, leaving the current month sitting off-centre with dead space beside
 * it.
 *
 * So: never read the window width for layout. Read this instead — it is the
 * window width on a phone and the column width on a tablet.
 */

/** iPad mini portrait is 744pt; at or above this we are on a tablet-class screen. */
export const TABLET_BREAKPOINT = 700;

/**
 * Roughly a large phone. Keeps phone-tuned type and spacing in proportion instead
 * of stretching them across a tablet.
 */
export const TABLET_CONTENT_MAX_WIDTH = 520;

/**
 * Usable content width, clamped to the tablet column.
 *
 * Kept as a function rather than a constant so call sites read it at render time.
 * The nine call sites this replaced all destructured `Dimensions.get('window')`
 * at module scope, which freezes the value at import — harmless while the app is
 * locked to portrait, but wrong the moment that changes.
 */
export const getContentWidth = (): number =>
  Math.min(Dimensions.get('window').width, TABLET_CONTENT_MAX_WIDTH);
