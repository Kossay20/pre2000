/**
 * The supplement "Source" line reads in the reader's language: no French "OMS" or
 * "Source :" on the English and Arabic screens, and an Arabic list separator in ar/tn.
 */
import i18next, { type i18n as I18n } from 'i18next';
import fr from '../../i18n/locales/fr';
import en from '../../i18n/locales/en';
import ar from '../../i18n/locales/ar';
import tn from '../../i18n/locales/tn';
import supplements from '../../data/supplements_db.json';
import { formatSupplementSources } from '../supplementSources';

let inst: I18n;
beforeAll(async () => {
    inst = i18next.createInstance();
    await inst.init({
        resources: {
            fr: { translation: fr as any }, en: { translation: en as any },
            ar: { translation: ar as any }, tn: { translation: tn as any },
        },
        lng: 'fr', fallbackLng: 'fr', interpolation: { escapeValue: false },
    });
});

const line = (raw: string, lng: string) => formatSupplementSources(raw, inst.getFixedT(lng), lng);

describe('formatSupplementSources', () => {
    it.each([
        ['fr', 'Source\u00a0: OMS 2023, ACOG, NHS'],
        ['en', 'Source: WHO 2023, ACOG, NHS'],
        ['ar', 'المصدر: منظمة الصحة العالمية 2023، ACOG، NHS'],
        ['tn', 'المصدر: منظمة الصحة العالمية 2023، ACOG، NHS'],
    ])('%s: translates the WHO and keeps its year', (lng, expected) => {
        expect(line('OMS 2023, ACOG, NHS', lng)).toBe(expected);
    });

    it('translates the Cochrane review', () => {
        expect(line('Revue Cochrane 2018, WAO, WGO 2017', 'en')).toBe('Source: Cochrane Review 2018, WAO, WGO 2017');
        expect(line('Revue Cochrane 2018, WAO', 'ar')).toBe('المصدر: مراجعة كوكرين 2018، WAO');
    });

    it.each(['en', 'ar', 'tn'])('%s: no supplement prints a French source name or "Source :"', (lng) => {
        const leaks = (supplements as Array<{ supplement_id: string; sources?: string }>)
            .filter(s => s.sources)
            .map(s => [s.supplement_id, line(s.sources as string, lng)] as const)
            .filter(([, text]) => /\bOMS\b|\bRevue\b|Source :/.test(text));
        expect(leaks).toEqual([]);
    });
});
