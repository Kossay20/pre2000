/**
 * The Arabic preposition بـ is written joined to its word. The weekly texts had it
 * outside the bold markers — "بـ **التعب**" — so once the markdown was stripped for a
 * card excerpt it read as a detached "بـ التعب".
 */
import weeks from '../weeks_db.json';

describe('weeks_db Arabic text', () => {
    it('never leaves the preposition بـ detached before a bold word', () => {
        const hits: string[] = [];
        for (const week of weeks as Array<Record<string, unknown>>) {
            for (const [field, value] of Object.entries(week)) {
                if (typeof value === 'string' && /بـ\s*\*\*/.test(value)) hits.push(`week ${week.week_number}: ${field}`);
            }
        }
        expect(hits).toEqual([]);
    });
});
