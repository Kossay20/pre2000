/**
 * Final release round 16 (captures on 329a3f2). Source-level checks, like the earlier
 * finalReleaseR*.test.ts files: the repo ships no React renderer.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

describe('C-072 / E 35-scale-home: the Home quick actions wrap instead of clipping', () => {
    // "Rendez-vous" / "Nouveau RDV" replaced the clipped abbreviations, and at 280 pt with
    // large text they truncated to "Rendez-v…" / "Nouveau …" on a single line.
    const src = read('../HomeScreen.tsx');
    const pills = src.match(/<Text style=\{styles\.quickActionPillLabel\}[^>]*>/g) ?? [];

    it('has the four pill labels, each allowed a second line', () => {
        expect(pills).toHaveLength(4);
        pills.forEach((p) => expect(p).toMatch(/numberOfLines=\{2\}/));
    });

    it('centres a wrapped label in its pill', () => {
        const styles = read('../HomeScreen.styles.ts');
        expect(styles).toMatch(/quickActionPillLabel: \{[^}]*textAlign: 'center'/s);
    });
});

describe('B-057: the Health screen asks for the glucose unit before any alert', () => {
    const src = read('../HealthDashboardScreen.tsx');
    const handler = src.slice(src.indexOf('const handleAddGlucose'), src.indexOf('const handleToggleSymptom'));

    it('asks g/L or mmol/L first, and only then runs the clinical check', () => {
        expect(handler).toMatch(/glucoseLooksLikeGramsPerLitre\(value\)/);
        expect(handler.indexOf('glucoseLooksLikeGramsPerLitre')).toBeLessThan(handler.indexOf('checkGlucose('));
        expect(handler).toMatch(/gramsPerLitreToMmol\(value\)/);
    });

    it('writes the g/L figure with two decimals, so 0,92 is not shown as 0,9', () => {
        // A g/L lab value carries two decimals (0,92 g/L = the 5,1 mmol/L criterion); the one-decimal
        // `num` printed "0,9 g/L = 5,1 mmol/L", which is not even true (0,9 g/L = 5,0 mmol/L).
        expect(src).toMatch(/const numGl = \(value: number\) => formatDecimal\(Number\(value\), i18n\.language, 2\)/);
        expect(handler).toMatch(/value: numGl\(value\)/);
        expect(handler).toMatch(/original: numGl\(value\)/);
        expect(handler).not.toMatch(/(value|original): num\(value\)/);
    });

    it('has the dialog copy in the four languages', () => {
        const keys = ['glucoseUnitCheckTitle', 'glucoseUnitCheckMsg', 'glucoseIsMmol', 'glucoseIsGl', 'glucoseConvertedTitle', 'glucoseConvertedMsg'];
        for (const lang of ['fr', 'en', 'ar', 'tn']) {
            const d = JSON.parse(read(`../../i18n/locales/${lang}/dashboard.json`));
            keys.forEach((k) => expect(typeof d[k]).toBe('string'));
            expect(d.glucoseUnitCheckMsg).toContain('{{value}}');
            expect(d.glucoseUnitCheckMsg).toContain('{{converted}}');
            expect(d.glucoseConvertedMsg).toContain('{{original}}');
        }
    });
});

describe('B-023: one way to say a day in French — "8 octobre", not "08 octobre"', () => {
    it('the week strip names its days without a leading zero, like the Home upcoming list', () => {
        const strip = read('../../components/calendar/WeeklyStrip.tsx');
        expect(strip).toMatch(/const a11yLabel = format\(date, 'EEEE d MMMM'/);
        expect(strip).not.toMatch(/'EEEE dd MMMM'/);
        expect(read('../HomeScreen.tsx')).toMatch(/'d MMMM, HH:mm'/);
    });
});
