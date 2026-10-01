/**
 * Planning screens wiring (final-release Wave B, B-plan). The screens are .tsx with JSX,
 * which ts-jest cannot load under the Expo tsconfig and the repo ships no React renderer —
 * so, like authFunnelUi.test.ts, the wiring is locked at source level. The behaviour
 * behind it is unit-tested in calendarService.test.ts, localDayTimezones.test.ts and
 * utils/__tests__/localDate.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'];
const locale = (lang: string, file: string) => JSON.parse(read(`src/i18n/locales/${lang}/${file}`));

describe('HYP-B3 / HYP-B5 — the edit form is addressed by id and reads the event itself', () => {
    const calendar = read('src/screens/CalendarScreen.tsx');
    const form = read('src/screens/AddAppointmentScreen.tsx');

    it('Calendar passes only the event id (an object param became "[object Object]" in the URL)', () => {
        expect(calendar).toMatch(/navigate\('AddAppointment', \{ eventId: item\.id \}\)/);
        expect(calendar).not.toMatch(/navigate\('AddAppointment', \{ event: /);
    });

    it('the form loads the event by id and has a not-found state', () => {
        expect(form).toMatch(/getUserEvent\(eventId\)/);
        expect(form).not.toMatch(/route\.params\?\.event\b(?!Id)/);
        expect(form).toMatch(/t\('addAppointment\.notFoundTitle'\)/);
    });

    it('the Month view list carries location and notes like the Week view', () => {
        const monthUserEvents = calendar.slice(calendar.indexOf('// Add user events'), calendar.indexOf('return grouped;'));
        expect(monthUserEvents).toMatch(/location: event\.location/);
        expect(monthUserEvents).toMatch(/notes: event\.notes/);
    });

    it('a reloaded edit URL keeps the Calendar under the form', () => {
        const app = read('App.tsx');
        const block = app.slice(app.indexOf('Calendrier: {', app.indexOf('const linking')));
        expect(block.slice(0, 400)).toMatch(/initialRouteName: 'CalendarMain'/);
    });
});

describe('HYP-B4 / HYP-B2 / 07 — what Save writes', () => {
    const form = read('src/screens/AddAppointmentScreen.tsx');

    it('an emptied location/notes is sent as null (cleared), not left out of the merge', () => {
        const update = form.slice(form.indexOf('updateUserEvent(editingEvent.id'), form.indexOf('showToast(pendingSync'));
        expect(update).toMatch(/location: location\.trim\(\) \|\| null/);
        expect(update).toMatch(/notes: notes\.trim\(\) \|\| null/);
    });

    it('the web date is parsed strictly and an impossible day blocks Save with a localized error', () => {
        expect(form).toMatch(/withLocalDay\(date, text\)/);
        expect(form).toMatch(/t\('addAppointment\.errors\.dateInvalid'\)/);
        expect(form).toMatch(/disabled=\{saving \|\| !isTitleValid \|\| !!dateError\}/);
        expect(form).not.toMatch(/setFullYear\(year, month - 1, day\)/);
    });

    it('the saved time is to the minute', () => {
        expect(form).toMatch(/const when = toMinute\(date\)/);
        const writes = form.slice(form.indexOf('const when = toMinute(date)'), form.indexOf('trackPositiveAction('));
        expect(writes.match(/date: when\.toISOString\(\)/g)).toHaveLength(2);
        expect(writes).not.toMatch(/date: date\.toISOString\(\)/);
    });
});

describe('HYP-B6 — Home "this week" pill counts like the Calendar', () => {
    it('Home fetches every upcoming appointment (the list shows 3, the pill counts them all)', () => {
        expect(read('src/screens/HomeScreen.tsx')).toMatch(/getUpcomingAppointments\(user\.uid, Number\.POSITIVE_INFINITY\)/);
    });

    it('the pill and the Calendar use the same range and counter', () => {
        const tracker = read('src/components/home/DailyRoutinesTracker.tsx');
        expect(tracker).toMatch(/countEventsInRange\(upcomingAppointments, getCurrentPregnancyWeekRange\(lmpDate\)\)/);
        expect(tracker).toMatch(/user\?\.pregnancyStartDate \|\| profile\?\.lmp/);
        expect(read('src/screens/CalendarScreen.tsx')).toMatch(/countEventsInRange\(userEvents, weekDates\)/);
    });
});

describe('HYP-B8 / 09 — Home quick actions', () => {
    const home = read('src/screens/HomeScreen.tsx');

    it('"+ Tâche" opens the add-task modal', () => {
        expect(home).toMatch(/params: \{ screen: 'TasksTab', params: \{ action: 'add' \} \}/);
        const tasks = read('src/screens/reminders/TasksTab.tsx');
        expect(tasks).toMatch(/if \(actionParam === 'add'\) \{\s*setEditingTask\(undefined\);\s*setShowAddModal\(true\);/);
        expect(tasks).toMatch(/navigation\.setParams\(\{ action: undefined \}/);
    });

    it('"+ RDV" keeps the Calendar under the form and opens it on the local day', () => {
        const quickAdd = home.slice(home.indexOf("screen: 'AddAppointment'") - 200, home.indexOf('testID="home_quick_add_appointment"'));
        expect(quickAdd).toMatch(/initial: false/);
        expect(quickAdd).toMatch(/selectedDate: quickAddDateKey\(currentWeekNumber, pregnancyInfo\?\.week\)/);
        expect(quickAdd).not.toMatch(/toISOString\(\)/);
    });

    it('every jump from another tab into the form keeps the Calendar under it', () => {
        // Without `initial: false` the form became the Calendar stack's only route when the
        // tab had not been opened yet, and Save's goBack() left the tab on a stale form.
        const screens = fs.readdirSync(path.resolve(__dirname, '..')).filter((f) => f.endsWith('.tsx'));
        const jumps = screens.flatMap((file) => {
            const src = read(`src/screens/${file}`);
            return [...src.matchAll(/navigate\('Calendrier'[^)]*?screen: 'AddAppointment'[\s\S]*?\}\)/g)].map((m) => ({ file, call: m[0] }));
        });
        expect(jumps.map((j) => j.file).sort()).toEqual(['HomeScreen.tsx', 'RegisterScreen.tsx']);
        for (const jump of jumps) expect(jump).toEqual({ file: jump.file, call: expect.stringMatching(/initial: false/) });
    });

    it('the Calendar FAB passes a local day key', () => {
        expect(read('src/screens/CalendarScreen.tsx')).toMatch(/selectedDate: getLocalDateKey\(selectedDate\)/);
    });
});

describe('HYP-B1 — Suggestions never open onto nothing', () => {
    it('an empty suggestions panel explains itself', () => {
        const calendar = read('src/screens/CalendarScreen.tsx');
        expect(calendar).toMatch(/t\('calendar\.noSuggestionsWeek'\)/);
        expect(calendar).toMatch(/t\('calendar\.noSuggestionsMonth'\)/);
    });
});

describe('20 — Statistics include the user\'s tasks', () => {
    it('StatisticsScreen passes the server tasks to getHistoricalData', () => {
        const stats = read('src/screens/reminders/StatisticsScreen.tsx');
        expect(stats).toMatch(/getHistoricalData\(days, tasks\)/);
        expect(stats).toMatch(/getUserTasks\(userId\)/);
    });
});

describe('new copy exists in all four locales', () => {
    it.each(LOCALES)('%s', (lang) => {
        const cal = locale(lang, 'calendar.json');
        const add = locale(lang, 'add_appointment.json');
        for (const value of [cal.noSuggestionsWeek, cal.noSuggestionsMonth, add.notFoundTitle, add.notFoundMsg, add.backToCalendar, add.errors.dateInvalid]) {
            expect(typeof value).toBe('string');
            expect(value.trim()).not.toBe('');
        }
        if (lang === 'ar' || lang === 'tn') {
            expect(cal.noSuggestionsWeek).toMatch(/[؀-ۿ]/);
            expect(add.notFoundMsg).toMatch(/[؀-ۿ]/);
        }
    });
});
