# GOAL — ULTRA-DEEP TEST & ANALYSIS (abusif) — Mama & Bébé

**Mission**: audit + functionally test + adversarially break + heal **every feature, every button, every
micro-state, in 4 languages**, looping each feature to **VALIDATED** before advancing — the deepest,
widest pass possible. Not surface-level: every interactive element × every state × every locale.
**Stack**: Expo 54 / RN 0.81 / React 19 / RN-Web static export / Firebase / i18next FR-EN-AR-TN.
**Branch base**: `feat/interaction-ux-2026-06-18` (the converged UX overhaul, 30 commits, jest 1867 green).
**Mama & Bébé only** — this plan adapts the ultra-architect methodology; there is NO FoodKing/NF525/POS here.

> **▶ EXECUTION STATUS** (live): see [`reports/test-e2e/ultra-deep/CONVERGENCE_LEDGER.md`](../reports/test-e2e/ultra-deep/CONVERGENCE_LEDGER.md) — the per-wave ledger. As of 2026-06-20: W0 inventory done · **W1 (S1) VALIDATED** (19/21) · **W2 (S2 Home) P1-VALIDATED** (9/30) · **W3 (S3 Calendar) P1-VALIDATED** (7/25, incl. a ship-surface crash) — **all three at P0+P1=0**. Per-wave backlogs/status: `W{n}_BACKLOG.json` + `W{n}_STATUS.md`. The per-feature loop is **proven to scale across 3 full waves**; W4 (Reminders) next.

---

## §0 — Preamble

### §0.1 Working-tree decision
Current tree is clean + converged (visual rounds 7/10/11 GREEN, functional 12/12). Commit any pending,
then branch **`test/ultra-deep-2026-06-20`** off it. Every feature-wave commits behind a green gate;
WIP commits on interrupt (`wip(<wave>): partial through <feature>`).

### §0.2 Invariants (this repo's gates — replace NF525/frozen-zones)
- `npm run verify` (lint:colors [no #hex/rgba outside theme] + `tsc --noEmit` strict + jest ≥1867) MUST stay green; **no commit before green**.
- **i18n 4-lang parity**: every key in fr/en/ar/tn; JSON valid; zero raw-key leak.
- **RTL-safe** (ar/tn): `I18nManager.isRTL` is FALSE on web — never gate layout on it; mirror via dir/logical/`useRtl`. Never `row-reverse` what dir=rtl already mirrors.
- **Theme-only** styling; **no medical-content fabrication** (faithful translation only, flag for clinical review).
- **Harness**: `e2e/audit2/capture.mjs` (quartet capture) + `e2e/audit2/review.workflow.js` (9-wave × 4-lang adversarial review, ROUND-hardcoded) + per-feature functional Playwright drivers.

### §0.3 The ABUSIVE-DEPTH definition (§0.5 state-matrix is the core of this GOAL)
"Every detail" = for EACH of the **~696 interactive elements** (578 TouchableOpacity + 31 Button + 62 TextInput + 15 Pressable + 10 Switch; 293 onPress handlers — verified), across the **state-matrix**:

> **M = {default, pressed/active, disabled, loading, empty, error, filled/populated, focused, RTL-mirrored, long-text/overflow, offline/guest-fallback, success-feedback}** (12 states)
> × **L = {fr, en, ar, tn}** (4 locales)

⇒ target surface ≈ 696 × 12 × 4 ≈ **~33,000 micro-checks** + ~7,040 localized strings (1,760 × 4) + 33 services' logic paths. THIS is the "1000-hour" matrix. The breakdown agent enumerates the per-element inventory at launch into `reports/test-e2e/ultra-deep/INVENTORY.json`; the GOAL does not inline 33k rows.

### §0.4 Per-task pipeline
Each task runs the LOOP (see `~/.claude/skills/ultra-audit-profond` + `test-e2e`): **enumerate → capture-every-state → 10+ specialists analyze in parallel → adversarial dispute → ultra-plan fix → implement (TDD) → verify → re-capture → re-dispute → repeat until VALIDATED**. Convergence = §0.6.

### §0.5 Real anchors (verified 2026-06-20)
`ls/grep` output: **29 screens** + 3 reminders sub-screens (`src/screens/`), **47 components** (`src/components/`), **33 services** (`src/services/`), **30 Stack.Screen** + **5 bottom tabs** (`App.tsx`), **67 jest files** + 5 e2e specs (`e2e/*.spec.ts`). Per-screen element density (verified `grep -cE 'onPress=|TextInput|<Switch|<Button'`): Onboarding 41 · Home 23 · Profile 20 · AddAppointment 18 · WeightTracker 14 · Register 14 · Login 11 · HospitalBag 11 · Ramadan/Health/Contraction/Chatbot/ArticleDetail 9 · Supplements/Settings/Articles 8 · KickCounter 7 · SupplementDetail/ForbiddenFoods 5 · WeekRecommendations/Calendar/AuthChoice 4.

### §0.6 Convergence criteria (per feature AND per GOAL)
A feature is VALIDATED only when **two consecutive adversarial rounds report P0+P1=0 with identical findings sets** (set-equality kills flakes), AND its functional flow PASSES (drive+persist), AND `npm run verify` green. Rejection triggers (any → heal, do not advance): raw-key leak · wrong-language text · console error/pageerror from app code (not the documented offline trigger) · unexpected 4xx/5xx · layout break/overlap/off-screen on any viewport · blank/crash where content expected · RTL not mirrored on a task path · cross-surface numeric mismatch · element with no accessibilityLabel on a primary path · tap target <44px on a primary action · "good enough" claim. P2/P3 = disclose, don't block. **No feature is skipped on "covered elsewhere" — if it isn't exercised in THIS pass, it's NOT covered.**

### §0.7 DONE = production-perfect, every-detail, not "almost there"
All 9 systems VALIDATED; the full ~696-element × 12-state × 4-lang matrix swept with evidence; functional flows persist; a11y on every primary path; convergence GREEN ×2 on the final full review; `verify` green. Production-perfect.

---

## §1 — System map (feature domains, anchored)

| # | System | Screens / element-density anchor | Logic anchor (services) | Tests |
|---|---|---|---|---|
| S1 | **Onboarding & Auth funnel** | Onboarding(41), Register(14), Login(11), AuthChoice(4), LanguageSelect, PrivacyPolicy, GuestUpgrade | `context/AuthContext.tsx`, `i18n/`, `utils/validation.ts` | `e2e/auth-onboarding-lang-audit.spec.ts`, `context/__tests__/AuthContext.*` |
| S2 | **Home hub** | HomeScreen(23) + `components/home/*`, `components/tasks/MyDaySection` | `useCurrentWeek`, `tipsService`, `babyMessageService` | (e2e/audit2 round captures) |
| S3 | **Calendar & Appointments** | Calendar(4), AddAppointment(18) + `components/calendar/*` | `calendarService`, `appointmentService`, `rdvNotificationService` | `services/__tests__/calendar*` |
| S4 | **Reminders / Tasks / Notifications** | RemindersScreen + reminders/{RemindersTab,TasksTab,StatisticsScreen}, `HydrationCard` | `remindersScheduler`, `reminderService`, `remindersV2Service`, `taskService`, `dailyChecklistService`, `hydrationService`, `notification*` | `services/__tests__/{reminder,dailyChecklist,hydration}*` |
| S5 | **Resources & Content** | Articles/Supplements list+detail, WeekRecommendations + bookmark + filters | `contentService`, `localContentFallback`, `bookmarkService`, `i18nHelpers` | `services/__tests__/bookmarkService`, `utils/__tests__/i18nHelpers` |
| S6 | **Chatbot (triage)** | ChatbotScreen(9) | `chatbotService`, `chatbot/data/*` | `services/__tests__/chatbotTriage.test.ts`, `e2e/chatbot-abuse.spec.ts` |
| S7 | **Health & Tracking tools** | HealthDashboard(9), WeightTracker(14), KickCounter(7), ContractionTimer(9), HospitalBag(11), ForbiddenFoods(5), BabyEvolution | `healthService`, `weightService`, `weightIntelligence`, `kickCounterService`, `contractionTimerService`, `hospitalBagService`, `ramadanService` | `services/__tests__/{weight,hospitalBag,...}` |
| S8 | **Profile & Settings & Diagnostic & Ramadan** | Profile(20), Settings(8), Diagnostic, Ramadan(9) | `AuthContext.updateProfile`, `analyticsService`, `dataExportService`, `pdfExportService`, `supportService` | `components/profile/__tests__/*` |
| S9 | **Cross-cutting** (i18n/RTL · a11y · perf · data-integrity · nav/deep-link) | ALL 32 surfaces × 4 langs; `App.tsx` linking; `hooks/useRtl`; `localizedFormat` | `i18n/*`, all services' persistence | `i18n/__tests__/*` |

Per-element inventory (the ~696 rows) → generated at launch to `reports/test-e2e/ultra-deep/INVENTORY.json` by the Micro-Breakdown agent (Wave 0).

---

## §2–§10 — Per-system decomposition
Each system → sub-systems → tasks. Every task: **enumerate elements → matrix-sweep → analyze(10+) → dispute → fix → re-test to VALIDATED**. Acceptance names a real or to-be-created test.

### §2 — S1 Onboarding & Auth funnel
**Contract**: every entry path reaches the app or a clear next step; every field validates; 4-lang + RTL; guest + account both work.
- **1.1 Onboarding flow (41 elements)** — every step (Je suis enceinte/TTC/Curieuse, LMP picker, age, country, first-preg, guest-continue), back/forward, progress bar, each choice card press+selected state. *Acc*: `e2e/auth-onboarding-lang-audit.spec.ts` 4/4 + new `(TBC e2e/onboarding-matrix.spec.ts)` driving all branches × 4 langs to MainTabs.
- **1.2 Register/Login (25 elements)** — every field (email/password/confirm) × {empty,invalid,valid,error,focused}, password meter /4, show/hide eye, Terms/Privacy links, submit, cross-nav, GuestUpgrade upgradeMode. *Acc*: `(TBC e2e/auth-fields-matrix.spec.ts)` + `i18n/__tests__/passwordMin` green.
- **1.3 LanguageSelect + persistence** — each of 4 cards press+selected+✓, live switch (dir flip), reload-persists (sentinel), flags. *Acc*: `(TBC src/__tests__/language-persist.test.ts)` + functional sentinel probe PASS.

### §3 — S2 Home hub
**Contract**: every Home affordance navigates/acts correctly; week-aware; first-run welcome; RTL.
- **2.1 Quick actions + week nav** — 2×2 buttons (Tâche/RDV/Recherche/Mes RDV) targets, chevrons ±, return-to-today (preview vs current), tap targets ≥44px. *Acc*: `(TBC e2e/home-actions-matrix.spec.ts)`.
- **2.2 Cards** — baby card→BabyEvolution, recommendations→detail, "Votre corps" accordion (aria-expanded), warnings, MyDay/DailyRoutines, welcome dismiss-persists. *Acc*: round-capture W1 GREEN + functional welcome PASS.
- **2.3 Trimester grid** — each tool card press + week-gating (KickCounter≥16, Contraction/HospitalBag≥28) at week boundaries {15,16,27,28}. *Acc*: `(TBC src/screens/__tests__/homeGrid.test.tsx)`.

### §4 — S3 Calendar & Appointments
- **3.1 AddAppointment (18 elements)** — title/date/time/category/notes × {empty,filled,invalid}, save (guest-gate→GuestUpgrade), cancel, beforeRemove discard. *Acc*: functional appointment PASS (guest-gate verified) + `(TBC e2e/appointment-matrix.spec.ts)`.
- **3.2 Calendar (week+month)** — day cells, week strip, month grid (RTL mirror chevrons), Today, Suggestions toggle, FAB, event cards, delete. *Acc*: round W3 GREEN + RTL calendar probe.
- **3.3 RDV reminders/notifications** — schedule, J-1, notif tap→screen (CRN-01). *Acc*: `services/__tests__/rdvNotification*` + notif-deeplink test.

### §5 — S4 Reminders / Tasks / Notifications
- **4.1 Hydration** — +verre increments+persists+localized, goal edit, reminder toggle. *Acc*: functional hydration PASS + `services/__tests__/hydration*`.
- **4.2 Tasks/MyDay** — complete toggle (persist+strikethrough+%), highlight from notif, weekly tasks. *Acc*: functional tasks PASS + `dailyChecklistService` tests.
- **4.3 Reminders V2 + Statistics** — each habit toggle/time chip, stats hero/streak, edit modal. *Acc*: round W3 GREEN + `reminder*` tests.
- **4.4 Notification permission** — banner→request, Settings test-notif, priming. *Acc*: functional notif-banner PASS.

### §6 — S5 Resources & Content
- **5.1 Lists (Articles/Supplements)** — search debounce, category/safety filter chips, ★ Favoris filter, each card press, skeleton/empty, offline-fallback content. *Acc*: functional filters+bookmark PASS + round W2 GREEN.
- **5.2 Details + cross-links + bookmark** — markdown render, related chips nav, bookmark toggle persist, safety icon+label, category localized. *Acc*: functional bookmark PASS + cross-link DOM-verified.
- **5.3 WeekRecommendations** — empty-state CTA, safety badge, article/supplement nav. *Acc*: round W1 GREEN.

### §7 — S6 Chatbot
- **6.1 Triage send/reply** — input, send, quick-replies, bot reply non-empty, disclaimer. *Acc*: `chatbotTriage.test.ts` (168 corpus) + functional chatbot PASS.
- **6.2 Clinical safety (adversarial)** — emergency over/under-escalation across fr/en/ar/tn (RED corpus). *Acc*: `e2e/chatbot-abuse.spec.ts` + 97-case battery 0 over/under.
- **6.3 Deep-link to content** — chatbot→supplement/article anchors (D6-02). *Acc*: `(TBC)`.

### §8 — S7 Health & Tracking tools
- **7.1 Weight** — setup prefill, add (persist+reload), chart, dedup, intelligence suggestions. *Acc*: functional weight PASS + `weightService`/`weightIntelligence` tests.
- **7.2 Kick + Contraction + HospitalBag** — counter increments+history+persist, timer start/stop+duration, checklist check+progress+persist, localized dates (RTL). *Acc*: functional kick/contraction/hospitalbag PASS (all verified) + `services/__tests__/*`.
- **7.3 HealthDashboard + ForbiddenFoods + BabyEvolution** — guest-lock EmptyState+CTA, dashboard data, foods search+halal panel (ar/tn), evolution RTL carousel centers current month + localized units. *Acc*: round W4/W1 GREEN + BabyEvolution centering probe.

### §9 — S8 Profile & Settings & Diagnostic & Ramadan
- **8.1 Profile (20 elements)** — every field+chip (country, height/weight a11y), guest "Créer un compte" CTA, save/persist, photo, delete-account flow. *Acc*: functional + `components/profile/__tests__`.
- **8.2 Settings** — baby-message toggle+hour chips, vector icons, permission rows, RTL header gap. *Acc*: round W6 GREEN.
- **8.3 Diagnostic + Ramadan + Export** — diagnostic statuses, Ramadan reachable+call-doctor, PDF/data export. *Acc*: `(TBC)` + `dataExportService`/`pdfExportService` tests.

### §10 — S9 Cross-cutting (runs against ALL systems each wave)
- **9.1 i18n/RTL** — 4-lang parity sweep (no raw key, no wrong-lang), RTL mirror per element, localized numbers/units/dates. *Acc*: `i18n/__tests__/*` + per-round arabic-ratio scan = 0 unexpected.
- **9.2 a11y** — every interactive element: accessibilityRole+Label, ≥44px target, focus, contrast ≥4.5:1 text, SR live regions. *Acc*: `(TBC e2e/a11y-sweep.spec.ts)` (axe-core per screen).
- **9.3 Perf** — re-render loops (screen_view amplification), bundle, animation reduce-motion, list virtualization, memory on tab switch. *Acc*: `(TBC)` render-count probes.
- **9.4 Data-integrity** — persistence round-trip per feature, guest/offline fallback, cross-surface numeric equality, validation/injection. *Acc*: functional persistence PASS per feature.
- **9.5 Nav/deep-link** — every route deep-linkable, getStateFromPath catch-all, notif routing, back-stack, no dead-ends. *Acc*: `(TBC e2e/nav-matrix.spec.ts)`.

---

## §A — Agent army (12 roles, ≥10 parallel per feature) + fan-out matrix
All read-only analysts persist findings to `reports/test-e2e/ultra-deep/<feature>/<round>/<role>.json` (schema below); the orchestrator synthesizes from disk (survives interrupts).

| # | Role | subagent_type | Tools | Mandate |
|---|---|---|---|---|
| A1 | **Micro-Breakdown analyst** | general-purpose | Read/Bash | enumerate EVERY element of the feature × the 12-state matrix → INVENTORY rows; nothing un-listed |
| A2 | **Logic-Verifier** | general-purpose | Read | trace each onPress→handler→service→state mutation→persistence; prove the logic is correct |
| A3 | **Reasoner** | Plan/general-purpose | Read | reason intended-vs-actual behavior, edge cases, "what SHOULD this do"; surface missing states |
| A4 | **Adversarial-Disputer (RED)** | general-purpose | Read | try to BREAK every element + REFUTE every other agent's finding (default-skeptic); hunt hidden defects |
| A5 | **Visual-Capturer (QA)** | general-purpose | Read+Playwright | drive + capture every state of every element (the quartet) per lang |
| A6 | **RED-Visual** | general-purpose | Read | independently re-analyze A5's captures, dispute (kills confirmation bias) |
| A7 | **a11y specialist** | general-purpose | Read+Playwright | role/label/target/contrast/focus/SR per element |
| A8 | **i18n/RTL specialist** | general-purpose | Read | 4-lang parity + RTL mirror + number/date/unit localization per element |
| A9 | **Perf specialist** | general-purpose | Read+Playwright | re-render counts, loops, bundle, memory, reduce-motion |
| A10 | **Security/Data-integrity** | general-purpose | Read | persistence round-trip, guest/offline, validation, injection, cross-surface equality |
| A11 | **Ultra-Planner-Fixer** | Plan/general-purpose | Read | synthesize all findings → optimal scope-minimal fix plan + the loop strategy + dispute-resolution |
| A12 | **Implementer** | code-editor/general-purpose | Edit/Write/Bash | TDD fixes; theme-only; 4-lang; NEVER parallel with another implementer |

**Fan-out matrix** (which fire per element/task class):
| Class | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 | A9 | A10 | A11 | A12 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Button/touchable | x | x | x | x | x | x | x | x | . | . | x | x |
| Text input/form | x | x | x | x | x | x | x | x | . | x | x | x |
| Data/persistence | x | x | x | x | . | . | . | . | x | x | x | x |
| Navigation/deep-link | x | x | x | x | x | . | x | . | . | . | x | x |
| Content/i18n | x | . | x | x | x | x | . | x | . | . | x | x |
| Animation/perf | x | . | x | x | x | . | x | . | x | . | x | x |

**Dispatch discipline**: the **10 read-only analysts (A1-A10) fan out in ONE message** (parallel, per feature/round) → A11 synthesizes → A12 implements (serial) → A4+A6 dispute after the fix → re-loop. Concurrency cap ~min(16,cores-2); large element sets pipeline. Reporting schema per finding: `[P0|P1|P2|P3] <element @ file:line / state / lang> — <title> · repro: <click path> · evidence: <screenshot|console|test> · fix: <scope-minimal>` (≤1500 words/agent).

---

## §X — Convergence waves (per-feature loop; ~11 waves)
**Default: sequential per wave** (one feature domain at a time, loop to VALIDATED before next — per the user's mandate), **parallel within** the wave's 10-agent analysis phase. Two waves parallel only if disjoint files.

| Wave | Scope | Loop until | Checkpoint |
|---|---|---|---|
| **W0 Pre-flight + Inventory** | branch; build dist; serve :8081; A1 generates the full ~696-element × 12-state × 4-lang `INVENTORY.json` | inventory complete + baselines captured | verify green; inventory exists |
| **W1 S1 Onboarding/Auth** | 1.1–1.3 | P0+P1=0 ×2 + functional onboarding 4/4 + auth-fields matrix | feature VALIDATED gate |
| **W2 S2 Home** | 2.1–2.3 | " | " |
| **W3 S3 Calendar** | 3.1–3.3 | " | " |
| **W4 S4 Reminders/Tasks/Notif** | 4.1–4.4 | " | " |
| **W5 S5 Resources/Content** | 5.1–5.3 | " | " |
| **W6 S6 Chatbot** | 6.1–6.3 (incl. RED safety corpus) | 0 over/under-escalation + P0+P1=0 ×2 | " |
| **W7 S7 Health tools** | 7.1–7.3 | " | " |
| **W8 S8 Profile/Settings/Diag/Ramadan** | 8.1–8.3 | " | " |
| **W9 S9 Cross-cutting sweep** | 9.1–9.5 against ALL systems | a11y/perf/i18n/data/nav matrices clean | " |
| **W10 Final full convergence** | full `e2e/audit2` review (4 langs) + functional re-run all + `verify` | **2 consecutive GREEN, identical findings, P0+P1=0** | CONVERGENCE_FINAL written |

**Per-feature VALIDATED gate** (all required to advance): all matrix rows for the feature swept with evidence · P0+P1=0 across 2 consecutive adversarial rounds (identical sets) · functional flow PASS (drive+persist) · a11y/i18n/RTL clean on the feature's elements · `npm run verify` green · feature committed.
**Convergence-failure protocol**: 3rd heal-loop on the same cluster → STOP, spawn A3(Reasoner)+A11 for pivot analysis → `STUCK_<wave>.md` → surface options (accept-with-doc / pivot / defer / owner-gate), don't auto-pick.
**Interrupt-resume**: commit WIP + write `INTERRUPT_<wave>.md` (last green SHA, last element, next queue, agent reports on disk) + update RESUME manifest; on resume read it, smoke last element, continue.

---

## §G — Owner gates (WHO / WHAT / WHERE)
| Gate | Description | WHO | WHAT | WHERE | Blocks |
|---|---|---|---|---|---|
| G1 | Firebase **Anonymous Auth + App Check** ON | Physical owner (Firebase console) | config screenshot | operator log | online verify of guest-link / online content; **local/web matrix runs without it** |
| G2 | `firebase deploy --only firestore:rules` | Physical owner | deploy log | commit tag | online content path (offline fallback unaffected) |
| G3 | Device smoke (iOS+Android) fr/ar/tn — motion/haptics/notif permission/native pickers | Physical owner | device video/notes | report path | W10 sign-off (web matrix unaffected) |
| G4 | Clinical/native-speaker review of supplement translations + chatbot triage corpus | Owner + clinician | sign-off note | report | medical-content release only |

Gate-waiting: W0-W9 web/local matrix proceeds in parallel; only online-verify + device + clinical steps wait.

---

## §R — References
- Methodology: `~/.claude/skills/{ultra-audit-profond,test-e2e,superpower-gstack,dispatching-parallel-agents}`.
- Harness: `e2e/audit2/capture.mjs`, `e2e/audit2/review.workflow.js`; reports `reports/test-e2e/run-2026-06-17/` + `goal-interaction/`.
- Prior convergence: `reports/test-e2e/run-2026-06-17/{CONVERGENCE_FINAL,FUNCTIONAL_AUDIT_2026-06-19}.md`; UX GOAL `docs/GOAL_INTERACTION_UX_MAMABEBE_2026-06-18.md` (+ `docs/goal_carto/findings_compact.json`).
- Memory: [[reference-rnweb-rtl-gotchas]], [[project_goal_interaction_ux]].

## §F — Final DONE rule
DONE only when: the full **~696-element × 12-state × 4-lang matrix** is swept with on-disk evidence; **every one of the 9 systems VALIDATED** (P0+P1=0 ×2, functional PASS, a11y/i18n/RTL/perf/data clean); the W10 full adversarial review is **GREEN twice consecutively with identical findings**; `npm run verify` green; chatbot safety corpus 0 over/under-escalation; and the disclosed-residual list is explicit. Every button, every state, every language — production-perfect, not "almost there".
