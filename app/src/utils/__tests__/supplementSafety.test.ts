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
