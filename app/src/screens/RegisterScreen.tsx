import { createLogger } from '../utils/logger';
const log = createLogger('RegisterScreen');
import React, { useState, useMemo, useRef } from 'react';
import { analyticsService } from '../services/analyticsService';
import {
    View, Text, StyleSheet, TextInput, ScrollView,
    TouchableOpacity, KeyboardAvoidingView, Platform,
    Pressable, Keyboard,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import { Button } from '../components/common/Button';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useToast } from '../context/ToastContext';
import { validateEmail, validatePassword, validatePasswordMatch } from '../utils/validation';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors';
import { AuthScreenNavigationProp } from '../types/navigation';
import { useAuthLoading } from '../hooks/useAuthLoading';
import { retryOperation } from '../utils/retry';
import { useTranslation } from 'react-i18next';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

export const RegisterScreen = () => {
    useScreenAnalytics('RegisterScreen');
    const { t, i18n } = useTranslation();
    const { register, upgradeGuest } = useAuth();
    const navigation = useNavigation<AuthScreenNavigationProp>();
    const route = useRoute<any>();
    // NAV-01: when reached as the in-app guest-upgrade route, link the account in place
    // and return the user to where they were (no AuthStack, no re-onboarding).
    const upgradeMode = route.params?.upgradeMode === true;
    const { showToast } = useToast();
    const { loading, withLoading } = useAuthLoading();
    // AUDIT-FIX (page-by-page validation 2026-06-02): language-derived RTL — I18nManager.isRTL is
    // false on web (forceRTL skipped to avoid reload loop), breaking absolute-positioned mirroring.
    const isRTL = i18n.language === 'ar' || i18n.language === 'tn';

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
    // AUTH-03: meter uses SHORT hint keys (not the long validation sentences) so the
    // fixed-width label can't collide with the bar — esp. in AR.
    const strengthLabel = [
        '',
        t('errors.passwordLength', { defaultValue: 'Min. 10 caractères' }),
        t('errors.passwordHintAddDigit', { defaultValue: 'Ajouter un chiffre' }),
        t('errors.passwordHintAddUpper', { defaultValue: 'Ajouter une majuscule' }),
        '✓',
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
                    showToast(t('common.accountCreated', { defaultValue: 'Compte créé ✅' }), 'success');
                    if (navigation.canGoBack()) navigation.goBack();
                    else navigation.navigate('HomeMain' as any);
                } else {
                    await retryOperation(() => register(email.trim(), password));
                    navigation.navigate('Onboarding');
                }
            } catch (error: any) {
                log.error('[RegisterScreen] Registration error:', error);
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
            {/* PHASE 3.1 FIX: TouchableWithoutFeedback deprecated → Pressable */}
            <Pressable onPress={Keyboard.dismiss}>
                <ScrollView
                    contentContainerStyle={styles.container}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Back arrow — explicit side per isRTL (RN-Web doesn't clear `left:undefined`). */}
                    <TouchableOpacity
                        style={[styles.backButton, { [isRTL ? 'right' : 'left']: theme.spacing.l }]}
                        onPress={() => upgradeMode
                            ? (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('HomeMain' as any))
                            : navigation.navigate('AuthChoice' as any)}
                        accessibilityRole="button"
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <RtlAwareChevron direction="back" variant="arrow" size={24} color={theme.colors.textSecondary} />
                    </TouchableOpacity>

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
                                    style={[styles.strengthLabel, { color: strengthColor }]}
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
            </Pressable>
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
        paddingHorizontal: 8,
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
        paddingVertical: 8,
    },
    crossNavText: {
        color: theme.colors.accent,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
