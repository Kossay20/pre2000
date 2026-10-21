/**
 * Wave E (final-release) — accessible names, tap targets and tablet layout.
 *
 * Style objects are imported and checked by value. Components are .tsx with JSX, which
 * ts-jest cannot load under the Expo tsconfig (see authFunnelUi.test.ts), so the
 * accessibility props are locked at source level, plus the locale files behaviourally.
 */
import * as fs from 'fs';
import * as path from 'path';
import { styles as homeStyles } from '../HomeScreen.styles';
import { styles as calendarStyles } from '../CalendarScreen.styles';
import { styles as profileStyles } from '../ProfileScreen.styles';
import { styles as healthStyles } from '../HealthDashboardScreen.styles';
import { styles as addTaskStyles } from '../../components/tasks/AddTaskModal.styles';
import { styles as reminderEditStyles } from '../../components/reminders/ReminderEditModal.styles';
import { styles as remindersTabStyles } from '../reminders/RemindersTab.styles';
import { MODAL_MAX_WIDTH, TABLET_CONTENT_MAX_WIDTH } from '../../utils/layout';
import { theme } from '../../theme';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const MIN_TARGET = 44;

describe('tap targets ≥ 44pt', () => {
    it('Home week chevrons and the "Your body" toggle', () => {
        expect(homeStyles.navButton.minWidth).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(homeStyles.navButton.minHeight).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(homeStyles.infoCardHeaderToggle.minHeight).toBeGreaterThanOrEqual(MIN_TARGET);
    });

    it('Home avatar no longer reaches down into the week row', () => {
        expect(homeStyles.profileButtonContainer.top).toBe(0);
    });

    it('Home "Baby this week" card no longer overlaps the BabyGrowthCard CTA above it', () => {
        expect(read('src/screens/HomeScreen.tsx')).not.toMatch(/marginTop: -50/);
    });

    it('Calendar empty-state copy stays clear of the FAB column', () => {
        // FAB: 56pt wide, 20pt from the edge; the list already insets 16pt.
        expect(calendarStyles.emptyState.paddingHorizontal).toBeGreaterThanOrEqual(56 + 20 - 16);
    });

    it('Calendar prev/next and month-grid day cells (no double gutter)', () => {
        expect(calendarStyles.navButton.width).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(calendarStyles.navButton.height).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(calendarStyles.monthGrid.marginHorizontal).toBe(0);
        // 375pt phone − 2×16 list gutter − 2×12 grid padding, 7 columns.
        const cell = (375 - 2 * 16 - 2 * (calendarStyles.monthGrid.padding as number)) / 7;
        expect(cell).toBeGreaterThanOrEqual(MIN_TARGET);
    });

    it('Profile country chips and the LMP date button', () => {
        expect(profileStyles.countryButton.minHeight).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(profileStyles.dateButton.minHeight).toBeGreaterThanOrEqual(MIN_TARGET);
    });

    it('AddTask close ✕ and the reminders gear / permission banner', () => {
        expect(addTaskStyles.closeButton.minWidth).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(addTaskStyles.closeButton.minHeight).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(remindersTabStyles.essentialEditButton.minWidth).toBeGreaterThanOrEqual(MIN_TARGET);
        expect(remindersTabStyles.permissionBanner.minHeight).toBeGreaterThanOrEqual(MIN_TARGET);
    });

    it('BabyEvolution month dots get a 44pt-tall pressable box around the 10pt dot', () => {
        const src = read('src/screens/BabyEvolutionScreen.tsx');
        expect(src).toMatch(/style=\{styles\.progressDotTouch\}/);
        expect(src).toMatch(/progressDotTouch: \{[^}]*height: 44/);
    });
});

describe('iPad: reading column and dialogs', () => {
    it('the tablet column is a reading width, not a phone width', () => {
        expect(TABLET_CONTENT_MAX_WIDTH).toBeGreaterThanOrEqual(700);
        expect(TABLET_CONTENT_MAX_WIDTH).toBeLessThanOrEqual(760);
    });

    it('TabletFrame draws the same column getContentWidth() reports', () => {
        const src = read('src/components/common/TabletFrame.tsx');
        expect(src).toMatch(/import \{ TABLET_BREAKPOINT, TABLET_CONTENT_MAX_WIDTH \} from '\.\.\/\.\.\/utils\/layout'/);
        expect(src).not.toMatch(/export const TABLET_CONTENT_MAX_WIDTH = /);
    });

    it('centred dialogs are capped (Modal renders over the whole window, outside TabletFrame)', () => {
        expect(healthStyles.modal.maxWidth).toBe(MODAL_MAX_WIDTH);
        expect(reminderEditStyles.modalContainer.maxWidth).toBe(TABLET_CONTENT_MAX_WIDTH);
        for (const file of ['src/components/reminders/HydrationCard.tsx', 'src/screens/HospitalBagChecklistScreen.tsx']) {
            expect(read(file)).toMatch(/maxWidth: MODAL_MAX_WIDTH/);
        }
    });
});

describe('contrast wiring on the pink header', () => {
    it('header gradients start on the text-bearing pink, chips darken instead of whitening', () => {
        // E-038: Home and Calendar use the same two-stop pair as every other header.
        for (const file of ['src/screens/HomeScreen.tsx', 'src/components/calendar/CalendarHeader.tsx']) {
            expect(read(file)).toMatch(/colors=\{\[theme\.colors\.primaryStrong, theme\.colors\.accent\]\}/);
            expect(read(file)).not.toMatch(/theme\.colors\.deepPink\]/);
        }
        expect(homeStyles.quickActionPill.backgroundColor).toBe(theme.colors.headerChipBg);
        expect(homeStyles.trimesterBadge.backgroundColor).toBe(theme.colors.headerChipBg);
        expect(homeStyles.trimesterBadge.color).toBe(theme.colors.white);
        expect(calendarStyles.selectorGroup.backgroundColor).toBe(theme.colors.headerChipBg);
        expect(calendarStyles.todayButton.backgroundColor).toBe(theme.colors.headerChipBg);
        // Amber suggestions badge: dark text, not white (was 1.73:1).
        expect(calendarStyles.suggestionText.color).toBe(theme.colors.text);
    });

    it('filled AddTask priority chips: AA fills, and medium is calm amber with dark text (E-038)', () => {
        expect(addTaskStyles.priorityButtonActiveMedium.backgroundColor).toBe(theme.colors.accentAmber);
        expect(addTaskStyles.priorityButtonTextActiveMedium.color).toBe(theme.colors.text);
        expect(addTaskStyles.priorityButtonActiveLow.backgroundColor).toBe(theme.colors.green800);
        expect(addTaskStyles.priorityButtonActiveHigh.backgroundColor).toBe(theme.colors.red800);
    });

    it('success/error/info toasts use the semantic (AA) tokens', () => {
        const src = read('src/context/ToastContext.tsx');
        expect(src).toMatch(/case 'success': return theme\.colors\.success;/);
        expect(src).toMatch(/case 'error': return theme\.colors\.error;/);
        expect(src).toMatch(/case 'info': return theme\.colors\.info;/);
    });
});

describe('accessible names and roles', () => {
    it('My Day 🗑️ says what it does (delete a task vs hide a reminder for today)', () => {
        const src = read('src/components/tasks/MyDaySection.tsx');
        expect(src).toMatch(/t\('a11y\.deleteItem', \{ name: plainLabel\(item\.title\) \}\)/);
        expect(src).toMatch(/t\('a11y\.hideItemToday', \{ name: plainLabel\(item\.title\) \}\)/);
        expect(src).toMatch(/t\('a11y\.editItem', \{ name: plainLabel\(item\.title\) \}\)/);
    });

    it('AddTask: ✕ is named, priority/recurrence are radios, switches are named', () => {
        const src = read('src/components/tasks/AddTaskModal.tsx');
        expect(src).toMatch(/style=\{styles\.closeButton\}\s+accessibilityRole="button"\s+accessibilityLabel=\{t\('a11y\.close'\)\}/);
        for (const lvl of ['high', 'medium', 'low']) {
            expect(src).toContain(`onPress={() => setPriority('${lvl}')}\n                                    accessibilityRole="radio"\n                                    aria-checked={priority === '${lvl}'}`);
        }
        expect(src).toMatch(/accessibilityLabel=\{t\('tasks\.modal\.routine'\)\}/);
        expect(src).toMatch(/accessibilityLabel=\{plainLabel\(t\('tasks\.modal\.addReminder'\)\)\}/);
    });

    it('SectionHeader "See all" is a named button', () => {
        const src = read('src/components/common/SectionHeader.tsx');
        expect(src).toMatch(/accessibilityRole="button"\s+accessibilityLabel=\{actionLabel\}/);
    });

    it('Home "My Day" tracker rows and the hydration add button are named buttons', () => {
        const tracker = read('src/components/home/DailyRoutinesTracker.tsx');
        expect(tracker.match(/accessibilityRole="button"/g)).toHaveLength(2);
        expect(tracker).toMatch(/accessibilityLabel=\{`\$\{t\('reminders\.myDay\.title'\)\} \$\{completedItems\}\/\$\{totalItems\}`\}/);
        const hydration = read('src/components/reminders/HydrationCard.tsx');
        expect(hydration).toMatch(/accessibilityLabel=\{t\('reminders\.hydration\.addWater'\)\}/);
        expect(hydration).toMatch(/accessibilityLabel=\{t\('reminders\.hydration\.enableReminders'\)\}/);
    });

    it('the weight title is only a (debug) control in dev builds', () => {
        const src = read('src/screens/WeightTrackerScreen.tsx');
        expect(src).toMatch(/\{__DEV__ \? \(\s+<TouchableOpacity onPress=\{handleTitlePress\}>/);
    });

    it('offline AddAppointment: one event id per form, and a queued save is announced as such', () => {
        const src = read('src/screens/AddAppointmentScreen.tsx');
        expect(src).toMatch(/const newEventIdRef = React\.useRef<string>\(newUserEventId\(\)\);/);
        expect(src).toMatch(/\{ eventId: newEventIdRef\.current \}/);
        expect(src).toMatch(/result\.pendingSync \? t\('addAppointment\.savedOffline'\)/);
        for (const locale of ['fr', 'en', 'ar', 'tn']) {
            const strings = JSON.parse(read(`src/i18n/locales/${locale}/add_appointment.json`));
            expect(typeof strings.savedOffline).toBe('string');
        }
    });

    it('new a11y strings exist in all four locales', () => {
        for (const locale of ['fr', 'en', 'ar', 'tn']) {
            const a11y = JSON.parse(read(`src/i18n/locales/${locale}/common.json`)).a11y;
            for (const key of ['deleteItem', 'editItem', 'hideItemToday']) {
                expect(a11y[key]).toEqual(expect.stringContaining('{{name}}'));
            }
        }
    });
});
