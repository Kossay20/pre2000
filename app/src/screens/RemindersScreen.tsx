import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { RemindersTab } from './reminders/RemindersTab';
import { TasksTab } from './reminders/TasksTab';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

const Tab = createMaterialTopTabNavigator();

/**
 * RemindersScreen - V1.2 Feature
 * Full reminders and tasks management with local notifications
 * Refactored to use split components
 *
 * T7-FIX-F47 : `swipeEnabled: Platform.OS !== 'web'` — sur web, le swipe horizontal
 * de MaterialTopTabs cassait le layout (panel Tasks et Reminders affichés
 * partiellement superposés, banner truncated mid-word). Désactiver le swipe
 * force la transition à se compléter via click tab uniquement.
 */
export const RemindersScreen = () => {
    useScreenAnalytics('RemindersScreen');
    const { t } = useTranslation();
    return (
        <Tab.Navigator
            // The tab view's root is `overflow: hidden`, which a browser still scrolls to reveal a
            // focused or measured element. Switching to "Tâches" for the first time left the whole
            // screen (tab bar and page) sitting 98 px to the left of the viewport (B-021/B-032);
            // `clip` forbids any scroll offset, and the pager slides by transform anyway.
            style={Platform.OS === 'web' ? ({ overflow: 'clip' } as object) : undefined}
            screenOptions={{
                tabBarActiveTintColor: theme.colors.accent,
                tabBarInactiveTintColor: theme.colors.neutral400,
                tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
                tabBarStyle: { backgroundColor: theme.colors.white },
                tabBarIndicatorStyle: { backgroundColor: theme.colors.accent },
                swipeEnabled: Platform.OS !== 'web',
                // Cycle 4 F703 : sur web l'animation MaterialTopTabs causait des
                // captures mid-transition (cf. F47 Cycle 1 + F52 Cycle 2). Désactiver
                // l'animation force un rendu propre instantané au tab switch.
                animationEnabled: Platform.OS !== 'web',
            }}
        >
            <Tab.Screen
                name="RemindersTab"
                component={RemindersTab}
                options={{ tabBarLabel: t('common.screen.remindersAlerts') }}
            />
            <Tab.Screen
                name="TasksTab"
                component={TasksTab}
                options={{ tabBarLabel: t('common.screen.remindersTasks') }}
            />
        </Tab.Navigator>
    );
};
