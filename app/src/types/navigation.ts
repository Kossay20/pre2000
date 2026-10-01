/**
 * Navigation Type Definitions
 * 
 * Centralized type-safe navigation params for all navigators.
 * Uses a comprehensive AllScreensParamList for the global augmentation
 * so that `useNavigation()` works across all stacks without `as any`.
 */
import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp } from '@react-navigation/native';

// ─── Auth Stack Screens ──────────────────────────────────────
export type AuthStackParamList = {
  Language: undefined;
  AuthChoice: undefined;
  Register: undefined;
  Login: undefined;
  Onboarding: undefined;
  PrivacyPolicy: undefined;
};

// ─── Home Stack Screens ──────────────────────────────────────
export type HomeStackParamList = {
  HomeMain: undefined;
  WeekRecommendations: { weekNumber?: number };
  ArticleDetail: { articleId: string; anchor?: string };
  SupplementDetail: { supplementId: string };
  Profile: undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
  HealthDashboard: undefined;
  WeightTracker: undefined;
  ForbiddenFoods: undefined;
  Diagnostic: undefined;
  LanguageSelect: undefined;
  BabyEvolution: undefined;
  KickCounter: undefined;
  ContractionTimer: undefined;
  HospitalBag: undefined;
  RamadanPregnancy: undefined;
};

// ─── Resources Stack Screens ─────────────────────────────────
export type ResourcesStackParamList = {
  ResourcesMain: { openSearch?: boolean };
  ArticleDetail: { articleId: string; anchor?: string };
  SupplementDetail: { supplementId: string };
};

// ─── Calendar Stack Screens ──────────────────────────────────
export type CalendarStackParamList = {
  CalendarMain: { selectedDate?: string };
  // selectedDate: local yyyy-MM-dd. eventId: edit mode (the form reads the event itself).
  AddAppointment: { selectedDate?: string; eventId?: string };
};

// ─── Reminders Stack Screens ─────────────────────────────────
export type RemindersStackParamList = {
  RemindersMain: { screen?: string; params?: Record<string, any> };
  Statistics: undefined;
  TasksTab: { action?: string; highlightId?: string };
};

// ─── Main Tab Navigator ──────────────────────────────────────
export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Calendrier: NavigatorScreenParams<CalendarStackParamList>;
  Rappels: NavigatorScreenParams<RemindersStackParamList>;
  Ressources: NavigatorScreenParams<ResourcesStackParamList>;
  Chatbot: undefined;
};

// ─── All Screens Param List (Flat) ───────────────────────────
// Merges every possible screen name into one flat type.
// This powers the global module augmentation so that any
// `useNavigation().navigate('ScreenName', params)` call is typed.
export type AllScreensParamList = {
  // Auth
  Language: undefined;
  AuthChoice: undefined;
  Register: undefined;
  Login: undefined;
  Onboarding: undefined;
  PrivacyPolicy: undefined;
  // Home Stack
  HomeMain: undefined;
  WeekRecommendations: { weekNumber?: number };
  ArticleDetail: { articleId: string; anchor?: string };
  SupplementDetail: { supplementId: string };
  Profile: undefined;
  Settings: undefined;
  HealthDashboard: undefined;
  WeightTracker: undefined;
  ForbiddenFoods: undefined;
  Diagnostic: undefined;
  LanguageSelect: undefined;
  BabyEvolution: undefined;
  KickCounter: undefined;
  ContractionTimer: undefined;
  HospitalBag: undefined;
  RamadanPregnancy: undefined;
  // Calendar Stack
  CalendarMain: { selectedDate?: string };
  // selectedDate: local yyyy-MM-dd. eventId: edit mode (the form reads the event itself).
  AddAppointment: { selectedDate?: string; eventId?: string };
  // Reminders Stack
  RemindersMain: { screen?: string; params?: Record<string, any> };
  Statistics: undefined;
  TasksTab: { action?: string; highlightId?: string };
  // Resources Stack
  ResourcesMain: { openSearch?: boolean };
  // Tabs (for cross-tab navigation)
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  Calendrier: NavigatorScreenParams<CalendarStackParamList> | undefined;
  Rappels: NavigatorScreenParams<RemindersStackParamList> | undefined;
  Ressources: NavigatorScreenParams<ResourcesStackParamList> | undefined;
  Chatbot: undefined;
};

// ─── Composite Navigation Props ──────────────────────────────
/** Navigation prop for screens inside HomeStack */
export type HomeScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList>,
  BottomTabNavigationProp<MainTabParamList>
>;

/** Navigation prop for screens inside CalendarStack */
export type CalendarScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<CalendarStackParamList>,
  BottomTabNavigationProp<MainTabParamList>
>;

/** Navigation prop for screens inside ResourcesStack */
export type ResourcesScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ResourcesStackParamList>,
  BottomTabNavigationProp<MainTabParamList>
>;

/** Navigation prop for screens inside RemindersStack */
export type RemindersScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<RemindersStackParamList>,
  BottomTabNavigationProp<MainTabParamList>
>;

/** Navigation prop for AuthStack screens */
export type AuthScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

// ─── React Navigation Global Type ────────────────────────────
// This enables `useNavigation()` to know about ALL screens globally.
// Any screen can navigate to any other without casts.
declare global {
  namespace ReactNavigation {
    interface RootParamList extends AllScreensParamList {}
  }
}
