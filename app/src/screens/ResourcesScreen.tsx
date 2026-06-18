import React, { useState } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { ArticlesListScreen } from './ArticlesListScreen';
import { SupplementsListScreen } from './SupplementsListScreen';
import { theme } from '../theme';
import { useTranslation } from 'react-i18next';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

const Tab = createMaterialTopTabNavigator();

/**
 * Native: react-navigation material-top-tabs (handles RTL natively via I18nManager).
 */
const NativeResourcesTabs = () => {
    const { t } = useTranslation();
    return (
        <Tab.Navigator
            screenOptions={{
                // PERFECT-FIX-4: lazy-mount tabs so the inactive screen doesn't run its
                // Firestore queries until the user actually visits it.
                lazy: true,
                // A11Y-CONTRAST-01: active-tab label tint accent #C2185B = 5.5:1 (pass).
                tabBarActiveTintColor: theme.colors.accent,
                tabBarInactiveTintColor: theme.colors.textLight,
                tabBarIndicatorStyle: { backgroundColor: theme.colors.primary },
                tabBarStyle: { backgroundColor: theme.colors.white },
                tabBarLabelStyle: { fontWeight: '600' },
                swipeEnabled: true,
            }}
        >
            <Tab.Screen name="Articles" component={ArticlesListScreen} options={{ tabBarLabel: t('common.screen.articles') }} />
            <Tab.Screen name="Compléments" component={SupplementsListScreen} options={{ tabBarLabel: t('common.screen.supplements') }} />
        </Tab.Navigator>
    );
};

/**
 * Web: a conditional-render segmented control instead of the material-top-tabs pager.
 *
 * R-RTL-FIX (E2E audit 2026-06-17): the material-top-tabs horizontal pager computes its
 * panel offsets from I18nManager.isRTL, which is FALSE on web (forceRTL is skipped to avoid
 * the reload loop) even though document.dir='rtl' for ar/tn. The mismatch translated the
 * second panel (Suppléments) off-screen (probe: card x≈-342, y≈5853), so the Supplements tab
 * rendered as a BLANK screen for Arabic/Tunisian guests (P0). Conditional rendering has no
 * pager transform, so each panel lays out at x=0 in both LTR and RTL. Conditional mount also
 * preserves the lazy-query behaviour (the inactive list never mounts).
 */
const WebResourcesTabs = () => {
    const { t } = useTranslation();
    const [active, setActive] = useState<'articles' | 'supplements'>('articles');
    const tabs: { key: 'articles' | 'supplements'; label: string }[] = [
        { key: 'articles', label: t('common.screen.articles') },
        { key: 'supplements', label: t('common.screen.supplements') },
    ];
    return (
        <View style={styles.webRoot}>
            <View style={styles.webTabBar} accessibilityRole="tablist">
                {tabs.map(({ key, label }) => {
                    const selected = active === key;
                    return (
                        <TouchableOpacity
                            key={key}
                            style={[styles.webTab, selected && styles.webTabActive]}
                            onPress={() => setActive(key)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            // RN-Web 0.21 drops accessibilityState->aria; set aria-selected directly on web.
                            {...(Platform.OS === 'web' ? { 'aria-selected': selected } : {})}
                        >
                            <Text style={[styles.webTabLabel, { color: selected ? theme.colors.accent : theme.colors.textLight }]}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <View style={styles.webPanel}>
                {active === 'articles' ? <ArticlesListScreen /> : <SupplementsListScreen />}
            </View>
        </View>
    );
};

export const ResourcesScreen = () => {
    useScreenAnalytics('ResourcesScreen');
    return Platform.OS === 'web' ? <WebResourcesTabs /> : <NativeResourcesTabs />;
};

const styles = StyleSheet.create({
    webRoot: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    webTabBar: {
        flexDirection: 'row',
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    webTab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.m,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    webTabActive: {
        borderBottomColor: theme.colors.primary,
    },
    webTabLabel: {
        fontWeight: '600',
        fontSize: 15,
    },
    webPanel: {
        flex: 1,
    },
});
