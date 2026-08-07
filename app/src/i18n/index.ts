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

// TUNISIAN PLURALS FIX. Our Derja locale uses the code `tn`, but in CLDR `tn`
// is Setswana — a two-form language (one / other). i18next resolves plural rules
// through Intl.PluralRules on that code, so every Arabic form we ship for `tn`
// (_zero, _two, _few, _many) was dead: 0, 2, 3 and 11 all fell through to
// _other. Tunisian rendered "3 مهمة" where Arabic correctly renders "3 مهام",
// and the same for every pluralized string in the locale.
// Derja is Arabic, so borrow Arabic's rules. Renaming the locale to `ar-TN`
// would also work but would invalidate the persisted `app_locale` value and
// every `language === 'tn'` comparison in the codebase.
try {
    const pluralResolver: any = (i18n as any).services?.pluralResolver;
    if (pluralResolver?.getRule) {
        const originalGetRule = pluralResolver.getRule.bind(pluralResolver);
        pluralResolver.getRule = (code: string, options?: unknown) =>
            originalGetRule(code === 'tn' ? 'ar' : code, options);
    } else {
        log.warn('[i18n] pluralResolver unavailable — tn will use Setswana plural rules');
    }
} catch (e) {
    log.warn('[i18n] Could not alias tn plural rules to ar:', e);
}

log.debug('[i18n] ✅ i18n initialized');

// P1-2 FIX (E2E audit 2026-05-08): on web, sync <html lang> and <html dir>
// with the active language. Without this, document.documentElement.lang stays
// 'en' even when displaying French content — auto-translate extensions and
// screen readers misidentify the document language.
// AR-RTL ROOT CAUSE (web): react-native-web 0.21 compiles `marginStart/End`,
// `paddingStart/End` and `start/end` to the *logical* CSS properties
// (`margin-inline-end`, `inset-inline-start`, …). Those resolve against the
// element's OWN `direction` — and RN-Web stamps `dir="auto"` on every <Text>.
// Per the HTML spec, `dir="auto"` on a node with no strong directional
// character (an emoji icon, a number, "•", ":") resolves to **ltr**, NOT to the
// parent's direction. Result in Arabic: every emoji/numeric Text kept its
// spacing and insets on the LTR side — icons glued to their label, badges on
// the wrong edge, chevrons offset the wrong way — across the whole app.
// Fix: while the document is RTL, give RN-Web's text nodes an explicit author
// `direction: rtl`, which outranks the UA's `dir="auto"` resolution. The
// `unicode-bidi: isolate` RN-Web sets stays untouched, so genuinely LTR runs
// (emails, URLs, "mmol/L") still render internally left-to-right — exactly what
// native does under `I18nManager.forceRTL(true)`.
const RTL_DIR_STYLE_ID = 'mb-rtl-dir-fix';
const ensureRtlDirStyle = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(RTL_DIR_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = RTL_DIR_STYLE_ID;
    style.textContent = 'html[dir="rtl"] [dir="auto"]{direction:rtl;}';
    document.head.appendChild(style);
};

const syncHtmlLangDir = (lng: string) => {
    if (typeof document === 'undefined') return;
    try {
        document.documentElement.lang = lng;
        document.documentElement.dir = (lng === 'ar' || lng === 'tn') ? 'rtl' : 'ltr';
        ensureRtlDirStyle();
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
