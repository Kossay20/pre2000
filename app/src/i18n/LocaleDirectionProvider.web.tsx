import React from 'react';
import { useTranslation } from 'react-i18next';
import { isRtlLang } from '../hooks/useRtl';
import { htmlLangTag } from './htmlLang';
import { createLogger } from '../utils/logger';

const log = createLogger('LocaleDirectionProvider');

/**
 * LocaleDirectionProvider — web implementation.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/i18n/rtl.ts` deliberately skips `I18nManager.forceRTL()` on web (it
 * caused an infinite reload loop, since react-native-web's `I18nManager.isRTL`
 * is in-memory and resets to `false` on every page load). Setting
 * `document.documentElement.dir = 'rtl'` was assumed to be enough — it is not.
 *
 * react-native-web 0.21 compiles styles to *atomic physical* CSS: `marginEnd:16`
 * becomes a class whose declaration is literally `margin-right: 16px`. The
 * mirroring happens at render time in `StyleSheet`'s `localizeStyle(style,
 * isRTL)`, and that `isRTL` comes from the component's `writingDirection` —
 * which resolves to `props.dir || LocaleContext.direction`, defaulting to
 * `'ltr'`. Neither `I18nManager` nor the `<html dir>` attribute feeds it.
 *
 * So without a LocaleProvider, every `marginStart/marginEnd`,
 * `paddingStart/paddingEnd`, `start/end` inset and directional `textAlign` in
 * the app (120+ usages) stayed on its left-to-right side in Arabic: icons glued
 * to their labels, badges on the wrong edge, chevrons pointing the wrong way.
 *
 * Wrapping the tree in RN-Web's own `LocaleProvider` is the supported fix and
 * makes the web preview mirror the device behaviour, so Arabic can actually be
 * QA'd in a browser.
 *
 * `LocaleProvider` is not re-exported from the package root, so it is imported
 * from its module path. This file is web-only (Metro picks `.web.tsx`), so the
 * native bundle never resolves it.
 */

let LocaleProvider: React.ComponentType<{
    direction?: 'ltr' | 'rtl';
    locale?: string;
    children: React.ReactNode;
}> | null = null;

try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    LocaleProvider = require('react-native-web/dist/modules/useLocale').LocaleProvider ?? null;
} catch (e) {
    log.warn('react-native-web LocaleProvider unavailable — RTL styles will not mirror on web', e);
}

export const LocaleDirectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { i18n } = useTranslation();
    const direction = isRtlLang(i18n.language) ? 'rtl' : 'ltr';

    if (!LocaleProvider) return <>{children}</>;

    // `key` forces a remount on direction change so every memoised style object
    // is re-localised rather than kept from the previous direction.
    // The provider derives its direction from `locale` whenever one is given and ignores
    // `direction`. The raw key `tn` reads as Setswana, a left-to-right language, so the
    // Tunisian screens kept every start/end margin on its LTR side (search icon glued to
    // its placeholder, emoji glued to labels). `ar-TN` resolves to Arabic script, RTL.
    return (
        <LocaleProvider key={direction} direction={direction} locale={htmlLangTag(i18n.language)}>
            {children}
        </LocaleProvider>
    );
};
