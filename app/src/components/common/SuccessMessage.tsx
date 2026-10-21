import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface SuccessMessageProps {
    message?: string;
}

export const SuccessMessage: React.FC<SuccessMessageProps> = ({ message }) => {
    if (!message) return null;

    return (
        // W1 #5: announce success to assistive tech (polite — success isn't as urgent as an error).
        <View
            style={styles.container}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
        >
            <Text style={styles.text}>✓ {message}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: theme.colors.feedbackSuccessBg,
        // RTL FIX: aligned logical border + color (was Start+Left mismatch)
        borderStartWidth: 4,
        borderStartColor: theme.colors.success,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.s,
        marginTop: theme.spacing.m,
    },
    text: {
        color: theme.colors.feedbackSuccessText,
        fontSize: 14,
        fontWeight: '500',
    },
});
