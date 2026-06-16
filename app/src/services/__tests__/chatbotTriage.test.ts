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

// CB-NEW-01/02/03 — benign false-escalation corpus (3 P1 clinical-safety fixes).
// These everyday food/hydration/fatigue questions previously mis-fired an emergency:
//   • CB-NEW-01: synonym "hydratation" (from "boire"/"eau") substring-matched the red-flag
//     keyword "déshydratation" → severe-vomiting flag on "puis-je boire de l'eau ?".
//   • CB-NEW-02: the pre-eclampsia visual-sign flag had generic single tokens
//     ("yeux"/"taches"/"les"/...) → typo-corrected "peux"→"yeux" escalated "manger du fromage".
//   • CB-NEW-03: the suggestion path prepended a linked red-flag ⚠️ standard_message for
//     low-confidence (non-chip-click) topic matches → "je suis fatiguée" showed a vomiting
//     warning. The warning text is now gated behind a deliberate exact chip click.
// Each MUST return neither a red_flag nor a ⚠️/🚨 emergency standard_message (typed free-text).
describe('Chatbot triage — benign food/hydration/fatigue questions must NOT escalate (CB-NEW-01/02/03)', () => {
  const benignNew: { lang: string; text: string }[] = [
    { lang: 'fr', text: 'puis-je boire du café ?' },
    { lang: 'fr', text: "puis-je boire de l'eau ?" },
    { lang: 'fr', text: 'est-ce que je peux manger du fromage ?' },
    { lang: 'fr', text: 'je suis fatiguée' },
    { lang: 'fr', text: 'combien de café par jour ?' },
    { lang: 'en', text: 'can I eat cheese?' },
  ];
  for (const c of benignNew) {
    it(`[${c.lang}] "${c.text}" → no red_flag AND no ⚠️ emergency message`, async () => {
      const r: any = await analyzeMessage(c.text);
      // (1) must not route to the red_flag path
      expect({ phrase: c.text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      // (2) must not carry a red_flag object
      expect(r.redFlag).toBeUndefined();
      // (3) the response text must not contain an emergency/severe-symptom warning banner.
      const msg: string = typeof r.message === 'string' ? r.message : '';
      expect({ phrase: c.text, msg }).toMatchObject({ msg: expect.not.stringContaining('⚠️') });
      expect({ phrase: c.text, msg }).toMatchObject({ msg: expect.not.stringContaining('🚨') });
    });
  }
});

// CB-R3-01 — generic-keyword over-escalation (P1 CLINICAL). Benign sentences that merely
// CONTAIN a generic red-flag keyword (a colour/substance/sensation word) used to escalate to a
// full EMERGENCY (red_flag + call button) because a single EXACT token match was enough:
//   "I painted the nursery red" / "is red wine ok"  → "red"    → hemorrhage EMERGENCY
//   "the sky is so bright"                            → "bright" → hemorrhage EMERGENCY
//   "I gave blood at the clinic"                      → "blood"  → hemorrhage EMERGENCY
//   "I have mild back pain"                           → "pain"   → severe-cramps URGENT
//   "j'ai mangé du foie de veau"                      → "foie"   → HELLP EMERGENCY
// ("I painted the nursery red" ALSO fuzzy-mis-corrected "painted"→"fainted" → eclampsia.)
// Fix: a generic single-token keyword only counts when corroborated (an intensity/quantity word
// or a second distinct generic concept), and fuzzy correction no longer changes a word's first
// letter. These MUST NOT route to the red_flag path nor carry a ⚠️/🚨 emergency banner.
describe('Chatbot triage — generic words in benign sentences must NOT escalate (CB-R3-01)', () => {
  const benignGeneric: { lang: string; text: string }[] = [
    { lang: 'en', text: 'I painted the nursery red' },
    { lang: 'en', text: 'the sky is so bright' },
    { lang: 'en', text: 'I gave blood at the clinic' },
    { lang: 'en', text: 'is red wine ok' },
    { lang: 'en', text: 'I have mild back pain' },
    { lang: 'fr', text: "j'ai mangé du foie de veau" },
  ];
  for (const c of benignGeneric) {
    it(`[${c.lang}] "${c.text}" → no red_flag AND no ⚠️/🚨 emergency message`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
      const msg: string = typeof r.message === 'string' ? r.message : '';
      expect({ phrase: c.text, msg }).toMatchObject({ msg: expect.not.stringContaining('⚠️') });
      expect({ phrase: c.text, msg }).toMatchObject({ msg: expect.not.stringContaining('🚨') });
    });
  }

  // Guard: a CORROBORATED generic word (intensity/quantity word present, or a second generic
  // concept) MUST still escalate — the fix must not weaken real single-symptom emergencies.
  const stillEscalates: { lang: string; text: string }[] = [
    { lang: 'fr', text: 'je perds beaucoup de sang' },   // sang + intensifier (beaucoup/perds)
    { lang: 'en', text: 'I am bleeding a lot' },          // bleeding + intensifier (a lot)
    { lang: 'fr', text: "j'ai une douleur au foie" },     // douleur + foie (two generic concepts)
  ];
  for (const c of stillEscalates) {
    it(`[${c.lang}] "${c.text}" → STILL escalates (corroborated)`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, escalates: escalates(r) }).toMatchObject({ escalates: true });
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

// ─────────────────────────────────────────────────────────────────────────────
// CB-R2-01 (P1) — negation SCOPE. The KeywordEngine reset its negation window after a
// SINGLE content word, so in "je n'ai pas de maux de tête" the head noun "tête" leaked as
// POSITIVE; its arabizi synonyms (tasdiya / ras youja3) match the céphalée red-flag keyword_tn
// → a FALSE urgent_consult. The window now spans the full noun phrase until a hard reset
// (connector mais/et/and/… or clause punctuation). These negated-headache phrasings MUST NOT
// route to the red_flag path.
describe('Chatbot triage — negated headache must NOT escalate (CB-R2-01)', () => {
  const negatedHeadache = [
    "je n'ai pas de maux de tête",
    'aucun maux de tête',
    'pas de maux de tête',
  ];
  for (const text of negatedHeadache) {
    it(`"${text}" → NOT a red_flag`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
    });
  }

  // Controls: other negated symptoms still suppressed …
  it('"je n\'ai pas de fièvre" → NOT a red_flag', async () => {
    const r: any = await analyzeMessage("je n'ai pas de fièvre");
    expect(r.type).not.toBe('red_flag');
  });
  it('"je ne saigne pas" → NOT a red_flag', async () => {
    const r: any = await analyzeMessage('je ne saigne pas');
    expect(r.type).not.toBe('red_flag');
  });

  // … and the widened negation window must NOT swallow real emergencies.
  it('"je saigne beaucoup" → STILL escalates (hemorrhage)', async () => {
    const r: any = await analyzeMessage('je saigne beaucoup');
    expect(escalates(r)).toBe(true);
  });
  it('"maux de tête violents" → STILL escalates (céphalée)', async () => {
    const r: any = await analyzeMessage('maux de tête violents');
    expect(escalates(r)).toBe(true);
  });
  // Hard-reset boundary: a connector re-opens positive scope after a negated symptom.
  it('"je n\'ai pas de fièvre et mal à la tête" → STILL escalates (headache after "et")', async () => {
    const r: any = await analyzeMessage("je n'ai pas de fièvre et mal à la tête");
    expect(escalates(r)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R2-02 (P2) — suggestion MIS-ROUTING. Loose bidirectional substring scoring let 1-letter
// label tokens (FR elision "à"/"a", EN article "a"/pronoun "i") match almost any user word, so
// benign nutrition queries scored 80 on the bleeding (cs06) / headache (cs09) symptom chips.
// Fix: whole-word token equality + a min-confidence floor + a nutrition/topic preference for
// food & drink queries. These food/drink questions MUST NOT surface a bleeding/headache chip.
describe('Chatbot triage — food/drink queries must NOT mis-route to a symptom chip (CB-R2-02)', () => {
  const SYMPTOM_FALSE_CHIPS = ['cs06', 'cs09']; // bleeding / violent headache
  const foodDrink = [
    'manger du fromage',
    'puis-je boire du café',
    'puis-je boire du café ?',
    'est-ce que je peux manger du fromage ?',
  ];
  for (const text of foodDrink) {
    it(`"${text}" → not the bleeding/headache symptom suggestion`, async () => {
      const r: any = await analyzeMessage(text);
      // never the direct red_flag path
      expect(r.type).not.toBe('red_flag');
      expect(r.redFlag).toBeUndefined();
      // if it routes as a suggestion, it must not be the bleeding/headache chip
      if (r.type === 'suggestion') {
        expect(SYMPTOM_FALSE_CHIPS).not.toContain(r.suggestions?.[0]?.suggestion_id);
        expect((r.suggestions?.[0]?.topic || '').toLowerCase()).not.toContain('symptom');
      }
      // and no emergency banner text leaks into the message
      const msg: string = typeof r.message === 'string' ? r.message : '';
      expect(msg).not.toContain('⚠️');
      expect(msg).not.toContain('🚨');
    });
  }

  // Control: a deliberately-typed food TOPIC query still surfaces nutrition help.
  it('"quels aliments éviter ?" → still surfaces the nutrition suggestion', async () => {
    const r: any = await analyzeMessage('quels aliments éviter ?');
    expect(r.type).toBe('suggestion');
    expect((r.suggestions?.[0]?.topic || '').toLowerCase()).toContain('nutrition');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R5-01 (P1 CLINICAL — over-escalation). EN 'liver' is overwhelmingly a FOOD word in
// pregnancy questions, yet it is a single-token keyword of the HELLP emergency flag — a lone
// occurrence fired a full EMERGENCY + call button ("is liver pate safe" → HELLP). FR 'foie' was
// already gated; the EN equivalents (liver/hepatic/ribs) were not. Fix: add them to
// GENERIC_FLAG_TOKENS so a bare mention needs corroboration. The multiword "liver pain" and a
// "severe … liver" report still escalate.
describe('Chatbot triage — EN liver as a food must NOT escalate (CB-R5-01)', () => {
  const benignLiver = [
    'is liver pate safe',
    'can I eat beef liver',
    'chicken liver is rich in iron',
  ];
  for (const text of benignLiver) {
    it(`"${text}" → no red_flag AND no ⚠️/🚨 emergency message`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
      const msg: string = typeof r.message === 'string' ? r.message : '';
      expect({ phrase: text, msg }).toMatchObject({ msg: expect.not.stringContaining('⚠️') });
      expect({ phrase: text, msg }).toMatchObject({ msg: expect.not.stringContaining('🚨') });
    });
  }

  // Guard: a corroborated liver report STILL escalates (HELLP must not be weakened).
  const stillEscalatesLiver = [
    'liver pain',                 // multiword keyword → strong match
    'I have severe liver pain',   // intensifier 'severe' + multiword
  ];
  for (const text of stillEscalatesLiver) {
    it(`"${text}" → STILL escalates (HELLP)`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, escalates: escalates(r) }).toMatchObject({ escalates: true });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R5-02 (P1 CLINICAL — over-escalation). The everyday word 'week' fuzzy-corrected to 'weak'
// (a single-token keyword of the fetal-distress flag) because they share a first letter and
// differ by one edit → "see you next week" / "my appointment is next week" escalated to a
// fetal-distress URGENT. Fix: a FuzzyMatcher allow-list never treats week/weeks (and other
// frequent safe words) as typos, AND a lone 'weak' is gated to require a baby/movement concept.
describe('Chatbot triage — "week" must NOT fuzzy-correct to "weak" / escalate (CB-R5-02)', () => {
  const benignWeek = [
    'my appointment is next week',
    'see you next week',
    'the baby is due in two weeks',
  ];
  for (const text of benignWeek) {
    it(`"${text}" → no red_flag`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
    });
  }

  // Guard: a REAL "weak" report with baby context still escalates (fetal distress).
  it('"my baby is weak and barely moving" → STILL escalates (fetal distress)', async () => {
    const r: any = await analyzeMessage('my baby is weak and barely moving');
    expect(escalates(r)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R5-03 (P1 CLINICAL — UNDER-escalation, MOST IMPORTANT). Natural reduced-fetal-movement
// phrasings did NOT escalate: the negation/reduction cue pushed the baby + movement tokens into
// the negative bucket, so only rigid exact phrases + the AR substring escalated, leaving these
// to return a benign info card. Fix: reduced fetal movement is detected as a negation-aware
// concept (baby + movement + reduction/negation cue) that FORCES the fetal-movements red flag.
describe('Chatbot triage — natural reduced-fetal-movement phrasings MUST escalate (CB-R5-03)', () => {
  const reducedMovement: { lang: string; text: string }[] = [
    // EN
    { lang: 'en', text: 'my baby is not moving anymore' },
    { lang: 'en', text: "I don't feel my baby move" },
    { lang: 'en', text: 'I feel fewer movements today' },
    // FR
    { lang: 'fr', text: 'mon bébé ne bouge plus' },
    { lang: 'fr', text: 'je ne sens plus mon bébé bouger' },
    { lang: 'fr', text: 'bébé ne bouge pas depuis hier' },
  ];
  for (const c of reducedMovement) {
    it(`[${c.lang}] "${c.text}" → escalates (fetal movements)`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, severity: r.redFlag?.severity, escalates: escalates(r) })
        .toMatchObject({ escalates: true });
    });
  }

  // CRITICAL control: a baby+movement phrase with NO reduction cue (benign reassurance) must
  // NOT escalate — the reduction/negation cue is required.
  const benignMovement: { lang: string; text: string }[] = [
    { lang: 'en', text: 'baby moves a lot' },
    { lang: 'en', text: 'my baby is kicking a lot today' },
    { lang: 'fr', text: 'bébé bouge beaucoup' },
  ];
  for (const c of benignMovement) {
    it(`[${c.lang}] "${c.text}" → NOT a red_flag (benign movement)`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R6-01 (P1 CLINICAL — UNDER-escalation, rupture of membranes). The universal layperson
// phrasings of waters breaking did NOT escalate: the 'liquide chaud' flag only carried the
// clinical "liquide chaud,écoulement,vaginal", so "my water broke" / "je perds les eaux" /
// "la poche des eaux a rompu" tokenized to harmless words and returned a benign info card.
// Two incidental MIS-routes also surfaced: "perte des eaux" hit the hemorrhage EMERGENCY via
// the generic token "perte", and "j'ai un liquide chaud" hit the fever flag via the
// "chaud"→fièvre synonym. Fix: canonical multi-word ROM keywords were added in all 4 langs and
// a negation-aware ROM concept detector FORCES the 'liquide chaud' flag and SUPPRESSES the two
// colliding flags. These MUST escalate to the ROM/discharge flag (urgent_consult).
describe('Chatbot triage — rupture of membranes MUST escalate to the ROM flag (CB-R6-01)', () => {
  const romCases: { lang: string; text: string }[] = [
    // EN — layperson "water(s) broke" / leaking fluid
    { lang: 'en', text: 'my water broke' },
    { lang: 'en', text: 'my waters broke' },
    { lang: 'en', text: 'I think my water broke' },
    { lang: 'en', text: 'water is leaking' },
    { lang: 'en', text: 'I am leaking fluid' },
    { lang: 'en', text: 'I think I am leaking amniotic fluid' },
    // FR — perte / poche des eaux
    { lang: 'fr', text: 'je perds les eaux' },
    { lang: 'fr', text: "j'ai perdu les eaux" },
    { lang: 'fr', text: 'la poche des eaux a rompu' },
    { lang: 'fr', text: 'perte des eaux' },              // was → hemorrhage EMERGENCY (wrong)
    { lang: 'fr', text: "j'ai un liquide chaud" },        // was → fever (wrong)
    // AR canonical
    { lang: 'ar', text: 'انفجار كيس الماء' },
    { lang: 'ar', text: 'نزل ماء الولادة' },
    { lang: 'ar', text: 'تمزق كيس الماء' },
  ];
  for (const c of romCases) {
    it(`[${c.lang}] "${c.text}" → escalates to the ROM flag 'liquide chaud'`, async () => {
      const r: any = await analyzeMessage(c.text);
      // (1) it escalates with the right severity …
      expect({ phrase: c.text, type: r.type, severity: r.redFlag?.severity, escalates: escalates(r) })
        .toMatchObject({ escalates: true });
      // (2) … and specifically to the ROM/discharge flag — NOT the hemorrhage or fever mis-route.
      expect({ phrase: c.text, flag: r.redFlag?.red_flag_id })
        .toMatchObject({ flag: 'liquide chaud' });
      expect(r.redFlag?.red_flag_id).not.toMatch(/hemorragie|hémorragie|température/i);
    });
  }

  // CRITICAL controls: benign phrasings that merely share a word must NOT mis-fire.
  //  • "écoulement nasal" (a runny nose) shares the generic discharge token "écoulement".
  //  • "I drank a warm tea" shares "warm" but has no break/leak/water cue.
  const benignRom: { lang: string; text: string }[] = [
    { lang: 'fr', text: 'écoulement nasal' },
    { lang: 'en', text: 'I drank a warm tea' },
    { lang: 'en', text: 'I had a warm drink' },
  ];
  for (const c of benignRom) {
    it(`[${c.lang}] "${c.text}" → NOT a red_flag (benign, no ROM context)`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
    });
  }

  // Regression controls: a real fever / a real hemorrhage on a DIFFERENT phrasing must still win
  // their own flags — the ROM suppression is scoped only to ROM-detected messages.
  it('"j\'ai de la fièvre" → STILL escalates to the fever flag (suppression is ROM-scoped)', async () => {
    const r: any = await analyzeMessage("j'ai de la fièvre");
    expect(escalates(r)).toBe(true);
    expect(r.redFlag?.red_flag_id).toMatch(/température/i);
  });
  it('"je perds beaucoup de sang" → STILL escalates to a hemorrhage EMERGENCY', async () => {
    const r: any = await analyzeMessage('je perds beaucoup de sang');
    expect(escalates(r)).toBe(true);
    expect((r.redFlag?.severity || '').toLowerCase()).toBe('emergency');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R7-01 / CB-R7-02 (P1 CLINICAL — over-escalation, forced-path negation/reassurance bypass).
// The reducedFetalMovement and ruptureOfMembranes detectors FORCED their red flag onto the match
// list AFTER the negation guard, so NEGATED/REASSURING phrasings over-escalated:
//   "my water has not broken yet" / "je n'ai pas perdu les eaux"        → liquide-chaud URGENT
//   "baby is moving normally, no concerns" / "bébé bouge bien pas de souci" → fetal-movement URGENT
// Fix: the fetal path aborts when a REASSURANCE token co-occurs (normally/bien/no concerns/pas de
// souci…); the ROM path aborts when a negation SCOPES a rupture/fluid cue (and the negated ROM
// multiword keyword is suppressed too). Genuine reports keep escalating (controls below).
describe('Chatbot triage — negated/reassuring ROM & fetal-movement must NOT escalate (CB-R7-01/02)', () => {
  const benign: { lang: string; text: string }[] = [
    { lang: 'en', text: 'my water has not broken yet' },
    { lang: 'fr', text: "je n'ai pas perdu les eaux" },
    { lang: 'fr', text: 'je nai pas perdu les eaux' },          // no-apostrophe variant
    { lang: 'en', text: 'baby is moving normally, no concerns' },
    { lang: 'fr', text: 'bébé bouge bien pas de souci' },
    { lang: 'fr', text: 'bébé bouge normalement tout va bien' },
  ];
  for (const c of benign) {
    it(`[${c.lang}] "${c.text}" → NOT a red_flag`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
    });
  }

  // Controls: GENUINE ROM / reduced-movement (no reassurance, affirmative event) STILL escalate.
  const stillEscalates: { lang: string; text: string; flag?: string }[] = [
    { lang: 'en', text: 'my water broke', flag: 'liquide chaud' },
    { lang: 'fr', text: 'je perds les eaux', flag: 'liquide chaud' },
    { lang: 'en', text: 'my baby is not moving anymore' },
    { lang: 'en', text: 'my baby has not moved all day' },
    { lang: 'fr', text: 'mon bébé ne bouge plus' },
    { lang: 'fr', text: 'bébé ne bouge pas depuis hier' },
  ];
  for (const c of stillEscalates) {
    it(`[${c.lang}] "${c.text}" → STILL escalates${c.flag ? ` (${c.flag})` : ''}`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, escalates: escalates(r) }).toMatchObject({ escalates: true });
      if (c.flag) expect(r.redFlag?.red_flag_id).toBe(c.flag);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R7-03 (P1 CLINICAL — over-escalation, Arabic substring + ungated generics). The AR matcher
// did normalizedText.includes(keyword) and unconditionally set matchCount++/strongMatch, bypassing
// the generic-token gating. The 2-char blood token "دم" is a SUBSTRING of the benign "القادم"
// (next), so "متى موعد السونار القادم" (when is my next ultrasound) fired a hemorrhage EMERGENCY.
// Fix: AR keywords match on WORD BOUNDARIES (clitic-aware so "الانتحار"→"انتحار" still matches but
// "القادم"↛"دم"), and generic AR tokens require corroboration like the latin path.
describe('Chatbot triage — Arabic generic-substring must NOT escalate (CB-R7-03)', () => {
  const benignAr = [
    'متى موعد السونار القادم',   // when is my next ultrasound (القادم ⊃ دم)
    'متى الفحص القادم عندي',     // when is my next check-up
    'ما هي الأطعمة المفيدة للحامل', // what foods are good for a pregnant woman
  ];
  for (const text of benignAr) {
    it(`[ar] "${text}" → NOT a red_flag`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
    });
  }

  // Controls: REAL Arabic emergencies still escalate (specific tokens + clitic-prefixed forms).
  const stillEscalatesAr: { text: string }[] = [
    { text: 'عندي نزيف' },              // I have bleeding
    { text: 'عندي نزيف قوي' },          // heavy bleeding (intensifier)
    { text: 'النزيف لا يتوقف' },        // the bleeding won't stop (clitic ال+نزيف)
    { text: 'أريد أن أموت' },           // want to die
    { text: 'أفكر في الانتحار' },       // thinking of suicide (clitic ال+انتحار)
    { text: 'لا أشعر بحركة الجنين منذ الصباح' }, // no fetal movement
  ];
  for (const c of stillEscalatesAr) {
    it(`[ar] "${c.text}" → STILL escalates`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, escalates: escalates(r) }).toMatchObject({ escalates: true });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R7-04 (P1 CLINICAL — over-escalation, FR chaud→fièvre). The synonym 'chaud(e)'→fièvre made a
// warm DRINK/FOOD escalate to the fever flag: "j'ai bu une tisane chaude" → température élevée
// URGENT (the EN "warm tea" analogue was already safe). Fix: a warm-drink/food context with no
// explicit fever lexeme suppresses the fever flag. Real fever still escalates (explicit lexeme/degree).
describe('Chatbot triage — warm drink/food must NOT escalate to fever (CB-R7-04)', () => {
  const benignWarm = [
    "j'ai bu une tisane chaude",
    "j'ai bu un thé chaud ce matin",
    'un café chaud le matin est-il ok',
    "j'ai mangé une soupe chaude",
    'I drank a warm tea',
    'I had a hot chocolate',
  ];
  for (const text of benignWarm) {
    it(`"${text}" → no red_flag AND no ⚠️/🚨 message`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
      const msg: string = typeof r.message === 'string' ? r.message : '';
      expect({ phrase: text, msg }).toMatchObject({ msg: expect.not.stringContaining('⚠️') });
      expect({ phrase: text, msg }).toMatchObject({ msg: expect.not.stringContaining('🚨') });
    });
  }

  // Controls: a REAL fever (explicit lexeme / temperature) STILL escalates to the fever flag.
  const stillFever = ["j'ai de la fièvre", "j'ai une forte fièvre", "j'ai 39 de fièvre", 'I have a high fever of 39 degrees'];
  for (const text of stillFever) {
    it(`"${text}" → STILL escalates (fever)`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, escalates: escalates(r) }).toMatchObject({ escalates: true });
      expect(r.redFlag?.red_flag_id).toMatch(/température/i);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R7-05 / CB-R7-06 (P1 CLINICAL — UNDER-escalation, inflected forms). Safety-category misses:
//   • suicidal gerunds "ending my life" / "ending it all" (keyword was literal "end my life")
//   • presyncope "going to faint" / "feel faint" (keywords had "fainted" but not these phrasings)
// Fix: inflected/gerund variants added to chatbot_data.ts. A bare 'faint' token is gated against
// the common BENIGN "faint line"/"faint heartbeat" object descriptions (both word orders) so it
// does not over-fire — genuine presyncope uses the multiword phrases.
describe('Chatbot triage — suicidal gerunds & presyncope MUST escalate (CB-R7-05/06)', () => {
  const mustEscalate: { lang: string; text: string; rx: RegExp }[] = [
    { lang: 'en', text: 'I feel like ending my life', rx: /suicid/i },
    { lang: 'en', text: 'I am thinking of ending it all', rx: /suicid/i },
    { lang: 'en', text: 'I want to take my own life', rx: /suicid/i },
    { lang: 'en', text: "I don't want to be here anymore", rx: /suicid/i },
    { lang: 'en', text: 'I think I am going to faint', rx: /perte de conscience/i },
    { lang: 'en', text: 'I feel faint and dizzy', rx: /perte de conscience/i },
    { lang: 'en', text: 'I am about to faint', rx: /perte de conscience/i },
    { lang: 'fr', text: "je vais m'évanouir", rx: /perte de conscience/i },
  ];
  for (const c of mustEscalate) {
    it(`[${c.lang}] "${c.text}" → escalates to the right flag`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, escalates: escalates(r), flag: r.redFlag?.red_flag_id })
        .toMatchObject({ escalates: true });
      expect(r.redFlag?.red_flag_id).toMatch(c.rx);
    });
  }

  // Controls: a "faint LINE/heartbeat" (a benign object description) must NOT escalate.
  const benignFaint = [
    'I see a faint line on my test',
    'is a faint positive still a positive',
    'the second line is very faint',
    'the heartbeat sounded faint on the doppler',
  ];
  for (const text of benignFaint) {
    it(`"${text}" → NOT a red_flag (benign 'faint' object description)`, async () => {
      const r: any = await analyzeMessage(text);
      expect({ phrase: text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CB-R8-01 (P1 CLINICAL — over-escalation, ungated generic SYNONYM single token). Common BENIGN
// FR pain complaints escalated to the 'crampes sévères' URGENT flag (+ call button): "j'ai mal au
// dos", "j'ai mal aux seins c'est normal", "légère douleur au dos", "j'ai mal aux jambes le soir",
// "douleur ligamentaire ronde normale" (EN "I have mild back pain" was already safe).
// ROOT CLASS (same family as CB-R3-01 / CB-R5-01): the generic-token gating listed only the FR/EN
// base words (douleur/pain/…), but KeywordEngine.SYNONYMS expands 'douleur'→'mal','wji3a','wja3',
// 'وجيعة'… and the 'crampes sévères' flag carries those arabizi VARIANTS as single-word keywords_tn
// (e.g. 'wji3a'). A lone pain SYNONYM was therefore an UN-gated single hit. Fix: the gating set is
// now the SYNONYM-CLOSURE of the base generic tokens (built once at module load), so every form
// reachable from a generic concept ('wji3a'/'وجيعة'/'mal'…) is gated exactly like 'douleur', AND
// the "≥2 distinct concepts corroborate" rule counts CANONICAL concepts (not synonym variants), so
// the closure can't auto-satisfy the gate. SPECIFIC bleeding lexemes (nzif/نزيف/saigne…) are kept
// out of the closure so single-hit hemorrhage escalation is unaffected. These benign pain phrasings
// MUST NOT route to the red_flag path nor carry a ⚠️/🚨 emergency banner.
describe('Chatbot triage — benign pain complaints (generic synonym) must NOT escalate (CB-R8-01)', () => {
  const benignPain: { lang: string; text: string }[] = [
    { lang: 'fr', text: "j'ai mal au dos" },
    { lang: 'fr', text: "j'ai mal aux seins c'est normal" },
    { lang: 'fr', text: "j'ai une légère douleur au dos" },
    { lang: 'fr', text: "j'ai mal aux jambes le soir" },
    { lang: 'fr', text: 'douleur ligamentaire ronde normale' },
    { lang: 'en', text: 'I have mild back pain' },                 // already-safe EN control
    { lang: 'ar', text: 'عندي ألم خفيف في الظهر' },               // AR mild back pain (Path A leak)
    { lang: 'tn', text: 'wji3a khafifa fl dahr' },                 // arabizi mild back pain
  ];
  for (const c of benignPain) {
    it(`[${c.lang}] "${c.text}" → no red_flag AND no ⚠️/🚨 emergency message`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, type: r.type, wrongFlag: r.redFlag?.red_flag_id })
        .not.toMatchObject({ type: 'red_flag' });
      expect(r.redFlag).toBeUndefined();
      const msg: string = typeof r.message === 'string' ? r.message : '';
      expect({ phrase: c.text, msg }).toMatchObject({ msg: expect.not.stringContaining('⚠️') });
      expect({ phrase: c.text, msg }).toMatchObject({ msg: expect.not.stringContaining('🚨') });
    });
  }

  // Controls: CORROBORATED severe pain (intensifier, multiword clinical phrase, or a 2nd distinct
  // generic concept) MUST still escalate — the synonym-aware gate must not weaken real emergencies.
  const stillEscalates: { lang: string; text: string; rx?: RegExp }[] = [
    { lang: 'fr', text: 'crampes sévères', rx: /crampes/ },           // multiword strong-match
    { lang: 'fr', text: 'douleur unilatérale violente' },             // intensifier 'violente'
    { lang: 'en', text: 'one-sided severe pain' },                    // intensifier 'severe'
    { lang: 'tn', text: 'wji3 qawi fl karch' },                       // arabizi multiword 'wji3 qawi'
    { lang: 'fr', text: "j'ai une douleur au foie" },                 // 2 concepts (douleur + foie)
  ];
  for (const c of stillEscalates) {
    it(`[${c.lang}] "${c.text}" → STILL escalates (corroborated)`, async () => {
      const r: any = await analyzeMessage(c.text);
      expect({ phrase: c.text, escalates: escalates(r) }).toMatchObject({ escalates: true });
      if (c.rx) expect(r.redFlag?.red_flag_id).toMatch(c.rx);
    });
  }
});
