/**
 * Journal PDF (D-046, D-056, D-057): one date style, locale decimals, header alignment that
 * follows the document direction. generateHTML is private, so the HTML handed to
 * Print.printToFileAsync is inspected.
 */
import { fr } from 'date-fns/locale';
import { arSA } from 'date-fns/locale';

const mockPrintToFile = jest.fn();
jest.mock('expo-print', () => ({ printToFileAsync: (...a: unknown[]) => mockPrintToFile(...a) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ deleteAsync: jest.fn(async () => undefined) }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../../i18n', () => ({ __esModule: true, default: { language: 'fr' } }));
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { generateAndSharePDF } from '../pdfExportService';

const t = ((key: string) => key) as any;
const data = {
    profile: { firstName: 'Amel', country: 'FR', lmp: '2026-02-27T00:00:00.000Z', dpa: '2026-12-04T00:00:00.000Z' } as any,
    weightHistory: [{ date: '2026-10-03T10:00:00.000Z', weight: 68.4 }],
    appointments: [],
    notes: [],
};

const htmlFor = async (lang: string, locale: any) => {
    mockPrintToFile.mockResolvedValue({ uri: 'file:///x.pdf' });
    await generateAndSharePDF(data, t, locale, 'j.pdf', lang);
    return mockPrintToFile.mock.calls[mockPrintToFile.mock.calls.length - 1][0].html as string;
};

describe('journal PDF', () => {
    beforeEach(() => mockPrintToFile.mockReset());

    it('uses one long-date style in the profile tiles and the tables, never an abbreviation (D-046)', async () => {
        const html = await htmlFor('fr', fr);
        expect(html).toContain('27 février 2026');
        expect(html).toContain('4 décembre 2026');
        expect(html).not.toMatch(/févr\.|déc\./);
        expect(html).not.toMatch(/>0\d (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/);
    });

    it('prints the weight with the app decimal separator (D-056)', async () => {
        expect(await htmlFor('fr', fr)).toContain('68,4&nbsp;kg');
        expect(await htmlFor('ar', arSA)).toContain('68.4&nbsp;kg');
    });

    it('lets the header cells follow the document direction, as the body cells do (D-057)', async () => {
        const html = await htmlFor('ar', arSA);
        expect(html).toContain('dir="rtl"');
        const th = html.match(/th \{[^}]*\}/)?.[0] ?? '';
        expect(th).toMatch(/text-align:\s*start/);
        expect(th).not.toMatch(/text-align:\s*(left|right)/);
    });
    it('writes what she typed as text, never as markup (D-066)', async () => {
        mockPrintToFile.mockResolvedValue({ uri: 'file:///x.pdf' });
        const hostile = {
            profile: { ...data.profile, firstName: '<img src=x onerror=alert(1)>', lastName: 'O\'Brien & <b>fils</b>' },
            weightHistory: [],
            appointments: [{ date: '2026-10-03T10:00:00.000Z', title: '<script>steal()</script>', notes: '"><svg onload=x>' }],
            notes: [{ date: '2026-10-03T10:00:00.000Z', content: 'Rendez-vous chez la <sage-femme> & le Dr' }],
        };
        await generateAndSharePDF(hostile, t, fr, 'j.pdf', 'fr');
        const html = mockPrintToFile.mock.calls[mockPrintToFile.mock.calls.length - 1][0].html as string;
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('<script>steal');
        expect(html).not.toContain('<svg onload');
        expect(html).not.toContain('<sage-femme>');
        expect(html).not.toContain('<b>fils</b>');
        // ...and she still reads what she wrote.
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('O&#39;Brien &amp; &lt;b&gt;fils&lt;/b&gt;');
        expect(html).toContain('&lt;sage-femme&gt; &amp; le Dr');
    });
});
