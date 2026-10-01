/**
 * Wave B round 2 (Home week preview, new appointment). The screens are .tsx with JSX,
 * which ts-jest cannot load here and the repo ships no React renderer — so, like
 * planningWiring.test.ts, the wiring is locked at source level.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

describe('HOME-WEEKNAV-GATE — the pregnancy tools follow her real week, not the previewed one', () => {
    const home = read('src/screens/HomeScreen.tsx');

    it('gates kick counter (16) and contraction timer / hospital bag (28) on the real week', () => {
        expect(home).toMatch(/const toolsWeek = pregnancyInfo\?\.week \?\? currentWeekNumber;/);
        expect(home).toMatch(/\{toolsWeek >= 16 && \(/);
        expect(home.match(/\{toolsWeek >= 28 && \(/g)).toHaveLength(2);
        // currentWeekNumber is the PREVIEWED week while the chevrons are used.
        expect(home).not.toMatch(/\{currentWeekNumber >= (16|28) && \(/);
    });

    it('past term the chevron steps back into the content weeks and counts as a preview', () => {
        expect(home).toMatch(/const newWeek = Math\.min\(shownWeek - 1, 40\);/);
        expect(home).toMatch(/overrideWeek !== null && !!pregnancyInfo\?\.week && overrideWeek !== displayWeek/);
    });
});

describe('APPT-DEFAULT-TYPE — a new appointment starts on Medical', () => {
    const form = read('src/screens/AddAppointmentScreen.tsx');

    it('new → medical; an edited event keeps its saved category, then the legacy heuristic', () => {
        const init = form.slice(form.indexOf('const initialType = ('), form.indexOf("as 'medical' | 'other';"));
        expect(init).toMatch(/!editingEvent\s*\?\s*'medical'/);
        expect(init).toMatch(/editingEvent\.category === 'medical' \|\| editingEvent\.category === 'other'/);
        expect(init).toMatch(/editingEvent\.type === 'appointment' \? 'medical' : 'other'/);
    });
});
