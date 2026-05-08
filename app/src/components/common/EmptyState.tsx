/**
 * EmptyState — composant générique pour les états vides.
 *
 * Usage:
 *   <EmptyState
 *     icon="📭"
 *     title={t('home.noData')}
 *     subtitle={t('home.noDataSubtitle')}
 *     action={<Button title={t('common.refresh')} onPress={loadData} />}
 *   />
 *
 * - `icon` accepte un emoji (string) OU un ReactNode (icône SVG, vector icon…).
 * - Centré vertical + horizontal, multi-line subtitle supporté.
 * - Le texte des labels est passé par le caller (i18n géré côté écran).
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '../../theme';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    /** Réduit le padding pour intégration inline (dans une card par ex.). */
    compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    subtitle,
    action,
    style,
    compact = false,
}) => {
    return (
        <View
            style={[styles.container, compact && styles.containerCompact, style]}
            accessibilityRole="summary"
            accessible
            accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        >
            {icon !== undefined && icon !== null && (
                <View style={styles.iconWrapper}>
                    {typeof icon === 'string' ? (
                        <Text style={styles.iconEmoji} accessibilityElementsHidden>
                            {icon}
                        </Text>
                    ) : (
                        icon
                    )}
                </View>
            )}
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {action ? <View style={styles.actionWrapper}>{action}</View> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.xl,
    },
    containerCompact: {
        flex: 0,
        paddingVertical: theme.spacing.l,
        paddingHorizontal: theme.spacing.m,
    },
    iconWrapper: {
        marginBottom: theme.spacing.m,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconEmoji: {
        fontSize: 56,
        textAlign: 'center',
    },
    title: {
        ...theme.typography.h3,
        textAlign: 'center',
        marginBottom: theme.spacing.s,
    },
    subtitle: {
        ...theme.typography.caption,
        color: theme.colors.textLight,
        textAlign: 'center',
        lineHeight: 20,
        // Cycle 4 F704 : maxWidth 320→400 — textes AR/TN ~30% plus longs que EN.
        // Avant: tronquage en 4-5 lignes saccadées en arabe. Après: 2-3 lignes lisibles.
        maxWidth: 400,
        paddingHorizontal: theme.spacing.m,
    },
    actionWrapper: {
        marginTop: theme.spacing.l,
        alignSelf: 'stretch',
        alignItems: 'center',
    },
});
