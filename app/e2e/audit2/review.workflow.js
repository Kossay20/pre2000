export const meta = {
  name: 'mamabebe-e2e-review',
  description: 'Adversarial multimodal E2E review of mama-bebe across 4 languages (FR/EN/AR/TN)',
  phases: [
    { title: 'Review', detail: 'multimodal visual+technical review per wave across 4 langs' },
    { title: 'Verify', detail: 'adversarially refute each P0/P1 finding' },
  ],
};

// Round is hardcoded per-run to avoid the args-stringification ambiguity that
// silently defaulted a prior run to round-1 (reviewing stale pre-fix captures).
const ROUND = 10;
const BASE = `/Users/1millnonstop/Downloads/pregnancy-app/pre2000/app/e2e/audit2/round-${ROUND}`;
const LANGS = ['fr', 'en', 'ar', 'tn'];

const CONTEXT = `
# AUDIT CONTEXT — read carefully, it changes what counts as a defect

App: "Mama & Bébé" pregnancy app — Expo 54 / React Native 0.81 / RN-Web static export, served as SPA on :8081.
Harness: a GUEST profile (week 18, France) is seeded in localStorage, mobile viewport 390x844, deviceScaleFactor 2.

## The single most important nuance — offline/guest Firestore is EXPECTED
This harness runs with Firestore Anonymous-Auth OFF, so every Firestore content read returns
"FirebaseError: Missing or insufficient permissions" (console) and HTTP 403 on firestore.googleapis.com (network).
THIS IS THE EXPECTED TRIGGER for the app's offline/guest fallback. Do NOT, by itself, flag these as defects.
Judge each screen by its OUTCOME instead:
  - PASS  = the screen gracefully shows real content (bundled fallback), a clean empty-state (illustration+copy+CTA), or a recoverable "retry" state.
  - DEFECT = the screen dead-ends in a broken "Oups"/error with no content where bundled content SHOULD exist, OR is blank/white, OR crashes (ErrorBoundary "Oops"/"Something went wrong"), OR shows a raw stack.

## Recently added fallback (the thing most worth verifying)
Articles list, Supplements list, Article detail, Supplement detail now fall back to BUNDLED local JSON when Firestore fails.
Expected: Articles list shows real articles ("Les symptômes de grossesse", "Alimentation pendant la grossesse"...);
Supplements list shows real supplements ("Acide folique", "Fer", "Vitamine D"...); detail screens show full content.
If any of these shows an error/empty state instead of bundled content => P0 (the fallback regressed).

## 4 languages
fr = French (LTR), en = English (LTR), ar = Arabic (RTL), tn = Tunisian Arabic / Derja (RTL).
- For ar AND tn the meta.json "dir" MUST be "rtl" and the layout must visually mirror (back-chevrons, alignment).
- i18n completeness per language is critical:
  * Raw key leak (visible text like "home.myDay", "common.screen.article", "label.add_to_cart") => P1.
  * WRONG-LANGUAGE text: French/English sentences showing on an ar/tn screen (beyond a single brand word) => P1 i18n gap.
    (Note: tn legitimately falls back to ar then en/fr for missing keys — a FEW fallback words are tolerable, but whole
     French UI sentences on an Arabic screen is a real gap. Use judgment; cite the exact text.)
  * Numbers/dates not localized is P2 unless clearly broken.

## Accepted residuals — do NOT raise these as new defects
- Chatbot is BETA and shows a permanent medical disclaimer — that is intentional, not a defect.
- A guest inside MainTabs cannot navigate to the Auth "create account" stack (Firebase-web limitation); an explanatory
  message is shown instead — intentional.
- Soft brand pink (#FF6B9D) decorative FILLS are intentional. Only flag pink when it BACKS or CARRIES text and the
  text contrast is < 4.5:1 (color_contrast P2), or when it is an active control tint on text.
- Console logs of type "log"/"info"/"warn" and the documented FirebaseError permission-denied are NOT console_error defects.
`;

const PROTOCOL = `
# REVIEWER PROTOCOL (visual-first, then technical)

VISUAL FIRST (examine the .png with your vision before anything else):
  1. text truncation that cuts a meaningful word (P2; P1 if it cuts a button label / critical value)
  2. clickable element overlap / layered modals (P1)
  3. off-brand palette or text-on-bg contrast < 4.5:1 (P2)
  4. empty state with no illustration AND no copy AND no CTA (P2)
  5. broken layout / element off-screen that should be visible / RTL not mirrored on ar|tn (P1 if it breaks a task)
  6. blank/white screen or visible crash/error where content is expected (P0)

THEN TECHNICAL (.meta.json = {title,dir,lang,bodyTextSample}; .console.json = {navError,console[]}; .network.json):
  7. i18n raw-key leak in bodyTextSample (P1)
  8. wrong-language UI text for the screen's language (P1)
  9. navError present (page failed to load) (P0)
 10. console entry type "error"/"pageerror" from APP code NOT explained by the documented offline trigger (P1)
 11. network status >=500, or a >=400 that is NOT the expected firestore 403 / auth 401 (P0)
 12. numeric/content integrity: same fact differing across surfaces, obviously wrong value (P0)

SEVERITY GATE: P0 and P1 block delivery. P2/P3 are disclosed, not blocking.
Be adversarial and concrete: cite the EXACT screen file, language, and the EXACT text/pixels you saw.
Do NOT invent defects; if a screen is clean, say so. A passing screen is the floor — hunt for what was missed,
but every finding must be backed by a concrete observation in a named artifact.
`;

// Wave definitions. mode = guest|fresh. states are the file basenames (without lang dir).
const WAVES = [
  { id: 'W1', mode: 'guest', label: 'home+recommendations+baby', states: ['01-home', '02-recommendations', '17-baby-evolution'] },
  { id: 'W2', mode: 'guest', label: 'content-fallback (CRITICAL)', states: ['03-resources-articles', '03b-resources-supplements', '04-article-detail', '05-supplement-detail'] },
  { id: 'W3', mode: 'guest', label: 'calendar+reminders+stats', states: ['06-calendar', '07-add-appointment', '08-reminders', '09-statistics'] },
  { id: 'W4', mode: 'guest', label: 'health+weight+foods', states: ['10-health-dashboard', '11-weight-tracker', '15-forbidden-foods'] },
  { id: 'W5', mode: 'guest', label: 'cycle8 tools', states: ['12-kick-counter', '13-contraction-timer', '14-hospital-bag'] },
  { id: 'W6', mode: 'guest', label: 'profile+settings+diag+lang+guest-upgrade', states: ['18-profile', '19-settings', '20-diagnostic', '21-language-select', '23-guest-upgrade'] },
  { id: 'W7', mode: 'guest', label: 'ramadan+chatbot', states: ['16-ramadan', '22-chatbot'] },
  { id: 'W8', mode: 'fresh', label: 'auth entry', states: ['01-welcome', '02-authchoice', '03-register', '04-login'] },
  { id: 'W9', mode: 'fresh', label: 'onboarding+privacy', states: ['05-onboarding', '06-privacy'] },
];

const FINDING_PROPS = {
  id: { type: 'string', description: 'wave id + sequence, e.g. W2-001' },
  state: { type: 'string', description: 'state basename, e.g. 03-resources-articles' },
  lang: { type: 'string', enum: ['fr', 'en', 'ar', 'tn', 'all'] },
  category: { type: 'string' },
  severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
  evidence: { type: 'string', description: 'exact text/pixel observation in the named artifact' },
  fix_hint: { type: 'string', description: 'file path + concrete suggested fix if known' },
};

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['wave', 'states_reviewed', 'findings', 'summary', 'verdict'],
  properties: {
    wave: { type: 'string' },
    states_reviewed: { type: 'number' },
    findings: {
      type: 'array',
      items: { type: 'object', required: ['id', 'state', 'lang', 'category', 'severity', 'evidence'], properties: FINDING_PROPS },
    },
    summary: {
      type: 'object',
      required: ['P0', 'P1', 'P2', 'P3'],
      properties: { P0: { type: 'number' }, P1: { type: 'number' }, P2: { type: 'number' }, P3: { type: 'number' } },
    },
    verdict: { type: 'string', enum: ['GREEN', 'AMBER', 'RED'] },
    notes: { type: 'string' },
  },
};

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'final_severity', 'reason'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'refuted', 'downgraded'] },
          final_severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'none'] },
          reason: { type: 'string', description: 'why it is real or a false positive — re-cite the artifact' },
        },
      },
    },
  },
};

function fileLines(wave) {
  const lines = [];
  for (const s of wave.states) {
    for (const l of LANGS) {
      lines.push(`  - ${BASE}/${wave.mode}/${l}/${s}.png   (+ .meta.json, .console.json, .network.json siblings)`);
    }
  }
  return lines.join('\n');
}

function reviewPrompt(wave) {
  return `${CONTEXT}\n${PROTOCOL}
# YOUR TASK
You are an adversarial QA reviewing WAVE ${wave.id} ("${wave.label}"), mode=${wave.mode}, across all 4 languages ${JSON.stringify(LANGS)}.
States in this wave: ${JSON.stringify(wave.states)}.

For EVERY state x EVERY language, use the Read tool on the .png (you SEE it) and on the sibling .meta.json / .console.json / .network.json.
Artifacts:
${fileLines(wave)}

Compare the SAME state across fr/en/ar/tn to catch i18n gaps, wrong-language text, and RTL (ar/tn must have dir=rtl and mirrored layout).
Apply the reviewer protocol. Remember the offline-Firestore nuance: do not flag the expected permission-denied/403 unless the SCREEN is actually broken.

Emit a findings object EXACTLY per the provided schema. Each finding MUST name the state, the lang, the category, a severity, and concrete evidence (the exact text or visual you saw, in which file). If a state is clean in all langs, add NO finding for it. Keep P0/P1 strictly for blocking defects.`;
}

function verifyPrompt(wave, blocking) {
  return `${CONTEXT}
# ADVERSARIAL VERIFICATION
Another reviewer flagged these P0/P1 findings on wave ${wave.id} (${wave.label}), mode=${wave.mode}.
Your job: try to REFUTE each one. Re-Read the cited artifact (.png + .meta.json/.console.json/.network.json) yourself and decide:
  - "confirmed": the defect is real and blocking (keep severity).
  - "downgraded": real but it is actually P2/P3 quality, or it is an accepted residual (see context) — give final_severity.
  - "refuted": false positive (e.g. it IS the documented graceful offline state, or the text was misread, or it is intentional) — final_severity "none".
Default to skepticism: if the "defect" is just the expected offline trigger with a working screen, REFUTE it.

Findings to verify (JSON):
${JSON.stringify(blocking, null, 2)}

Artifacts live under: ${BASE}/${wave.mode}/<lang>/<state>.png (+ .meta.json/.console.json/.network.json).
Return verdicts EXACTLY per schema, one per finding id.`;
}

phase('Review');
log(`Reviewing ${WAVES.length} waves x ${LANGS.length} langs (round ${ROUND})`);

const results = await pipeline(
  WAVES,
  (w) => agent(reviewPrompt(w), { label: `review:${w.id}-${w.label}`, phase: 'Review', schema: REVIEW_SCHEMA }),
  (review, w) => {
    if (!review || !Array.isArray(review.findings)) return { wave: w.id, label: w.label, review: review || null, verified: [] };
    const blocking = review.findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
    if (blocking.length === 0) return { wave: w.id, label: w.label, review, verified: [] };
    return agent(verifyPrompt(w, blocking), { label: `verify:${w.id}`, phase: 'Verify', schema: VERIFY_SCHEMA })
      .then((v) => ({ wave: w.id, label: w.label, review, verified: (v && v.verdicts) || [] }))
      .catch(() => ({ wave: w.id, label: w.label, review, verified: [] }));
  },
);

// Aggregate confirmed blocking defects (P0/P1 that survived verification).
const confirmedBlocking = [];
const allFindings = [];
for (const r of results.filter(Boolean)) {
  if (!r.review || !Array.isArray(r.review.findings)) continue;
  const vmap = {};
  for (const v of r.verified) vmap[v.id] = v;
  for (const f of r.review.findings) {
    const v = vmap[f.id];
    const finalSev = v ? (v.final_severity === 'none' ? 'refuted' : v.final_severity) : f.severity;
    const rec = { ...f, wave: r.wave, verify_verdict: v ? v.verdict : 'not_verified', final_severity: finalSev };
    allFindings.push(rec);
    if ((finalSev === 'P0' || finalSev === 'P1') && (!v || v.verdict === 'confirmed')) confirmedBlocking.push(rec);
  }
}

log(`Review complete. ${allFindings.length} raw findings, ${confirmedBlocking.length} confirmed P0/P1 blocking.`);

return {
  round: ROUND,
  waves: results.filter(Boolean).map((r) => ({ wave: r.wave, label: r.label, verdict: r.review && r.review.verdict, summary: r.review && r.review.summary })),
  confirmedBlocking,
  allFindings,
};
