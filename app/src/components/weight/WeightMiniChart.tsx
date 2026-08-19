import React from 'react';
import { View, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { theme } from '../../theme';
import { styles } from '../../screens/WeightTrackerScreen.styles';
import { hexToRgba } from '../../utils/styleUtils';
import type { WeightEntry } from '../../services/weightService';
import { getContentWidth } from '../../utils/layout';

const SCREEN_WIDTH = getContentWidth();

interface WeightMiniChartProps {
    weightHistory: WeightEntry[];
    prePregnancyWeight: number;
    t: (key: string, options?: any) => string;
}

export const WeightMiniChart: React.FC<WeightMiniChartProps> = ({
    weightHistory,
    prePregnancyWeight,
    t,
}) => {
    if (weightHistory.length < 1) return null;

    const sortedHistory = [...weightHistory].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Show last 6 entries to keep it readable
    const entries = sortedHistory.slice(-6);

    // If less than 2 points, chart might look weird, but library handles it.
    // We need labels (weeks) and data (weights)
    const labels = entries.map(e => `${t('weight.weekShort')}${e.week_of_pregnancy}`);
    const data = entries.map(e => e.weight);

    // Calculate min/max for chart scale to avoid flat lines
    const minWeight = Math.min(...data, prePregnancyWeight) - 2;
    const maxWeight = Math.max(...data) + 2;

    return (
        <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>{t('weight.evolution')}</Text>

            <LineChart
                data={{
                    labels: labels,
                    datasets: [
                        {
                            data: data,
                            color: (opacity = 1) => hexToRgba(theme.colors.pinkAccent, opacity),
                            strokeWidth: 2
                        },
                        {
                            // Baseline (pre-pregnancy) integration if desired,
                            // or just let the user see the trend relative to start via text
                            data: [prePregnancyWeight],
                            withDots: false,
                            color: () => 'transparent' // Invisible, just to anchor scale if needed
                        }
                    ]
                }}
                width={SCREEN_WIDTH - 32} // padding 16*2
                height={220}
                yAxisSuffix={t('common.kg')}
                yAxisInterval={1}
                chartConfig={{
                    backgroundColor: theme.colors.white,
                    backgroundGradientFrom: theme.colors.white,
                    backgroundGradientTo: theme.colors.white,
                    decimalPlaces: 1,
                    color: (opacity = 1) => hexToRgba(theme.colors.accent, opacity),
                    labelColor: (opacity = 1) => hexToRgba(theme.colors.textSecondary, opacity),
                    style: {
                        borderRadius: 16
                    },
                    propsForDots: {
                        r: "4",
                        strokeWidth: "2",
                        stroke: theme.colors.accent
                    }
                }}
                bezier
                style={{
                    marginVertical: 8,
                    borderRadius: 16
                }}
                fromZero={false}
                // Force y-axis range via dataset tricks if needed
                segments={4}
            />

            {/* Starting weight reference */}
            <View style={styles.chartStartRef}>
                <Text style={styles.startRefText}>{t('weight.startWeightValue', { weight: prePregnancyWeight })}</Text>
            </View>
        </View>
    );
};
