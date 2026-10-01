import React, { useEffect } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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
import { NavigationContainer, useNavigation, getStateFromPath } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n'; // Initialize i18n
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { needsProfileSetup } from './src/context/loginHelpers';
import { needsHealthDataConsent } from './src/utils/healthDataConsent';
import { HealthDataConsentScreen } from './src/screens/HealthDataConsentScreen';
import { localizedHeaderBack } from './src/navigation/headerBack';
import { PregnancyProvider, usePregnancy } from './src/context/PregnancyContext';
import { theme } from './src/theme';
import { ToastProvider, useToast } from './src/context/ToastContext';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { OfflineNotice } from './src/components/common/OfflineNotice';
import { TabletFrame } from './src/components/common/TabletFrame';
import { RAMADAN_GUIDANCE_CLINICALLY_REVIEWED } from './src/config/featureFlags';
import { configureNotifications } from './src/services/rdvNotificationService';
import { cleanupPastReminders } from './src/services/rdvNotificationService';
import { ensureNotificationChannels } from './src/services/notificationService';
import appI18n from './src/i18n';
import { setupRTL } from './src/i18n/rtl';
import { LocaleDirectionProvider } from './src/i18n/LocaleDirectionProvider';
import { isRtlLang } from './src/hooks/useRtl';
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
    // The titles on Language and AuthChoice are never shown (no header) but they are
    // what the next screen's back button is named after; without them the header back
    // on Register/Login/Privacy was announced by route name ("AuthChoice, back").
    <Stack.Navigator screenOptions={{ headerShown: false, ...localizedHeaderBack(t) }}>
      <Stack.Screen name="Language" component={LanguageSelectScreen} options={{ title: t('common.chooseLanguage') }} />
      <Stack.Screen name="AuthChoice" component={AuthChoiceScreen} options={{ title: t('startJourney') }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: true, title: t('common.screen.createAccount') }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: true, title: t('common.screen.login') }} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: true, title: t('common.screen.onboarding') }} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ headerShown: true, title: t('common.screen.legalNotice') }} />
    </Stack.Navigator>
  );
};

// A signed-in account with no profile yet (needsProfileSetup): a fresh registration,
// or an account that reaches the app without a userProfiles document — a new device,
// an older build, a partial document. Onboarding is the only way forward, so it is the
// only screen, with sign-out as the way out for someone on the wrong account.
// A finished profile saved before the app asked for consent to process health data
// (needsHealthDataConsent) starts on that question instead, and cannot reach Home
// without answering it. Both can open the privacy policy they are asked to accept.
const ProfileSetupStack = ({ initialRouteName }: { initialRouteName: 'Onboarding' | 'HealthDataConsent' }) => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{
      headerStyle: { backgroundColor: theme.colors.background },
      headerTintColor: theme.colors.text,
      ...localizedHeaderBack(t),
    }}>
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          title: t('common.screen.onboarding'),
          headerRight: () => (
            <TouchableOpacity
              onPress={logout}
              accessibilityRole="button"
              accessibilityLabel={t('profile.logout')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
              testID="profile_setup_logout"
            >
              <Text style={{ color: theme.colors.accent, fontSize: 14, fontWeight: '600' }}>{t('profile.logout')}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="HealthDataConsent"
        component={HealthDataConsentScreen}
        options={{ title: t('onboarding.healthConsent.sheetTitle'), headerBackVisible: false, gestureEnabled: false }}
      />
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
      ...localizedHeaderBack(t),
    }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WeekRecommendations" component={WeekRecommendationsScreen} options={{ title: t('common.screen.recommendations') }} />
      <Stack.Screen name="ArticleDetail" component={ArticleDetailScreen} options={{ title: t('common.screen.article') }} />
      <Stack.Screen name="SupplementDetail" component={SupplementDetailScreen} options={{ title: t('common.screen.supplement') }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('common.screen.myProfile') }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('common.screen.settings') }} />
      {/* NAV-01: guest-upgrade entry reachable from INSIDE MainTabs (the AuthStack
          Register lives in a stack that is unmounted for a logged-in guest, so the old
          navigate('AuthChoice') silently no-op'd). RegisterScreen in upgradeMode links the
          anonymous account in place — no re-onboarding. */}
      <Stack.Screen name="GuestUpgrade" component={RegisterScreen} initialParams={{ upgradeMode: true }} options={{ headerShown: true, title: t('common.screen.createAccount') }} />
      {/* PRIVACY-REACHABILITY FIX. AuthStack and MainTabs are mutually exclusive
          (`user ? <MainTabs/> : <AuthStack/>`), so registering PrivacyPolicy only in
          AuthStack made it unreachable for every logged-in user: the links in
          SettingsScreen and ProfileScreen were silent no-ops, and so was the "terms &
          privacy" line on the guest-upgrade signup form. The app's medical disclaimer
          lives on that screen too. Apple requires an in-app privacy policy, so this is
          a store blocker as much as a broken link. Same fix already applied to
          GuestUpgrade just above. */}
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ headerShown: true, title: t('common.screen.legalNotice') }} />
      <Stack.Screen name="HealthDashboard" component={HealthDashboardScreen} options={{ title: t('common.screen.myHealth') }} />
      <Stack.Screen name="WeightTracker" component={WeightTrackerScreen} options={{ title: t('common.screen.weightTracking') }} />
      <Stack.Screen name="ForbiddenFoods" component={ForbiddenFoodsScreen} options={{ title: t('common.screen.forbiddenFoods') }} />
      {/* DEV-SURFACE FIX: the Settings entry point is already __DEV__-gated, but the
          screen itself was registered unconditionally AND deep-linkable at
          /diagnostic, so a production build still shipped an internal data-dump
          screen reachable by URL. Gate the registration, not just the menu item. */}
      {__DEV__ && (
        <Stack.Screen name="Diagnostic" component={DiagnosticScreen} options={{ title: t('common.screen.dataDiagnostic') }} />
      )}
      <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} options={{ title: t('common.screen.language') }} />
      <Stack.Screen name="BabyEvolution" component={BabyEvolutionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="KickCounter" component={KickCounterScreen} options={{ title: t('cycle8.kickCounter.title') }} />
      <Stack.Screen name="ContractionTimer" component={ContractionTimerScreen} options={{ title: t('cycle8.contractionTimer.title') }} />
      <Stack.Screen name="HospitalBag" component={HospitalBagChecklistScreen} options={{ title: t('cycle8.hospitalBag.title') }} />
      {/* Gated until the guidance is clinically signed off — see featureFlags.ts.
          The registration is gated, not just the Home entry point: DiagnosticScreen
          taught us that a menu-hidden screen stays reachable by URL otherwise. */}
      {RAMADAN_GUIDANCE_CLINICALLY_REVIEWED && (
        <Stack.Screen name="RamadanPregnancy" component={RamadanPregnancyScreen} options={{ title: t('cycle8.ramadan.title') }} />
      )}
    </Stack.Navigator>
  );
};

const ResourcesStack = () => {
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: theme.colors.background },
      headerTintColor: theme.colors.text,
      ...localizedHeaderBack(t),
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
      ...localizedHeaderBack(t),
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
      ...localizedHeaderBack(t),
    }}>
      <Stack.Screen name="RemindersMain" component={RemindersScreen} options={{ title: t('common.nav.reminders') }} />
      <Stack.Screen name="Statistics" component={StatisticsScreen} options={{ title: t('common.screen.myStatistics'), headerShown: false }} />
    </Stack.Navigator>
  );
};

const MainTabs = () => {
  const { t } = useTranslation();
  // Five tabs share the width. Below ~72pt per tab (320pt iPad Slide Over, small
  // phones) the longest labels ("Calendrier", "Ressources") truncated to "Calend…";
  // step the label down a point there rather than cutting the word.
  const { width } = useWindowDimensions();
  const narrowTabs = width / 5 < 72;
  const tabLabelFontSize = narrowTabs ? 9 : 10;
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
        // A11Y-CONTRAST-01: active-tab tint #FF6B9D on white = 2.68:1 (WCAG AA fail).
        // Route actionable tint to accent #C2185B = 5.5:1 (passes AA). Decorative
        // pink fills stay #FF6B9D.
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarStyle: {
          backgroundColor: theme.colors.white,
          borderTopColor: theme.colors.border,
        },
        // In the 48-49pt bar the 28pt icon box and the tab's 5pt padding left the one-line
        // label 10pt for a ~13pt line, so it clipped its own descenders ("Rappels" read
        // "Raooels" in the store screenshots). A 24pt icon box (the glyph is 25pt and
        // overflows it harmlessly) gives the label its full line box. On narrow bars the
        // label also borrows the tab's side padding so "Ressources" is not cut.
        // (maxWidth overrides RN-web's max-width:100% so the negative margin can widen it.)
        tabBarIconStyle: { height: 24 },
        tabBarLabelStyle: {
          fontSize: tabLabelFontSize,
          lineHeight: Math.ceil(tabLabelFontSize * 1.4),
          ...(narrowTabs ? { marginHorizontal: -4, maxWidth: 80 } : {}),
        },
        // The bar is a fixed 49pt: a label scaled by the OS text size cannot fit it and
        // gets clipped. iOS already opts tab labels out (the Large Content Viewer shows
        // them enlarged on long-press); do the same on Android so the icon + label stay
        // whole. Screen content keeps scaling (App.tsx caps it at 1.4).
        tabBarAllowFontScaling: false,
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
    // `mama-bebe://` is registered by `scheme` in app.json; `exp+mama-bebe://` by
    // the dev client. No https prefix: without associated domains / verified app
    // links a web URL never opens the app, so listing one only suggests it does.
    prefixes: ['mama-bebe://', 'exp+mama-bebe://'],
    // R3-ROUTE-01: catch-all for unknown / mistyped / wrong-case deep links.
    // React Navigation's default getStateFromPath returns `undefined` for a path
    // that matches no screen (e.g. /Profile with a capital P, or /totally-unknown).
    // When the resolved state is undefined the NavigationContainer renders nothing
    // and any subsequent interaction tripped the global ErrorBoundary instead of
    // showing a screen. Here we delegate to the default resolver and, on a miss,
    // fall back to a valid state that lands the user on Home (HomeMain) rather than
    // erroring. This also normalises capitalised paths by retrying lowercase.
    getStateFromPath: (path: string, options: any) => {
      const resolved = getStateFromPath(path, options);
      if (resolved) return resolved;
      // Retry once with a lowercased path so /Profile, /Settings, /Ramadan etc.
      // resolve to their (lowercase) configured routes instead of falling through.
      const lower = path.toLowerCase();
      if (lower !== path) {
        const retried = getStateFromPath(lower, options);
        if (retried) return retried;
      }
      // Final fallback: send unknown URLs to the Home tab's main screen.
      return getStateFromPath('/', options) ?? {
        routes: [{ name: 'Home', state: { routes: [{ name: 'HomeMain' }] } }],
      };
    },
    config: {
      screens: {
        // R2-01 FIX: AuthStack routes were absent from the linking config, so
        // /Login /Register /AuthChoice /Onboarding silently fell through to the
        // Language fallback. Each AuthStack route now gets a distinct path.
        // NOTE: 'language' is already taken by Home > LanguageSelect below, so
        // the auth Language screen uses 'welcome' instead.
        Language: 'welcome',
        AuthChoice: 'auth',
        Register: 'register',
        Login: 'login',
        Onboarding: 'onboarding',
        PrivacyPolicy: 'privacy',
        Home: {
          screens: {
            ArticleDetail: 'article/:articleId',
            SupplementDetail: 'supplement/:supplementId',
            WeekRecommendations: 'recommendations',
            // Dev-only, matching the __DEV__-gated screen registration above.
            ...(__DEV__ ? { Diagnostic: 'diagnostic' } : {}),
            HealthDashboard: 'health',
            WeightTracker: 'weight',
            Profile: 'profile',
            Settings: 'settings',
            GuestUpgrade: 'create-account',
            ForbiddenFoods: 'forbidden-foods',
            KickCounter: 'kick-counter',
            ContractionTimer: 'contraction-timer',
            HospitalBag: 'hospital-bag',
            // Gated with the screen registration above; a linking entry for an
            // unregistered route would resolve to nothing and blank the container.
            ...(RAMADAN_GUIDANCE_CLINICALLY_REVIEWED ? { RamadanPregnancy: 'ramadan' } : {}),
            BabyEvolution: 'baby-evolution',
            LanguageSelect: 'language',
          }
        },
        Calendrier: {
          // A reloaded /appointment/add?eventId=… keeps the Calendar under the form, so
          // Save / back return to it instead of leaving the form as the tab's only screen.
          initialRouteName: 'CalendarMain' as const,
          screens: {
            CalendarMain: 'calendar',
            AddAppointment: 'appointment/add',
          }
        },
        Rappels: {
          screens: {
            RemindersMain: 'reminders',
            Statistics: 'statistics',
          }
        },
        Ressources: {
          screens: {
            ResourcesMain: 'resources',
          }
        },
        // Every other tab was URL-addressable; this one was not, so `/chatbot`
        // fell through `getStateFromPath`'s catch-all and landed on Home. Chatbot
        // is a Tab.Screen directly under MainTabs (no inner Stack), so it takes a
        // path string rather than a `screens` map.
        Chatbot: 'chatbot',
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
      // AR-RTL: React Navigation derives its direction from
      // `I18nManager.getConstants().isRTL`, which stays false on web (forceRTL is
      // deliberately skipped there — it looped). That left the header back arrow
      // pointing left in Arabic, where "back" must point right. Drive it from the
      // UI language instead, which is correct on every platform.
      direction={isRtlLang(i18n.language) ? 'rtl' : 'ltr'}
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
      {user
        ? (needsProfileSetup(user) || needsHealthDataConsent(user)
          ? <ProfileSetupStack
              key={needsProfileSetup(user) ? 'setup' : 'consent'}
              initialRouteName={needsProfileSetup(user) ? 'Onboarding' : 'HealthDataConsent'}
            />
          : <MainTabs />)
        : <AuthStack />}
    </NavigationContainer>
  );
};

import { analyticsService } from './src/services/analyticsService';

// navigationRef moved to its own module so deep leaf screens can import it without a circular
// dependency back into App.tsx. Re-exported here for backward compatibility.
import { navigationRef } from './src/navigation/navigationRef';
export { navigationRef };

import { databaseService } from './src/services/chatbot/data/DatabaseService';

function App() {
  // Initialize notifications, RTL, and database on app start
  useEffect(() => {
    setupRTL();
    configureNotifications();
    // SQLite is mobile-only; on web the chatbot uses the in-memory repository.
    // Skip DB init on web to avoid the (stubbed) wa-sqlite.wasm CompileError noise.
    if (Platform.OS !== 'web') {
      databaseService.init().catch(err => console.error('DB Init Error', err));
    }

    // STARTUP-FIX-01: Purge stale past RDV reminders from AsyncStorage on each launch.
    // Prevents unbounded growth of the '@rdv_reminders' key over time.
    cleanupPastReminders().catch(err => console.warn('cleanupPastReminders failed:', err));

    // Android notification channels exist from the first launch, whether or not
    // permission has been asked yet, and carry the app's language in system
    // settings — so they are re-named whenever the language changes (including
    // the first detection from storage, which lands after this effect runs).
    ensureNotificationChannels();
    const renameChannels = () => { ensureNotificationChannels(); };
    appI18n.on('languageChanged', renameChannels);

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
      appI18n.off('languageChanged', renameChannels);
    };
  }, []);

  return (
    <LocaleDirectionProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        <OfflineNotice />
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              <PregnancyProvider>
                <AppInitializer />
                {/* `ios.supportsTablet` is true, so this runs at 1032pt on an iPad
                    while every screen is laid out for a phone. TabletFrame centres
                    the app in a phone-width column above 700pt and is a no-op
                    below it. See the component for why this rather than 33
                    re-layouts. */}
                <TabletFrame>
                  <AppContent />
                </TabletFrame>
              </PregnancyProvider>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </LocaleDirectionProvider>
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
          // NAV-02 FIX (GOAL W2): TasksTab is a material-top-tab INSIDE RemindersScreen
          // (route RemindersMain), so it must be reached through the RemindersMain level —
          // mirroring the canonical nesting HomeScreen uses for the same jump. The previous
          // `{screen:'TasksTab'}` skipped RemindersMain, so RN fell back to the default
          // sub-tab (Reminders) and the highlightId never reached TasksTab.
          // @ts-ignore
          navigationRef.navigate('Rappels', {
            screen: 'RemindersMain',
            params: { screen: 'TasksTab', params: { highlightId: data.reminderId } }
          });
        } else if (data.screen === 'Calendar') {
          // @ts-ignore
          navigationRef.navigate('Calendrier');
        } else {
          try {
            // @ts-ignore
            navigationRef.navigate(data.screen, data.params);
          } catch (e) {
            // NAV-07 FIX (GOAL W2): never strand the user on a failed deep-link — fall back Home.
            logger.error('App', 'Navigation failed', e);
            try { // @ts-ignore
              navigationRef.navigate('Home'); } catch { /* navigator not ready */ }
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
