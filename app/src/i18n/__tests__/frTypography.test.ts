/**
 * French puts a space before ":", ";", "?" and "!". With a plain space the mark can
 * wrap alone to the start of the next line (": impossible de les retrouver…" on the
 * guest disclaimer at 375pt), so fr strings use a no-break space (U+00A0, or the
 * narrow U+202F) there. The same goes for the spaces inside « » — at 320pt the consent
 * sheet ended a line on a lone "«".
 *
 * The locale files carry the no-break spaces themselves. The content data (src/data,
 * and its copies in Firestore) keeps plain spaces and gets them from frenchSpacing when
 * it is read for display, so the data suite below checks the helper's output.
 */
import fs from 'fs';
import path from 'path';
import { frenchSpacing, getLocalizedContent, getLocalizedTrilang } from '../../utils/i18nHelpers';

jest.mock('../index', () => ({ __esModule: true, default: { language: 'fr' } }));

const FR_DIR = path.join(__dirname, '..', 'locales', 'fr');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PLAIN_SPACE_BEFORE_MARK = /\S [:;?!]/;
const PLAIN_SPACE_IN_GUILLEMETS = /« | »/;
const NBSP = '\u00a0';

function collect(node: unknown, trail: string, out: string[], rule: RegExp = PLAIN_SPACE_BEFORE_MARK): void {
    if (typeof node === 'string') {
        if (rule.test(node)) out.push(`${trail} → ${JSON.stringify(node)}`);
    } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) collect(value, `${trail}.${key}`, out, rule);
    }
}

describe('fr locale typography', () => {
    it('has no plain space before : ; ? ! (use U+00A0)', () => {
        const offenders: string[] = [];
        for (const file of fs.readdirSync(FR_DIR).filter((f) => f.endsWith('.json'))) {
            const json = JSON.parse(fs.readFileSync(path.join(FR_DIR, file), 'utf8'));
            collect(json, file, offenders);
        }
        expect(offenders).toEqual([]);
    });

    it('has no plain space inside « » (use U+00A0)', () => {
        const offenders: string[] = [];
        for (const file of fs.readdirSync(FR_DIR).filter((f) => f.endsWith('.json'))) {
            const json = JSON.parse(fs.readFileSync(path.join(FR_DIR, file), 'utf8'));
            collect(json, file, offenders, PLAIN_SPACE_IN_GUILLEMETS);
        }
        expect(offenders).toEqual([]);
    });

    it('the guillemet rule catches a plain space and accepts a no-break one', () => {
        expect(PLAIN_SPACE_IN_GUILLEMETS.test('choisissez « Supprimer mon compte » ci-dessous')).toBe(true);
        expect(PLAIN_SPACE_IN_GUILLEMETS.test(`choisissez «${NBSP}Supprimer mon compte${NBSP}» ci-dessous`)).toBe(false);
    });

    it('the rule catches a plain space and accepts a no-break one', () => {
        expect(PLAIN_SPACE_BEFORE_MARK.test('à ce téléphone : impossible')).toBe(true);
        expect(PLAIN_SPACE_BEFORE_MARK.test('à ce téléphone : impossible')).toBe(false);
        expect(PLAIN_SPACE_BEFORE_MARK.test('Rendez-vous à 10:30')).toBe(false);
    });
});

describe('fr content data typography (frenchSpacing)', () => {
    it('puts a no-break space before : ; ? ! and inside « »', () => {
        expect(frenchSpacing('Incroyable : Je prends beaucoup de place, désolé pour tes côtes !'))
            .toBe(`Incroyable${NBSP}: Je prends beaucoup de place, désolé pour tes côtes${NBSP}!`);
        expect(frenchSpacing('On est à la moitié ! Je suis grand.')).toBe(`On est à la moitié${NBSP}! Je suis grand.`);
        expect(frenchSpacing('Vraiment ?! Oui ; bien sûr.')).toBe(`Vraiment${NBSP}?! Oui${NBSP}; bien sûr.`);
        expect(frenchSpacing('dit « à terme » en France')).toBe(`dit «${NBSP}à terme${NBSP}» en France`);
        expect(frenchSpacing('**Attention** : appelez (pourquoi ?)')).toBe(`**Attention**${NBSP}: appelez (pourquoi${NBSP}?)`);
    });

    it('leaves URLs, times, markdown table rules and already-spaced text alone', () => {
        for (const text of [
            'Voir https://www.has-sante.fr/jcms/c_547976/fr/suivi',
            'Rendez-vous à 10:30',
            '| Aliment | Risque |\n| :--- | :---: |',
            `Déjà fait${NBSP}: rien à changer${NBSP}!`,
            '- Calcium : 1000 mg'.replace(' :', `${NBSP}:`),
        ]) expect(frenchSpacing(text)).toBe(text);
    });

    it('is applied to French content only, and can be turned off for text that is matched, not shown', () => {
        const chip = { label_fr: 'Puis-je faire du sport ?', label_en: 'Can I exercise ?' };
        expect(getLocalizedContent(chip, 'label', 'fr')).toBe(`Puis-je faire du sport${NBSP}?`);
        expect(getLocalizedContent(chip, 'label', 'fr', { plainSpaces: true })).toBe('Puis-je faire du sport ?');
        expect(getLocalizedContent(chip, 'label', 'en')).toBe('Can I exercise ?');
        // A language with no text of its own falls back to English first, then French.
        expect(getLocalizedContent({ label_fr: 'Ça va ?' }, 'label', 'ar')).toBe(`Ça va${NBSP}?`);
        expect(getLocalizedTrilang({ fr: 'Bravo !', en: 'Well done !' }, 'fr')).toBe(`Bravo${NBSP}!`);
        expect(getLocalizedTrilang({ fr: 'Bravo !', en: 'Well done !' }, 'en')).toBe('Well done !');
    });

    // Every French field of the bundled content, as the screens read it: `*_fr` keys,
    // the `fr` leg of a trilang object and the Ramadan guidance's bare `key_risks`.
    const isFrenchField = (key: string) => key === 'fr' || key.endsWith('_fr') || key === 'key_risks';

    function collectFrench(node: unknown, trail: string, french: boolean, out: { trail: string; text: string }[]): void {
        if (typeof node === 'string') {
            if (french) out.push({ trail, text: node });
        } else if (Array.isArray(node)) {
            node.forEach((value, i) => collectFrench(value, `${trail}[${i}]`, french, out));
        } else if (node && typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                collectFrench(value, `${trail}.${key}`, isFrenchField(key), out);
            }
        }
    }

    const dataFiles = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));

    it('covers the content data files', () => {
        expect(dataFiles).toEqual(expect.arrayContaining(['weeks_db.json', 'articles_db.json', 'REMINDERS_V2.json']));
    });

    it.each(dataFiles)('%s: no French field is left with a plain space before a mark or inside « »', (file) => {
        const fields: { trail: string; text: string }[] = [];
        collectFrench(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')), file, false, fields);
        const offenders: string[] = [];
        const brokenUrls: string[] = [];
        for (const { trail, text } of fields) {
            const shown = frenchSpacing(text);
            if (PLAIN_SPACE_BEFORE_MARK.test(shown) || PLAIN_SPACE_IN_GUILLEMETS.test(shown)) offenders.push(trail);
            // Only spaces change: same length, and no URL gains a no-break space.
            if (shown.length !== text.length || /https?:\/\/\S*\u00a0/.test(shown)) brokenUrls.push(trail);
        }
        expect(offenders).toEqual([]);
        expect(brokenUrls).toEqual([]);
    });
});
