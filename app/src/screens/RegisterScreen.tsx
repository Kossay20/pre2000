import { createLogger } from '../utils/logger';
const log = createLogger('RegisterScreen');
import React, { useState, useMemo, useRef } from 'react';
import { analyticsService } from '../services/analyticsService';
import {
    View, Text, StyleSheet, TextInput, ScrollView,
    TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import { Button } from '../components/common/Button';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { DismissKeyboardView } from '../components/common/DismissKeyboardView';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useToast } from '../context/ToastContext';
import { validateEmail, validatePassword, validatePasswordMatch } from '../utils/validation';
import { getFirebaseErrorMessage, isExpectedAuthError } from '../utils/firebaseErrors';
import { AuthScreenNavigationProp } from '../types/navigation';
import { useAuthLoading } from '../hooks/useAuthLoading';
import { retryOperation } from '../utils/retry';
import { useTranslation } from 'react-i18next';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { hasPendingAppointmentDraft } from '../utils/pendingAppointmentDraft';

export const RegisterScreen = () => {
    useScreenAnalytics('RegisterScreen');
    const { t, i18n } = useTranslation();
    const { register, upgradeGuest } = useAuth();
    const navigation = useNavigation<AuthScreenNavigationProp>();
    const route = useRoute<any>();
    // NAV-01: when reached as the in-app guest-upgrade route, link the account in place
    // and return the user to where they were (no AuthStack, no re-onboarding).
    // UPGRADE-MODE FIX. This used to be `=== true`, a strict boolean check. The route
    // is deep-linkable (`/create-account?upgradeMode=true`) and React Navigation
    // rebuilds screen params from the URL, so the flag arrives as the STRING "true"
    // — which failed the check. The guest-upgrade screen then silently fell into the
    // fresh-registration branch: it created a brand-new account instead of linking
    // the guest, and finished with `navigate('Onboarding')`, a route that does not
    // exist inside HomeStack. The action was dropped, the user stayed on the form
    // with no feedback, and a second attempt reported "email already in use" —
    // the reported "I can't create an account".
    const upgradeMode = route.params?.upgradeMode === true || route.params?.upgradeMode === 'true';
    const { showToast } = useToast();
    const { loading, withLoading } = useAuthLoading();
    // AUDIT-FIX (page-by-page validation 2026-06-02): language-derived RTL — I18nManager.isRTL is
    // false on web (forceRTL skipped to avoid reload loop), breaking absolute-positioned mirroring.
    const isRTL = i18n.language === 'ar' || i18n.language === 'tn';
    const showInlineBack = !navigation.canGoBack();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    // W1 #18: which field is focused (visible focus ring, WCAG 2.4.7) + which field failed
    // validation (red border, so the user sees WHICH input to fix, not just a generic message).
    const [focusedField, setFocusedField] = useState<'email' | 'password' | 'confirm' | null>(null);
    const [errorField, setErrorField] = useState<'email' | 'password' | 'confirm' | null>(null);
    const passwordFocused = focusedField === 'password';
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const passwordRef = useRef<TextInput>(null);
    const confirmRef = useRef<TextInput>(null);

    // C14-FIX: aligned with C9 policy (10+ chars, 1 digit, 1 uppercase).
    // Password strength: 0=empty, 1=too short(<10), 2=no digit, 3=no uppercase, 4=valid
    const passwordStrength = useMemo(() => {
        if (!password) return 0;
        if (password.length < 10) return 1;
        if (!/\d/.test(password)) return 2;
        if (!/[A-Z]/.test(password)) return 3;
        return 4;
    }, [password]);

    const strengthColor = [
        'transparent',
        theme.colors.redAccentLight,
        theme.colors.orange500,
        theme.colors.orange500,
        theme.colors.green500,
    ][passwordStrength];
    // The bar keeps its traffic-light fill; the word under it needs text contrast
    // (≥ 4.5:1 on the pink background), which the light red/orange/green fills lack.
    const strengthTextColor = [
        'transparent',
        theme.colors.error,
        theme.colors.textSecondary,
        theme.colors.textSecondary,
        theme.colors.success,
    ][passwordStrength];
    // AUTH-03: the meter carries a short word so the fixed-width label can't collide
    // with the bar — esp. in AR. A strength word, not a rule: the rule is already on
    // the helper line under the field and in the alert on submit, and the meter
    // repeating it in different words ("Ajouter une majuscule" next to "Au moins
    // 1 majuscule") read as two rules.
    const strengthLabel = [
        '',
        t('passwordStrengthWeak'),
        t('passwordStrengthMedium'),
        t('passwordStrengthMedium'),
        `${t('passwordStrengthStrong')} ✓`,
    ][passwordStrength];

    const handleRegister = async () => {
        setError('');
        setErrorField(null);

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            setError(t(emailValidation.error || 'invalidEmail'));
            setErrorField('email');
            return;
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            setError(t(passwordValidation.error || 'invalidPassword'));
            setErrorField('password');
            return;
        }

        const passwordMatchValidation = validatePasswordMatch(password, confirmPassword);
        if (!passwordMatchValidation.valid) {
            setError(t(passwordMatchValidation.error || 'errors.passwordMismatch'));
            setErrorField('confirm');
            return;
        }

        await withLoading(async () => {
            try {
                if (upgradeMode) {
                    // Link the guest in place — no re-onboarding; return to the prior screen.
                    await retryOperation(() => upgradeGuest(email.trim(), password));
                    // Persistent: she is sent back to where she was right after.
                    showToast(t('common.accountCreated', { defaultValue: 'Compte créé ✅' }), 'success', { persistent: true });
                    // GUEST-DRAFT FIX: if the upgrade was triggered by a guest trying to
                    // save an appointment, land them back on that form — AddAppointment
                    // restores the stashed draft on mount. goBack() would drop them on
                    // Home instead, stranding the draft and making them retype it.
                    if (await hasPendingAppointmentDraft()) {
                        // `initial: false` keeps CalendarMain under the form, as Home's "+ RDV"
                        // does: when the Calendar tab had not been opened yet the form became the
                        // stack's only route, and Save's goBack() left the tab stuck on it.
                        navigation.getParent()?.navigate('Calendrier' as any, { screen: 'AddAppointment', initial: false });
                    } else if (navigation.canGoBack()) {
                        navigation.goBack();
                    } else {
                        navigation.navigate('HomeMain' as any);
                    }
                } else {
                    // No navigation here. register() installs a profile-less user, and
                    // the root navigator routes any signed-in account without a
                    // pregnancy anchor to Onboarding (needsProfileSetup, App.tsx). The
                    // old navigate('Onboarding') raced that swap: the auth state change
                    // replaced this whole stack with MainTabs first, and the user landed
                    // on a Home with no week and no profile ever written.
                    await retryOperation(() => register(email.trim(), password));
                }
            } catch (error: any) {
                // A taken email or a dropped connection is the user's to fix and the
                // form says so; only an unexpected failure is worth an error report.
                (isExpectedAuthError(error) ? log.warn : log.error)('[RegisterScreen] Registration error:', error);
                const errorMessage = error.code
                    ? t(getFirebaseErrorMessage(error.code))
                    : t('errors.createAccount');
                setError(errorMessage);
            }
        });
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* FOCUS FIX: on web, Pressable's responder preventDefault()s pointer-down
                and blocks focusing the inputs underneath — the form could not be typed
                into at all. DismissKeyboardView is a no-op on web, unchanged on native. */}
            <DismissKeyboardView>
                <ScrollView
                    contentContainerStyle={styles.container}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Back arrow — only when the stack header has none to show (a deep link
                        to /register or /create-account opens with no history). Both stacks
                        that host this screen show a header back otherwise, and the two
                        controls side by side were one too many. Explicit side per isRTL
                        (RN-Web doesn't clear `left:undefined`). */}
                    {showInlineBack && (
                        <TouchableOpacity
                            style={[styles.backButton, { [isRTL ? 'right' : 'left']: theme.spacing.l }]}
                            onPress={() => navigation.navigate((upgradeMode ? 'HomeMain' : 'AuthChoice') as any)}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.back')}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <RtlAwareChevron direction="back" variant="arrow" size={24} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    )}

                    <Text style={[styles.title, isRTL && styles.rtlText]}>{t('register')}</Text>
                    <Text style={[styles.subtitle, isRTL && styles.rtlText]}>
                        {t('secureData')}
                    </Text>

                    <View style={styles.form}>
                        {/* Email */}
                        <Text style={[styles.label, isRTL && styles.rtlText]}>{t('email')}</Text>
                        {/* W1 #14: email/password are LTR data — never force RTL caret/text in ar/tn. */}
                        <TextInput
                            style={[styles.input, focusedField === 'email' && styles.inputFocused, errorField === 'email' && styles.inputError]}
                            placeholderTextColor={theme.colors.neutral400}
                            placeholder={t('emailPlaceholder')}
                            value={email}
                            onChangeText={(text) => { setEmail(text); setError(''); setErrorField(null); }}
                            onFocus={() => setFocusedField('email')}
                            onBlur={() => setFocusedField(f => (f === 'email' ? null : f))}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="next"
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            testID="register_email_input"
                            // PHASE 2.2 FIX: a11y + password manager hints
                            accessibilityLabel={t('email')}
                            textContentType="emailAddress"
                            autoComplete="email"
                            inputMode="email"
                        />

                        {/* Password */}
                        <Text style={[styles.label, { marginTop: theme.spacing.m }, isRTL && styles.rtlText]}>
                            {t('password')}
                        </Text>
                        <View style={[styles.passwordContainer, focusedField === 'password' && styles.containerFocused, errorField === 'password' && styles.containerError]}>
                            <TextInput
                                ref={passwordRef}
                                style={styles.passwordInput}
                                placeholderTextColor={theme.colors.neutral400}
                                placeholder={t('passwordPlaceholder')}
                                value={password}
                                onChangeText={(text) => { setPassword(text); setError(''); setErrorField(null); }}
                                onFocus={() => setFocusedField('password')}
                                onBlur={() => setFocusedField(f => (f === 'password' ? null : f))}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                returnKeyType="next"
                                onSubmitEditing={() => confirmRef.current?.focus()}
                                testID="register_password_input"
                                // PHASE 2.2 FIX: hint password manager to OFFER a new password
                                accessibilityLabel={t('password')}
                                textContentType="newPassword"
                                autoComplete="new-password"
                            />
                            <TouchableOpacity
                                style={styles.eyeButton}
                                onPress={() => setShowPassword(v => !v)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={showPassword ? t('hidePassword') : t('showPassword')}
                                accessibilityState={{ selected: showPassword }}
                            >
                                <Text style={styles.eyeIcon} accessibilityElementsHidden importantForAccessibility="no">{showPassword ? '🙈' : '👁'}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* AUTH-03: full rule surfaced as a static helper line — placeholder is now
                            a short prompt so it can't be clipped by the narrow field. */}
                        <Text style={[styles.passwordHint, isRTL && styles.rtlText]}>
                            {t('passwordMin')}
                        </Text>

                        {/* Password Strength Bar */}
                        {(passwordFocused || password.length > 0) && (
                            <View style={styles.strengthContainer}>
                                <View style={styles.strengthBarBg}>
                                    <View
                                        style={[
                                            styles.strengthBarFill,
                                            {
                                                width: `${(passwordStrength / 4) * 100}%` as any,
                                                backgroundColor: strengthColor,
                                            },
                                        ]}
                                    />
                                </View>
                                <Text
                                    style={[styles.strengthLabel, { color: strengthTextColor }]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                >
                                    {strengthLabel}
                                </Text>
                            </View>
                        )}

                        {/* Confirm Password */}
                        <Text style={[styles.label, { marginTop: theme.spacing.m }, isRTL && styles.rtlText]}>
                            {t('confirmPassword')}
                        </Text>
                        <View style={[styles.passwordContainer, focusedField === 'confirm' && styles.containerFocused, errorField === 'confirm' && styles.containerError]}>
                            <TextInput
                                ref={confirmRef}
                                style={styles.passwordInput}
                                placeholderTextColor={theme.colors.neutral400}
                                placeholder={t('retypePassword')}
                                value={confirmPassword}
                                onChangeText={(text) => { setConfirmPassword(text); setError(''); setErrorField(null); }}
                                onFocus={() => setFocusedField('confirm')}
                                onBlur={() => setFocusedField(f => (f === 'confirm' ? null : f))}
                                secureTextEntry={!showConfirm}
                                autoCapitalize="none"
                                returnKeyType="done"
                                onSubmitEditing={handleRegister}
                                testID="register_confirm_input"
                                accessibilityLabel={t('confirmPassword')}
                                textContentType="newPassword"
                                autoComplete="new-password"
                            />
                            <TouchableOpacity
                                style={styles.eyeButton}
                                onPress={() => setShowConfirm(v => !v)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={showConfirm ? t('hidePassword') : t('showPassword')}
                                accessibilityState={{ selected: showConfirm }}
                            >
                                <Text style={styles.eyeIcon} accessibilityElementsHidden importantForAccessibility="no">{showConfirm ? '🙈' : '👁'}</Text>
                            </TouchableOpacity>
                        </View>

                        <ErrorMessage message={error} />

                        <Button
                            title={t('createMyAccount')}
                            onPress={handleRegister}
                            style={styles.button}
                            loading={loading}
                            testID="register_submit_button"
                        />

                        {/* Terms */}
                        <TouchableOpacity
                            style={styles.termsContainer}
                            onPress={() => navigation.navigate('PrivacyPolicy' as any)}
                            // It opens the terms and privacy page — a link, named by its text.
                            // It was a role-less, unnamed <div tabindex=0> on web.
                            accessibilityRole="link"
                            accessibilityLabel={t('termsDisclaimer')}
                        >
                            <Text style={[styles.termsText, isRTL && styles.rtlText]}>
                                {t('termsDisclaimer')}
                            </Text>
                        </TouchableOpacity>

                        {/* Separator */}
                        <View style={styles.separator}>
                            <View style={styles.separatorLine} />
                            <Text style={styles.separatorText}>{'·'}</Text>
                            <View style={styles.separatorLine} />
                        </View>

                        {/* Cross-nav: Already have account → Login (hidden in guest-upgrade mode:
                            the AuthStack Login route is unreachable from inside MainTabs). */}
                        {!upgradeMode && (
                            <TouchableOpacity
                                style={styles.crossNavButton}
                                onPress={() => navigation.navigate('Login' as any)}
                                accessibilityRole="button"
                            >
                                <Text style={[styles.crossNavText, isRTL && styles.rtlText]}>
                                    {t('alreadyHaveAccount', { defaultValue: 'Already have an account? Sign in' })}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>
            </DismissKeyboardView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        backgroundColor: theme.colors.background,
        padding: theme.spacing.l,
        paddingTop: 60,
        justifyContent: 'center',
    },
    backButton: {
        position: 'absolute',
        top: 54,
        padding: 4,
        // left/right set inline per isRTL (see render) — avoids the RN-Web `left:undefined` gotcha.
        // W1 #20: WCAG 2.5.5 — 44pt tap target (chevron is 24pt; hitSlop covers native, this covers web).
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginTop: theme.spacing.xl,
    },
    subtitle: {
        marginTop: theme.spacing.s,
        fontSize: 15,
        color: theme.colors.textLight,
        marginBottom: theme.spacing.xl,
    },
    rtlText: {
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    form: {
        gap: theme.spacing.xs,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 4,
    },
    input: {
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        fontSize: 16,
        backgroundColor: theme.colors.white,
    },
    inputRTL: {
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    // W1 #18: visible focus ring (WCAG 2.4.7) + per-field validation error border.
    inputFocused: {
        borderColor: theme.colors.accent,
    },
    inputError: {
        borderColor: theme.colors.error,
    },
    containerFocused: {
        borderColor: theme.colors.accent,
    },
    containerError: {
        borderColor: theme.colors.error,
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.white,
        overflow: 'hidden',
    },
    passwordInput: {
        flex: 1,
        padding: theme.spacing.m,
        fontSize: 16,
    },
    passwordHint: {
        marginTop: 4,
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    eyeButton: {
        paddingHorizontal: 14,
        justifyContent: 'center',
        alignItems: 'center',
        // 44pt target on every platform: hitSlop does not exist on react-native-web,
        // where the toggle measured 49×21.
        minWidth: 44,
        minHeight: 44,
    },
    eyeIcon: {
        fontSize: 18,
    },
    strengthContainer: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    strengthBarBg: {
        flex: 1,
        height: 4,
        backgroundColor: theme.colors.disabled,
        borderRadius: 2,
        overflow: 'hidden',
    },
    strengthBarFill: {
        height: 4,
        borderRadius: 2,
    },
    strengthLabel: {
        fontSize: 11,
        fontWeight: '500',
        minWidth: 90,
        flexShrink: 1,
        textAlign: 'right',
    },
    button: {
        marginTop: theme.spacing.l,
    },
    termsContainer: {
        marginTop: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        minHeight: 44,
    },
    termsText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        textDecorationLine: 'underline',
        lineHeight: 16,
    },
    separator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: theme.spacing.m,
        gap: 8,
    },
    separatorLine: {
        flex: 1,
        height: 1,
        backgroundColor: theme.colors.borderLight,
    },
    separatorText: {
        color: theme.colors.textLight,
        fontSize: 16,
    },
    crossNavButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        minHeight: 44,
    },
    crossNavText: {
        color: theme.colors.accent,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
