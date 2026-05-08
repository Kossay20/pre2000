import { createLogger } from '../utils/logger';
const log = createLogger('i18n');
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import translations
import fr from './locales/fr';
import ar from './locales/ar';
import tn from './locales/tn';
import en from './locales/en';

const LANGUAGE_DETECTOR = {
    type: 'languageDetector' as const,
    async: true,
    detect: async (callback: (lang: string) => void) => {
        try {
            const savedLang = await AsyncStorage.getItem('app_locale');
            callback(savedLang || 'fr');
        } catch (error) {
            log.debug('[i18n] Error detecting language:', error);
            callback('fr');
        }
    },
    init: () => { },
    cacheUserLanguage: async (lang: string) => {
        try {
            await AsyncStorage.setItem('app_locale', lang);
        } catch (error) {
            log.debug('[i18n] Error caching language:', error);
        }
    },
};

i18n
    .use(LANGUAGE_DETECTOR as any)
    .use(initReactI18next)
    .init({
        resources: {
            fr: { translation: fr },
            ar: { translation: ar },
            tn: { translation: tn },
            en: { translation: en },
        },
        fallbackLng: {
            'tn': ['ar', 'en', 'fr'],
            'ar': ['en', 'fr'],
            'en': ['fr'],
            'default': ['fr']
        },
        // lng: 'fr', // Commented out to allow language detector to work from AsyncStorage
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: false,
        },
    });

log.debug('[i18n] ✅ i18n initialized');

// P1-2 FIX (E2E audit 2026-05-08): on web, sync <html lang> and <html dir>
// with the active language. Without this, document.documentElement.lang stays
// 'en' even when displaying French content — auto-translate extensions and
// screen readers misidentify the document language.
const syncHtmlLangDir = (lng: string) => {
    if (typeof document === 'undefined') return;
    try {
        document.documentElement.lang = lng;
        document.documentElement.dir = (lng === 'ar' || lng === 'tn') ? 'rtl' : 'ltr';
    } catch (e) {
        log.debug('[i18n] Could not sync html lang/dir:', e);
    }
};
i18n.on('initialized', () => syncHtmlLangDir(i18n.language));
i18n.on('languageChanged', syncHtmlLangDir);
// In case i18n is already initialised at import time (cached resolver):
if (i18n.isInitialized) syncHtmlLangDir(i18n.language);

// PHASE 1.2 FIX (E2E audit 2026-05-08): inject the i18n instance into
// registerRTLListener() to break the require cycle (rtl.ts no longer imports
// from index.ts, so HMR-stable). Wired up the moment the i18n module is
// imported — BEFORE App.tsx mounts — so the async LANGUAGE_DETECTOR can
// finish reading 'app_locale' from AsyncStorage and trigger setupRTL().
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { registerRTLListener } = require('./rtl');
    registerRTLListener(i18n);
} catch (e) {
    log.warn('[i18n] Failed to register RTL listener:', e);
}

export default i18n;
