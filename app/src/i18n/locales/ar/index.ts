// CLEANUP: ui/babyEvolution/support/article namespaces were duplicated in common.json
// (which is spread at root). The standalone .json files have been removed.
import authAr from './auth.json';
import commonAr from './common.json';
import profileAr from './profile.json';
import onboardingAr from './onboarding.json';
import addAppointmentAr from './add_appointment.json';
import calendarAr from './calendar.json';
import dashboardAr from './dashboard.json';
import weightAr from './weight.json';
import homeAr from './home.json';
import tasksAr from './tasks.json';
import remindersAr from './reminders.json';
import forbiddenFoodsAr from './forbiddenFoods.json';
import notificationsAr from './notifications.json';
import cycle8Ar from './cycle8.json';

import babyGrowthAr from './babyGrowth.json';
// P0-2 FIX (E2E audit 2026-05-08): commonAr.errors shadowed authAr.errors.
// Explicit deep-merge of the `errors` sub-block — auth wins, common is base.
const mergedErrorsAr = { ...(commonAr as any).errors, ...(authAr as any).errors };

// AUTH-01 FIX: commonAr.home holds the TTC/Curious/postpartum keys, but
// `home: homeAr` would overwrite the whole subtree (home.json lacks those 8 keys).
// Deep-merge `home` — home.json wins, common.home is the base (mirrors `errors`).
const mergedHomeAr = { ...(commonAr as any).home, ...(homeAr as any) };

export default {
    ...authAr,
    ...commonAr,
    errors: mergedErrorsAr,
    common: commonAr,
    profile: profileAr,
    onboarding: onboardingAr,
    addAppointment: addAppointmentAr,
    calendar: calendarAr,
    dashboard: dashboardAr,
    weight: weightAr,
    home: mergedHomeAr,
    tasks: tasksAr,
    reminders: remindersAr,
    forbiddenFoods: forbiddenFoodsAr,
    notifications: notificationsAr,
    cycle8: cycle8Ar,

    babyGrowth: babyGrowthAr,
};
