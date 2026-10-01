/**
 * French puts a space before ":", ";", "?" and "!". With a plain space the mark can
 * wrap alone to the start of the next line (": impossible de les retrouver…" on the
 * guest disclaimer at 375pt), so fr strings use a no-break space (U+00A0, or the
 * narrow U+202F) there.
 */
import fs from 'fs';
import path from 'path';

const FR_DIR = path.join(__dirname, '..', 'locales', 'fr');
const PLAIN_SPACE_BEFORE_MARK = /\S [:;?!]/;

function collect(node: unknown, trail: string, out: string[]): void {
    if (typeof node === 'string') {
        if (PLAIN_SPACE_BEFORE_MARK.test(node)) out.push(`${trail} → ${JSON.stringify(node)}`);
    } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) collect(value, `${trail}.${key}`, out);
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

    it('the rule catches a plain space and accepts a no-break one', () => {
        expect(PLAIN_SPACE_BEFORE_MARK.test('à ce téléphone : impossible')).toBe(true);
        expect(PLAIN_SPACE_BEFORE_MARK.test('à ce téléphone : impossible')).toBe(false);
        expect(PLAIN_SPACE_BEFORE_MARK.test('Rendez-vous à 10:30')).toBe(false);
    });
});
