import React, { useEffect } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { logger } from './src/utils/logger';

// ACCESSIBILITY: Prevent text from scaling too large and breaking layout
// (Standard practice for complex layouts not fully optimized for A11y yet)
interface TextWithDefaultProps extends Text {
  defaultProps?: { maxFontSizeMultiplier?: number };
}
(Text as unknown as TextWithDefaultProps).defaultProps = (Text as unknown as TextWithDefaultProps).defaultProps || {};
(Text as unknown as TextWithDefaultProps).defaultProps!.maxFontSizeMultiplier = 1.4;

(TextInput as unknown as TextWithDefaultProps).defaultProps = (TextInput as unknown as TextWithDefaultProps).defaultProps || {};
(TextInput as unknown as TextWithDefaultProps).defaultProps!.maxFontSizeMultiplier = 1.4;

// Initialize Sentry for crash reporting (only in production)
if (!__DEV__) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
    debug: false,
    tracesSampleRate: 0.2, // Capture 20% of transactions for performance monitoring
  });
}
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n'; // Initialize i18n
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { PregnancyProvider, usePregnancy } from './src/context/PregnancyContext';
import { theme } from './src/theme';
import { ToastProvider, useToast } from './src/context/ToastContext';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { OfflineNotice } from './src/components/common/OfflineNotice';
import { configureNotifications } from './src/services/rdvNotificationService';
import { cleanupPastReminders } from './src/services/rdvNotificationService';
import { setupRTL } from './src/i18n/rtl';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { getAuth } from 'firebase/auth';

import { LanguageSelectScreen } from './src/screens/LanguageSelectScreen';
import { AuthChoiceScreen } from './src/screens/AuthChoiceScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { ResourcesScreen } from './src/screens/ResourcesScreen';
import { ArticleDetailScreen } from './src/screens/ArticleDetailScreen';
import { SupplementDetailScreen } from './src/screens/SupplementDetailScreen';
import { ChatbotScreen } from './src/screens/ChatbotScreen';
import { WeekRecommendationsScreen } from './src/screens/WeekRecommendationsScreen';
import { DiagnosticScreen } from './src/screens/DiagnosticScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { AddAppointmentScreen } from './src/screens/AddAppointmentScreen';
import { RemindersScreen } from './src/screens/RemindersScreen';
// P4 CLEANUP: CompletedTasksScreen import removed — file exists but no Stack.Screen
// is registered for it and no navigate() call points to it. Re-import + register
// in a future Stack when product wires up a "Trash" / "History" entrypoint.
import { SettingsScreen } from './src/screens/SettingsScreen'; // V1.2 NEW
import { PrivacyPolicyScreen } from './src/screens/PrivacyPolicyScreen'; // Legal
import { HealthDashboardScreen } from './src/screens/HealthDashboardScreen';
import { WeightTrackerScreen } from './src/screens/WeightTrackerScreen';
import { ForbiddenFoodsScreen } from './src/screens/ForbiddenFoodsScreen';
import { BabyEvolutionScreen } from './src/screens/BabyEvolutionScreen'; // P0: Baby 3D Evolution
import { KickCounterScreen } from './src/screens/KickCounterScreen'; // Cycle 8 Epic 1
import { ContractionTimerScreen } from './src/screens/ContractionTimerScreen'; // Cycle 8 Epic 1
import { HospitalBagChecklistScreen } from './src/screens/HospitalBagChecklistScreen'; // Cycle 8 Epic 1
import { RamadanPregnancyScreen } from './src/screens/RamadanPregnancyScreen'; // Cycle 8 Epic 2
import './src/types/navigation'; // Activate global navigation type augmentation

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = () => {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Language" component={LanguageSelectScreen} />
      <Stack.Screen name="AuthChoice" component={AuthChoiceScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: true, title: t('common.screen.createAccount') }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: true, title: t('common.screen.login') }} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: true, title: t('common.screen.onboarding') }} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ headerShown: true, title: t('common.screen.legalNotice') }} />
    </Stack.Navigator>
  );
};

const HomeStack = () => {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: theme.colors.background },
      headerTintColor: theme.colors.text,
      headerBackTitle: t('common.back', 'Retour'),
    }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WeekRecommendations" component={WeekRecommendationsScreen} options={{ title: t('common.screen.recommendations') }} />
      <Stack.Screen name="ArticleDetail" component={ArticleDetailScreen} options={{ title: t('common.screen.article') }} />
      <Stack.Screen name="SupplementDetail" component={SupplementDetailScreen} options={{ title: t('common.screen.supplement') }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('common.screen.myProfile') }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('common.screen.settings') }} />
      {/* NAV-FIX: PrivacyPolicy is already registered in AuthStack — no duplicate here */}
      <Stack.Screen name="HealthDashboard" component={HealthDashboardScreen} options={{ title: t('common.screen.myHealth') }} />
      <Stack.Screen name="WeightTracker" component={WeightTrackerScreen} options={{ title: t('common.screen.weightTracking') }} />
      <Stack.Screen name="ForbiddenFoods" component={ForbiddenFoodsScreen} options={{ title: t('common.screen.forbiddenFoods') }} />
      <Stack.Screen name="Diagnostic" component={DiagnosticScreen} options={{ title: t('common.screen.dataDiagnostic') }} />
      <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} options={{ title: t('common.screen.language') }} />
      <Stack.Screen name="BabyEvolution" component={BabyEvolutionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="KickCounter" component={KickCounterScreen} options={{ title: t('cycle8.kickCounter.title') }} />
      <Stack.Screen name="ContractionTimer" component={ContractionTimerScreen} options={{ title: t('cycle8.contractionTimer.title') }} />
      <Stack.Screen name="HospitalBag" component={HospitalBagChecklistScreen} options={{ title: t('cycle8.hospitalBag.title') }} />
      <Stack.Screen name="RamadanPregnancy" component={RamadanPregnancyScreen} options={{ title: t('cycle8.ramadan.title') }} />
    </Stack.Navigator>
  );
};

const ResourcesStack = () => {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: theme.colors.background },
      headerTintColor: theme.colors.text,
      headerBackTitle: t('common.back', 'Retour'),
    }}>
      <Stack.Screen name="ResourcesMain" component={ResourcesScreen} options={{ title: t('common.nav.resources') }} />
      <Stack.Screen name="ArticleDetail" component={ArticleDetailScreen} options={{ title: t('common.screen.article') }} />
      <Stack.Screen name="SupplementDetail" component={SupplementDetailScreen} options={{ title: t('common.screen.supplement') }} />
    </Stack.Navigator>
  );
};

const CalendarStack = () => {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: theme.colors.background },
      headerTintColor: theme.colors.text,
      headerBackTitle: t('common.back', 'Retour'),
    }}>
      <Stack.Screen name="CalendarMain" component={CalendarScreen} options={{ title: t('common.nav.calendar') }} />
      <Stack.Screen name="AddAppointment" component={AddAppointmentScreen} options={{ title: t('common.screen.addAppointment') }} />
    </Stack.Navigator>
  );
};

import { StatisticsScreen } from './src/screens/reminders/StatisticsScreen'; // V1.2 NEW

// V1.2 NEW: Reminders Stack
const RemindersStack = () => {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: theme.colors.background },
      headerTintColor: theme.colors.text,
      headerBackTitle: t('common.back', 'Retour'),
    }}>
      <Stack.Screen name="RemindersMain" component={RemindersScreen} options={{ title: t('common.nav.reminders') }} />
      <Stack.Screen name="Statistics" component={StatisticsScreen} options={{ title: t('common.screen.myStatistics'), headerShown: false }} />
    </Stack.Navigator>
  );
};

const MainTabs = () => {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      detachInactiveScreens
      screenOptions={({ route }) => ({
        // P0-3 FIX (E2E audit 2026-05-08): on web, detachInactiveScreens is a
        // no-op (depends on react-native-screens, native-only). Without this,
        // every visited tab stayed in the DOM → 3-4 simultaneous H1, stale
        // ErrorBoundary, leaking Firestore listeners.
        unmountOnBlur: true,
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarStyle: {
          backgroundColor: theme.colors.white,
          borderTopColor: theme.colors.border,
        },
        // PHASE 2.3 FIX (E2E audit 2026-05-08): replace emoji <Text> with vector
        // icons. RNWeb was rendering the emoji twice in the a11y tree (`tab "🏠 🏠
        // Accueil"`) because emoji <Text> got mirrored as accessibilityLabel.
        // Ionicons is rendered via SVG/font, no a11y duplication, branding-grade.
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'help-circle-outline';
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Calendrier') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'Ressources') iconName = focused ? 'library' : 'library-outline';
          else if (route.name === 'Chatbot') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          else if (route.name === 'Rappels') iconName = focused ? 'notifications' : 'notifications-outline';
          // Wrap in <View accessible={false} aria-hidden> so the icon doesn't
          // leak whitespace into the tab's accessible name on RNWeb. The
          // tabBarLabel below provides the canonical name.
          return (
            <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={iconName} size={size} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} options={{ tabBarLabel: t('common.nav.home') }} />
      <Tab.Screen name="Calendrier" component={CalendarStack} options={{ tabBarLabel: t('common.nav.calendar') }} />
      <Tab.Screen name="Rappels" component={RemindersStack} options={{ tabBarLabel: t('common.nav.reminders') }} />
      <Tab.Screen name="Ressources" component={ResourcesStack} options={{ tabBarLabel: t('common.nav.resources') }} />
      <Tab.Screen name="Chatbot" component={ChatbotScreen} options={{ tabBarLabel: t('common.nav.chatbot') }} />
    </Tab.Navigator>
  );
};

import { syncRemindersToNotifications } from './src/services/remindersScheduler';
import { useTranslation } from 'react-i18next'; // Localized content

const AppContent = () => {
  const { user, loading } = useAuth();
  const { profile, pregnancyInfo } = usePregnancy(); // Context for week
  const { i18n } = useTranslation();

  // Sync Reminders (Smart Notifications & Baby Messages)
  // Re-run when user logs in/out, when pregnancy week advances, or language changes.
  // NOTIF-03 FIX: Guard against week=0 (guest with no profile) to avoid scheduling
  // 40+ blank notifications for every enable/disable toggle on the Reminders tab.
  // P2.1 FIX: Pass user.uid so loadUserSettings reads Firestore (auth) instead of
  // falling back to AsyncStorage guest settings (was a silent regression).
  useEffect(() => {
    const week = pregnancyInfo?.week;
    if (user && week && week > 0) {
      syncRemindersToNotifications(week, i18n.language, user.uid);
    }
  }, [user?.uid, pregnancyInfo?.week, i18n.language]); // user?.uid instead of user object to avoid stale-closure re-runs

  // Deep Linking Configuration
  // The linking tree mirrors the navigator hierarchy by ROUTE NAME, not component
  // name. MainTabs registers tabs named Home / Calendrier / Rappels / Ressources;
  // each of those tabs hosts a Stack whose inner Stack.Screen names (ArticleDetail,
  // CalendarMain, …) are what the linking config addresses directly. Previous
  // versions wrapped these in fake `*Stack` levels (matching component names) and
  // mis-spelled `Resources` instead of `Ressources` — both made every deep link
  // silently no-op.
  const linking = {
    prefixes: ['mama-bebe://', 'exp+mama-bebe://', 'https://mama-bebe.com'],
    config: {
      screens: {
        Home: {
          screens: {
            ArticleDetail: 'article/:articleId',
            SupplementDetail: 'supplement/:supplementId',
            WeekRecommendations: 'recommendations',
            Diagnostic: 'diagnostic',
          }
        },
        Calendrier: {
          screens: {
            CalendarMain: 'calendar',
            AddAppointment: 'appointment/add',
          }
        },
        Rappels: {
          screens: {
            RemindersMain: 'reminders',
          }
        },
        Ressources: {
          screens: {
            ResourcesMain: 'resources',
          }
        }
      }
    }
  };

  if (loading) return null;

  // PHASE 2.1 FIX (E2E audit 2026-05-08): localize document.title per route on
  // web. Default React Navigation behaviour leaks the route name (e.g.
  // "AuthChoice", "HomeMain") to <title>. Map common.screen.<key> per route name,
  // fall back to the brand on unknown routes.
  const APP_BRAND = 'Mama & Bébé';
  const routeNameToTitleKey: Record<string, string> = {
    Language: 'common.chooseLanguage',
    AuthChoice: 'startJourney',
    Register: 'common.screen.createAccount',
    Login: 'common.screen.login',
    Onboarding: 'common.screen.onboarding',
    HomeMain: 'common.nav.home',
    CalendarMain: 'common.nav.calendar',
    RemindersMain: 'common.nav.reminders',
    ResourcesMain: 'common.nav.resources',
    Articles: 'common.screen.articles',
    Chatbot: 'common.nav.chatbot',
    Profile: 'common.screen.myProfile',
    Settings: 'common.screen.settings',
    HealthDashboard: 'common.screen.myHealth',
    WeightTracker: 'common.screen.weightTracking',
    ForbiddenFoods: 'common.screen.forbiddenFoods',
    Statistics: 'common.screen.myStatistics',
    PrivacyPolicy: 'common.screen.legalNotice',
  };

  return (
    <NavigationContainer
      linking={linking}
      documentTitle={{
        formatter: (options: any, route: any) => {
          const i18nMod = require('./src/i18n').default;
          const key = routeNameToTitleKey[route?.name];
          if (key) {
            const translated = i18nMod.t(key);
            if (translated && translated !== key) return `${translated} · ${APP_BRAND}`;
          }
          return options?.title ? `${options.title} · ${APP_BRAND}` : APP_BRAND;
        },
      }}
      onStateChange={async () => {
        const currentRouteName = navigationRef.getCurrentRoute()?.name;
        const currentRouteParams = navigationRef.getCurrentRoute()?.params;

        if (currentRouteName) {
          // @ts-ignore
          await analyticsService.logScreenView(currentRouteName, currentRouteName);
        }
      }}
      ref={navigationRef}
    >
      {user ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
};

import { createNavigationContainerRef } from '@react-navigation/native';
import { analyticsService } from './src/services/analyticsService';

export const navigationRef = createNavigationContainerRef();

import { databaseService } from './src/services/chatbot/data/DatabaseService';

function App() {
  // Initialize notifications, RTL, and database on app start
  useEffect(() => {
    setupRTL();
    configureNotifications();
    databaseService.init().catch(err => console.error('DB Init Error', err));

    // STARTUP-FIX-01: Purge stale past RDV reminders from AsyncStorage on each launch.
    // Prevents unbounded growth of the '@rdv_reminders' key over time.
    cleanupPastReminders().catch(err => console.warn('cleanupPastReminders failed:', err));

    // STARTUP-FIX-02: Refresh Firebase auth token on app foreground resume.
    // On Android, tokens can silently expire after 1h+ in background without re-triggering
    // onAuthStateChanged. Reloading the current user forces a token refresh.
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        getAuth().currentUser?.reload().catch(() => {/* silent - user may be logged out */});
      }
    };
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <OfflineNotice />
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <PregnancyProvider>
              <AppInitializer />
              <AppContent />
            </PregnancyProvider>
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Component to handle initialization that requires context
const AppInitializer = () => {
  const { showToast } = useToast();
  const { t } = useTranslation();

  // Global Deep Linking Listener for notification taps
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data;
      logger.info('🔔 Notification clicked:', data);

      if (data?.screen && navigationRef.isReady()) {
        if (data.screen === 'TasksTab') {
          // @ts-ignore
          navigationRef.navigate('Rappels', {
            screen: 'TasksTab',
            params: { highlightId: data.reminderId }
          });
        } else if (data.screen === 'Calendar') {
          // @ts-ignore
          navigationRef.navigate('Calendrier');
        } else {
          try {
            // @ts-ignore
            navigationRef.navigate(data.screen, data.params);
          } catch (e) {
            logger.error('App', 'Navigation failed', e);
          }
        }
      }
    });

    return () => subscription.remove();
  }, []);

  return null;
};

// Wrap the app for Sentry performance monitoring (Touch events, etc.)
export default Sentry.wrap(App);
