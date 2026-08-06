import React from 'react';

/**
 * LocaleDirectionProvider — native no-op.
 *
 * On iOS/Android, RTL is applied globally by `I18nManager.forceRTL()` in
 * `src/i18n/rtl.ts`, which is what React Native uses to flip `marginStart`,
 * `start/end` insets and default text alignment. Nothing extra is needed here.
 *
 * The web build gets `LocaleDirectionProvider.web.tsx` instead — see that file
 * for why the web platform needs an explicit provider.
 */
export const LocaleDirectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <>{children}</>
);
