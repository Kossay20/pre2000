import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface TagProps {
    label: string;
    color?: string; // Optional override
    /** Label colour; pass one whenever `color` is passed, so the pair can be checked for contrast. */
    textColor?: string;
}

export const Tag: React.FC<TagProps> = ({ label, color, textColor }) => {
    return (
        <View style={[styles.container, { backgroundColor: color || theme.colors.secondary }]}>
            <Text style={[styles.text, textColor ? { color: textColor } : null]}>{label}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: theme.spacing.s,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.s,
        alignSelf: 'flex-start',
        marginEnd: theme.spacing.xs,
    },
    text: {
        fontSize: 12,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
});
