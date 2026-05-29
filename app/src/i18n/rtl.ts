import { I18nManager, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { createLogger } from '../utils/logger';
import type { i18n as I18nInstance } from 'i18next';
const log = createLogger('rtl');

// PHASE 1.2 FIX (E2E audit 2026-05-08): break the require cycle
// `i18n/index.ts -> i18n/rtl.ts -> i18n/index.ts`. The cycle caused
// `i18n` to be undefined at registerRTLListener() time, throwing
// "Cannot read properties of undefined (reading 'isInitialized')" on every
// HMR reload. Now i18n is injected via registerRTLListener(i18nInstance).
let i18nRef: I18nInstance | null = null;

export const isRTL = (): boolean => {
    if (!i18nRef) return false;
    return i18nRef.language === 'ar' || i18nRef.language === 'tn';
};

export const setupRTL = async () => {
    const shouldBeRTL = isRTL();

    // I2-FIX (RED-team): on WEB, do NOT touch I18nManager or reload. react-native-web's
    // I18nManager.isRTL is in-memory and resets to `false` on every page load, so
    // forceRTL(true) + window.location.reload() never converges for an Arabic/Tunisian
    // user — it reloads, isRTL is false again, mismatch again → INFINITE RELOAD LOOP.
    // Web RTL direction is already applied declaratively via document.documentElement.dir
    // in i18n/index.ts (syncHtmlLangDir), so there is nothing to reload for here.
    if (Platform.OS === 'web') {
        return;
    }

    // NATIVE: anti-loop guard — only flip + reload when the direction actually changed.
    if (I18nManager.isRTL !== shouldBeRTL) {
        log.info(`Switching RTL mode: ${I18nManager.isRTL} -> ${shouldBeRTL}`);
        I18nManager.allowRTL(shouldBeRTL);
        I18nManager.forceRTL(shouldBeRTL);

        // Reload app to apply RTL changes (native only).
        // P0-5 FIX: Updates.reloadAsync throws CodedError in dev mode → guard.
        try {
            setTimeout(async () => {
                if (__DEV__) {
                    log.info('Skipping Updates.reloadAsync in dev — RTL change visible after manual restart');
                    return;
                }
                await Updates.reloadAsync();
            }, 100);
        } catch (error) {
            log.warn('Could not reload app for RTL change:', error);
        }
    }
};

let rtlListenerRegistered = false;

/**
 * Register the RTL listener. The i18n instance is injected from
 * src/i18n/index.ts after init() to avoid the require cycle.
 */
export const registerRTLListener = (i18nInstance: I18nInstance) => {
    i18nRef = i18nInstance;
    if (rtlListenerRegistered) return;
    rtlListenerRegistered = true;

    const triggerSetup = () => {
        setupRTL().catch((err) => log.warn('setupRTL from listener failed:', err));
    };

    if (i18nInstance.isInitialized) {
        triggerSetup();
    } else {
        i18nInstance.on('initialized', triggerSetup);
    }

    i18nInstance.on('languageChanged', triggerSetup);
};

export const changeLanguage = async (lang: string) => {
    if (!i18nRef) {
        log.warn('changeLanguage called before registerRTLListener — i18n not ready');
        return;
    }
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('app_locale', lang);
    await i18nRef.changeLanguage(lang);
    try {
        const { analyticsService } = require('../services/analyticsService');
        analyticsService.setUserProperties({ app_language: lang });
        analyticsService.logEvent('language_changed', { language: lang });
    } catch (_e) { /* Analytics not critical */ }
    await setupRTL();
};
