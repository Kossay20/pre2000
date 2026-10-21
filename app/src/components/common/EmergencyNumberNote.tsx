import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import type { EmergencyNumberSource } from '../../utils/clinicalChecks';

/**
 * Says where an emergency number came from when it is not the user's own country,
 * with a way to fix it. Rendered under every call button that uses
 * resolveEmergencyContact: without it a guessed number (device region) or the 112
 * fallback looked exactly like a number chosen for her, and nothing told her the
 * country question mattered.
 */
export const EmergencyNumberNote: React.FC<{ source: EmergencyNumberSource }> = ({ source }) => {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    if (source === 'profile') return null;
    return (
        <View style={styles.container} testID="emergency_number_note">
            <Text style={styles.text}>
                {source === 'fallback' ? t('common.emergencyNumber.fallbackNote') : t('common.emergencyNumber.regionNote')}
            </Text>
            <TouchableOpacity
                // Profile lives in the Home tab's stack; this reaches it from any tab.
                onPress={() => navigation.navigate('Home', { screen: 'Profile' })}
                accessibilityRole="link"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="emergency_number_choose_country"
            >
                <Text style={styles.link}>{t('common.emergencyNumber.chooseCountry')}</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    text: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    link: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.accent,
        textDecorationLine: 'underline',
    },
});
