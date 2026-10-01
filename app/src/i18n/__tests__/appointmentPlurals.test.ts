/**
 * Wave B: Home read "Vous avez 1 rendez-vous prévus cette semaine." The appointment
 * counters were single strings with {{count}}, so French and English never agreed with
 * the number and Arabic / Derja printed the plural noun for 1, 2 and 11+. They are CLDR
 * plural keys now; tn goes through the app singleton, which resolves tn with Arabic rules.
 */
import i18n from '../index';

const KEYS = ['appointmentsToday', 'appointmentsTomorrow', 'appointmentsWeek'] as const;
const t = (lng: string, key: string, count: number) => i18n.getFixedT(lng)(`home.reminders.${key}`, { count });

afterAll(async () => {
    await i18n.changeLanguage('fr');
});

describe('appointment counters agree with the number', () => {
    it('fr: "1 rendez-vous prévu", "3 rendez-vous prévus"', () => {
        expect(t('fr', 'appointmentsWeek', 1)).toBe('Vous avez 1 rendez-vous prévu cette semaine.');
        expect(t('fr', 'appointmentsWeek', 3)).toBe('Vous avez 3 rendez-vous prévus cette semaine.');
    });

    it('en: singular for 1, plural otherwise', () => {
        expect(t('en', 'appointmentsWeek', 1)).toBe('You have 1 appointment scheduled this week.');
        expect(t('en', 'appointmentsWeek', 2)).toBe('You have 2 appointments scheduled this week.');
        expect(t('en', 'appointmentsToday', 1)).toBe('Today: 1 appointment!');
        expect(t('en', 'appointmentsTomorrow', 4)).toBe("Don't forget! 4 appointments tomorrow.");
    });

    it.each(['ar', 'tn'])('%s: one / two / few / many forms', (lng) => {
        // 1 → "موعد واحد", 2 → dual, 3-10 → "مواعيد", 11+ → singular "موعد(ًا)".
        expect(t(lng, 'appointmentsWeek', 1)).toContain('موعد واحد');
        expect(t(lng, 'appointmentsWeek', 1)).not.toContain('1');
        expect(t(lng, 'appointmentsWeek', 3)).toContain('3 مواعيد');
        expect(t(lng, 'appointmentsWeek', 11)).toMatch(/11 موعد/);
        expect(t(lng, 'appointmentsWeek', 11)).not.toContain('مواعيد');
        expect(t(lng, 'appointmentsWeek', 2)).not.toContain('2');
    });

    it('every locale resolves every count to a real string (no raw key)', () => {
        for (const lng of ['fr', 'en', 'ar', 'tn']) {
            for (const key of KEYS) {
                for (const count of [0, 1, 2, 3, 11, 100]) {
                    const out = t(lng, key, count);
                    expect(out).not.toContain('home.reminders');
                    expect(out).not.toMatch(/\(s\)/);
                }
            }
        }
    });
});
