import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';

interface ErrorMessageProps {
    message?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
    const { t } = useTranslation();
    if (!message) return null;

    // Translate the message if it looks like an i18n key (contains dots, no spaces)
    const displayMessage = message.includes('.') && !message.includes(' ')
        ? t(message, message) // fallback to raw message if key not found
        : message;

    return (
        // W1 #5: announce errors to assistive tech the moment they mount. RN-Web maps
        // accessibilityLiveRegion -> aria-live and role="alert" -> role=alert, so a screen
        // reader speaks the validation/auth error without the user hunting for it.
        <View
            style={styles.container}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
        >
            <Text style={styles.text}>⚠️ {displayMessage}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: theme.colors.feedbackErrorBg,
        // RTL FIX: align logical border (Start) with logical color (StartColor) — was mixing
        // borderStartWidth + borderLeftColor → in RTL the border had no color.
        borderStartWidth: 4,
        borderStartColor: theme.colors.error,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.s,
        marginTop: theme.spacing.m,
    },
    text: {
        color: theme.colors.error,
        fontSize: 14,
        fontWeight: '500',
    },
});
