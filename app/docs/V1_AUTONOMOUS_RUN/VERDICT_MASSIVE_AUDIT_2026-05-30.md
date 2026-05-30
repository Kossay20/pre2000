# VERDICT — Massive Audit (2026-05-30)

**Scope:** Whole-project audit of Mama & Bébé — chatbot triage reasoning (40-phrase adversarial
corpus in 4 langs), multilingual/RTL visual (34 screenshots × 4 langs), i18n parity (value-level),
a11y, clinical-safety keyword coverage, GDPR/privacy, graceful degradation. 87 subagents ran
across 8 finder dimensions + adversarial verification + synthesis (partial — workflow hit
StructuredOutput timeout in synthesis step; findings extracted from 83/87 completed agents).

**Methodology:** GStack + Superpowers test-e2e dual-team loop + Ultracode Workflow (8 parallel
finders, per-finding 3-lens adversarial verify: harness-artifact / evidence / severity).
Pregnancy app — invariants: clinical-safety + GDPR + i18n-parity. NOT FoodKing.

---

## Findings summary: 26 raw → P0 ×4, P1 ×7, P2 ×9, P3 ×6

---

## P0 findings — FIXED (commit d32454b)

| ID | Surface | Defect | Fix |
|----|---------|--------|-----|
| S1 | `chatbot_data.ts:2087-2090` | **Suicide flag i18n parity**: EN had 12 layperson paraphrases (`want to die, kill myself, end my life…`); FR had 2 clinical terms, AR had 2. FR "j'ai envie d'en finir avec la vie" and AR "أريد أن أموت" silently dropped (corpus proof: E03, E12 FAIL). | Add native paraphrases: FR `en finir,vouloir mourir,me faire du mal,mourir,suicid`; AR `انتحار,أؤذي,أموت,أريد أن أموت,لا أريد الحياة`; TN arabizi. |
| S2 | `chatbot_data.ts:2125-2128` | **HELLP syndrome unreachable**: FR `douleur foie` and AR `ألم الكبد` are multiword keywords requiring exact contiguous substring — common phrasings like "j'ai une douleur au foie" miss entirely. | Replace with single-token: `foie,hépatique,côtes` (FR); `كبد,كبدي` (AR). |
| S3 | `chatbot_data.ts:2106-2107` | **Eclampsia inflected forms**: noun `évanouissement` (FR) does not match adjective `évanouie`; `فقدان الوعي` multiword (AR) misses inflected `أغمي علي`. | Add `évanouie,évanouir,évanoui,inconsciente` (FR); `أغمي,إغماءة` (AR). |
| S4 | `chatbot_data.ts:2068` | **Breathlessness adjective** (P1 → treated as P0 given severity=emergency): `essoufflement` noun misses `essoufflée`. FR "je suis essoufflée" routed to dehydration (urgent_consult) instead of essoufflement (emergency). | Add `essouffl,essoufflée,essoufflé,souffle` to keywords_fr. |

**Lock:** 13 new assertions in `chatbotTriage.test.ts` covering all 4 P0 cases. Corpus: 39/40
PASS (was 37/40 before these fixes + CB4-FIX earlier).

---

## P1 findings — FIXED (commit d32454b)

| ID | Surface | Defect | Fix |
|----|---------|--------|-----|
| CAL1 | `CalendarHeader.tsx:43-45, 54, 56, 72` | **Calendar RTL double-mirror**: code applied BOTH `flexDirection:'row-reverse'` AND glyph swap (chevron-forward↔back) → both nav arrows pointed INWARD in AR/TN. Also: a11y labels not swapped with onPress (left button called `onNextWeek` but labelled "previousWeek"). | Remove both swaps. Standard calendar UX (Apple iOS Arabic) uses ← = earlier / → = later. Left=onPrevWeek+label previousWeek; right=onNextWeek+label nextWeek. Verified in ar-tab1.png. |
| TN1 | `tn/common.json:118` | `"dashboard": "Tableau de bord"` — plain French in a TN Darija/Arabic catalog, leaks to Profile section title. | → `"لوحات القياس"` (matches AR). |
| TN2 | `tn/common.json:120` | `"privacyPolicy": "Politique de confidentialité"` — plain French in TN catalog. | → `"سياسة الخصوصية"` (matches AR). |
| TN3 | `tn/common.json:141` | `"الأعراض (القلق)"` — "symptoms (anxiety)" wrong gloss in chatWelcome. | → `"الأعراض (العوارض)"`. Verified in tn-tab4.png. |

**P1 deferred (source-only, no E2E):**
- **SUG1** — Suggestion path renders full emergency message on benign/low-score inputs when
  `linked_red_flag_ids` is set. Safety-errs toward disclosure; true cry-wolf risk is P1 but
  needs careful scope analysis (chatbotService.ts:474-478). Deferred as post-G2 hardening.
- **GDPR1** — Privacy policy guest-mode claim ("data stored only on your device, not sent to
  our servers") becomes false post G1 (Anonymous Auth writes to Firestore). Must be updated
  before G1 is enabled. Owner-gate dependency: flag for G1 runbook.

---

## P2 findings — DOCUMENTED (no code change)

| Defect | Anchor | Status |
|--------|--------|--------|
| Bare `douleur` keyword → sleep complaint "je dors mal" over-escalates to crampes sévères | `chatbot_data.ts:1895, KeywordEngine.ts:9` | Deferred P2; same root WF1. Both affected flags are `urgent_consult`, safety outcome preserved. Needs synonym-scope rework. |
| i18n parity test is value-blind (guards key existence, not translated values) | `i18nParity.test.ts:52-63` | Documented P2. Adding value-level assertions is low-risk; deferred to post-audit polish. |
| GDPR: no consent gate before Sentry.init + Analytics screen tracking | `App.tsx:18-25, analyticsService.ts:173` | P2. `setCollectionEnabled` exists but 0 call-sites. Owner decision: opt-in or error-only. |
| Emergency call button ~37px tap target (WCAG 44px minimum) | `ChatbotScreen.tsx:427-434` | P2. `paddingVertical:8` → bump to 12 for 44px. Easy; deferred to polish. |
| Icon-only reminder controls missing accessibilityLabel/Role | `HydrationCard.tsx:92-97, ReminderCardV2.tsx:137-139, ReminderEditModal.tsx:290-326` | P2. Add labels per component. Deferred to polish. |
| Water-tracker card droplet icon overlaps RTL title | `multilang/ar-tab2.png, tn-tab2.png` | P2. Fixed-start-margin in card flex row. Deferred. |
| Visual inconsistency: Home vs Resources error cards render differently | `HomeScreen.tsx:264-274 vs ArticlesListScreen.tsx:159-175` | P2. Shared `<ErrorCard>` component would unify. Already tracked T1. |

---

## P3 findings — NOTED

- Heavy-bleeding articles topically unrelated (Medical Exams / Multiple Pregnancies) — tracked T8/T9.
- Orphan per-namespace JSON stubs (ui/article/babyEvolution/support) on disk, imported by nothing.
- Language picker cards missing `accessibilityRole='button'` — visible text children mitigate.
- `01-home-offline-boundary.png` shows skeleton state, not error boundary — audit artifact note.

---

## Verification

- **Unit:** 62 suites / **1623 tests green**, tsc clean (post-fix, post-delete of temp audit files).
- **E2E (fresh `expo export` + `serve --single`):** **34/34 green** across 4 specs.
- **Chatbot corpus:** 39/40 PASS. T02 sleep complaint ("je dors mal la nuit" → crampes sévères)
  remains — P2 over-triage, safety preserved (both flags are `urgent_consult`), deferred.
- **Visual (post-fix):**
  - `ar-tab1.png` (Calendar): chevrons now point outward — left `<` pointing left, right `>` pointing right. ✓
  - `tn-tab4.png` (Chatbot): welcome message shows "الأعراض (العوارض)" — correct gloss. ✓

---

## Deferred items (non-blocking, owner or post-G2)

| ID | Sev | Why deferred |
|----|-----|-------------|
| SUG1 | P1 | Suggestion→emergency message on benign input; needs chatbotService scope analysis pre-fix |
| GDPR1 | P1 | False privacy claim only triggered post-G1 (Anonymous Auth); flag for G1 runbook |
| T02 bare-douleur | P2 | Same root as WF1; safety outcome unchanged; needs synonym rework |
| a11y tap-target | P2 | 37px emergency button; easy; deferred to polish |
| Reminder icon a11y | P2 | 5 controls missing labels; deferred to polish |
| Analytics consent | P2 | Owner decision (opt-in vs error-only); architectural |
| RTL water-tracker | P2 | Layout fix in hydration card; deferred |
| TN chatbot article map | P3 | Tracked T8/T9 |

---

## Commits

- `d32454b` fix(v1-ship): massive-audit P0/P1 — suicide i18n parity + HELLP/eclampsia + calendar RTL + TN strings
- (Prior session) `25f8eee → 76fabf6` — abuse-e2e audit cycle (CB4 severity, BAN1/BAN2 banners, NEG1, RTL1 chevrons, TAB3 multilang)

**Gate held:** nothing pushed. Merge/push awaits explicit owner go.
Owner gates G1 (Anonymous Auth) + G2 (clinical sign-off) still block store ship — human-only.
