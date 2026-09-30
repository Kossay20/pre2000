import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../theme';

interface SectionHeaderProps {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, actionLabel, onAction }) => {
    return (
        <View style={styles.container}>
            <Text style={[styles.title, theme.typography.h2] as any}>{title}</Text>
            {actionLabel && onAction && (
                <TouchableOpacity
                    onPress={onAction}
                    style={styles.actionTouch}
                    accessibilityRole="button"
                    accessibilityLabel={actionLabel}
                    // Several sections share the same "See all" wording; the hint says which.
                    accessibilityHint={title}
                >
                    <Text style={styles.action}>{actionLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.s,
        marginTop: theme.spacing.m,
    },
    title: {
        flex: 1,
    },
    // 44pt tap target around a one-line text link: the padding grows the pressable
    // area, the matching negative margin keeps the row's layout unchanged.
    actionTouch: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.s,
        marginVertical: -theme.spacing.m,
        marginEnd: -theme.spacing.s,
    },
    action: {
        color: theme.colors.accent,
        fontWeight: 'bold',
        fontSize: 14,
    },
});
