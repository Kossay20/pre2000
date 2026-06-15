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
        // R3-GLOBAL-02: clearing hasError re-mounts the subtree so the previously
        // failing screen gets a fresh attempt. If the same render throws again,
        // getDerivedStateFromError re-trips the boundary (no infinite loop — React
        // unwinds once per render) and the user still has the "Back to home" escape.
        this.setState({ hasError: false, error: null, errorId: null });
    };

    private handleReturnHome = () => {
        // R3-GLOBAL-02: on web, a hard navigation to '/' fully re-mounts the React
        // tree AND resets the URL, so a bad deep-link that tripped the boundary is
        // discarded (otherwise retry would re-render the same broken route). On
        // native there is no nav ref here without a circular import, so we clear the
        // error state, which returns the user to a freshly-mounted (working) tree.
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
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

                        {/* R3-GLOBAL-02: secondary action — Back to home. Rendered on
                            ALL platforms (previously web-gated, which made it silently
                            absent whenever the Platform check failed to evaluate to the
                            web branch). On web it does a hard reset to '/'; on native it
                            falls back to clearing the error state. The returnHome key
                            exists in all 4 locales, so no defaultValue override is
                            needed (an override would force French onto non-FR users if
                            the key were ever missing). */}
                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={this.handleReturnHome}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={i18n.t('errorBoundary.returnHome')}
                            testID="error_boundary_home"
                        >
                            <Text style={styles.secondaryButtonText}>
                                {i18n.t('errorBoundary.returnHome')}
                            </Text>
                        </TouchableOpacity>
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
        color: theme.colors.accent,
        fontSize: 15,
        fontWeight: '500',
    },
});
