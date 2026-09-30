import React from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { LanguageSelector } from '../components/common/LanguageSelector';
import { useTranslation } from 'react-i18next';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

export const AuthChoiceScreen = () => {
    useScreenAnalytics('AuthChoiceScreen');
    const navigation = useNavigation<any>();
    const { t, i18n } = useTranslation();
    // AUDIT-FIX (page-by-page validation 2026-06-02): language-derived RTL — I18nManager.isRTL is
    // false on web (forceRTL skipped to avoid reload loop), breaking absolute-positioned mirroring.
    const isRTL = i18n.language === 'ar' || i18n.language === 'tn';

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={[theme.colors.lavenderBlush, theme.colors.white]}
                style={styles.container}
            >
                {/* Language Selector - top corner */}
                <View style={[styles.langContainer, isRTL && styles.langContainerRTL]}>
                    <LanguageSelector />
                </View>

                {/* Hero section */}
                <View style={styles.heroSection}>
                    <Text style={styles.heroEmoji}>🤰</Text>
                    <Text style={[styles.heroTitle, isRTL && styles.rtlText]}>
                        {t('startJourney')}
                    </Text>
                    <Text style={[styles.heroSubtitle, isRTL && styles.rtlText]}>
                        {t('trackDaily')}
                    </Text>
                </View>

                {/* Buttons */}
                <View style={styles.buttonsContainer}>
                    {/* Primary: Create Account */}
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => navigation.navigate('Register')}
                        testID="auth_signup_button"
                        accessibilityRole="button"
                        accessibilityLabel={t('createAccount')}
                        activeOpacity={0.85}
                    >
                        {/* White text needs the strong pink at the gradient's start: on
                            `primary` it measured 2.68:1 ("Créer un compte") and 2.3:1 for the
                            85 % white subtext. primaryStrong → accent holds ≥ 4.6:1 across. */}
                        <LinearGradient
                            colors={[theme.colors.primaryStrong, theme.colors.accent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.primaryGradient}
                        >
                            <Text style={styles.primaryButtonText}>{t('createAccount')}</Text>
                            <Text style={styles.buttonSubtext}>{t('startQuestionnaire')}</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Secondary: Login */}
                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => navigation.navigate('Login')}
                        testID="auth_login_button"
                        accessibilityRole="button"
                        accessibilityLabel={t('login')}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.secondaryButtonText}>{t('login')}</Text>
                    </TouchableOpacity>

                    {/* Guest — lighter, with lock icon */}
                    <TouchableOpacity
                        style={styles.guestButton}
                        onPress={() => navigation.navigate('Onboarding')}
                        testID="auth_guest_button"
                        accessibilityRole="button"
                        accessibilityLabel={t('continueAsGuest')}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.guestButtonText}>{t('continueAsGuest')}</Text>
                    </TouchableOpacity>

                    {/* Disclaimer + privacy link — W1 #17: split into two elements so the RTL bidi
                        algorithm can't scramble a "<sentence> — <link>" concatenation, and the link
                        gets a real link role (the disclaimer text is no longer falsely tappable). */}
                    <View style={styles.termsContainer}>
                        <Text style={[styles.termsText, isRTL && styles.rtlText]}>
                            {t('guestDisclaimer')}
                        </Text>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('PrivacyPolicy')}
                            activeOpacity={0.7}
                            accessibilityRole="link"
                            accessibilityLabel={t('privacyPolicy', { defaultValue: 'Politique de confidentialité' })}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            // hitSlop does not exist on react-native-web: the link was 18px tall there.
                            style={styles.termsLinkTarget}
                        >
                            <Text style={[styles.termsLink, isRTL && styles.rtlText]}>
                                {t('privacyPolicy', { defaultValue: 'Politique de confidentialité' })}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.colors.lavenderBlush,
    },
    container: {
        flex: 1,
        paddingHorizontal: theme.spacing.l,
        paddingBottom: theme.spacing.xl,
        justifyContent: 'space-between',
    },
    langContainer: {
        alignSelf: 'flex-end',
        marginTop: theme.spacing.m,
    },
    langContainerRTL: {
        alignSelf: 'flex-start',
    },
    heroSection: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: theme.spacing.xl,
    },
    heroEmoji: {
        fontSize: 72,
        marginBottom: theme.spacing.m,
    },
    heroTitle: {
        fontSize: 30,
        fontWeight: 'bold',
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: theme.spacing.s,
    },
    heroSubtitle: {
        fontSize: 16,
        color: theme.colors.textLight,
        textAlign: 'center',
        paddingHorizontal: theme.spacing.m,
    },
    rtlText: {
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    buttonsContainer: {
        gap: theme.spacing.m,
    },
    primaryButton: {
        borderRadius: theme.borderRadius.m,
        overflow: 'hidden',
        elevation: 3,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
    },
    primaryGradient: {
        padding: theme.spacing.l,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: theme.colors.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
    buttonSubtext: {
        // Full white: 85 % white over primaryStrong is 3.7:1 at 13px.
        color: theme.colors.white,
        fontSize: 13,
        marginTop: 3,
    },
    secondaryButton: {
        padding: theme.spacing.l,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        backgroundColor: theme.colors.white,
        borderWidth: 2,
        borderColor: theme.colors.primary,
    },
    secondaryButtonText: {
        // A11Y-CONTRAST-01: 'Sign in' text #FF6B9D on white button = 2.68:1 (WCAG AA
        // fail). Route to accent #C2185B = 5.5:1 (pass). Border stays #FF6B9D (decorative).
        color: theme.colors.accent,
        fontSize: 18,
        fontWeight: 'bold',
    },
    guestButton: {
        padding: theme.spacing.m,
        alignItems: 'center',
    },
    guestButtonText: {
        color: theme.colors.textLight,
        fontSize: 15,
    },
    termsContainer: {
        alignItems: 'center',
        paddingHorizontal: theme.spacing.m,
        marginTop: 4,
    },
    termsText: {
        fontSize: 11,
        color: theme.colors.neutral400,
        textAlign: 'center',
        lineHeight: 16,
    },
    termsLinkTarget: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.s,
    },
    termsLink: {
        fontSize: 11,
        color: theme.colors.textLight,
        textAlign: 'center',
        textDecorationLine: 'underline',
        lineHeight: 16,
        marginTop: 2,
    },
});
