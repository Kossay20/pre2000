import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { theme } from '../../theme';
import { TABLET_BREAKPOINT, TABLET_CONTENT_MAX_WIDTH } from '../../utils/layout';

/**
 * Constrain the app to a centred reading column on tablets.
 *
 * `app.json` declares `ios.supportsTablet: true`, which means the app runs at the
 * iPad's native width — 1032pt in portrait on a 13" — and Apple requires an iPad
 * screenshot set for the listing. Every screen here is laid out for a phone: full
 * width cards, phone-scale type, phone-scale spacing. Stretched to 1032pt the
 * result is a wall of near-empty cards with text at a size meant to be read at
 * 390pt, which reads as unfinished rather than as a tablet layout.
 *
 * Rather than re-lay-out 33 screens for a v1, the app is centred in a reading-width
 * column (`TABLET_CONTENT_MAX_WIDTH`) with the gutters painted in the app
 * background. That is a deliberate, common treatment for a phone-first app on tablet, and it is honest:
 * it looks intentional instead of broken. A real tablet layout — two-pane home,
 * wider content grids — belongs in a later version.
 *
 * Below the breakpoint this renders nothing but its children in a plain flex
 * container, so phones are completely unaffected.
 */

// One source for the column width: screens size themselves from `getContentWidth()`,
// which must agree with the column this frame actually draws.
export { TABLET_BREAKPOINT, TABLET_CONTENT_MAX_WIDTH };

export const TabletFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width } = useWindowDimensions();

  if (width < TABLET_BREAKPOINT) {
    return <View style={styles.fill}>{children}</View>;
  }

  return (
    <View style={styles.gutter}>
      <View style={[styles.column, { maxWidth: TABLET_CONTENT_MAX_WIDTH }]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  gutter: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  column: {
    flex: 1,
    width: '100%',
    backgroundColor: theme.colors.background,
  },
});
