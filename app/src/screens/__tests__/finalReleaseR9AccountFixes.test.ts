/**
 * Round 9, "account" lot: source-level guards for the screens and App.tsx options the
 * findings were about, plus unit tests for the two new pure helpers.
 */
import fs from 'fs';
import path from 'path';
import { scrubSentryEvent } from '../../utils/sentryScrub';
import { plainLabel } from '../../utils/a11yLabel';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const locales = ['fr', 'en', 'ar', 'tn'] as const;
const json = (lang: string, file: string) => JSON.parse(read(`src/i18n/locales/${lang}/${file}.json`));

describe('A-043 — a sign-out lands on AuthChoice, not the cold language picker', () => {
    const app = read('App.tsx');
    it('AuthStack starts on AuthChoice once an account has been signed in this run', () => {
        expect(app).toMatch(/initialRouteName=\{signedInThisRun \? 'AuthChoice' : 'Language'\}/);
        expect(app).toMatch(/if \(user\) signedInThisRun = true;/);
    });
    it('keeps <AuthStack /> prop-less (profileSetupRouting pins that shape)', () => {
        expect(app).toMatch(/:\s*<AuthStack\s*\/>/);
    });
});

describe('A-044 / E-050 — the language screen fits four cards and shows no toast in the funnel', () => {
    const src = read('src/screens/LanguageSelectScreen.tsx');
    it('only the signed-in language screen toasts', () => {
        expect(src).toMatch(/if \(route\.name === 'LanguageSelect'\) \{\s*showToast\(/);
    });
    it('the hero is compact', () => {
        expect(src).toMatch(/headerEmoji: \{\s*fontSize: 48/);
        expect(src).toMatch(/languageCard: \{[^}]*padding: 14/);
    });
});

describe('A-045 — no synthetic italic on Arabic script', () => {
    it('the contraction disclaimer is upright in ar/tn', () => {
        const src = read('src/screens/ContractionTimerScreen.tsx');
        expect(src).toMatch(/isRTL && styles\.disclaimerUpright/);
        expect(src).toMatch(/disclaimerUpright: \{ fontStyle: 'normal' \}/);
    });
});

describe('A-046 — the onboarding preview card keeps one width', () => {
    it('stretches in every state', () => {
        const styles = read('src/screens/OnboardingScreen.styles.ts');
        expect(styles.slice(styles.indexOf('previewBox: {'))).toMatch(/^previewBox: \{[^}]*alignSelf: 'stretch'/);
    });
});

describe('B-041 — Switches carry no second switch role on web', () => {
    it.each([
        'src/components/reminders/ReminderCardV2.tsx',
        'src/screens/AddAppointmentScreen.tsx',
        'src/screens/SettingsScreen.tsx',
        'src/screens/reminders/RemindersTab.tsx',
    ])('%s', (file) => {
        expect(read(file)).not.toMatch(/accessibilityRole="switch"/);
    });
});

describe('B-042 — the health card is titled for what it counts', () => {
    it.each(locales)('%s: the section is the weekly tasks, not "reminders"', (lang) => {
        const dash = json(lang, 'dashboard');
        const title = (dash.dashboard ?? dash).remindersThisWeek as string;
        expect(title).not.toMatch(/🔔/);
    });
    it('fr and en say "tasks"', () => {
        expect((json('fr', 'dashboard').dashboard ?? json('fr', 'dashboard')).remindersThisWeek).toMatch(/Tâches/);
        expect((json('en', 'dashboard').dashboard ?? json('en', 'dashboard')).remindersThisWeek).toMatch(/tasks/i);
    });
    it('"see all" opens the Tasks tab', () => {
        expect(read('src/screens/HealthDashboardScreen.tsx')).toMatch(/screen: 'RemindersMain', params: \{ screen: 'TasksTab' \}/);
    });
});

describe('B-043 / D-042 — the Profile card does not claim a sync that has not happened', () => {
    const src = read('src/screens/ProfileScreen.tsx');
    it('uses the counter the logout guard uses', () => {
        expect(read('src/hooks/useUnsyncedRecords.ts')).toMatch(/countUnsyncedTrackerRecords/);
        expect(src).toMatch(/unsyncedCount > 0/);
        expect(src).toMatch(/profile\.cloudPending/);
        expect(src).toMatch(/profile\.cloudOffline/);
    });
    it.each(locales)('%s has both sentences, the pending one with the count', (lang) => {
        const p = json(lang, 'profile');
        expect(p.cloudOffline).toBeTruthy();
        expect(p.cloudPending).toMatch(/\{\{n\}\}/);
    });
});

describe('D-041 — emergency type badges hold contrast', () => {
    it('no bright fill under the white label, label at least 11pt', () => {
        const src = read('src/components/profile/EmergencyContactsSection.tsx');
        expect(src).not.toMatch(/blue600|gray500|colors\.critical|pinkAccent/);
        expect(src).toMatch(/typeText: \{[^}]*fontSize: 11/);
    });
});

describe('D-046 — one date format on the Profile dates and the appointment field', () => {
    it('AddAppointment reads out the long month without a padded day', () => {
        const src = read('src/screens/AddAppointmentScreen.tsx');
        expect(src).not.toMatch(/format\(date, 'dd MMM/);
        expect(src).toMatch(/format\(date, 'd MMMM yyyy'/);
    });
});

describe('D-048 — no +0 kg in green without a baseline', () => {
    const src = read('src/screens/HealthDashboardScreen.tsx');
    it('shows a dash and an action when there is no pre-pregnancy weight', () => {
        expect(src).toMatch(/hasWeightBaseline \?/);
        expect(src).toMatch(/dashboard\.setStartingWeight/);
    });
    it.each(locales)('%s has the action label', (lang) => {
        const d = json(lang, 'dashboard');
        expect((d.dashboard ?? d).setStartingWeight).toBeTruthy();
    });
});

describe('D-049 — tab labels, task labels, auth header', () => {
    const app = read('App.tsx');
    it('tab labels are 11pt (10pt on very narrow bars)', () => {
        expect(app).toMatch(/const tabLabelFontSize = narrowTabs \? 10 : 11;/);
    });
    it('the signed-out funnel headers use the app background', () => {
        const stack = app.slice(app.indexOf('const AuthStack'), app.indexOf('const ProfileSetupStack'));
        expect(stack).toMatch(/headerStyle: \{ backgroundColor: theme\.colors\.background \}/);
    });
    it('plainLabel strips decorative emoji from accessible names', () => {
        expect(plainLabel('💊 Prendre l’acide folique')).toBe('Prendre l’acide folique');
        expect(plainLabel('✅  Rendez-vous ❤️')).toBe('Rendez-vous');
        expect(plainLabel(undefined)).toBe('');
    });
    it('task checkboxes use it', () => {
        expect(read('src/components/tasks/TaskCard.tsx')).toMatch(/accessibilityLabel=\{plainLabel\(/);
        expect(read('src/components/tasks/MyDaySection.tsx')).toMatch(/accessibilityLabel=\{plainLabel\(item\.title\)\}/);
    });
});

describe('D-024 — the temp export file is removed and the sweep exists', () => {
    const src = read('src/services/dataExportService.ts');
    it('deletes after the share sheet and can sweep leftovers', () => {
        expect(src).toMatch(/FileSystem\.deleteAsync\(fileUri, \{ idempotent: true \}\)/);
        expect(src).toMatch(/export const sweepExportFiles/);
    });
});

describe('E-006 — 44pt targets', () => {
    it('hydration settings close, weight delete + info, baby evolution month dots', () => {
        const hydration = read('src/components/reminders/HydrationCard.tsx');
        expect(hydration).toMatch(/minWidth: 44, minHeight: 44/);
        const weight = read('src/screens/WeightTrackerScreen.tsx');
        expect(weight).toMatch(/styles\.deleteButton, \{ minWidth: 44, minHeight: 44/);
        expect(weight).toMatch(/styles\.infoButton\}[\s\S]{0,900}hitSlop=\{\{ top: 10, bottom: 10, left: 10, right: 10 \}\}/);
        expect(read('src/screens/BabyEvolutionScreen.tsx')).toMatch(/progressDotTouch: \{[^}]*minWidth: 44/);
    });
});

describe('E-026 — one visible title on screens that draw their own H1', () => {
    const app = read('App.tsx');
    it.each(['Register', 'Login', 'Settings', 'GuestUpgrade', 'KickCounter', 'ContractionTimer', 'HospitalBag'])('%s', (name) => {
        const line = app.split('\n').find((l) => l.includes(`name="${name}"`)) ?? '';
        expect(line).toContain('...BODY_TITLED');
    });
    it('the header keeps its back button (headerTitle only blanked)', () => {
        expect(app).toMatch(/const BODY_TITLED = \{ headerTitle: '' \} as const;/);
    });
});

describe('E-045 — vector plus instead of the heavy-plus emoji', () => {
    it.each(locales)('%s: no ➕ left in tasks/weight strings', (lang) => {
        expect(read(`src/i18n/locales/${lang}/tasks.json`)).not.toContain('➕');
        expect(read(`src/i18n/locales/${lang}/weight.json`)).not.toContain('➕');
    });
    it('both buttons draw an Ionicons add', () => {
        expect(read('src/screens/reminders/TasksTab.tsx')).toMatch(/<Ionicons name="add"/);
        expect(read('src/screens/WeightTrackerScreen.tsx')).toMatch(/<Ionicons name="add"/);
    });
});

describe('E-053 — chart axis labels get a sans-serif family on web', () => {
    it('both charts pass propsForLabels', () => {
        expect(read('src/components/weight/WeightMiniChart.tsx')).toMatch(/propsForLabels: chartLabelProps/);
        expect(read('src/screens/HealthDashboardScreen.tsx')).toMatch(/propsForLabels: chartLabelProps/);
    });
});

describe('E-056 — the offline-saved toast is replaced when the connection returns', () => {
    it('the toast provider supports it and the form asks for it', () => {
        expect(read('src/context/ToastContext.tsx')).toMatch(/replaceOnReconnect/);
        const form = read('src/screens/AddAppointmentScreen.tsx');
        expect(form.match(/replaceOnReconnect/g)).toHaveLength(2);
    });
});

describe('F-036 — Sentry scrubbing and the DSN contract', () => {
    it('init reads the DSN from the environment and scrubs events', () => {
        const app = read('App.tsx');
        expect(app).toMatch(/dsn: process\.env\.EXPO_PUBLIC_SENTRY_DSN \|\| ''/);
        expect(app).toMatch(/beforeSend: \(event\) => scrubSentryEvent\(event\)/);
    });
    it('drops extras, request bodies and the e-mail/IP, keeps the hashed id and the message', () => {
        const event: any = {
            message: 'boom',
            extra: { args: [{ email: 'a@b.c' }] },
            request: { url: 'https://x', data: { a: 1 }, cookies: 'c', headers: { h: 1 } },
            user: { id: 'abcd', email: 'a@b.c', ip_address: '1.2.3.4' },
            breadcrumbs: [{ category: 'nav', message: 'm', data: { uid: 'u' } }],
        };
        const out = scrubSentryEvent(event);
        expect(out.extra).toBeUndefined();
        expect(out.request).toEqual({ url: 'https://x' });
        expect(out.user).toEqual({ id: 'abcd' });
        expect(out.breadcrumbs).toEqual([{ category: 'nav', message: 'm' }]);
        expect(out.message).toBe('boom');
    });
});
