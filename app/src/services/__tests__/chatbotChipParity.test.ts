/**
 * Suggestion-chip triage parity across fr / en / ar / tn.
 *
 * A chip is the same intent whatever language it is shown in, so tapping it must produce the
 * same triage everywhere. Before this, the chip label went through the keyword matcher like
 * free text and the outcome depended on how each translation tokenized: EN "I'm bleeding a
 * little" got a plain ⚠️ text reply (lone generic "bleeding" is gated) while FR/AR/TN got the
 * EMERGENCY block with the call button, and AR "I feel very tired" / "leg cramps" escalated to
 * unrelated headache / eclampsia flags.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
const i18nStub = { language: 'fr', t: (k: string) => k, changeLanguage: jest.fn() };
jest.mock('../../i18n', () => ({ __esModule: true, default: i18nStub }));

import { analyzeMessage } from '../chatbotService';
import { SUGGESTIONS, RED_FLAGS } from '../../data/chatbot_data';

const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const REPORTING_CHIPS = ['cs06', 'cs07', 'cs08', 'cs09', 'cs13', 'cs14'];

const tapChip = async (chip: any, lang: string) => {
  i18nStub.language = lang;
  return analyzeMessage(chip[`label_${lang}`]) as Promise<any>;
};

const triageOf = (r: any) => `${r.type}|${r.redFlag?.red_flag_id ?? '-'}|${r.redFlag?.severity ?? '-'}`;

afterAll(() => { i18nStub.language = 'fr'; });

describe('every suggestion chip triages identically in all 4 locales', () => {
  it.each(SUGGESTIONS.map(s => [s.suggestion_id, s] as const))('%s', async (_id, chip) => {
    const outcomes: Record<string, string> = {};
    for (const lang of LOCALES) {
      expect((chip as any)[`label_${lang}`]).toBeTruthy();
      outcomes[lang] = triageOf(await tapChip(chip, lang));
    }
    expect(new Set(Object.values(outcomes)).size).toBe(1);
  });
});

describe('symptom-reporting chips raise their linked red flag with the alert block', () => {
  it.each(REPORTING_CHIPS)('%s', async (id) => {
    const chip: any = SUGGESTIONS.find(s => s.suggestion_id === id);
    const flag = RED_FLAGS.find(f => f.red_flag_id === chip.linked_red_flag_ids);
    expect(flag).toBeDefined();
    // ChatbotScreen renders the alert block + call button only for these two severities.
    expect(['emergency', 'urgent_consult']).toContain(flag!.severity);
    for (const lang of LOCALES) {
      const r = await tapChip(chip, lang);
      expect(r.type).toBe('red_flag');
      expect(r.redFlag.red_flag_id).toBe(flag!.red_flag_id);
    }
  });

  it('"I\'m bleeding a little" (cs06) is an EMERGENCY with the critical wording in every locale', async () => {
    const chip = SUGGESTIONS.find(s => s.suggestion_id === 'cs06')!;
    for (const lang of LOCALES) {
      const r = await tapChip(chip, lang);
      expect(r.redFlag.severity).toBe('emergency');
      expect(r.message.startsWith('🚨')).toBe(true);
      expect(r.message).toContain('common.chatResponse.redFlagCritical');
    }
  });
});

describe('non-reporting chips never raise the alert block', () => {
  const others = SUGGESTIONS.filter(s => !REPORTING_CHIPS.includes(s.suggestion_id));
  it.each(others.map(s => [s.suggestion_id, s] as const))('%s', async (_id, chip) => {
    for (const lang of LOCALES) {
      const r = await tapChip(chip, lang);
      expect(r.type).not.toBe('red_flag');
      expect(r.redFlag).toBeUndefined();
    }
  });
});

describe('free text is still triaged by the matcher', () => {
  it('a typed EN bleeding report with an intensifier still escalates', async () => {
    i18nStub.language = 'en';
    const r: any = await analyzeMessage('I am bleeding a lot');
    expect(r.type).toBe('red_flag');
    expect(r.redFlag.severity).toBe('emergency');
  });
});
