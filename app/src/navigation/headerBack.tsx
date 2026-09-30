import React from 'react';
import { Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { TFunction } from 'i18next';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { theme } from '../theme';

/**
 * Stack header back button with a localized name.
 *
 * The default back button names itself after the previous screen's title and
 * falls back to the ROUTE NAME when that screen has none — so Register and Login
 * announced "AuthChoice, back", in Arabic too. `headerBackTitle` fixes the label
 * the native iOS button shows. On web the default button still builds its
 * accessible name as `${label}, back` (English suffix, hardcoded in
 * @react-navigation/elements), so web renders this button instead.
 */
const WebHeaderBack = ({ label, tintColor }: { label: string; tintColor?: string }) => {
    const navigation = useNavigation();
    return (
        <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.button}
        >
            <RtlAwareChevron direction="back" variant="arrow" size={24} color={tintColor ?? theme.colors.text} />
        </TouchableOpacity>
    );
};

export const localizedHeaderBack = (t: TFunction): Partial<NativeStackNavigationOptions> => {
    const label = t('common.back');
    return {
        headerBackTitle: label,
        ...(Platform.OS === 'web'
            ? {
                headerLeft: ({ canGoBack, tintColor }) =>
                    canGoBack ? <WebHeaderBack label={label} tintColor={tintColor} /> : null,
            }
            : {}),
    };
};

const styles = StyleSheet.create({
    // WCAG 2.5.5 — 44pt target, same as the in-body back buttons it replaces.
    button: {
        minWidth: 44,
        minHeight: 44,
        marginHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
