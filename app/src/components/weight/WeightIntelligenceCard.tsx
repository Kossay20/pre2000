import React from 'react';
import { View, Text } from 'react-native';
import { styles, TREND_SEVERITY_TONE } from '../../screens/WeightTrackerScreen.styles';
import type { Trend, SmartSuggestion } from '../../services/weightIntelligence';

interface WeightIntelligenceCardProps {
    hasValidData: boolean;
    historyCount: number;
    trimesterMessage: string | null;
    /** The shared common.trimester_N label, interpolated into the message. */
    trimesterLabel: string | null;
    trend: Trend | null;
    suggestions: SmartSuggestion[];
    t: (key: string, options?: any) => string;
}

export const WeightIntelligenceCard: React.FC<WeightIntelligenceCardProps> = ({
    hasValidData,
    historyCount,
    trimesterMessage,
    trimesterLabel,
    trend,
    suggestions,
    t,
}) => {
    if (!hasValidData || historyCount < 1) return null;

    return (
        <View style={styles.intelligenceCard}>
            {/* Trimester message */}
            {trimesterMessage && (
                <View style={styles.trimesterBanner}>
                    <Text style={styles.trimesterBannerText}>
                        {t(trimesterMessage, { trimester: trimesterLabel })}
                    </Text>
                </View>
            )}

            {/* Trend badge */}
            {trend && (
                <View style={[
                    styles.trendBadge,
                    { backgroundColor: TREND_SEVERITY_TONE[trend.severity].bg, borderColor: TREND_SEVERITY_TONE[trend.severity].fg }
                ]}>
                    <Text style={[styles.trendText, { color: TREND_SEVERITY_TONE[trend.severity].fg }]}>
                        {t(trend.messageKey, trend.messageParams)}
                    </Text>
                </View>
            )}

            {/* Smart suggestions from weightIntelligence */}
            {suggestions.length > 0 && (
                <View style={styles.suggestionsGrid}>
                    {suggestions.map((s, i) => (
                        <View key={i} style={styles.suggestionChip}>
                            <Text style={styles.suggestionIcon}>{s.icon}</Text>
                            <Text style={styles.suggestionText}>{t(s.textKey)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
};
