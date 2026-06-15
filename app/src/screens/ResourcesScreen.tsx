import React from 'react';
import { Platform } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { ArticlesListScreen } from './ArticlesListScreen';
import { SupplementsListScreen } from './SupplementsListScreen';
import { theme } from '../theme';
import { useTranslation } from 'react-i18next';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

const Tab = createMaterialTopTabNavigator();

export const ResourcesScreen = () => {
    useScreenAnalytics('ResourcesScreen');
    const { t } = useTranslation();
    return (
        <Tab.Navigator
            screenOptions={{
                // PERFECT-FIX-4: lazy-mount tabs so the inactive screen (Articles or Suppléments)
                // doesn't run its Firestore queries until the user actually visits it.
                // Saves a duplicate scan on first entry to Resources.
                lazy: true,
                // A11Y-CONTRAST-01: active-tab label tint #FF6B9D on white = 2.68:1
                // (WCAG AA fail). Route to accent #C2185B = 5.5:1 (pass). The indicator
                // bar below stays #FF6B9D (decorative, non-text).
                tabBarActiveTintColor: theme.colors.accent,
                tabBarInactiveTintColor: theme.colors.textLight,
                tabBarIndicatorStyle: { backgroundColor: theme.colors.primary },
                tabBarStyle: { backgroundColor: theme.colors.white },
                tabBarLabelStyle: { fontWeight: '600' },
                // T7-FIX-F52 : swipe MaterialTopTabs cassait le layout sur web
                // (panel Articles + Supplements affichés en partie superposés
                // après tab switch). Click-only sur web.
                swipeEnabled: Platform.OS !== 'web',
            }}
        >
            <Tab.Screen name="Articles" component={ArticlesListScreen} options={{ tabBarLabel: t('common.screen.articles') }} />
            <Tab.Screen name="Compléments" component={SupplementsListScreen} options={{ tabBarLabel: t('common.screen.supplements') }} />
        </Tab.Navigator>
    );
};
