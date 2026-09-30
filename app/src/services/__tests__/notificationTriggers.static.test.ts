/**
 * Static guard: no app code may schedule a notification with a CALENDAR trigger.
 *
 * expo-notifications' CALENDAR trigger is iOS-only. On Android the native
 * NotificationScheduler has no 'calendar' case and throws "Trigger of type:
 * calendar is not supported on Android", which our scheduling helpers catch and
 * log — so every recurring reminder silently never existed on Android. Unit
 * tests with a mocked scheduler cannot see that, hence this scan of the source.
 * Use DAILY / WEEKLY / DATE / TIME_INTERVAL, which both platforms support.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../../..');

const collectSources = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            collectSources(full, out);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
};

// Matches `SchedulableTriggerInputTypes.CALENDAR`, `type: 'calendar'` / "calendar",
// and the CalendarTriggerInput type cast that always accompanies one.
const CALENDAR_TRIGGER = /SchedulableTriggerInputTypes\.CALENDAR|type\s*:\s*['"]calendar['"]|CalendarTriggerInput/;

describe('notification triggers are Android-compatible', () => {
    it('no source file under src/ (or App.tsx) builds a CALENDAR trigger', () => {
        const files = [...collectSources(path.join(APP_ROOT, 'src')), path.join(APP_ROOT, 'App.tsx')];
        expect(files.length).toBeGreaterThan(50);

        const offenders: string[] = [];
        for (const file of files) {
            fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
                if (CALENDAR_TRIGGER.test(line)) offenders.push(`${path.relative(APP_ROOT, file)}:${i + 1}: ${line.trim()}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('the pattern really catches the trigger shapes it guards against', () => {
        expect(CALENDAR_TRIGGER.test('type: Notifications.SchedulableTriggerInputTypes.CALENDAR,')).toBe(true);
        expect(CALENDAR_TRIGGER.test("trigger: { type: 'calendar', hour: 8 }")).toBe(true);
        expect(CALENDAR_TRIGGER.test('} as Notifications.CalendarTriggerInput,')).toBe(true);
        expect(CALENDAR_TRIGGER.test('type: Notifications.SchedulableTriggerInputTypes.DAILY,')).toBe(false);
    });
});
