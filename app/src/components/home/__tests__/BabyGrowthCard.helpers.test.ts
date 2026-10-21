import { pregnancyProgressPercent } from '../BabyGrowthCard.helpers';

describe('pregnancyProgressPercent', () => {
    it('agrees with the day shown beside it', () => {
        // Week 32, day 1: the card prints "Jour 218".
        expect(pregnancyProgressPercent(218).toFixed(0)).toBe('78');
        expect(pregnancyProgressPercent(140).toFixed(0)).toBe('50');
    });

    it('stays within 0..100', () => {
        expect(pregnancyProgressPercent(280)).toBe(100);
        expect(pregnancyProgressPercent(291)).toBe(100);
        expect(pregnancyProgressPercent(-3)).toBe(0);
        expect(pregnancyProgressPercent(NaN)).toBe(0);
    });
});
