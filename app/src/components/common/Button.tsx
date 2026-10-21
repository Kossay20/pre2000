import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    TouchableOpacityProps,
    ViewStyle,
} from 'react-native';
import { theme } from '../../theme';
import {
    ButtonSize,
    ButtonVariant,
    resolveButtonSize,
    resolveButtonVariant,
} from './Button.helpers';

export type { ButtonSize, ButtonVariant } from './Button.helpers';
export { resolveButtonSize, resolveButtonVariant } from './Button.helpers';

interface ButtonProps extends TouchableOpacityProps {
    title: string;
    onPress: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    style?: ViewStyle;
    textStyle?: TextStyle;
    loading?: boolean;
    disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    size = 'medium',
    style,
    textStyle,
    loading = false,
    disabled = false,
    accessibilityLabel,
    accessibilityHint,
    ...props
}) => {
    const isDisabled = disabled || loading;
    const v = resolveButtonVariant(variant, disabled);
    const s = resolveButtonSize(size);
    const hasBorder = !!v.borderColor;

    return (
        <TouchableOpacity
            style={[
                styles.button,
                {
                    backgroundColor: v.backgroundColor,
                    paddingVertical: s.paddingVertical,
                    paddingHorizontal: s.paddingHorizontal,
                    minHeight: s.minHeight,
                },
                hasBorder && { borderWidth: 1, borderColor: v.borderColor },
                style,
            ]}
            onPress={onPress}
            disabled={isDisabled}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? title}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: isDisabled, busy: loading }}
            {...props}
        >
            {loading ? (
                <ActivityIndicator color={v.textColor} />
            ) : (
                <Text
                    style={[
                        styles.text,
                        { color: v.textColor, fontSize: s.fontSize },
                        textStyle,
                    ]}
                    // Two lines, not one: a long label ("Exporter mes données" at 320pt
                    // or with a larger system font) wraps instead of ending in "…".
                    numberOfLines={2}
                >
                    {title}
                </Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        borderRadius: theme.borderRadius.round,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontWeight: '600',
        textAlign: 'center',
    },
});
