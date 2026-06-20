import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { format, Locale } from 'date-fns';
import { styles } from '../../screens/CalendarScreen.styles';

interface CalendarMonthDayProps {
    day: Date | null;
    isSelected: boolean;
    isToday: boolean;
    isCurrentMonth: boolean;
    userEventCount: number;
    onPress: (day: Date) => void;
    t: (key: string, options?: any) => string;
    dateLocale: Locale;
}

export const CalendarMonthDay: React.FC<CalendarMonthDayProps> = ({
    day,
    isSelected,
    isToday,
    isCurrentMonth,
    userEventCount,
    onPress,
    t,
    dateLocale,
}) => {
    // Empty cell for padding
    if (day === null) {
        return <View style={styles.monthDayEmpty} />;
    }

    return (
        <TouchableOpacity
            key={day.toISOString()}
            style={[
                styles.monthDay,
                isSelected && styles.monthDaySelected,
                isToday && !isSelected && styles.monthDayToday,
            ]}
            onPress={() => onPress(day)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={format(day, 'EEEE d MMMM yyyy', { locale: dateLocale })}
            accessibilityState={{ selected: isSelected }}
            // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.selected → expose aria explicitly.
            {...(Platform.OS === 'web' ? { 'aria-selected': isSelected } : {})}
            accessibilityHint={userEventCount > 0 ? t('calendar.suggestionsCount', { count: userEventCount }) : undefined}
        >
            <Text
                style={[
                    styles.monthDayText,
                    !isCurrentMonth && styles.monthDayTextDisabled,
                    isToday && !isSelected && styles.monthDayTextToday,
                    // W3 #6: emphasise the selected day's number (style existed but was never applied).
                    isSelected && styles.monthDayTextSelected,
                ]}
            >
                {format(day, 'd')}
            </Text>
            {userEventCount > 0 && (
                <View style={styles.eventDotSmall} />
            )}
        </TouchableOpacity>
    );
};
