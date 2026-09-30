import { createLogger } from '../utils/logger';
const log = createLogger('LanguageSelectScreen');
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
// Cycle 3 F206 : toast non-bloquant à la place de Alert.alert pour le succès.
import { useToast } from '../context/ToastContext';
import { showAlert } from '../utils/alert';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { theme } from '../theme';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n/rtl';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { useRtl } from '../hooks/useRtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// T7-FIX-F53 : utiliser le nom natif comme label principal pour AR/TN aussi
// (idem FR/EN). Un user arabophone reconnaît "العربية" en premier coup d'œil
// alors que "Arabic" était caché en subtitle.
// P3-FIX : le sous-titre (descKey) est désormais localisé via t() au lieu d'une
// chaîne figée. Avant, la carte TN affichait toujours "Arabe + Darija" (FR) et
// la carte AR "Arabic" (EN) quelle que soit la langue active de l'UI.
const LANGUAGES = [
    { code: 'fr', name: 'Français', flag: '🇫🇷', descKey: 'common.langDescFr' },
    // #12b: MSA Arabic is pan-regional, not one country — a globe avoids arbitrarily picking a
    // single Arab nation's flag (Derja below keeps 🇹🇳, which IS Tunisia-specific).
    { code: 'ar', name: 'العربية', flag: '🌍', descKey: 'common.langDescAr' },
    // No beta suffix on the name: the first screen a reviewer sees must not present any
    // part of the app as unfinished (App Store 2.2).
    { code: 'tn', name: 'العربية + الدارجة', flag: '🇹🇳', descKey: 'common.langDescTn' },
    { code: 'en', name: 'English', flag: '🇬🇧', descKey: 'common.langDescEn' },
];

export const LanguageSelectScreen = () => {
    useScreenAnalytics('LanguageSelectScreen');
    const navigation = useNavigation();
    const { t } = useTranslation();
    const { showToast } = useToast();
    // AR-RTL fix: react-native-web puts `dir="auto"` on every Text, so a Latin
    // label ("English", "Français") was left-aligned while its Arabic subtitle was
    // right-aligned inside the same card. Pin the alignment to the UI language.
    const { textAlign } = useRtl();
    const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'fr');
    const [loading, setLoading] = useState(false);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        // Load saved language
        const loadLanguage = async () => {
            try {
                const savedLang = await AsyncStorage.getItem('app_locale');
                if (savedLang) {
                    setSelectedLanguage(savedLang);
                }
            } catch (error) {
                log.error('Error loading language:', error);
            }
        };
        loadLanguage();
    }, []);

    const handleLanguageSelect = async (languageCode: string) => {
        setLoading(true);
        try {
            await changeLanguage(languageCode);

            // Save language preference (redundant if changeLanguage does it, but safe)
            await AsyncStorage.setItem('app_locale', languageCode);
            setSelectedLanguage(languageCode);

            // Cycle 3 F206 : toast non-bloquant à la place de l'Alert (qui bloquait
            // le flux et forçait un tap OK). Pas de navigation auto — l'utilisatrice
            // confirme via le bouton "Continue" en bas de l'écran (l'helper E2E
            // bootstrap-main-tabs.ts:21 + audit-screens spec 02 cliquent ce bouton).
            // Cela préserve aussi un meilleur UX : si l'utilisatrice se trompe de
            // langue, elle peut re-cliquer une autre carte sans être navigated away.
            // Use i18n.getFixedT(newLang) instead of t() here: the React useTranslation hook
            // captures its value at render time and lags one cycle behind i18n.changeLanguage,
            // so t('languageUpdated') would show the OLD language's string (e.g. "Langue mise
            // à jour" in French even after switching to Arabic). getFixedT reads the new locale
            // directly from the i18n instance without waiting for a React re-render.
            showToast(i18n.getFixedT(languageCode)('common.languageUpdated'), 'success');
        } catch (error) {
            log.error('Error saving language:', error);
            showAlert(t('common.error'), t('common.languageChangeError'));
        } finally {
            setLoading(false);
        }
    };

    // GJ-006: Continue lives in a footer outside the ScrollView. At the end of the
    // list it sat below the fold on a phone (y≈1044 on a 390×844 screen in French,
    // ≈982 in Arabic): the one action this screen exists for was invisible until the
    // user thought to scroll past an info box.
    return (
        <View style={styles.screen}>
            <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
                {/* Header with Gradient */}
                <LinearGradient
                    colors={[theme.colors.primary, theme.colors.accent]}
                    style={styles.header}
                >
                    <Text style={styles.headerEmoji}>🌐</Text>
                    <Text style={styles.headerTitle}>{t('common.chooseLanguage')}</Text>
                    <Text style={styles.headerSubtitle}>
                        {t('common.chooseLanguageSubtitle')}
                    </Text>
                </LinearGradient>

                <View style={styles.content}>
                    <Text style={styles.infoText}>
                        {t('common.selectLanguageHint')}
                    </Text>

                    {LANGUAGES.map((language) => (
                        <TouchableOpacity
                            key={language.code}
                            // Stable E2E hook. The suite used to locate these cards by
                            // flag emoji and positional index; when the Arabic card swapped
                            // 🇩🇿 for a region-neutral 🌍 the regex silently matched only
                            // three cards, so the "ar" test was actually clicking the
                            // Tunisian card and the en/tn tests broke outright. A testID
                            // cannot drift with the visual design.
                            testID={`lang_card_${language.code}`}
                            style={[
                                styles.languageCard,
                                selectedLanguage === language.code && styles.languageCardSelected,
                            ]}
                            onPress={() => handleLanguageSelect(language.code)}
                            disabled={loading}
                            activeOpacity={0.7}
                        >
                            <View style={styles.languageContent}>
                                <Text style={styles.languageFlag}>{language.flag}</Text>
                                <View style={styles.languageInfo}>
                                    <Text style={[
                                        styles.languageName,
                                        { textAlign },
                                        selectedLanguage === language.code && styles.languageNameSelected,
                                    ]}>
                                        {language.name}
                                    </Text>
                                    <Text style={[
                                        styles.languageNative,
                                        { textAlign },
                                        selectedLanguage === language.code && styles.languageNativeSelected,
                                    ]}>
                                        {t(language.descKey)}
                                    </Text>
                                </View>
                                {/* AR-RTL fix: the checkmark used `position:absolute; right:20`, a
                                    physical inset that stayed on the right in Arabic and collided
                                    with the flag. In-flow at the end of the row it mirrors for free. */}
                                {selectedLanguage === language.code && (
                                    <View style={styles.checkmark}>
                                        <Text style={styles.checkmarkText}>✓</Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    ))}

                    {/* Info Box */}
                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>{t('common.infoTitle')}</Text>
                        {/* The "some translations are in progress" / "French is the most
                            complete" bullets are gone: the first screen of a store build told
                            every user the product was unfinished, while ar, tn and en ship as
                            first-class languages. */}
                        <Text style={styles.infoBoxText}>
                            {t('common.infoLanguageApplied')}
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* Continue Button */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.dispatch(
                        CommonActions.reset({ index: 0, routes: [{ name: 'AuthChoice' }] })
                    )}
                    accessibilityRole="button"
                >
                    <View style={styles.continueRow}>
                        <Text style={styles.backButtonText}>{t('common.continue')}</Text>
                        <RtlAwareChevron direction="forward" variant="arrow" size={18} color={theme.colors.textSecondary} />
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    scrollContent: {
        flexGrow: 1,
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.disabled,
    },
    header: {
        paddingTop: 60,
        paddingBottom: 32,
        alignItems: 'center',
    },
    headerEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.white,
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 14,
        color: theme.colors.whiteAlpha90,
        textAlign: 'center',
    },
    content: {
        padding: 16,
        paddingBottom: 16,
    },
    infoText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    languageCard: {
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: theme.colors.disabled,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    languageCardSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.gradientPinkEnd,
    },
    languageContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    languageFlag: {
        fontSize: 40,
        marginEnd: 16,
    },
    languageInfo: {
        flex: 1,
    },
    languageName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.textInk,
        marginBottom: 4,
    },
    languageNameSelected: {
        color: theme.colors.accent,
    },
    languageNative: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    languageNativeSelected: {
        color: theme.colors.accent,
    },
    checkmark: {
        marginStart: 12,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmarkText: {
        color: theme.colors.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
    infoBox: {
        backgroundColor: theme.colors.surfaceBlueTint,
        borderRadius: 12,
        padding: 16,
        marginTop: 24,
        borderWidth: 1,
        borderColor: theme.colors.blue100,
    },
    infoBoxTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.info,
        marginBottom: 12,
    },
    infoBoxText: {
        fontSize: 14,
        color: theme.colors.blue800,
        lineHeight: 20,
    },
    backButton: {
        backgroundColor: theme.colors.white,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.disabled,
    },
    backButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    continueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
});
