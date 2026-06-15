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
                <TouchableOpacity onPress={onAction}>
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
    action: {
        color: theme.colors.accent,
        fontWeight: 'bold',
        fontSize: 14,
    },
});
