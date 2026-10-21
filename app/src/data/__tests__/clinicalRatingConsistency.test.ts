/**
 * A rating must not contradict the text printed under it.
 *
 * The badge is what a reader takes in at a glance; the details are what they read
 * if they open the card. When the badge says "Limit" and the details say "Avoid",
 * or the supplements screen rates vitamin A "With caution" while the foods screen
 * rates the same retinol supplements "Avoid", the reader gets the weaker answer
 * from whichever screen she happens to open. Every inconsistency found was settled
 * in the stricter direction and listed for clinician sign-off in
 * docs/clinical-review/CONSISTENCY_CHANGES.md; these tests keep a new one from
 * shipping. They check agreement between the app's own statements, not the
 * statements themselves — that is the clinician's job.
 */
import foods from '../forbidden_foods.json';
import supplements from '../supplements_db.json';
import frFoods from '../../i18n/locales/fr/forbiddenFoods.json';
import enFoods from '../../i18n/locales/en/forbiddenFoods.json';
import arFoods from '../../i18n/locales/ar/forbiddenFoods.json';
import tnFoods from '../../i18n/locales/tn/forbiddenFoods.json';
import frCommon from '../../i18n/locales/fr/common.json';
import enCommon from '../../i18n/locales/en/common.json';
import arCommon from '../../i18n/locales/ar/common.json';
import tnCommon from '../../i18n/locales/tn/common.json';

type Food = { id: string; name_fr: string; severity: string; [k: string]: string };
type Supp = { supplement_id: string; pregnancy_safety: string; [k: string]: string };

const FOODS = foods as Food[];
const SUPPS = supplements as unknown as Supp[];
const STRICT = new Set(['critical', 'high']);
const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;

// The imperative "avoid" as the app writes it in each locale.
const AVOID_IN_TEXT = /\b(é|e)vit(er|ez)\b|\bavoid\b|تجنّ?ب/i;

const ownText = (item: Record<string, string>, fields: string[]) =>
    fields.flatMap(f => LOCALES.map(l => item[`${f}_${l}`] || '')).join(' \n ');

const food = (id: string) => {
    const f = FOODS.find(x => x.id === id);
    if (!f) throw new Error(`forbidden_foods.json has no "${id}"`);
    return f;
};
const supp = (id: string) => {
    const s = SUPPS.find(x => x.supplement_id === id);
    if (!s) throw new Error(`supplements_db.json has no "${id}"`);
    return s;
};

describe('forbidden foods: badge agrees with the item\'s own text', () => {
    it('an item whose details or alternative say "avoid" is badged avoid or stricter', () => {
        const offenders = FOODS
            .filter(f => AVOID_IN_TEXT.test(ownText(f, ['details', 'alternative'])))
            .filter(f => !STRICT.has(f.severity))
            .map(f => `${f.id}: ${f.severity}`);
        expect(offenders).toEqual([]);
    });

    it('a food named in two items gets the same rating in both', () => {
        // "lait cru" is its own item (avoid); the raw-milk feta/goat-cheese item may not
        // read softer. Same for pâté, listed under both charcuterie and rillettes.
        expect(food('feta_goat').severity).toBe(food('raw_milk_cheese').severity);
        expect(food('rillettes').severity).toBe(food('charcuterie').severity);
    });

    it('swordfish and shark are badged avoid, as the ANSES advice the screen cites says', () => {
        const mercury = food('high_mercury_fish');
        expect(mercury.name_fr).toMatch(/espadon/);
        expect(mercury.name_fr).toMatch(/requin/);
        expect(STRICT.has(mercury.severity)).toBe(true);
        expect(mercury.details_fr).not.toMatch(/^[^.]*\.\s*Limiter/);
    });
});

describe('supplements: rating agrees with the supplement\'s own text and the foods screen', () => {
    it('a supplement whose text says supplementation should be avoided is rated deconseille', () => {
        const SAYS_AVOID_SUPPLEMENTING = /suppl[ée]mentation (doit|should) (être évitée|be avoided)/i;
        const offenders = SUPPS
            .filter(s => SAYS_AVOID_SUPPLEMENTING.test(ownText(s, ['typical_dose_text', 'pregnancy_notes', 'precautions'])))
            .filter(s => s.pregnancy_safety !== 'deconseille')
            .map(s => `${s.supplement_id}: ${s.pregnancy_safety}`);
        expect(offenders).toEqual([]);
    });

    it('vitamin A is rated "avoid" on the supplements screen, as retinol supplements are on the foods screen', () => {
        expect(STRICT.has(food('vitamin_a_supplements').severity)).toBe(true);
        expect(supp('s11_vitamine_a').pregnancy_safety).toBe('deconseille');
    });

    it('both screens use the same word for "avoid" in every locale', () => {
        const pairs = [
            [frFoods, frCommon],
            [enFoods, enCommon],
            [arFoods, arCommon],
            [tnFoods, tnCommon],
        ] as const;
        for (const [ff, common] of pairs) {
            const foodsLabel = ff.severity.high.replace(/^\p{Extended_Pictographic}\s*/u, '');
            expect(common.supplementSafety.avoid).toBe(foodsLabel);
        }
    });
});
