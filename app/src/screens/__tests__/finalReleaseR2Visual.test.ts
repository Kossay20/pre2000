/**
 * Final-release round 2 — visual and form findings (E-023, E-036, E-038, E-039, E-041,
 * E-006, A-026, A-027, A-028, A-031).
 *
 * Components are .tsx with JSX, which ts-jest cannot load under the Expo tsconfig (see
 * authFunnelUi.test.ts), so props are locked at source level and style objects by value.
 */
import * as fs from 'fs';
import * as path from 'path';
import { theme } from '../../theme';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.resolve(SRC, '..', rel), 'utf8');

function luminance(hex: string): number {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (fg: string, bg: string) => {
    const [a, b] = [luminance(fg), luminance(bg)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) return d.name === '__tests__' ? [] : walk(p);
        return /\.tsx$/.test(d.name) ? [p] : [];
    });

describe('E-023 — every placeholder has a real colour', () => {
    // Without placeholderTextColor, RN-web paints the placeholder in the text colour (it
    // looks like a typed value) and iOS uses its own ≈1.7:1 grey. Every TextInput that
    // shows a placeholder sets one from the theme, readable on the input's surface.
    const inputs = walk(SRC).flatMap((file) => {
        const src = fs.readFileSync(file, 'utf8');
        const out: Array<{ where: string; props: string }> = [];
        const re = /<TextInput\b([\s\S]*?)(?:\/>|\n\s*>)/g; // the opening tag ends at "/>" or a lone ">" (props hold "=>")
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
            if (/placeholder=/.test(m[1])) out.push({ where: `${path.relative(SRC, file)}:${src.slice(0, m.index).split('\n').length}`, props: m[1] });
        }
        return out;
    });

    it('finds the app’s inputs', () => {
        expect(inputs.length).toBeGreaterThan(25);
    });

    it.each(inputs.map((i) => [i.where, i.props]))('%s sets an AA placeholderTextColor', (_where, props) => {
        const m = /placeholderTextColor=\{theme\.colors\.(\w+)\}/.exec(props as string);
        expect(m).not.toBeNull();
        const token = (theme.colors as Record<string, string>)[m![1]];
        // The palest input surface the app uses is lavenderBlush (Hydration card).
        expect(contrast(token, theme.colors.white)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(token, theme.colors.lavenderBlush)).toBeGreaterThanOrEqual(4.5);
    });
});

const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const locale = (lng: string, ns: string) => JSON.parse(read(`src/i18n/locales/${lng}/${ns}.json`));

/** Composite an `rgba(r, g, b, a)` wash over an opaque hex background. */
const over = (rgba: string, bg: string) => {
    const m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)!;
    const a = Number(m[4]);
    const base = bg.replace('#', '');
    return '#' + [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + parseInt(base.slice(k * 2, k * 2 + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
};

/** HomeScreen.styles sizes itself from the window at import: load it for a given width. */
const homeStylesAt = (windowWidth: number) => {
    let styles: any;
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const RN = require('react-native');
        jest.spyOn(RN.Dimensions, 'get').mockReturnValue({ width: windowWidth, height: 900, scale: 2, fontScale: 1 });
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        styles = require('../HomeScreen.styles').styles;
    });
    jest.restoreAllMocks();
    return styles;
};

describe('E-036 — Home quick-action icons are readable on the dark tiles', () => {
    const home = read('src/screens/HomeScreen.tsx');
    const block = home.split('<View style={styles.quickActionsRow}>')[1].split('</View>')[0];

    it('no emoji glyphs (the ➕ painted dark grey, ≈1.3:1): four white line icons', () => {
        expect(block).not.toMatch(/[➕📅🔍]/u);
        const icons = block.match(/<Ionicons name="[\w-]+" size=\{18\} color=\{theme\.colors\.white\}/g) || [];
        expect(icons).toHaveLength(4);
        // "Add" reads as add, not as a second calendar.
        expect((block.match(/name="add-circle-outline"/g) || []).length).toBe(2);
    });

    it('white on the tile clears 3:1 (WCAG 1.4.11) over both ends of the hero', () => {
        for (const stop of [theme.colors.primaryStrong, theme.colors.accent]) {
            expect(contrast(theme.colors.white, over(theme.colors.headerChipBg, stop))).toBeGreaterThanOrEqual(4.5);
        }
    });
});

describe('E-038 — calm colours for information, red kept for danger', () => {
    it('AddTask "Moyenne": amber fill with dark text (not brick red next to "Haute")', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { styles } = require('../../components/tasks/AddTaskModal.styles');
        expect(styles.priorityButtonActiveMedium.backgroundColor).not.toBe(theme.colors.deepOrange900);
        expect(contrast(styles.priorityButtonTextActiveMedium.color, styles.priorityButtonActiveMedium.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        expect(read('src/components/tasks/AddTaskModal.tsx')).toMatch(/priority === 'medium' && styles\.priorityButtonTextActiveMedium/);
    });

    it('the due date on Profile is neutral text, AA on its amber card', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { styles } = require('../ProfileScreen.styles');
        expect(styles.dpaText.color).not.toBe(theme.colors.deepOrange900);
        expect(contrast(styles.dpaText.color, styles.dpaContainer.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    });
});

describe('E-039 / A-031 — Language "Continuer" is a filled primary button', () => {
    const src = read('src/screens/LanguageSelectScreen.tsx');
    const style = (name: string) => src.split(`    ${name}: {`)[1].split('},')[0];

    it('accent fill, white bold label, white arrow', () => {
        expect(src).toMatch(/style=\{styles\.continueButton\}/);
        expect(style('continueButton')).toMatch(/backgroundColor: theme\.colors\.accent,/);
        expect(style('continueButton')).not.toMatch(/borderColor: theme\.colors\.disabled/);
        expect(style('continueButtonText')).toMatch(/color: theme\.colors\.white,/);
        expect(src).toMatch(/variant="arrow" size=\{18\} color=\{theme\.colors\.white\}/);
        expect(contrast(theme.colors.white, theme.colors.accent)).toBeGreaterThanOrEqual(4.5);
    });
});

describe('A-027 — the trilingual subtitle is one line per language', () => {
    it('renders each "•" run as its own line', () => {
        expect(read('src/screens/LanguageSelectScreen.tsx')).toMatch(/t\('common\.chooseLanguageSubtitle'\)\.split\('•'\)\.map/);
    });

    it.each(LOCALES)('%s: three runs, the Arabic phrase whole in one of them', (lng) => {
        const runs = (locale(lng, 'common').chooseLanguageSubtitle as string).split('•').map((r) => r.trim());
        expect(runs).toHaveLength(3);
        runs.forEach((r) => expect(r.length).toBeGreaterThan(0));
        expect(runs).toContain('اختر لغتك');
    });
});

describe('A-028 — Register and Login start under the header', () => {
    it.each(['src/screens/LoginScreen.tsx', 'src/screens/RegisterScreen.tsx'])('%s', (file) => {
        const src = read(file);
        const container = src.split('    container: {')[1].split('},')[0];
        expect(container).not.toMatch(/justifyContent: 'center'/);
        expect(container).not.toMatch(/paddingTop: 60/);
        // Room for the inline back only when it is shown.
        expect(src).toMatch(/contentContainerStyle=\{\[styles\.container, showInlineBack && styles\.containerWithInlineBack\]\}/);
    });
});

describe('A-026 — onboarding step 4: short password placeholder, the rule under the field', () => {
    it.each(LOCALES)('%s: the placeholder no longer carries the rule', (lng) => {
        const ph = locale(lng, 'onboarding').step4.passwordPlaceholder as string;
        expect(ph).not.toMatch(/[0-9(]/);
        expect(ph.length).toBeLessThanOrEqual(14);
        expect(locale(lng, 'auth').passwordMin).toMatch(/10/);
    });

    it('the rule is a static line right after the password field', () => {
        const src = read('src/screens/OnboardingScreen.tsx');
        const after = src.split('testID="onboarding_step4_password"')[1].slice(0, 600);
        expect(after).toMatch(/\{t\('passwordMin'\)\}/);
    });
});

describe('E-006 — Reminders "Modifier" gear is a 44pt target', () => {
    it('min 44×44 on web and native, row kept compact', () => {
        const src = read('src/components/reminders/ReminderCardV2.tsx');
        const style = src.split('    editLink: {')[1].split('},')[0];
        expect(style).toMatch(/minWidth: 44,/);
        expect(style).toMatch(/minHeight: 44,/);
        expect(style).toMatch(/marginVertical: -12,/);
    });
});

describe('E-041 — the tablet column is used, not stretched', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { babyIllustrationSize } = require('../../utils/layout');

    it('the baby illustration grows with the tablet column, phone unchanged', () => {
        expect(babyIllustrationSize(375)).toEqual({ width: 225, height: 240 });
        expect(babyIllustrationSize(720)).toEqual({ width: 420, height: 420 });
        expect(babyIllustrationSize(700)).toEqual({ width: 420, height: 420 });
        expect(read('src/components/home/BabyGrowthCard.tsx')).toMatch(/babyImage: babyIllustrationSize\(width\)/);
    });

    it('Home quick actions: 2×2 on a phone, one row of four across the tablet column', () => {
        const phone = homeStylesAt(390);
        expect(phone.quickActionPill.flexBasis).toBe('45%');
        expect(phone.quickActionsRow.alignSelf).toBeUndefined();
        const tablet = homeStylesAt(1032);
        expect(tablet.quickActionPill.flexBasis).toBe('22%');
        expect(tablet.quickActionsRow.alignSelf).toBe('stretch');
    });

    it('the Calendar week strip is centred within 520pt', () => {
        const src = read('src/components/calendar/WeeklyStrip.tsx');
        const row = src.split('    daysRow: {')[1].split('},')[0];
        expect(row).toMatch(/maxWidth: 520,/);
        expect(row).toMatch(/alignSelf: 'center',/);
        expect(src).toMatch(/<View style=\{styles\.daysRow\}>/);
    });
});
