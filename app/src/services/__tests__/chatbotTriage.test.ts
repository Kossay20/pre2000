/**
 * C1/C2 — Chatbot red-flag triage SAFETY corpus.
 *
 * The single most important chatbot behavior is emergency escalation, and before this
 * test `analyzeMessage` had ZERO automated coverage. A supervisor engine-run (2026-05-30)
 * proved English emergencies silently failed: "I have heavy bleeding" → no red_flag,
 * "I want to kill myself" → no red_flag, while FR/AR/TN escalated.
 *
 * This corpus locks the safety-critical paths across all 4 languages and guards against
 * over-escalation of clearly-benign input. Detection is language-agnostic (the matcher
 * tests every keywords_{fr,ar,tn,en} against the processed tokens), so a fixed i18n stub
 * is sufficient — the phrase TEXT drives the result, not the active locale.
 *
 * Scope honesty: this proves known-dangerous phrasings escalate and obvious benign input
 * does not. It does NOT make a keyword matcher a trustworthy free-text triage — the BETA
 * badge + medical disclaimer remain mandatory regardless of green tests.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { language: 'fr', t: (k: string) => k, changeLanguage: jest.fn() },
}));

import { analyzeMessage } from '../chatbotService';

const ESCALATED_SEVERITIES = ['emergency', 'urgent_consult', 'critique', 'élevé'];
const escalates = (r: any) =>
  r.type === 'red_flag' && ESCALATED_SEVERITIES.includes((r.redFlag?.severity || '').toLowerCase());

describe('Chatbot triage — emergencies MUST escalate in all 4 languages', () => {
  const emergencies: { lang: string; text: string }[] = [
    // French
    { lang: 'fr', text: "j'ai des saignements abondants" },
    { lang: 'fr', text: 'je perds beaucoup de sang' },
    { lang: 'fr', text: "j'ai des pensées suicidaires" },
    // English (the verified-broken path)
    { lang: 'en', text: 'I have heavy bleeding' },
    { lang: 'en', text: 'I am bleeding a lot' },
    { lang: 'en', text: 'I want to kill myself' },
    { lang: 'en', text: 'I have suicidal thoughts' },
    // Arabic
    { lang: 'ar', text: 'عندي نزيف' },
    // Tunisian (arabizi)
    { lang: 'tn', text: '3andi nzif' },
    // RED-team paraphrases (P0-2/3/4/5) the first corpus missed
    { lang: 'en', text: "I can't breathe" },
    { lang: 'en', text: 'I passed out' },
    { lang: 'en', text: 'my baby stopped moving' },
    { lang: 'en', text: "I don't want to live" },
    { lang: 'en', text: "I'd be better off dead" },
    // RED-team P0-1 (worst): Arabic "I no longer feel the baby move" must NOT self-cancel
    // via the negation word "لا" that begins its own flag keyword.
    { lang: 'ar', text: 'لا أشعر بحركة الجنين' },
    // Adversary sweep: symptom-paraphrase coverage across the other flags (were missing).
    { lang: 'en', text: 'I have a high fever' },
    { lang: 'en', text: 'I keep vomiting everything I eat' },
    { lang: 'en', text: 'my face is swollen' },
    { lang: 'en', text: 'I fainted earlier' },
    // massive-audit P0 — suicidal-ideation i18n parity: FR/AR/TN paraphrases were silently dropped
    // (keywords_fr had only 2 clinical terms; EN had 12 layperson paraphrases). These cover the
    // most common layperson expressions that MUST escalate to the psychiatry emergency flag.
    { lang: 'fr', text: "j'ai envie d'en finir avec la vie" },
    { lang: 'fr', text: "je veux mourir" },
    { lang: 'fr', text: "je veux me faire du mal" },
    { lang: 'ar', text: 'أريد أن أموت' },
    { lang: 'ar', text: 'أفكر في الانتحار' },
    { lang: 'tn', text: 'nheb nmout' },
    // massive-audit P0 — eclampsia inflected forms: FR "évanouie" and AR "أغمي" were not caught
    { lang: 'fr', text: "je me suis évanouie" },
    { lang: 'fr', text: "je suis inconsciente" },
    { lang: 'ar', text: 'أغمي علي' },
    // massive-audit P0 — HELLP syndrome: "douleur foie" multiword missed; single-token "foie" added
    { lang: 'fr', text: "j'ai une douleur au foie" },
    { lang: 'ar', text: 'عندي ألم في الكبد' },
    // massive-audit P1 — breathlessness adjective: "essoufflée" did not match noun "essoufflement"
    { lang: 'fr', text: "je suis essoufflée" },
  ];

  for (const c of emergencies) {
    it(`[${c.lang}] "${c.text}" → escalates`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, severity: r.redFlag?.severity, escalates: escalates(r) })
        .toMatchObject({ escalates: true });
    });
  }
});

describe('Chatbot triage — clearly benign input must NOT over-escalate', () => {
  // Note: we deliberately do NOT assert that "headache" stays non-escalated — a headache in
  // pregnancy can signal pre-eclampsia, so erring toward escalation there is the safe side.
  // These are unambiguously informational/greeting inputs.
  const benign: { lang: string; text: string }[] = [
    { lang: 'en', text: 'what foods should I eat during pregnancy' },
    { lang: 'fr', text: 'quels aliments manger pendant la grossesse' },
    { lang: 'en', text: 'hello' },
    // RED-team P1-1/P1-2: explicitly NEGATED symptoms must NOT escalate (cry-wolf).
    { lang: 'en', text: 'I am not bleeding' },
    { lang: 'en', text: 'I have no headache' },
    { lang: 'fr', text: 'je ne saigne pas' },
    // Specificity guards: the new symptom keywords must NOT over-escalate normal pregnancy
    // complaints (ankle swelling / morning-sickness nausea are common, not emergencies).
    { lang: 'en', text: 'my ankles are a little swollen' },
    { lang: 'en', text: 'I feel a bit nauseous this morning' },
    // Supervisor-loop benign probes (2026-05-30): verify widened emergency keywords don't create
    // false positives on COLLOQUIAL or TOCOPHOBIA phrasing that is NOT suicidal ideation.
    // "mourir" standalone was too broad; replaced with conjugated multiword phrases.
    { lang: 'fr', text: "j'ai peur de mourir en accouchant" },   // tocophobia — NOT suicidal
    { lang: 'fr', text: "je vais mourir de rire" },              // colloquial idiom
    { lang: 'fr', text: "j'ai peur de l'accouchement" },        // normal childbirth fear
    { lang: 'fr', text: "cette attente va me tuer" },            // colloquial idiom
  ];

  for (const c of benign) {
    it(`[${c.lang}] "${c.text}" → no red_flag`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, wrongFlag: r.redFlag?.red_flag_id }).not.toMatchObject({ type: 'red_flag' });
    });
  }
});

// CB4-FIX — abuse-e2e reasoning audit found that the additive score let a multi-symptom URGENT
// flag outrank a higher-severity EMERGENCY. Severity must win; match count is only a tiebreaker.
const EMERGENCY_SEV = ['emergency', 'critique'];
describe('Chatbot triage — multi-symptom: the EMERGENCY must win, not the higher-keyword urgent flag', () => {
  const cases = [
    { text: 'I have a severe headache and pain and I cannot breathe', why: 'breathing emergency > headache urgent' },
    { text: 'I have a severe headache with pain and a little bleeding', why: 'bleeding emergency > headache urgent' },
  ];
  for (const c of cases) {
    it(`"${c.text}" → escalates to an EMERGENCY (${c.why})`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, severity: r.redFlag?.severity })
        .toMatchObject({ type: 'red_flag' });
      expect(EMERGENCY_SEV).toContain((r.redFlag?.severity || '').toLowerCase());
    });
  }
});

describe('Chatbot triage — negation must not leak a false emergency through a filler verb', () => {
  it('"I do not have bleeding but I have a headache" → NOT the bleeding emergency', async () => {
    const r: any = await analyzeMessage('I do not have bleeding but I have a headache');
    // bleeding is negated → must not route to a hemorrhage emergency (it may surface the headache).
    expect((r.redFlag?.red_flag_id || '')).not.toMatch(/hemorragie|hémorragie/i);
    if (r.type === 'red_flag') expect((r.redFlag?.severity || '').toLowerCase()).not.toBe('emergency');
  });
});

// SUG1-FIX — supervisor-loop (2026-05-30): the suggestion path was including the linked redFlag
// object for ALL score->0 matches, so "j'ai peur de l'accouchement" (normal childbirth fear)
// triggered a hemorrhage-linked suggestion and showed the full URGENCE + call-button UI — cry-wolf.
// Fix: gate redFlag on score >= 50 (exact chip-click = 100; typed keyword overlap = 10-20).
// This locks: (a) low-score benign queries don't show emergency UI via suggestion path;
// (b) deliberate chip-clicks ("J'ai des pensées négatives") still expose the linked redFlag.
describe('Chatbot triage — suggestion path: low-score match must NOT expose emergency redFlag UI', () => {
  it('"j\'ai peur de l\'accouchement" → no redFlag on the suggestion response (cry-wolf guard)', async () => {
    const r: any = await analyzeMessage("j'ai peur de l'accouchement");
    // If this routes via the suggestion path, the redFlag must be undefined (low-score match).
    // The message text may still contain a ⚠️ warning — that is acceptable and intentional.
    if (r.type === 'suggestion') {
      expect(r.redFlag).toBeUndefined();
    }
    // Alternatively it may route as unknown — either is fine; what's NOT acceptable is a
    // full emergency redFlag on a "fear of childbirth" query.
    if (r.type === 'red_flag') {
      // If a red_flag IS matched directly, make sure it's not the hemorrhage flag (wrong condition)
      expect(r.redFlag?.red_flag_id).not.toMatch(/hemorragie/i);
    }
  });
});
