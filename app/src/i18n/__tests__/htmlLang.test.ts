/**
 * `<html lang>` must be a tag browsers and screen readers resolve to the language on
 * screen. `tn` is the app's key for Tunisian Arabic but the BCP-47 tag of Setswana.
 */
import fs from 'fs';
import path from 'path';
import { htmlLangTag } from '../htmlLang';

describe('htmlLangTag', () => {
    it('publishes Tunisian as ar-TN', () => {
        expect(htmlLangTag('tn')).toBe('ar-TN');
    });

    it.each(['fr', 'en', 'ar'])('leaves %s as it is', (lng) => {
        expect(htmlLangTag(lng)).toBe(lng);
    });

    it.each(['fr', 'en', 'ar', 'tn'])('%s resolves to a tag Intl accepts, in the right script', (lng) => {
        const locale = new Intl.Locale(htmlLangTag(lng)).maximize();
        expect(locale.script).toBe(lng === 'ar' || lng === 'tn' ? 'Arab' : 'Latn');
    });

    it('is what the web document and the locale provider are given', () => {
        const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        expect(read('index.ts')).toMatch(/document\.documentElement\.lang = htmlLangTag\(lng\)/);
        expect(read('LocaleDirectionProvider.web.tsx')).toMatch(/locale=\{htmlLangTag\(i18n\.language\)\}/);
    });
});
