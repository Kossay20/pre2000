import { theme } from '../../theme';
import { createLogger } from '../../utils/logger';
const log = createLogger('BabyFactsCard');
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { parseBullets } from '../../utils/textParsers';
import { useTranslation } from 'react-i18next';

interface BabyFactsCardProps {
    facts_short?: string;
    facts_bullets?: string;
}

/**
 * BabyFactsCard - Displays baby development facts for the current week
 * Uses V3 data: baby_facts_short_fr and baby_facts_bullets_fr
 */
export const BabyFactsCard = React.memo<BabyFactsCardProps>(({
    facts_short,
    facts_bullets
}) => {
    const { t } = useTranslation();
    log.debug('[BabyFactsCard] Rendering with:', {
        has_short: !!facts_short,
        has_bullets: !!facts_bullets,
        bullets_length: facts_bullets?.length || 0,
    });

    // Parse bullet points
    const bulletPoints = parseBullets(facts_bullets);
    log.debug('[BabyFactsCard] Parsed bullets:', bulletPoints.length);

    // Don't render if no data
    if (!facts_short && bulletPoints.length === 0) {
        log.debug('[BabyFactsCard] No data, skipping render');
        return null;
    }

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[theme.colors.gradientPinkStart, theme.colors.surfacePinkSnow, theme.colors.white]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.emoji}>🍼</Text>
                    <Text style={styles.title}>{t('home.babyThisWeek')}</Text>
                </View>

                {/* Short summary */}
                {facts_short && (
                    <Text style={styles.shortText}>{facts_short}</Text>
                )}

                {/* Bullet points */}
                {bulletPoints.length > 0 && (
                    <View style={styles.bulletsContainer}>
                        {bulletPoints.map((fact, index) => (
                            <View key={index} style={styles.bulletRow}>
                                <Text style={styles.bulletDot}>•</Text>
                                <Text style={styles.bulletText}>{fact}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </LinearGradient>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginVertical: 12,
        marginHorizontal: 16,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    gradient: {
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    emoji: {
        fontSize: 28,
        marginEnd: 10,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.accent,
        flex: 1,
    },
    shortText: {
        fontSize: 15,
        color: theme.colors.text,
        lineHeight: 22,
        marginBottom: 12,
    },
    bulletsContainer: {
        marginTop: 8,
    },
    bulletRow: {
        flexDirection: 'row',
        marginBottom: 8,
        alignItems: 'flex-start',
    },
    bulletDot: {
        fontSize: 16,
        color: theme.colors.accent,
        marginEnd: 8,
        marginTop: 2,
    },
    bulletText: {
        fontSize: 14,
        color: theme.colors.brownText800,
        lineHeight: 20,
        flex: 1,
    },
});
