import { createLogger } from '../../utils/logger';
const log = createLogger('ErrorBoundary');
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';
import * as Sentry from '@sentry/react-native';
import i18n from '../../i18n';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorId: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        // PHASE 2.4 FIX (E2E audit 2026-05-08): generate a short errorId so the
        // user can quote it to support. Format: time-based, no dependencies.
        const errorId = `E${Date.now().toString(36).toUpperCase().slice(-6)}`;
        return { hasError: true, error, errorId };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        log.error('Uncaught error:', error, errorInfo, 'errorId:', this.state.errorId);
        if (!__DEV__) {
            Sentry.captureException(error, {
                extra: { componentStack: errorInfo.componentStack, errorId: this.state.errorId },
                tags: { errorId: this.state.errorId || 'unknown' },
            });
        }
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null, errorId: null });
    };

    private handleReturnHome = () => {
        // PHASE 2.4 FIX: full app reset on web (re-mount React tree); on native
        // we cannot navigate from here without nav ref — handleRetry() is fallback.
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.href = '/';
        } else {
            this.handleRetry();
        }
    };

    public render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <View style={styles.content}>
                        <Text style={styles.emoji}>🙈</Text>
                        <Text style={styles.title} accessibilityRole="header">{i18n.t('errorBoundary.title')}</Text>
                        <Text style={styles.message}>
                            {i18n.t('errorBoundary.message')}
                        </Text>

                        {/* PHASE 2.4 FIX: error id displayed for support */}
                        {this.state.errorId && (
                            <Text style={styles.errorId} selectable>
                                {i18n.t('errorBoundary.errorId', { defaultValue: 'Code erreur', id: this.state.errorId })}: {this.state.errorId}
                            </Text>
                        )}

                        {__DEV__ && this.state.error && (
                            <ScrollView style={styles.errorBox}>
                                <Text style={styles.errorText}>
                                    {this.state.error.toString()}
                                </Text>
                                {this.state.error.stack && (
                                    <Text style={styles.stackTrace}>
                                        {this.state.error.stack}
                                    </Text>
                                )}
                            </ScrollView>
                        )}

                        <TouchableOpacity
                            style={styles.button}
                            onPress={this.handleRetry}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={i18n.t('errorBoundary.retry')}
                            testID="error_boundary_retry"
                        >
                            <Text style={styles.buttonText}>{i18n.t('errorBoundary.retry')}</Text>
                        </TouchableOpacity>

                        {/* PHASE 2.4 FIX: secondary action — Return Home (web only useful) */}
                        {Platform.OS === 'web' && (
                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={this.handleReturnHome}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel={i18n.t('errorBoundary.returnHome', { defaultValue: 'Retour à l\'accueil' })}
                                testID="error_boundary_home"
                            >
                                <Text style={styles.secondaryButtonText}>
                                    {i18n.t('errorBoundary.returnHome', { defaultValue: 'Retour à l\'accueil' })}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    content: {
        alignItems: 'center',
        width: '100%',
        maxWidth: 400,
    },
    emoji: {
        fontSize: 64,
        marginBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.neutral900,
        marginBottom: 12,
    },
    message: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 24,
    },
    errorBox: {
        maxHeight: 150,
        width: '100%',
        backgroundColor: theme.colors.neutral100,
        padding: 12,
        borderRadius: 8,
        marginBottom: 32,
    },
    errorText: {
        fontSize: 12,
        color: theme.colors.red600,
        fontFamily: 'Courier',
    },
    stackTrace: {
        fontSize: 10,
        color: theme.colors.textSecondary,
        fontFamily: 'Courier',
        marginTop: 8,
    },
    button: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
        ...getShadowStyle(4, theme.colors.primary, 0.3, 8, { width: 0, height: 4 }),
    },
    buttonText: {
        color: theme.colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    // PHASE 2.4 FIX styles
    errorId: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginBottom: 24,
        fontFamily: 'Courier',
        opacity: 0.7,
    },
    secondaryButton: {
        marginTop: 12,
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    secondaryButtonText: {
        color: theme.colors.primary,
        fontSize: 15,
        fontWeight: '500',
    },
});
