/**
 * Round-18 fixes pinned at source level (the screens need a full RN renderer to mount).
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

describe('B-058: replacing today\'s weighing never loses it', () => {
    const src = read('../WeightTrackerScreen.tsx');
    const save = src.slice(src.indexOf('const saveAndConfirm'), src.indexOf('const handleSaveSetup'));
    const validation = src.slice(src.indexOf('const continueValidation'), src.indexOf('const saveAndConfirm'));

    it('saves the new weighing first and only then removes the old one', () => {
        expect(save).toMatch(/saveWeightEntry\(/);
        expect(save).toMatch(/deleteWeightEntry\(/);
        expect(save.indexOf('saveWeightEntry(')).toBeLessThan(save.indexOf('deleteWeightEntry('));
        // the old code deleted before saving
        expect(validation).not.toMatch(/await deleteWeightEntry/);
        expect(validation).toMatch(/saveAndConfirm\(weight, existingToday\)/);
    });

    it('keeps the saved weighing when only the cleanup of the old one fails', () => {
        const afterSave = save.slice(save.indexOf('deleteWeightEntry('));
        expect(save.slice(save.indexOf('saveWeightEntry('), save.indexOf('deleteWeightEntry('))).not.toMatch(/return;/);
        expect(afterSave).toMatch(/catch/);
    });
});

describe('C-077: the week-recommendation article cards are buttons with a name', () => {
    const src = read('../WeekRecommendationsScreen.tsx');
    const articles = src.slice(src.indexOf('articles.map('), src.indexOf('supplements.length > 0'));

    it('exposes role, name and hint, and hides the decorative icon', () => {
        expect(articles).toMatch(/accessibilityRole="button"/);
        expect(articles).toMatch(/accessibilityLabel=\{getLocalizedContent\(article, 'title', i18n\.language\)\}/);
        expect(articles).toMatch(/accessibilityHint=\{t\('a11y\.readArticle'\)\}/);
        expect(articles).toMatch(/accessibilityElementsHidden/);
        expect(articles).toMatch(/importantForAccessibility="no-hide-descendants"/);
    });
});

describe('C-078: a foods-to-avoid card announces whether it is expanded', () => {
    const src = read('../ForbiddenFoodsScreen.tsx');
    const card = src.slice(src.indexOf('filteredFoods.map(food'), src.indexOf('{isExpanded && ('));

    it('is a button with an expanded state (aria-expanded on web) and a spoken name', () => {
        expect(card).toMatch(/accessibilityRole="button"/);
        expect(card).toMatch(/accessibilityState=\{\{ expanded: isExpanded \}\}/);
        expect(card).toMatch(/'aria-expanded': isExpanded/);
        expect(card).toMatch(/accessibilityLabel=\{`\$\{getLocalizedContent\(food, 'name', i18n\.language\)\}, \$\{t\(`forbiddenFoods\.severity\.\$\{food\.severity\}`\)\}`\}/);
    });

    it('does not read the ▲/▼ glyph out', () => {
        expect(card).toMatch(/<Text style=\{styles\.expandIcon\} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">/);
    });
});

describe('C-079: the chatbot call buttons are named by what they show, number included', () => {
    const src = read('../ChatbotScreen.tsx');

    it('uses the visible label and the number on the bubble button and the pinned one', () => {
        const named = src.match(/accessibilityLabel=\{`\$\{t\('common\.chatEmergencyAction'\)\} \(\$\{emergencyNumberLabel\(t, emergencyContact\)\}\)`\}/g) ?? [];
        expect(named).toHaveLength(2);
        expect(src).not.toMatch(/accessibilityLabel=\{t\('a11y\.emergencyCall'\)\}/);
    });
});

describe('F-045: the owner runbook tells how the Firebase native files reach an EAS build', () => {
    const doc = read('../../../docs/RELEASE_READINESS_2026-08-19.md');
    const config = read('../../../app.config.ts');

    it('names the same two EAS file variables as app.config.ts', () => {
        for (const name of ['GOOGLE_SERVICES_JSON', 'GOOGLE_SERVICE_INFO_PLIST']) {
            expect(config).toContain(`'${name}'`);
            expect(doc).toContain(`--name ${name} --type file`);
        }
    });

    it('no longer claims that dropping the files at the root of app/ is enough for an EAS build', () => {
        expect(doc).not.toMatch(/puis racine de `app\/`/);
    });
});
