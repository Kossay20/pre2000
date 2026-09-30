/**
 * Resources / chatbot UI guards (final-release wave C: chat RTL bubble, GJ-007, GJ-008,
 * GJ-011, Favoris toggle state). These screens are .tsx with JSX, which ts-jest cannot
 * load here and the repo ships no React renderer, so — like authFunnelUi.test.ts — the
 * fixes are locked at source level, plus behavioural checks on the locale files.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const home = (lng: string) => JSON.parse(read(`src/i18n/locales/${lng}/home.json`));

describe('chat — the user bubble mirrors in ar/tn', () => {
    const src = read('src/screens/ChatbotScreen.tsx');

    it('relies on logical flex-end for the user bubble, with no per-language alignSelf swap', () => {
        expect(src).toMatch(/userMessage: \{\s*alignSelf: 'flex-end'/);
        expect(src).toMatch(/botMessage: \{\s*alignSelf: 'flex-start'/);
        expect(src).not.toMatch(/isRTL\s*\?\s*\(isUser/);
        expect(src).not.toMatch(/bubbleAlign/);
    });
});

describe('GJ-007 — suggestion chips keep an 8px+ inset from both screen edges', () => {
    const src = read('src/screens/ChatbotScreen.tsx');

    it('pads the chip row content symmetrically (same in LTR and RTL)', () => {
        expect(src).toMatch(/contentContainerStyle=\{styles\.suggestionsContent\}/);
        expect(src).toMatch(/suggestionsContent: \{\s*paddingHorizontal: theme\.spacing\.s,/);
        // 8 padding + the chip's 4 margin: never flush against the edge.
        expect(src).toMatch(/suggestionButton: \{[^}]*marginHorizontal: theme\.spacing\.xs/);
    });
});

describe('GJ-008 — one back control on Article / Supplement detail', () => {
    it.each(['src/screens/ArticleDetailScreen.tsx', 'src/screens/SupplementDetailScreen.tsx'])(
        '%s shows its in-body back only when the stack header has none',
        (file) => {
            const src = read(file);
            expect(src).toMatch(/const showInlineBack = useNavigationState\(state => state\.routes\[0\]\?\.key === route\.key\);/);
            const backAt = src.indexOf('style={styles.backButton}');
            expect(backAt).toBeGreaterThan(-1);
            const guard = src.lastIndexOf('{showInlineBack && (', backAt);
            expect(guard).toBeGreaterThan(-1);
            expect(src.slice(guard, backAt)).not.toMatch(/<\/TouchableOpacity>/);
        },
    );
});

describe('GJ-011 — Baby evolution footer matches the tap-a-dot navigation', () => {
    it('uses the tap copy, not the swipe copy', () => {
        const src = read('src/screens/BabyEvolutionScreen.tsx');
        expect(src).toContain("t('home.tapDotToSee')");
        expect(src).not.toContain('swipeToSee');
    });

    it.each(LOCALES)('%s has the footer copy and no swipe wording', (lng) => {
        const copy = home(lng).tapDotToSee;
        expect(typeof copy).toBe('string');
        expect(copy.trim().length).toBeGreaterThan(0);
        expect(copy).not.toMatch(/balayez|glissez|swipe|اسحب/i);
        expect(home(lng).swipeToSee).toBeUndefined();
    });
});

describe('Favoris chip exposes its toggled state', () => {
    it('sets aria-pressed on web (RN-Web drops accessibilityState)', () => {
        const src = read('src/screens/ArticlesListScreen.tsx');
        const favAt = src.indexOf('onPress={() => setFavoritesActive(v => !v)}');
        const end = src.indexOf('>', src.indexOf("accessibilityLabel={t('common.favorites')}", favAt));
        const props = src.slice(favAt, end);
        expect(props).toMatch(/accessibilityState=\{\{ selected: favoritesActive \}\}/);
        expect(props).toMatch(/Platform\.OS === 'web' \? \{ 'aria-pressed': favoritesActive \}/);
    });
});

describe('article search is accent-insensitive', () => {
    it('filters through matchesSearch', () => {
        const src = read('src/screens/ArticlesListScreen.tsx');
        expect(src).toMatch(/import \{ matchesSearch \} from '\.\.\/utils\/searchNormalize';/);
        expect(src).toMatch(/return matchesSearch\(query, \[/);
    });
});
