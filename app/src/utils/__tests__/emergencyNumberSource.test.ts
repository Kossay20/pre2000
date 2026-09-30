/**
 * A-008: the call buttons showed "(112)" with nothing saying it was a fallback, so
 * the user never learned that the country question mattered. resolveEmergencyContact
 * reports where the number came from; emergencyNumberLabel labels the 112 fallback as
 * international (checked through the shipped i18n singleton, all four locales).
 */
import i18n from '../../i18n';
import { resolveEmergencyContact, resolveEmergencyNumber } from '../clinicalChecks';
import { emergencyNumberLabel } from '../emergencyNumberLabel';

describe('resolveEmergencyContact', () => {
    it('profile country → its number, source profile', () => {
        expect(resolveEmergencyContact('tunisia', 'FR')).toEqual({ number: '190', source: 'profile' });
        expect(resolveEmergencyContact('france', null)).toEqual({ number: '15', source: 'profile' });
    });

    it('empty country + mapped device region → region number, source region', () => {
        expect(resolveEmergencyContact('', 'FR')).toEqual({ number: '15', source: 'region' });
        expect(resolveEmergencyContact(undefined, 'TN')).toEqual({ number: '190', source: 'region' });
    });

    it('empty country + unknown region → 112, source fallback', () => {
        expect(resolveEmergencyContact('', null)).toEqual({ number: '112', source: 'fallback' });
        expect(resolveEmergencyContact(null, 'EG')).toEqual({ number: '112', source: 'fallback' });
    });

    it('"other" is an explicit 112 — the device region is not consulted', () => {
        expect(resolveEmergencyContact('other', 'FR')).toEqual({ number: '112', source: 'fallback' });
    });

    it('resolveEmergencyNumber stays the number of the same resolution', () => {
        for (const [c, r] of [['tunisia', 'FR'], ['', 'FR'], ['', null], ['other', 'TN']] as const) {
            expect(resolveEmergencyNumber(c, r)).toBe(resolveEmergencyContact(c, r).number);
        }
    });
});

describe('emergencyNumberLabel', () => {
    it.each([
        ['fr', '112, international'],
        ['en', '112, international'],
        ['ar', '112، دولي'],
        ['tn', '112، دولية'],
    ])('%s labels the fallback as international', (lng, expected) => {
        expect(emergencyNumberLabel(i18n.getFixedT(lng), { number: '112', source: 'fallback' })).toBe(expected);
    });

    it('a number from the profile or the region is shown as is', () => {
        const t = i18n.getFixedT('fr');
        expect(emergencyNumberLabel(t, { number: '190', source: 'profile' })).toBe('190');
        expect(emergencyNumberLabel(t, { number: '15', source: 'region' })).toBe('15');
    });
});
