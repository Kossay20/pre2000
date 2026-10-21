import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';

/**
 * One-line "this does not replace medical advice" footer for screens that show
 * health content (articles, week pages). Same wording and look as the Health
 * dashboard's disclaimer, so the app says it one way everywhere.
 */
export const MedicalDisclaimer: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => {
    const { t } = useTranslation();
    return (
        <View style={[styles.container, style]} testID="medical-disclaimer">
            <Text style={styles.text}>{t('dashboard.disclaimer')}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        borderStartWidth: 3,
        borderStartColor: theme.colors.warning,
    },
    text: {
        fontSize: 12,
        // textSecondary, not textLight/gray: this is safety copy and must stay
        // readable (the chat disclaimer moved off gray for the same reason, F302).
        color: theme.colors.textSecondary,
        lineHeight: 18,
        textAlign: 'auto',
    },
});
