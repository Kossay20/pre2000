/**
 * What the assistant ANSWERS once triage has run, in fr / en / ar / tn.
 *
 * Wave C (final-release round 3) found four answers that were wrong or empty:
 * - the bleeding red flag named "late miscarriage" to a woman at 32 weeks, closed on a soft
 *   "don't hesitate to contact your doctor if needed" and linked the twins article;
 * - "What foods to avoid?" answered "Here's what I know:" and then listed nothing;
 * - "I am not bleeding" returned a breastfeeding article — retrieval matched the very word
 *   the sentence negates;
 * - the swelling chip, linked to the pre-eclampsia sign, read "I feel bloated" in en/ar.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
const i18nStub = { language: 'fr', t: (k: string) => k, changeLanguage: jest.fn() };
jest.mock('../../i18n', () => ({ __esModule: true, default: i18nStub }));

import { analyzeMessage } from '../chatbotService';
import { SUGGESTIONS, RED_FLAGS } from '../../data/chatbot_data';
import forbiddenFoods from '../../data/forbidden_foods.json';

const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const chip = (id: string): any => SUGGESTIONS.find(s => s.suggestion_id === id);
const ask = async (lang: string, text: string): Promise<any> => {
  i18nStub.language = lang;
  return analyzeMessage(text);
};

afterAll(() => { i18nStub.language = 'fr'; });

describe('bleeding red flag', () => {
  const bleeding: any = RED_FLAGS.find(f => f.red_flag_id === 'hemorragie_antepartum');

  it.each(LOCALES)('%s: names no trimester-specific outcome (no "late miscarriage" at 32 weeks)', (lang) => {
    const text: string = bleeding[`standard_message_${lang}`];
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/fausse couche|miscarriage|إجهاض/i);
  });

  it('links no unrelated article (twins) from any red flag', () => {
    for (const flag of RED_FLAGS) {
      expect({ flag: flag.red_flag_id, ids: flag.linked_articles_ids })
        .toEqual({ flag: flag.red_flag_id, ids: expect.not.arrayContaining(['a19_grossesses_multiples']) });
    }
  });

  it.each(LOCALES)('%s: the emergency reply does not end on a soft "don\'t hesitate… if needed"', async (lang) => {
    const r = await ask(lang, chip('cs06')[`label_${lang}`]);
    expect(r.type).toBe('red_flag');
    expect(r.redFlag.severity).toBe('emergency');
    expect(r.message).not.toContain('redFlagCritical');
    expect(r.articles.map((a: any) => a.article_id)).not.toContain('a19_grossesses_multiples');
  });
});

describe('"What foods to avoid?" answers with the foods and a way to the full list', () => {
  const avoided = (forbiddenFoods as any[]).filter(f => f.severity === 'critical' || f.severity === 'high');

  const expectFoodsAnswer = (r: any, lang: string) => {
    expect(r.type).not.toBe('red_flag');
    expect(r.screenLink).toBe('ForbiddenFoods');
    expect(r.message).toContain('common.chatResponse.foodsToAvoidIntro');
    expect(r.message).not.toContain('topicNutrition');
    for (const food of avoided) {
      const name = food[`name_${lang}`] || food.name_ar || food.name_fr;
      expect(r.message).toContain(`• ${name}`);
    }
  };

  it.each(LOCALES)('%s: tapping the chip', async (lang) => {
    expectFoodsAnswer(await ask(lang, chip('cs05')[`label_${lang}`]), lang);
  });

  it.each([
    ['fr', 'quels sont les aliments interdits pendant la grossesse ?'],
    ['fr', 'que dois-je éviter de manger'],
    ['en', 'which foods should I avoid'],
    ['en', 'what should I avoid eating?'],
    ['ar', 'ما هي الأطعمة الممنوعة أثناء الحمل؟'],
    ['tn', 'شنوة الماكلة اللي ما ناكولهاش؟'],
  ])('%s: typed "%s"', async (lang, text) => {
    expectFoodsAnswer(await ask(lang, text), lang);
  });

  it('a question about what she CAN eat is not answered with the avoid list', async () => {
    const r = await ask('fr', 'Que puis-je manger ?');
    expect(r.screenLink).toBeUndefined();
  });

  it('a red flag still wins over the food question', async () => {
    const r = await ask('en', 'what foods to avoid, I am bleeding a lot');
    expect(r.type).toBe('red_flag');
  });
});

describe('a negated symptom is not used to retrieve an article', () => {
  it.each([
    ['en', 'I am not bleeding'],
    ['en', 'I have no headache'],
    ['fr', 'je ne saigne pas'],
    ['ar', 'ليس لدي نزيف'],
  ])('%s: "%s" retrieves nothing and raises nothing', async (lang, text) => {
    const r = await ask(lang, text);
    expect(r.type).not.toBe('red_flag');
    expect(r.articles ?? []).toEqual([]);
  });

  it('the rest of the sentence is still answered', async () => {
    const r = await ask('en', 'I am not bleeding but my back hurts');
    expect(r.type).not.toBe('red_flag');
    expect((r.articles ?? []).map((a: any) => a.article_id)).toContain('a05_exercice_physique_pendant');
  });
});

describe('swelling chip (pre-eclampsia sign)', () => {
  const swelling = chip('cs19');

  it('says swollen face / hands / feet, not "bloated", in every locale', () => {
    expect(swelling.linked_red_flag_ids).toBe('gonflement visage');
    expect(swelling.label_en).toMatch(/swollen/i);
    expect(swelling.label_en).toMatch(/face/i);
    expect(swelling.label_en).not.toMatch(/bloat/i);
    expect(swelling.label_fr).toMatch(/visage/);
    expect(swelling.label_fr).toMatch(/gonfl/);
    expect(swelling.label_ar).toMatch(/تورّ?م/);
    expect(swelling.label_ar).toMatch(/الوجه/);
    expect(swelling.label_ar).not.toMatch(/انتفاخ/);
    expect(swelling.label_tn).toMatch(/وجه/);
  });

  it.each(LOCALES)('%s: tapping it raises the swelling red flag', async (lang) => {
    const r = await ask(lang, swelling[`label_${lang}`]);
    expect(r.type).toBe('red_flag');
    expect(r.redFlag.red_flag_id).toBe('gonflement visage');
  });
});

// D-036 (final-release round 5): "Puis-je manger du fromage ?" was answered with the twin
// pregnancy article ("Je pense qu'il répond à votre question") while the Foods-to-avoid data
// lists raw-milk cheeses as high risk. A named food is now answered from that same data.
describe('a question about one named food answers from the foods-to-avoid data (D-036)', () => {
  const byId = (id: string): any => (forbiddenFoods as any[]).find(f => f.id === id);
  const cases: { lang: string; text: string; ids: string[] }[] = [
    { lang: 'fr', text: 'Puis-je manger du fromage ?', ids: ['raw_milk_cheese', 'feta_goat'] },
    { lang: 'en', text: 'Can I eat cheese?', ids: ['raw_milk_cheese', 'feta_goat'] },
    { lang: 'ar', text: 'هل يمكنني أكل الجبن؟', ids: ['raw_milk_cheese', 'feta_goat'] },
    { lang: 'tn', text: 'نجم ناكل فرماج؟', ids: ['raw_milk_cheese', 'feta_goat'] },
    { lang: 'fr', text: 'Puis-je boire du vin ?', ids: ['alcohol'] },
    { lang: 'en', text: 'is it safe to drink coffee', ids: ['caffeine'] },
    { lang: 'fr', text: "puis-je manger du saumon fumé ?", ids: ['smoked_fish'] },
  ];

  it.each(cases)('$lang: "$text" gets the matching foods, not an unrelated article', async ({ lang, text, ids }) => {
    const r = await ask(lang, text);
    expect(r.type).toBe('suggestion');
    expect(r.screenLink).toBe('ForbiddenFoods');
    expect(r.articles).toEqual([]);
    expect(r.message).not.toContain('semanticMatch');
    for (const id of ids) {
      expect(r.message).toContain((byId(id) as any)[`name_${lang}`]);
    }
  });

  it('does not intercept a question that names no food', async () => {
    const r = await ask('fr', 'Quand faire la première échographie ?');
    expect(r.screenLink).not.toBe('ForbiddenFoods');
  });

  it('a red flag in the same message still escalates first', async () => {
    const r = await ask('fr', "je saigne beaucoup, puis-je manger du fromage ?");
    expect(r.type).toBe('red_flag');
  });
});

describe('Tunisian spaced negation "ما عنديش" (C-021, round 6)', () => {
  it.each(['ما عنديش نزيف', 'ما عنديش وجيعة'])('tn: "%s" retrieves no article', async (text) => {
    const r = await ask('tn', text);
    expect(r.type).not.toBe('red_flag');
    expect(r.articles ?? []).toEqual([]);
  });

  it('tn: a plain "ما" question is not a negation', async () => {
    const r = await ask('tn', 'ما هي الأطعمة التي يجب تجنبها؟');
    expect(r.screenLink).toBe('ForbiddenFoods');
  });
});
