import { createLogger } from '../utils/logger';
const log = createLogger('LoginScreen');
import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TextInput, ScrollView,
    TouchableOpacity, KeyboardAvoidingView, Platform,
    I18nManager, Pressable, Keyboard,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { auth } from '../config/firebase';
import { analyticsService } from '../services/analyticsService';
import { sendPasswordResetEmail } from 'firebase/auth';
import { theme } from '../theme';
import { Button } from '../components/common/Button';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { SuccessMessage } from '../components/common/SuccessMessage';
import { validateEmail, validatePasswordForLogin } from '../utils/validation';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuthLoading } from '../hooks/useAuthLoading';
import { retryOperation } from '../utils/retry';
// Cycle 3 F404 : authLimiter (5 tentatives / 5 min) — anti brute-force client-side.
import { authLimiter } from '../utils/rateLimiter';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

export const LoginScreen = () => {
    useScreenAnalytics('LoginScreen');
    const { login } = useAuth();
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const { loading, withLoading } = useAuthLoading();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const passwordRef = useRef<TextInput>(null);
    const isRTL = I18nManager.isRTL;

    const handleLogin = async () => {
        setError('');
        setSuccess('');

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            setError(t(emailValidation.error || 'auth.invalidEmail'));
            return;
        }

        // C14-FIX: use the permissive login validator so users registered
        // with the pre-C9 policy (8-char min, no uppercase req) can still log in.
        // Firebase Auth itself rejects wrong passwords; we only check non-empty here.
        const passwordValidation = validatePasswordForLogin(password);
        if (!passwordValidation.valid) {
            setError(t(passwordValidation.error || 'auth.invalidPassword'));
            return;
        }

        // Cycle 3 F404 : check rate limiter AVANT d'appeler Firebase (anti
        // brute-force / credential-stuffing). 5 tentatives / 5 min par appareil.
        // Complète le throttling Firebase Auth (qui est lâche : ~5/sec/IP).
        if (!authLimiter.tryRequest()) {
            const seconds = Math.ceil(authLimiter.getTimeUntilReset() / 1000);
            const minutes = Math.ceil(seconds / 60);
            setError(t('auth.tooManyAttempts', { minutes }));
            return;
        }

        await withLoading(async () => {
            try {
                await retryOperation(() => login(email.trim(), password));
                await analyticsService.logEvent('login', { method: 'email' });
                await analyticsService.setUserId(auth.currentUser?.uid || null);
                // Cycle 3 F404 : reset après succès (l'utilisatrice a légitimement
                // saisi son password, on ne pénalise pas un login OK).
                authLimiter.reset();
            } catch (error: any) {
                log.error('[LoginScreen] Login error:', error);
                const errorMessage = error.code
                    ? t(getFirebaseErrorMessage(error.code))
                    : t('errorOccurred');
                setError(errorMessage);
            }
        });
    };

    const handleForgotPassword = async () => {
        setError('');
        setSuccess('');

        if (!email.trim()) {
            setError(t('enterEmailForReset'));
            return;
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            setError(t(emailValidation.error || 'enterValidEmail'));
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email.trim());
            setSuccess(t('resetEmailSent'));
        } catch (error: any) {
            log.error(error);
            const errorMessage = error.code
                ? t(getFirebaseErrorMessage(error.code))
                : t('cannotSendResetEmail');
            setError(errorMessage);
        }
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
                    {/* Back arrow */}
                    <TouchableOpacity
                        style={[styles.backButton, isRTL && styles.backButtonRTL]}
                        onPress={() => navigation.navigate('AuthChoice')}
                        accessibilityRole="button"
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <RtlAwareChevron direction="back" variant="arrow" size={24} color={theme.colors.textSecondary} />
                    </TouchableOpacity>

                    <Text style={[styles.title, isRTL && styles.rtlText]}>{t('loginTitle')}</Text>
                    <Text style={[styles.subtitle, isRTL && styles.rtlText]}>
                        {t('loginSubtitle')}
                    </Text>

                    <View style={styles.form}>
                        {/* Email */}
                        <Text style={[styles.label, isRTL && styles.rtlText]}>{t('email')}</Text>
                        <TextInput
                            style={[styles.input, isRTL && styles.inputRTL]}
                            placeholder={t('emailPlaceholder')}
                            value={email}
                            onChangeText={(text) => { setEmail(text); setError(''); setSuccess(''); }}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="next"
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            testID="login_email_input"
                            accessibilityLabel={t('email')}
                            textContentType="emailAddress"
                            autoComplete="email"
                            inputMode="email"
                        />

                        {/* Password with show/hide toggle */}
                        <Text style={[styles.label, { marginTop: theme.spacing.m }, isRTL && styles.rtlText]}>
                            {t('password')}
                        </Text>
                        <View style={styles.passwordContainer}>
                            <TextInput
                                ref={passwordRef}
                                style={[styles.passwordInput, isRTL && styles.inputRTL]}
                                placeholder={t('passwordPlaceholder')}
                                value={password}
                                onChangeText={(text) => { setPassword(text); setError(''); setSuccess(''); }}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                returnKeyType="done"
                                onSubmitEditing={handleLogin}
                                testID="login_password_input"
                                accessibilityLabel={t('password')}
                                textContentType="password"
                                autoComplete="current-password"
                            />
                            <TouchableOpacity
                                style={styles.eyeButton}
                                onPress={() => setShowPassword(v => !v)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
                            </TouchableOpacity>
                        </View>

                        <ErrorMessage message={error} />
                        <SuccessMessage message={success} />

                        <Button
                            title={t('login')}
                            onPress={handleLogin}
                            style={styles.button}
                            loading={loading}
                            testID="login_submit_button"
                        />

                        {/* Forgot password */}
                        <TouchableOpacity
                            style={styles.forgotPasswordButton}
                            onPress={handleForgotPassword}
                            testID="forgot_password_button"
                            accessibilityRole="button"
                            accessibilityLabel={t('forgotPassword')}
                        >
                            <Text style={styles.forgotPasswordText}>{t('forgotPassword')}</Text>
                        </TouchableOpacity>

                        {/* Separator */}
                        <View style={styles.separator}>
                            <View style={styles.separatorLine} />
                            <Text style={styles.separatorText}>{'·'}</Text>
                            <View style={styles.separatorLine} />
                        </View>

                        {/* Cross-nav: No account → Register */}
                        <TouchableOpacity
                            style={styles.crossNavButton}
                            onPress={() => navigation.navigate('Register')}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.crossNavText, isRTL && styles.rtlText]}>
                                {t('noAccount', { defaultValue: "Don't have an account? Sign up" })}
                            </Text>
                        </TouchableOpacity>
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
        left: theme.spacing.l,
        padding: 4,
    },
    backButtonRTL: {
        left: undefined,
        right: theme.spacing.l,
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
    eyeButton: {
        paddingHorizontal: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eyeIcon: {
        fontSize: 18,
    },
    button: {
        marginTop: theme.spacing.l,
    },
    forgotPasswordButton: {
        marginTop: theme.spacing.m,
        alignItems: 'center',
    },
    forgotPasswordText: {
        color: theme.colors.primary,
        fontSize: 14,
        textDecorationLine: 'underline',
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
        color: theme.colors.primary,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});
