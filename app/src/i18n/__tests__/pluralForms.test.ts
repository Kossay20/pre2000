/**
 * I3 verify-first gate: does the current `_plural` suffix actually pluralize under i18next v25?
 * i18next v25 (no compatibilityJSON) uses CLDR categories (_one/_other, ar: _zero/_two/_few/_many/_other),
 * so a legacy `key` + `key_plural` pair may silently fall back to the singular base for count>1.
 * A fresh i18next instance over the real merged locale objects (pure JS, no react-native) reveals it.
 */
import i18next, { type i18n as I18n } from 'i18next';
import fr from '../locales/fr';
import en from '../locales/en';
import ar from '../locales/ar';
import tn from '../locales/tn';

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

describe('I3 — count-based keys pluralize correctly per language', () => {
  // Expected renderings per locale (from common.json CLDR forms). Arabic noun-number rule:
  // 1 → singular (مهمة), 3-10 → plural (مهام), 11+ → singular (مهمة). EN/FR: 1 → singular, else plural.
  const expectations = [
    { lng: 'en', at1: '1 task', at3: '3 tasks', at11: '11 tasks' },
    { lng: 'fr', at1: '1 tâche', at3: '3 tâches', at11: '11 tâches' },
    { lng: 'ar', at1: '1 مهمة', at3: '3 مهام', at11: '11 مهمة' },
    // TN on a BARE i18next instance: 'tn' is Setswana in CLDR, so Intl.PluralRules('tn')
    // offers only one/other and every Arabic form authored for tn is unreachable —
    // the singular is rendered at all counts. This suite deliberately documents that
    // raw behaviour. The SHIPPED app does not have it: src/i18n/index.ts aliases the
    // tn plural resolver to Arabic, covered by tnPluralAlias.test.ts.
    { lng: 'tn', at1: '1 مهمة', at3: '3 مهمة', at11: '11 مهمة' },
  ];

  for (const e of expectations) {
    it(`${e.lng}: taskCount renders correct CLDR form @1 / @3 / @11`, async () => {
      await inst.changeLanguage(e.lng);
      const at1 = inst.t('taskCount', { count: 1 });
      const at3 = inst.t('taskCount', { count: 3 });
      const at11 = inst.t('taskCount', { count: 11 });
      // eslint-disable-next-line no-console
      console.log(`[I3] ${e.lng}  1→"${at1}"  3→"${at3}"  11→"${at11}"`);
      expect(at1).toBe(e.at1);
      expect(at3).toBe(e.at3);   // Arabic 3-10 must use the plural word مهام
      expect(at11).toBe(e.at11); // Arabic 11+ must revert to the singular مهمة
    });
  }
});

// D-032: the Tasks tab printed "1 tâches restantes". Both blocks that carry the string
// (reminders.types, reminders.myDay) now have CLDR forms.
describe('remainingTasks pluralizes', () => {
  const cases = [
    { lng: 'fr', at1: '1 tâche restante', at3: '3 tâches restantes', at11: '11 tâches restantes' },
    { lng: 'en', at1: '1 task remaining', at3: '3 tasks remaining', at11: '11 tasks remaining' },
    { lng: 'ar', at1: '1 مهمة متبقية', at3: '3 مهام متبقية', at11: '11 مهمة متبقية' },
  ];
  for (const key of ['reminders.myDay.remainingTasks', 'reminders.types.remainingTasks']) {
    for (const c of cases) {
      it(`${c.lng}: ${key} @1 / @3 / @11`, async () => {
        await inst.changeLanguage(c.lng);
        expect(inst.t(key, { count: 1 })).toBe(c.at1);
        expect(inst.t(key, { count: 3 })).toBe(c.at3);
        expect(inst.t(key, { count: 11 })).toBe(c.at11);
      });
    }
  }

  // tn resolves through the Arabic rules in the shipped app (tnPluralAlias.test.ts); here
  // only that every Arabic form exists, with the singular distinct from the plural.
  it('tn: all six forms exist for the Tasks tab footer', () => {
    const myDay = (tn as any).reminders.myDay;
    for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
      expect(myDay[`remainingTasks_${form}`]).toContain('{{count}}');
    }
    expect(myDay.remainingTasks_one).not.toBe(myDay.remainingTasks_few);
  });
});
