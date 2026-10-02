/**
 * Final release round 9, lot "content": C-056, C-048, E-027, E-026 (article body heading),
 * E-040, E-052. Source-level checks, like finalReleaseR6Fixes.test.ts: the repo ships no
 * React renderer.
 */
import * as fs from 'fs';
import * as path from 'path';
import foods from '../../data/forbidden_foods.json';
import articles from '../../data/articles_db.json';
import { stripLeadingTitleHeading } from '../../utils/articleHeading';
import bundledTemplates from '../../data/calendar_templates_fallback.json';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

describe('C-056: rillettes / pates carry a real alternative', () => {
    const entry = (foods as any[]).find(f => f.id === 'rillettes');

    it('no entry repeats "avoid" as its alternative', () => {
        for (const f of foods as any[]) {
            for (const lang of ['fr', 'en', 'ar', 'tn']) {
                expect(f[`alternative_${lang}`]).not.toMatch(/^(éviter pendant|avoid during|تجنّ?بيها)/i);
            }
        }
    });

    it('offers a safe swap in the four languages', () => {
        for (const lang of ['fr', 'en', 'ar', 'tn']) {
            expect(String(entry[`alternative_${lang}`]).length).toBeGreaterThan(20);
        }
        expect(entry.alternative_fr).toMatch(/conserve stérilisée/);
        expect(entry.alternative_en).toMatch(/sterilised/);
    });

    it('the English name no longer reads as a French dish list', () => {
        expect(entry.name_en).not.toBe(entry.name_fr);
    });
});

describe('C-048: Foods to avoid screen matches the app chrome', () => {
    const src = read('../ForbiddenFoodsScreen.tsx');

    it('uses the app background and the Articles-style search row with a magnifier', () => {
        expect(src).not.toMatch(/backgroundColor: theme\.colors\.surface,\s*\},\s*content:/);
        expect(src).toMatch(/safeArea: \{ flex: 1, backgroundColor: theme\.colors\.background \}/);
        expect(src).toMatch(/styles\.searchIcon[^>]*>🔍</);
    });

    it('the stack header title is sentence case like the page title', () => {
        const fr = JSON.parse(read('../../i18n/locales/fr/common.json'));
        const en = JSON.parse(read('../../i18n/locales/en/common.json'));
        expect(fr.screen.forbiddenFoods).toBe('Aliments à éviter');
        expect(en.screen.forbiddenFoods).toBe('Foods to avoid');
    });
});

describe('E-027: every article category has a vector icon', () => {
    const src = read('../ArticlesListScreen.tsx');
    const map = read('../../utils/categoryIcon.ts');

    it('maps each category of the bundled articles', () => {
        const categories = Array.from(new Set((articles as any[]).map(a => a.category)));
        const missing = categories.filter(c => !new RegExp(`\\b${c}: '[a-z-]+-outline'`).test(map));
        expect(missing).toEqual([]);
    });

    it('draws an Ionicons glyph, not the book emoji placeholder', () => {
        expect(src).not.toMatch(/\|\| '📚'/);
        expect(src).toMatch(/<Ionicons name=\{getCategoryIcon\(item\.category\)\}/);
    });

    it('is the same icon on the week recommendations cards, on a >=3:1 block (C-059 / C-061 / E-062)', () => {
        const rec = read('../WeekRecommendationsScreen.tsx');
        expect(rec).toMatch(/<Ionicons name=\{getCategoryIcon\(article\.category\)\}/);
        expect(rec).not.toContain('>📚<');
        // white on the old #FF8FA3 secondary pink was 2.2:1; primaryStrong is 4.6:1
        expect(src).toMatch(/iconContainer: \{[^}]*primaryStrong/s);
        expect(rec).toMatch(/iconContainer: \{[^}]*width: 70[^}]*primaryStrong/s);
    });
});

describe('E-026: the article body does not repeat the title', () => {
    it('drops an opening heading that repeats the title', () => {
        const body = '# Les symptômes de grossesse : comment les reconnaître\n\nLa grossesse est…';
        expect(stripLeadingTitleHeading(body, 'Les symptômes de grossesse')).toBe('La grossesse est…');
        expect(stripLeadingTitleHeading('## Nausées matinales\nTexte', 'nausees matinales')).toBe('Texte');
    });

    it('keeps an opening heading that says something else', () => {
        const body = '## Quand consulter\n\nTexte';
        expect(stripLeadingTitleHeading(body, 'Nausées matinales')).toBe(body);
    });

    it('only the first line is considered', () => {
        const body = 'Intro\n\n# Nausées matinales\n';
        expect(stripLeadingTitleHeading(body, 'Nausées matinales')).toBe(body);
    });

    it('is applied on the detail screen', () => {
        expect(read('../ArticleDetailScreen.tsx')).toMatch(/stripLeadingTitleHeading\(sanitizeContent\(rawContent\), title\)/);
    });
});

describe('E-040: chatbot chips show the French no-break space before "?"', () => {
    const src = read('../ChatbotScreen.tsx');

    it('displays the spaced label but still sends the stored, plain one', () => {
        expect(src).toMatch(/<Text style=\{styles\.suggestionText\}>\{getSuggestionDisplayLabel\(item\)\}<\/Text>/);
        expect(src).toMatch(/handleSend\(getSuggestionLabel\(item\)\)/);
    });
});

describe('E-052: offline calendar suggestions', () => {
    it('ships bundled week templates', () => {
        expect(bundledTemplates.length).toBeGreaterThan(0);
        for (const t of bundledTemplates as any[]) {
            expect(typeof t.template_id).toBe('string');
            expect(t.week_min).toBeLessThanOrEqual(t.week_max);
        }
    });

    it('the service falls back to them when the Firestore read fails', () => {
        const src = read('../../services/calendarService.ts');
        expect(src).toMatch(/using the bundled templates[\s\S]*return getBundledCalendarTemplates\(\);/);
    });
});
