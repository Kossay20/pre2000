import fs from 'fs';
import path from 'path';
import { templateCategory, templateImportance } from '../calendarTemplateTags';

const templates = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../calendar_templates_db.json'), 'utf8'),
) as { type: string; importance_level?: number }[];

const LOCALES = ['fr', 'en', 'ar', 'tn'];
const calendarJson = (locale: string) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../i18n/locales/${locale}/calendar.json`), 'utf8'));

describe('templateImportance', () => {
  it('reads the importance_level the seeded templates actually carry', () => {
    expect(templateImportance({ importance_level: 1 })).toBe('essential');
    expect(templateImportance({ importance_level: 2 })).toBe('recommended');
    expect(templateImportance({ importance_level: 3 })).toBe('optional');
  });

  it('still accepts the typed string form', () => {
    expect(templateImportance({ importance: 'recommended' })).toBe('recommended');
  });

  it('returns null rather than a printable "undefined" when nothing is set', () => {
    expect(templateImportance({})).toBeNull();
    expect(templateImportance({ importance_level: 9 })).toBeNull();
  });
});

describe('templateCategory', () => {
  it('maps the composite French type to a language-neutral category', () => {
    expect(templateCategory('examen,echo')).toBe('exam');
    expect(templateCategory('administratif')).toBe('administrative');
    expect(templateCategory('self_care,bien_etre')).toBe('selfCare');
    expect(templateCategory('something-new')).toBeNull();
  });
});

describe('seeded templates', () => {
  it('every template resolves to a category and an importance', () => {
    const unresolved = templates.filter((t) => !templateCategory(t.type) || !templateImportance(t));
    expect(unresolved).toEqual([]);
  });

  it('every category and importance has a label in all four locales', () => {
    for (const locale of LOCALES) {
      const cal = calendarJson(locale);
      for (const t of templates) {
        expect(cal.category?.[templateCategory(t.type)!]).toEqual(expect.any(String));
        expect(cal.importance?.[templateImportance(t)!]).toEqual(expect.any(String));
      }
    }
  });
});
