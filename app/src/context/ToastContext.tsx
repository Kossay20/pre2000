import React, { useMemo, createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { isRtlLang } from '../hooks/useRtl';
import { usePrefersReducedMotion, getReducedMotionSync } from '../hooks/usePrefersReducedMotion';

type ToastType = 'success' | 'error' | 'info';

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [type, setType] = useState<ToastType>('success');
    const { i18n } = useTranslation();
    const isRTL = isRtlLang(i18n.language);
    // Primes the reduced-motion cache + re-renders on OS setting change (DS-3).
    usePrefersReducedMotion();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const showToast = useCallback((msg: string, t: ToastType = 'success') => {
        if (timerRef.current) clearTimeout(timerRef.current);

        setMessage(msg);
        setType(t);
        setVisible(true);

        // Animate In — skipped when the OS prefers reduced motion (DS-3): snap to
        // the final values so the toast still appears (and the SR live region fires).
        if (getReducedMotionSync()) {
            fadeAnim.setValue(1);
            translateY.setValue(0);
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(translateY, {
                    toValue: 0,
                    tension: 40,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]).start();
        }

        // Auto hide
        timerRef.current = setTimeout(() => {
            hideToast();
        }, 3000);
    }, []);

    const hideToast = () => {
        if (getReducedMotionSync()) {
            fadeAnim.setValue(0);
            translateY.setValue(20);
            setVisible(false);
            return;
        }
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 20,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setVisible(false);
        });
    };

    const getBackgroundColor = () => {
        switch (type) {
            case 'success': return theme.colors.green500;
            case 'error': return theme.colors.critical;
            case 'info': return theme.colors.blue600;
            default: return theme.colors.neutral900;
        }
    };

    const getIcon = () => {
        switch (type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'info': return 'ℹ️';
            default: return '✨';
        }
    };

    // The provider used to pass a fresh `{ showToast }` literal on every render, so
    // all 6 consumers re-rendered whenever ToastProvider did (i.e. on every toast
    // show/hide). `showToast` itself is already a stable useCallback — only the
    // wrapper object was churning.
    const contextValue = useMemo(() => ({ showToast }), [showToast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            {visible && (
                <Animated.View
                    // D7-01 / DS-2: announce async confirmations to screen readers.
                    accessibilityLiveRegion="polite"
                    accessibilityRole="alert"
                    {...(Platform.OS === 'web' ? { role: 'status', 'aria-live': 'polite' } : {})}
                    style={[
                        styles.toastContainer,
                        {
                            opacity: fadeAnim,
                            transform: [{ translateY }],
                            backgroundColor: getBackgroundColor(),
                        },
                    ]}
                >
                    <TouchableOpacity
                        onPress={hideToast}
                        activeOpacity={0.9}
                        // flexDirection 'row' mirrors automatically under dir=rtl (web) /
                        // I18nManager (native) — do NOT row-reverse (would double-reverse on web).
                        style={styles.content}
                        accessibilityRole="button"
                    >
                        <Text style={styles.icon}>{getIcon()}</Text>
                        <Text style={[styles.message, { textAlign: isRTL ? 'right' : 'left' }]}>{message}</Text>
                    </TouchableOpacity>
                </Animated.View>
            )}
        </ToastContext.Provider>
    );
};

const styles = StyleSheet.create({
    toastContainer: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 100 : 80, // Above tab bar
        left: 20,
        right: 20,
        borderRadius: 12,
        padding: 16,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
        zIndex: 9999,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    icon: {
        fontSize: 18,
        marginEnd: 12,
    },
    message: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
});
