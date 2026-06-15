/**
 * ErrorState - Reusable error display component
 * QUA-10: Used across screens that load data to provide consistent error UX
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { useTranslation } from 'react-i18next';

interface ErrorStateProps {
    message?: string;
    emoji?: string;
    onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
    message,
    emoji = '😔',
    onRetry,
}) => {
    const { t } = useTranslation();

    return (
        <View style={styles.container}>
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={styles.message}>
                {message || t('common.errorGeneric', 'Une erreur est survenue.')}
            </Text>
            {onRetry && (
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={onRetry}
                    accessibilityLabel={t('common.retry')}
                    accessibilityRole="button"
                >
                    <Text style={styles.retryText}>{t('common.retry', 'Réessayer')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        padding: 32,
    },
    emoji: {
        fontSize: 56,
        marginBottom: 16,
    },
    message: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 24,
    },
    retryButton: {
        // A11Y-CONTRAST (R5-CONTRAST-01): route the FILL to accent (#C2185B) so the
        // white retry label reaches 5.87:1 (was primary #FF6B9D → 2.68:1, AA fail).
        backgroundColor: theme.colors.accent,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: theme.borderRadius.m,
    },
    retryText: {
        color: theme.colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
});
