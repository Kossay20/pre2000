// CLEANUP: ui/babyEvolution/support/article namespaces were duplicated in common.json
// (which is spread at root). The standalone .json files have been removed.
import authEn from './auth.json';
import commonEn from './common.json';
import profileEn from './profile.json';
import onboardingEn from './onboarding.json';
import addAppointmentEn from './add_appointment.json';
import calendarEn from './calendar.json';
import dashboardEn from './dashboard.json';
import weightEn from './weight.json';
import homeEn from './home.json';
import tasksEn from './tasks.json';
import remindersEn from './reminders.json';
import forbiddenFoodsEn from './forbiddenFoods.json';
import notificationsEn from './notifications.json';
import cycle8En from './cycle8.json';

import babyGrowthEn from './babyGrowth.json';
// P0-2 FIX (E2E audit 2026-05-08): commonEn.errors shadowed authEn.errors.
// Explicit deep-merge of the `errors` sub-block — auth wins, common is base.
const mergedErrorsEn = { ...(commonEn as any).errors, ...(authEn as any).errors };

export default {
    ...authEn,
    ...commonEn,
    errors: mergedErrorsEn,
    common: commonEn,
    profile: profileEn,
    onboarding: onboardingEn,
    addAppointment: addAppointmentEn,
    calendar: calendarEn,
    dashboard: dashboardEn,
    weight: weightEn,
    home: homeEn,
    tasks: tasksEn,
    reminders: remindersEn,
    forbiddenFoods: forbiddenFoodsEn,
    notifications: notificationsEn,
    cycle8: cycle8En,

    babyGrowth: babyGrowthEn,
};
