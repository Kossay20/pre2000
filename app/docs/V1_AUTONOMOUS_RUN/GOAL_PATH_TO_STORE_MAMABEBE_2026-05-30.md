# 🎯 GOAL — PATH TO STORE · Mama & Bébé (v1.0)

**Slug** : `PATH_TO_STORE_MAMABEBE` · **Date** : 2026-05-30 · **Branch** : `release/v1.0-ship` · **HEAD** : `f7a5f12`
**Regenerated** because the remote `/ultraplan` session expired before its plan reached this CLI; this is the **local equivalent** anchored on current code.
**Per-task pipeline** : `ultra-audit-profond`. **Methodo** : GSTACK + Superpowers + adversary. **Advisor** : consulted this turn on scope (owner-gates = owner's; deferrals risk-flagged; I3 isolated).

> **Mama & Bébé = pregnancy health app.** No FoodKing / NF525 / POS. Load-bearing invariants = **clinical-safety + GDPR + i18n-parity + link-safety**.

---

## §0 — Préambule

### §0.1 Working-tree decision
Already on `release/v1.0-ship` (clean, 15 commits ahead of `main`, backup tag `backup/pre-ship-2026-05-30`). Continue on this branch; **merge to `main` is a human gate** (no auto-push). Each remaining task = its own commit.

### §0.2 What is ALREADY DONE (do NOT re-plan — verified green at HEAD)
**1393 unit/integration tests (61 suites) + 34 E2E** (cycle9 15 · full-audit 7 · multilang 4 · chatbot-abuse 8), `tsc` + lint clean. Shipped fixes: chatbot EN triage + negation + matching precision (`chatbotTriage.test.ts` 27); notification scheduling (`remindersScheduler`/`babyMessageService`); supplements seed + names; GDPR purge extracted+behavioral (`gdprPurge.test.ts`); RTL reload-loop (`rtl.test.ts`); calendar `location`/color bugs; AR emergency-number disclaimer fix; i18n parity guard; +970 unit tests across every service/util. Reports: `VERDICT_SHIP_V1_2026-05-30.md`, `VERDICT_TEST_CAMPAIGN_2026-05-30.md`.

### §0.3 Scope of THIS goal = the REMAINING path to the App Store / Play Store
Code-side is comprehensively tested. What's left is: (a) a few **no-regret code** items, (b) items needing an **owner decision** (don't do unilaterally), (c) **owner gates** (human-only), (d) **store submission**. Every task is tagged **[NO-REGRET]**, **[OWNER-DECISION]**, or **[OWNER-GATE]**.

### §0.4 Convergence criteria (DONE = in stores)
- `npm run verify` green (no regression vs 1393) + the relevant new test green.
- i18n 4-lang parity green (`i18nParity.test.ts`) on every i18n touch.
- Invariants attested (clinical/GDPR/link/rules tests green) on wave-close.
- For backend-dependent items: proven on a **live** Firebase backend (post owner-gate G1).
- Final: binary in TestFlight + Play internal track.

### §0.5 Interrupt-resume
Per wave: commit WIP `wip(<wave>): …`, write `docs/V1_AUTONOMOUS_RUN/INTERRUPT_<wave>_<ts>.md` (last green SHA + next task), update memory `project_supervisor_findings.md`.

---

## §1 — Map principal (9 systems · all 🟢 tested code-side, remaining work flagged)

| # | System | Code-side state | Remaining work (this goal) |
|---|---|---|---|
| S1 | Chatbot | 🟢 27 triage + abuse-e2e | C4 red-flag→article relevance [OWNER-DECISION/clinical] |
| S2 | Notifications | 🟢 scheduling tested | device-fire proof [OWNER-GATE G3] |
| S3 | Resources/Articles | 🟢 seed+names+tests | error-card consistency [NO-REGRET]; dosing/Darija translation [OWNER-GATE] |
| S4 | i18n | 🟢 parity guard + RTL | I3 Arabic plurals [NO-REGRET-IF-CONFIRMED] |
| S5 | Auth/Onboarding | 🟢 login/migration/GDPR | guest content-load proof [OWNER-GATE G1]; TTC ghost-pregnancy [OWNER-DECISION] |
| S6 | Home/Week | 🟢 calc tested | guest empty-state copy [OWNER-DECISION] |
| S7 | Calendar | 🟢 68 tests, bugs fixed | F55 ISO date localize [NO-REGRET, optional] |
| S8 | Health | 🟢 clinical tests + H1/H2 | — |
| S9 | Profile/Settings/GDPR | 🟢 behavioral purge | — |

**§2 (separated)** : none (app-only; `website/`+`privacy-policy/` out of scope).

---

## §3 — Système : i18n hardening (S4)

### Contract
Every UI string in FR/EN/AR/TN, grammatically correct. Parity is guarded; the one residual is Arabic plural grammar.

### Anchors (verified 2026-05-30)
`src/i18n/locales/{fr,en,ar,tn}/common.json` (`taskCount`/`taskCount_plural`:74-75, `activeCount`/`_plural`:124-125) · `src/i18n/index.ts` (no `compatibilityJSON` set → i18next v25 CLDR mode) · `src/i18n/__tests__/i18nParity.test.ts` (the guard to amend).

### Sub S4.1 — I3 Arabic plurals **[NO-REGRET-IF-CONFIRMED]**
**Tasks** :
- T-S4.1.0 **VERIFY FIRST** (gate): write a throwaway probe asserting `t('taskCount',{count:3})` rendered value in `ar` — confirm it returns the singular (`{{count}} مهمة`) not the plural. If it ALREADY pluralizes correctly → close as non-bug, STOP. *(test TO BE CREATED, throwaway)*
- T-S4.1.1 Migrate `_plural` → i18next v25 CLDR suffixes: en/fr `_one`+`_other`; ar/tn `_zero/_one/_two/_few/_many/_other` (only the 2 keys: taskCount, activeCount). *(anchor: common.json:74-75,124-125 ×4 locales)*
- T-S4.1.2 **Amend `i18nParity.test.ts`** to treat CLDR plural suffixes as allowed cross-locale asymmetry (Arabic legitimately has more forms than FR/EN) — preserve the guard for all NON-plural keys.
**Acceptance** : `i18nParity.test.ts` green (plural-aware) + a new `pluralForms.test.ts` asserting `t('taskCount',{count})` resolves correct form per language at 1/2/3/11 *(test TO BE CREATED at `src/i18n/__tests__/pluralForms.test.ts`)* + `npm run verify` 0 regression.
**Risk note** : touches the parity guard — do as an ISOLATED commit, owner-confirm before merge.

---

## §4 — Système : Content/UX consistency (S3/S6)

### Anchors (verified 2026-05-30)
`src/components/common/{ErrorState,ErrorBoundary,ErrorMessage,EmptyState}.tsx` · `src/i18n/locales/en/common.json:474` ("A small error occurred…") · `src/data/chatbot_data.ts` (`linked_articles_ids`) · `src/screens/{SupplementsListScreen,ArticleDetailScreen}.tsx`.

### Sub S3.1 — Error-state design consistency **[NO-REGRET]**
**Tasks** :
- T-S3.1.1 Audit the 3 divergent error surfaces (global `ErrorBoundary` "Oops!" + pill Retry; `ErrorState` per-screen; Supplements card missing the "Oops!" heading — found in E2E visual review). Unify on ONE `ErrorState` presentation (heading + emoji + message + Retry). *(anchor: ErrorState.tsx)*
**Acceptance** : `ErrorState` snapshot/helper test *(TO BE CREATED at `src/components/common/__tests__/ErrorState.test.tsx`)* + re-run `full-audit.spec.ts` screenshot review shows consistent error cards.

### Sub S3.2 — C4 chatbot red-flag → article relevance **[OWNER-DECISION / clinical]**
**Tasks** :
- T-S3.2.1 Audit `linked_articles_ids` per red flag (hemorrhage currently links "Examens médicaux"/"Grossesses multiples" — irrelevant). Produce a proposed relevant-article mapping. **Do NOT finalize** without midwife review (clinical relevance). → owner gate G2.
**Acceptance** : `CHATBOT_ARTICLE_MAP_2026-05-30.md` proposal + owner/clinician sign-off, then a contract test *(TO BE CREATED at `src/services/__tests__/chatbotArticleRelevance.test.ts`)*.

### Sub S6.1 — F55 date localization **[NO-REGRET, optional]**
- T-S6.1.1 AddAppointment date shows ISO `2026-05-30`; localize via `getDateLocale`/`Intl`. *(anchor: `AddAppointmentScreen.tsx`)* **Acceptance** : extend `i18nHelpers`/date test + visual check 4 langs.

---

## §5 — Système : Guest / Onboarding UX (S5/S6) — **[OWNER-DECISION]**

> These are product/UX decisions (what to SHOW), not bugs with one right answer. Surfaced for the owner; not auto-implemented.

### Anchors (verified 2026-05-30)
`src/context/PregnancyContext.tsx` (`PregnancyMode='pregnant'|'ttc'`, `ttcInfo`, comment "future TTC-specific UI") · `src/screens/HomeScreen.tsx` · `src/context/AuthContext.tsx:286-305` (guest fallback) · `firestore.rules:218-231` (content needs auth).

### Sub S5.1 — G-A guest empty-state **[OWNER-DECISION]**
Decision needed: when content reads fail (e.g., guest before Anonymous-Auth), show a dedicated "connect to load content / retry / offline" state vs the current generic error card. *(Owner picks copy + behavior; then implement + `ErrorState` variant test.)*

### Sub S5.2 — G-C TTC "ghost-pregnancy" **[OWNER-DECISION]**
TTC mode currently renders pregnancy UI at week 0. Decision: (a) build a dedicated TTC home, OR (b) beta-flag/hide pregnancy widgets for `mode==='ttc'`. *(Owner picks; then implement guarded by `pregnancyCalculator`/`fertility` tests + a TTC-home E2E.)*

---

## §6 — Système : E2E hardening (S-cross)

### Anchors (verified 2026-05-30)
`e2e/{cycle9-fixes,full-audit,multilang-audit,chatbot-abuse}.spec.ts` (current green net) · `e2e/{web-smoke,audit-screens,feature-tests,deep-interactive}.spec.ts` (legacy, stale/superseded) · `playwright.config.ts` (static-export harness).

### Sub X.1 — Legacy spec disposition **[NO-REGRET]**
- T-X.1.1 The 4 legacy specs are superseded by full-audit+multilang+chatbot-abuse and fail on stale flows/backend. Decide: DELETE (recommended — redundant) or convert the unique deep-flow cases into the new specs. **Acceptance** : `npm run e2e:web` runs only green specs; no perpetually-red legacy specs in the suite.

### Sub X.2 — Live-backend E2E **[OWNER-GATE-dependent on G1]**
- T-X.2.1 Once G1 (Anonymous Auth + rules deploy + seed) is done: run a real guest journey (fresh guest → onboarding → Home shows week content + tips + articles) + the deep screens (Profile/Health/Weight/ForbiddenFoods/KickCounter/ContractionTimer) that aren't offline-addressable. **Acceptance** : a `live-journey.spec.ts` GREEN against the seeded backend *(TO BE CREATED)*.

---

## §A — Agent army (adapted, pregnancy app)

| Rôle | Subagent | Tools | Brief |
|---|---|---|---|
| Architect | `Plan` | Read | decompose + anchor |
| Clinical-safety | `general-purpose` | Read | red-flag/emergency/dosing (replaces NF525 "Fiscal") |
| i18n | `general-purpose` | Read | 4-lang parity + RTL + CLDR plurals |
| UX/A11y | `general-purpose` | Read+axe | WCAG + RTL + flat |
| Implementer | `general-purpose` | Edit/Write/Bash | TDD-first, never 2 in // |
| RED-team | `general-purpose` | Read | hostile, file:line |
| QA-Vis + RED-Vis | `general-purpose` | Read+Playwright | capture + independent dispute |

Fan-out: i18n/content tasks → Architect+i18n+Implementer+RED (+QA-Vis for visual). Clinical (C4) → Clinical-safety mandatory + owner gate. Read-only specialists = 1 message parallel. Implementer never parallel.

---

## §X — Convergence waves (path to store)

| Wave | Scope | Tag | Parallelism | Checkpoint |
|---|---|---|---|---|
| **W1** No-regret code | S3.1 error-card consistency + X.1 legacy-spec disposition (+ S6.1 date if cheap) | NO-REGRET | Sequential | new tests green + `verify` 0 regression + E2E suite only-green |
| **W2** i18n plurals | S4.1 (verify-first gate → migrate → amend parity test) | NO-REGRET-IF-CONFIRMED | Sequential, isolated commit | pluralForms test green + parity green + owner-confirm before merge |
| **W3** Guest/TTC UX | S5.1 + S5.2 | OWNER-DECISION | blocked until owner picks behavior | owner sign-off in commit msg, then implement+test |
| **W4** Owner gates | G1 Firebase / G2 clinical / G3 device / G4 EAS / G5 GCP | OWNER-GATE | owner-driven, // to W1-W2 | each WHAT received (§G) |
| **W5** Live E2E + final convergence | X.2 (post-G1) + full smoke (1393 unit + all E2E on live backend) + invariant attestation + 2-cycle convergence | — | sequential | 2 consecutive cycles P0+P1=0; tag `v1.0.0-store-ready` |
| **W6** Store submission | app.json bump, 4-lang store listings + screenshots, privacy nutrition labels, EAS prod build, TestFlight + Play internal | OWNER+Claude | sequential, post-merge | binary in both internal tracks |

### Wave-checkpoint (6-point): tasks PASS/documented · high-risk-zone diff cited+adversary-OK · invariants attested · visual gate fired · RED 0 P0 NEW · memory updated.
### Parallelism: W1+W2 disjoint from W4 (owner) → run concurrently. W3/W5 gated. Convergence-failure (3 heal loops) → STOP + Plan subagent + owner choice.

---

## §G — Owner gates (WHO / WHAT / WHERE)

| Gate | Description | WHO | WHAT | WHERE | Status |
|---|---|---|---|---|---|
| **G1** | Firebase: enable **Anonymous Auth** + `firebase deploy --only firestore:rules` + seed collections (`npm run import-data` — now seeds supplements) | Physical owner | Console screenshots + deploy log + a live guest reading content | memory + commit tag | **PENDING — #1 ship blocker** |
| **G2** | **Clinical sign-off** of articles + supplement dosing/precautions + chatbot red-flag→article map (S3.2) by midwife/OB | Physical owner | signed review + `reviewedBy` field | `CONTENT_AUDIT` doc | PENDING (blocks medical-advice ship) |
| **G3** | Device notification smoke fr/ar/tn iOS+Android (only proof notifs fire) | Physical owner | photo/log of received notif + RTL | `NOTIF_DEVICE_SMOKE.md` | PENDING |
| **G4** | EAS Secrets migration (6) | Physical owner | `eas secret:list` | deploy report | PENDING (prod build) |
| **G5** | GCP API key restrictions | Physical owner | Console screenshot | memory | PENDING |
| **D1** | **Product decision**: guest empty-state behavior (S5.1) | Owner (+Claude implements) | chosen copy/behavior | W3 checkpoint | PENDING |
| **D2** | **Product decision**: TTC mode UI — dedicated home vs beta-flag (S5.2) | Owner (+Claude implements) | chosen approach | W3 checkpoint | PENDING |

**Owner-gate-waiting**: Claude runs W1+W2 (no-regret code) NOW; W3 waits on D1/D2; W4 is owner-driven (parallel); W5 waits on G1; W6 waits on G1/G2/G4/merge.

---

## §R — References
- `~/.claude/skills/ultra-audit-profond/SKILL.md` (per-task pipeline) · `superpower-gstack` · `test-e2e` · `superpowers:{writing-plans,TDD,verification,dispatching-parallel-agents}`
- State: `VERDICT_SHIP_V1_2026-05-30.md` · `VERDICT_TEST_CAMPAIGN_2026-05-30.md` · `SUPERVISOR_ASSESSMENT_2026-05-30.md` · prior `GOAL_SHIP_V1_MAMABEBE_2026-05-29.md`
- Memory: `project_supervisor_findings.md` · `project_v1_release.md`
- Invariant tests: `clinicalChecks.test.ts` · `AuthContext.gdpr.test.ts`/`gdprPurge.test.ts` · `i18nParity.test.ts` · `safeOpenUrl.test.ts` · `firestoreRulesParity.test.ts`

---

## §F — Règle finale (DONE = SHIPPED)
DONE only when: W1+W2 merged green; W3 implemented per owner D1/D2; **G1+G2 done** (guest content proven live + clinical sign-off); G3 device-smoke recorded; live-backend E2E (W5) green; 2-cycle convergence P0+P1=0; tag `v1.0.0-store-ready`; **binary in TestFlight + Play internal track**. Not "ready code-side" — **in stores**. Human gate (CLAUDE.md) before any push/merge.

---

*GOAL regenerated 2026-05-30 (local ultra-architect-planify; remote /ultraplan expired). Anchors verified via grep/ls/Read this session. Launch: « lance le GOAL » → W1 (no-regret) is the safe first move; W3/W4/W5 gated on owner.*
