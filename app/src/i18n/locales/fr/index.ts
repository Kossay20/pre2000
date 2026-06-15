// CLEANUP: ui/babyEvolution/support/article namespaces were duplicated in common.json
// (which is spread at root). The standalone .json files have been removed — common.json
// is now the single source of truth.
import authFr from './auth.json';
import commonFr from './common.json';
import profileFr from './profile.json';
import onboardingFr from './onboarding.json';
import addAppointmentFr from './add_appointment.json';
import calendarFr from './calendar.json';
import dashboardFr from './dashboard.json';
import weightFr from './weight.json';
import homeFr from './home.json';
import tasksFr from './tasks.json';
import babyGrowthFr from './babyGrowth.json';
import remindersFr from './reminders.json';
import forbiddenFoodsFr from './forbiddenFoods.json';
import notificationsFr from './notifications.json';
import cycle8Fr from './cycle8.json';



// P0-2 FIX (E2E audit 2026-05-08): commonFr.errors was shadowing authFr.errors
// because `...commonFr` spreads after `...authFr`. Result: keys like
// `errors.emailRequired` (defined only in auth.json) resolved to the raw key.
// Explicit deep-merge of the `errors` sub-block — auth wins, common is base.
const mergedErrors = { ...(commonFr as any).errors, ...(authFr as any).errors };

// AUTH-01 FIX: commonFr.home holds the TTC/Curious/postpartum keys, but
// `home: homeFr` would overwrite the whole subtree (home.json lacks those 8 keys).
// Deep-merge `home` — home.json wins, common.home is the base (mirrors `errors`).
const mergedHome = { ...(commonFr as any).home, ...(homeFr as any) };

export default {
    ...authFr,
    ...commonFr,
    errors: mergedErrors,
    common: commonFr,
    profile: profileFr,
    onboarding: onboardingFr,
    addAppointment: addAppointmentFr,
    calendar: calendarFr,
    dashboard: dashboardFr,
    weight: weightFr,
    home: mergedHome,
    tasks: tasksFr,
    babyGrowth: babyGrowthFr,
    reminders: remindersFr,
    forbiddenFoods: forbiddenFoodsFr,
    notifications: notificationsFr,
    cycle8: cycle8Fr,


};
