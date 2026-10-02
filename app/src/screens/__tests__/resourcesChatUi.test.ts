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
        // Favoris is now one choice of the single-selection filter row (utils/filterChips);
        // its lit state is still what both platforms announce.
        const favAt = src.indexOf("onPress={() => setFilter(f => pressFilterChip(f, { type: 'favorites' }))}");
        expect(favAt).toBeGreaterThan(-1);
        expect(src).toMatch(/const favoritesActive = filter\.favorites;/);
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

describe('Home — the size comparison has its own label', () => {
    it('does not cut the onboarding sentence in two', () => {
        // "Votre bébé fait la taille / d'" sat above a bare "Concombre (42,4 cm)".
        const src = read('src/screens/HomeScreen.tsx');
        expect(src).toContain("t('home.sizeComparisonLabel')");
        expect(src).not.toMatch(/babySize'[^)]*\)\.split\(/);
    });

    it.each(LOCALES)('%s label is a whole phrase with no dangling article', (lng) => {
        const label: string = home(lng).sizeComparisonLabel;
        expect(label.trim().length).toBeGreaterThan(3);
        expect(label).not.toMatch(/\n|\{\{|d['’]\s*$|un\(e\)/);
    });
});

describe('week recommendations — article excerpts are plain text', () => {
    it('strips markdown from the summary ("# L\'accouchement…" showed its "#")', () => {
        const src = read('src/screens/WeekRecommendationsScreen.tsx');
        expect(src).toMatch(/getLocalizedContent\(article, 'summary', i18n\.language, \{ stripMarkdown: true \}\)/);
    });
});

describe('ForbiddenFoods — category chips', () => {
    const src = read('src/screens/ForbiddenFoodsScreen.tsx');

    it('follow the page direction (no forced dir=ltr on the row)', () => {
        expect(src).not.toContain('useRtlScrollFix');
    });

    it('expose role and selected state, and centre their label', () => {
        expect(src.match(/accessibilityRole="button"\s+accessibilityState=\{\{ selected: selectedCategory === (null|cat\.id) \}\}/g)).toHaveLength(2);
        const chip = src.slice(src.indexOf('categoryChip: {'), src.indexOf('categoryChipActive: {'));
        expect(chip).toMatch(/justifyContent: 'center'/);
    });

    it('C-031 — "All" and every category say on web whether they are the lit one', () => {
        expect(src).toMatch(/accessibilityState=\{\{ selected: selectedCategory === null \}\}[^>]*?\{\.\.\.\(Platform\.OS === 'web' \? \{ 'aria-pressed': selectedCategory === null \} : \{\}\)\}/);
        expect(src).toMatch(/accessibilityState=\{\{ selected: selectedCategory === cat\.id \}\}[^>]*?\{\.\.\.\(Platform\.OS === 'web' \? \{ 'aria-pressed': selectedCategory === cat\.id \} : \{\}\)\}/);
    });
});

describe('C-031 — no toggle chip leaves its state to accessibilityState alone', () => {
    // react-native-web drops accessibilityState.selected, so a filter chip, a pager dot or
    // a language option whose only state is that prop is a plain button to a web screen
    // reader. Each must carry the web attribute beside it.
    it.each<[string, string[]]>([
        ['src/screens/ArticlesListScreen.tsx', ['favoritesActive', 'selected']],
        ['src/screens/SupplementsListScreen.tsx', ['favoritesActive', 'allSelected', 'selected']],
        ['src/screens/BabyEvolutionScreen.tsx', ['activeMonth === index + 1']],
        ['src/components/common/LanguageSelector.tsx', ['i18n.language === lang.code']],
    ])('%s', (file, states) => {
        const src = read(file);
        expect(src).toMatch(/import \{[^}]*\bPlatform\b[^}]*\} from 'react-native';/);
        for (const state of states) {
            expect(src).toContain(`{...(Platform.OS === 'web' ? { 'aria-pressed': ${state} } : {})}`);
        }
        const native = src.match(/accessibilityState=\{\{ selected\b/g) ?? [];
        const web = src.match(/Platform\.OS === 'web' \? \{ 'aria-pressed':/g) ?? [];
        // The bookmark and show-password buttons are not counted here: none lives in these files.
        expect(web).toHaveLength(native.length);
    });
});

describe('ForbiddenFoods — rating badges are readable', () => {
    const src = read('src/screens/ForbiddenFoodsScreen.tsx');

    it('pairs dark text with a light tint of the same hue (pairs pinned in the theme contrast test)', () => {
        const map = src.slice(src.indexOf('const severityBadgeColors'), src.indexOf('};', src.indexOf('const severityBadgeColors')));
        expect(map).toMatch(/critical: \{ text: theme\.colors\.red800, background: theme\.colors\.surfaceRose \}/);
        expect(map).toMatch(/high: \{ text: theme\.colors\.deepOrange900, background: theme\.colors\.surfaceOrangeTint \}/);
        expect(map).toMatch(/medium: \{ text: theme\.colors\.warningTextDark, background: theme\.colors\.surfaceAmberTint \}/);
        expect(map).toMatch(/low: \{ text: theme\.colors\.green800, background: theme\.colors\.surfaceGreenTint \}/);
    });

    it('no longer washes the label colour into its own background', () => {
        expect(src).not.toMatch(/severityColors\[food\.severity\] \+ '20'/);
        expect(src).toMatch(/backgroundColor: severityBadgeColors\[food\.severity\]\.background/);
        expect(src).toMatch(/color: severityBadgeColors\[food\.severity\]\.text/);
    });
});

describe('ArticleDetail — an article that is hidden or gone', () => {
    const src = read('src/screens/ArticleDetailScreen.tsx');
    const branch = src.slice(src.indexOf('if (!article) {'), src.indexOf('// Use shared helper for consistent localization'));

    it('renders the shared empty state on the app background, with a way back and a way on', () => {
        expect(branch).toContain('styles.notFoundContainer');
        expect(branch).toMatch(/<EmptyState[\s\S]*title=\{t\('article\.notFound'\)\}[\s\S]*subtitle=\{t\('article\.notFoundHint'\)\}/);
        expect(branch).toMatch(/accessibilityLabel=\{t\('a11y\.back'\)\}/);
        expect(branch).toMatch(/navigation\.canGoBack\(\) \? navigation\.goBack\(\) : openArticles\(\)/);
        expect(branch).toMatch(/navigate\('Ressources', \{ screen: 'ResourcesMain' \}\)/);
        expect(src).toMatch(/notFoundContainer: \{\s*flex: 1,\s*backgroundColor: theme\.colors\.background,/);
    });

    it.each(LOCALES)('%s has the explanation and the action', (lng) => {
        const article = JSON.parse(read(`src/i18n/locales/${lng}/common.json`)).article;
        expect(article.notFoundHint.length).toBeGreaterThanOrEqual(20);
        expect(article.browseArticles.trim().length).toBeGreaterThan(0);
    });
});
