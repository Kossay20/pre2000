import fs from 'fs';
import path from 'path';
import { normalizeSupplementSafety } from '../supplementSafety';

describe('normalizeSupplementSafety', () => {
    it('keeps the canonical tokens', () => {
        expect(normalizeSupplementSafety('ok')).toBe('ok');
        expect(normalizeSupplementSafety('a_surveiller')).toBe('a_surveiller');
        expect(normalizeSupplementSafety('deconseille')).toBe('deconseille');
    });

    it('reads the accented / cased / spaced spellings the data has carried', () => {
        expect(normalizeSupplementSafety('à_surveiller')).toBe('a_surveiller');
        expect(normalizeSupplementSafety('À surveiller')).toBe('a_surveiller');
        expect(normalizeSupplementSafety('déconseillé')).toBe('deconseille');
        expect(normalizeSupplementSafety(' OK ')).toBe('ok');
    });

    it('fails safe to caution — never to ok — for anything unknown or missing', () => {
        expect(normalizeSupplementSafety('safe')).toBe('a_surveiller');
        expect(normalizeSupplementSafety('')).toBe('a_surveiller');
        expect(normalizeSupplementSafety(undefined)).toBe('a_surveiller');
        expect(normalizeSupplementSafety(null)).toBe('a_surveiller');
    });
});

describe('every supplement screen reads safety through the normaliser', () => {
    const screens = ['SupplementsListScreen', 'SupplementDetailScreen', 'WeekRecommendationsScreen'];
    const read = (name: string) =>
        fs.readFileSync(path.resolve(__dirname, `../../screens/${name}.tsx`), 'utf8');

    it.each(screens)('%s never switches on or compares the raw token', (name) => {
        const src = read(name);
        expect(src).toContain('normalizeSupplementSafety(');
        expect(src).not.toMatch(/switch \(safety\)/);
        expect(src).not.toMatch(/pregnancy_safety\s*[!=]==/);
    });
});

describe('one label and one colour pair per rating', () => {
    const { SUPPLEMENT_SAFETY_LABEL_KEYS, SUPPLEMENT_SAFETY_TAG_COLORS } = require('../supplementSafety');
    const read = (name: string) =>
        fs.readFileSync(path.resolve(__dirname, `../../screens/${name}.tsx`), 'utf8');

    const luminance = (hex: string) => {
        const h = hex.replace('#', '');
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
        const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const contrast = (fg: string, bg: string) => {
        const [a, b] = [luminance(fg), luminance(bg)];
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };

    it.each(['ok', 'a_surveiller', 'deconseille'])('%s badge text reaches 4.5:1 on its fill', (token) => {
        const { text, background } = SUPPLEMENT_SAFETY_TAG_COLORS[token];
        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
    });

    it('the list card, the filter chip and the detail tag read the same label keys', () => {
        expect(Object.values(SUPPLEMENT_SAFETY_LABEL_KEYS)).toEqual([
            'common.supplementSafety.safe', 'common.supplementSafety.caution', 'common.supplementSafety.avoid',
        ]);
        for (const name of ['SupplementsListScreen', 'SupplementDetailScreen']) {
            const src = read(name);
            expect(src).not.toMatch(/common\.safety(Ok|Monitor|NotRecommended)/);
            expect(src).toContain('SUPPLEMENT_SAFETY_LABEL_KEYS');
        }
    });

    it('the detail tag passes its text colour with its fill', () => {
        expect(read('SupplementDetailScreen')).toMatch(/<Tag[^>]*color=\{safetyColors\.background\}[^>]*textColor=\{safetyColors\.text\}/);
    });
});
