# GOAL — Cross-Feature Interaction & UX/UI Excellence — Mama & Bébé

**Mission**: take the app from "screens that work in isolation" to "features that interact beautifully" — a ship-ready, cross-surface, 4-language (FR/EN/AR/TN, ar+tn RTL) interaction + UX/UI excellence pass, converged adversarially.
**Date**: 2026-06-18 · **Branch**: `audit-fix/p1-2026-06-15` (off the just-converged E2E audit) · **Stack**: Expo 54 / RN 0.81 / React 19 / RN-Web static export / Firebase / i18next.
**Basis**: 8-domain read-only cartography (67 anchored findings: 25 high / 33 medium / 9 low) → `docs/goal_carto/findings_compact.json` (full design specs per finding) + `cartography_raw.json`.

---

## §0 — Preamble

### §0.1 Working-tree decision
The current tree holds the **converged 2026-06-17 audit fixes** (20 files, verify-green, uncommitted) + this GOAL's docs. **Decision**: commit the audit wave first as a clean baseline (`fix(audit): R-2026-06-17 i18n/RTL/fallback convergence`), then branch this GOAL's work onto `feat/interaction-ux-2026-06-18`. Each wave commits behind a green gate; no wave starts on a dirty unrelated tree.

### §0.2 Invariants (this repo's equivalents of NF525/frozen-zones)
- **`npm run verify` MUST stay green**: `lint:colors` (NO `#hex`/`rgba(` outside `src/theme`) + `tsc --noEmit` (strict) + `jest` (1810+ tests). No commit before green.
- **i18n 4-lang parity**: every new key exists in fr/en/ar/tn; JSON valid; no raw-key leak.
- **RTL-safe**: ar/tn must mirror; remember `I18nManager.isRTL` is **false on web** while `document.dir=rtl` → never gate layout math on isRTL alone for web (see [[reference-rnweb-rtl-gotchas]]).
- **No medical-content fabrication**: bundled/clinical text is faithfully localized only, flagged for human review.
- **Theme-only styling**: colors/spacing/shadows from `src/theme`.

### §0.3 Per-task pipeline (do NOT re-describe per task)
Each task runs the LOOP: **anchor → (read-only specialist fan-out where the fan-out matrix fires) → implement (smallest change) → `npm run verify` → adversarial RED → visual/E2E capture → re-review → heal**. The visual/E2E layer reuses the harness built this session: `e2e/audit2/capture.mjs` (quartet capture per route×lang) + `e2e/audit2/review.workflow.js` (9-wave × 4-lang multimodal adversarial review, ROUND-hardcoded). See `~/.claude/skills/ultra-audit-profond` for the canonical per-task pipeline and `~/.claude/skills/test-e2e` for the convergence rule.

### §0.4 Convergence criteria (borrowed from test-e2e)
A wave / the GOAL is DONE only when **two consecutive adversarial rounds report P0+P1=0 with identical findings sets** (set-equality kills flakes). Rejection triggers (any one → heal): raw-key leak, wrong-language text, console error from app code (not the documented offline trigger), unexpected 4xx/5xx, layout break / overlap / off-screen on any viewport, blank/crash where content expected, RTL not mirrored on a task path, cross-surface numeric mismatch, frozen invariant violated, "good enough" claim. P2/P3 = disclose, don't loop.

### §0.5 DONE = production-perfect, not "almost there"
Cross-feature flows feel intentional in all 4 languages; no dead-ends, no silent no-ops, no cross-surface contradictions; a11y on every primary path; motion respectful; the test-e2e loop green ×2.

---

## §1 — Interaction-domain system map (anchored)

| # | System (interaction domain) | Maturity | Primary anchor (verified) | Findings | Tests existing |
|---|---|---|---|---|---|
| S1 | **Navigation & Deep-Link Spine** | functional, gaps | `App.tsx` L168-218 (MainTabs), L249-325 (linking), L441-476 (notif) | 8 (3H) | `e2e/auth-onboarding-lang-audit.spec.ts` |
| S2 | **Shared-State Continuity** | duplicated logic | `src/context/{Pregnancy,Auth,Toast}Context.tsx`, `src/services/useCurrentWeek.ts` | 9 (3H) | `src/context/__tests__/` |
| S3 | **Home as Interaction Hub** | dense, undifferentiated | `src/screens/HomeScreen.tsx` (+`.styles`), `src/components/home/*` | 9 (3H) | (TBC) |
| S4 | **Health & Tracking Loop** | siloed tools | `HealthDashboardScreen`, `WeightTrackerScreen`, `KickCounter`, `ContractionTimer`, `HospitalBag`, `ForbiddenFoods` | 9 (4H) | `src/services/__tests__/` |
| S5 | **Calendar / Reminders / Notifications** | fragmented model | `CalendarScreen`, `AddAppointmentScreen`, `screens/reminders/*`, `services/{calendar,rdvNotification,remindersScheduler,...}` | 8 (3H) | `src/services/__tests__/` |
| S6 | **Content & Chatbot** | no cross-linking | `ResourcesScreen`, `Article/SupplementDetail`, `ChatbotScreen`, `WeekRecommendationsScreen`, `services/{content,chatbot,localContentFallback}` | 8 (3H) | `e2e/chatbot-abuse.spec.ts`, `src/services/__tests__/chatbotTriage.test.ts` |
| S7 | **i18n / RTL / a11y Cross-Cut** | per-screen duplication | `src/i18n/*`, `App.tsx` documentTitle, `components/common/RtlAwareChevron.tsx` | 8 (3H) | `src/i18n/__tests__/` |
| S8 | **Transitions / Feedback / Design-System** | fragmented primitives | `src/components/common/*`, `src/theme` | 8 (3H) | `src/components/common/__tests__/` |

Full per-finding design spec, files_to_touch, acceptance, test_path: `docs/goal_carto/findings_compact.json` (67 entries). Task IDs below match that file.

---

## §2 — S1 Navigation & Deep-Link Spine
**Contract**: every cross-feature jump lands on a real, focused destination; deep-links (URL + notification) route correctly and round-trip; web titles/history are meaningful; no silent no-ops; guests can upgrade in place.
**Sub-systems & tasks** (anchor · acceptance · test):
- **1.1 Guest-upgrade flow** — `NAV-01`[H,L]: replace 3 in-MainTabs `navigate('AuthChoice')` (AddAppointment L342/L352, Calendar L380) with a HomeStack `GuestUpgrade` route + `AuthContext.upgradeGuest()` via `linkWithCredential` (import exists AuthContext L630); Profile guest badge (L568-577) gets a 'Créer un compte' CTA. · *Acc*: guest Save→confirm→working create-account screen inside tabs, no nav warning, links anon acct, returns and retries Save. · *Test*: `(TBC e2e/nav-guest-upgrade.spec.ts)`.
- **1.2 Notification routing** — `NAV-02`[H,S]: fix TasksTab nesting to `Rappels>RemindersMain>TasksTab` (mirror HomeScreen L453); `NAV-07`[L,S]: wrap generic branch in try/catch + fallback Home. · *Acc*: reminder-notif tap opens Tasks sub-tab w/ highlightId consumed. · *Test*: `(TBC src/__tests__/notification-deeplink.test.ts)`.
- **1.3 Web title/history** — `NAV-03`[H,M]: add missing `routeNameToTitleKey` entries + dynamic `navigation.setOptions({title})` for Article/Supplement detail. · *Acc*: each article/supplement tab title = its name in active lang. · *Test*: `(TBC)` assert document.title per deep-link.
- **1.4 Back/scroll integrity** — `NAV-04`[M,M]: `canGoBack()` guard → fallback Home on the 4 custom back buttons; `NAV-06`[M,L]: preserve scroll/stack across tab switch (evaluate dropping `unmountOnBlur` for a focus-based refresh + `getId`); `NAV-05`[M,M]: make supplements tab deep-linkable + honor `openSearch` on web Resources. · *Acc*: deep-linked detail back never strands; tab re-entry restores position. · *Test*: `(TBC e2e/nav-backstack.spec.ts)`.
- **1.5 a11y of navigation** — `NAV-08`[L,M]: announce destination + move focus on cross-tab nav. · *Acc*: SR announces new screen; focus lands on heading. · *Test*: `(TBC)`.

## §3 — S2 Shared-State Continuity
**Contract**: one source of truth for derived pregnancy state (week→month→trimester, baby-size); every surface reflects the same fact; week navigation and language switch propagate; guest→account preserves all data.
- **2.1 Single source of truth** — `D2-01`[H,M] unify the two week derivations (Auth + Pregnancy) into `useCurrentWeek`; `D2-02`[H,S] one `weekToMonth`/`weekToTrimester` util used everywhere; `D2-03`[M,M] + `D7-03` reconcile baby-size constant (Home 14.2 vs BabyEvolution 14). · *Acc*: week/month/trimester/baby-size identical across Home, BabyEvolution, Reminders, Health. · *Test*: `src/utils/__tests__/pregnancyMath.test.ts (TBC)` + extend `src/services/__tests__`.
- **2.2 Week navigation propagation** — `D2-04`[H,M] lift HomeScreen `overrideWeek` into context-aware preview; `D2-05`[M,S] fix Curious-mode frozen snapshot; `D2-08`[M,M] midnight rollover. · *Acc*: previewing a week (or rollover) updates dependent surfaces consistently. · *Test*: `(TBC)`.
- **2.3 Guest→account fidelity** — `D2-07`[M,M] migrate height/prePregnancyWeight on upgrade (couples with 1.1). · *Acc*: post-upgrade profile keeps physical data. · *Test*: extend AuthContext tests.
- **2.4 Feedback + perf** — `D2-06`[M,S] standardize on Toast (kill blocking alerts on shared writes); `D2-09`[L,M] light in-memory cache for shared-derived data. · *Acc*: consistent confirmation pattern; no full refetch flicker on tab switch. · *Test*: `(TBC)`.

## §4 — S3 Home as Interaction Hub
**Contract**: Home is a scannable, prioritized, week-personalized hub with real buttons, a return-to-today affordance, and a graceful first-run state.
- **3.1 Quick actions** — `D3-01`[H,M] convert tiny text links → real buttons (≥44px targets, icons, labels) ; `D3-09`[L,S] keep DailyRoutines anchor when empty. · *Acc*: quick actions are buttons, AA tap-targets, discoverable. · *Test*: `(TBC e2e/home-quickactions.spec.ts)`.
- **3.2 Time-machine** — `D3-02`[H,M] week chevrons get a "retour à aujourd'hui" affordance + visual "preview" state. · *Acc*: previewing a non-current week shows a clear banner + 1-tap return. · *Test*: `(TBC)`.
- **3.3 First-run/guest** — `D3-03`[H,M] welcome/empty state for brand-new users; `D3-06`[M,M] prioritize tools by trimester/week. · *Acc*: fresh guest sees a guided first state, not a full wall. · *Test*: `(TBC)`.
- **3.4 Consistency/motion/a11y** — `D3-04`[M,S] localize recommendation category (reuse `categories.*`); `D3-05`[M,M] stop infinite pulse, native-driver entrance, respect reduced-motion; `D3-07`[M,M] consistent expand affordance + aria-expanded; `D3-08`[L,L] migrate hero/tools to shared `Card`. · *Acc*: no raw slug, no perpetual motion, accordions announced. · *Test*: extend e2e home capture.

## §5 — S4 Health & Tracking Loop
**Contract**: a coherent Health home; entry→feedback→stats loops; milestones; localized dates/units; no dead-ends; accessible inputs.
- **4.1 Health home** — `D4-01`[H,L] one hub (resolve two rival weight screens; surface from Profile); `D4-04`[H,S] fix HealthDashboard 'See all' → real Calendar. · *Acc*: single discoverable health hub; no stub links. · *Test*: `(TBC e2e/health-hub.spec.ts)`.
- **4.2 Milestones + thresholds** — `D4-02`[H,M] celebratory moments on positive actions; `D4-08`[M,M] KickCounter clinical-threshold feedback + actionable history. · *Acc*: logging a kick/weight/etc. yields a meaningful response. · *Test*: extend `kickCounterService` tests.
- **4.3 Localized dates/units** — `D4-03`[H,S] replace raw `toLocaleString` in Kick/Contraction history with `getDateLocale`/`formatTime`; `D4-07`[M,M] unify units & week labels. · *Acc*: ar/tn dates+units localized everywhere. · *Test*: `src/utils/__tests__/i18nHelpers.test.ts` (extend).
- **4.4 Stats + inputs** — `D4-05`[M,M] fix hydration chart structural-zero; `D4-06`[M,M] a11y labels/keyboard/error on numeric inputs; `D4-09`[L,M] reminder nudges from tools. · *Acc*: stats truthful; inputs accessible. · *Test*: extend `dailyChecklistService`/`hydrationService` tests.

## §6 — S5 Calendar / Reminders / Notifications
**Contract**: one clear "things to do" model; appointment notifications route; permissions primed; calendar RTL-correct.
- **5.1 RDV notif deep-link** — `CRN-01`[H,M] make appointment-reminder tap open the appointment (define data.screen→Calendar/AddAppointment route + payload). · *Acc*: RDV notif tap lands on the appointment. · *Test*: extend notification-deeplink test.
- **5.2 Permission priming** — `CRN-02`[H,M] in-context priming before OS prompt + actionable banner; `CRN-04`[M,M] schedule summary + 'send test'. · *Acc*: no cold OS prompt; banner is actionable. · *Test*: `(TBC)`.
- **5.3 Unify model** — `CRN-03`[H,L] clarify/merge Tasks vs Reminders vs Appointments across the 3 surfaces; `CRN-07`[M,L] single date/time picker. · *Acc*: one coherent mental model. · *Test*: `(TBC)`.
- **5.4 Calendar interactions** — `CRN-05`[M,S] reliable 'Today' + remove dead handler; `CRN-06`[M,M] RTL-mirror WeeklyStrip/month grid on web; `CRN-08`[M,M] Statistics motivation loop. · *Acc*: Today returns home; calendar mirrored ar/tn. · *Test*: extend e2e calendar capture.

## §7 — S6 Content & Chatbot
**Contract**: content is cross-linked, week-contextual, saveable, filterable, and the chatbot bridges into it.
- **6.1 Cross-linking** — `D6-01`[H,M] render related_articles/related_supplements on Antigravity articles; `D6-02`[H,M] chatbot deep-links to supplement/article anchors. · *Acc*: article↔supplement↔chatbot navigable. · *Test*: `(TBC e2e/content-crosslink.spec.ts)`.
- **6.2 Save/bookmark** — `D6-03`[H,L] bookmark articles/supplements (persist guest+auth) + a "Saved" surface. · *Acc*: save from search/chat/detail, retrieve later. · *Test*: `(TBC)` + service test.
- **6.3 Discovery** — `D6-04`[M,M] category filter (Articles) + safety filter (Supplements); `D6-08`[M,M] week-contextual surfacing. · *Acc*: filterable, week-aware. · *Test*: extend e2e resources capture.
- **6.4 Reading + consistency + a11y** — `D6-06`[M,M] reading-time/scroll-progress/font-size; `D6-05`[M,M] unify list loading (skeleton) + debounce; `D6-07`[M,S] supplement safety = icon+label not color-only. · *Acc*: consistent, accessible reading. · *Test*: extend capture.

## §8 — S7 i18n / RTL / a11y Cross-Cut
**Contract**: a reusable RTL/a11y primitive set; live language switch; SR-aware async; localized numbers.
- **7.1 a11y of async** — `D7-01`[H,S]/`DS-2` Toast `accessibilityLiveRegion`/`aria-live` + RTL; `D7-02`[H,M] chatbot typing + bot reply announced. · *Acc*: async states announced to SR. · *Test*: `(TBC)` + extend ToastContext test.
- **7.2 Localized numbers** — `D7-03`[H,M] unit/number formatter (mm/cm/g→مم/سم/غ) shared. · *Acc*: ar/tn numerals+units consistent. · *Test*: `src/utils/__tests__/i18nHelpers.test.ts`.
- **7.3 RTL primitives** — `D7-04`[M,L] `useRtl()` hook replacing 11+ duplicated one-liners; `D7-07`[M,S] mirror absolute-positioned chrome; `D7-08`[L,M] RTL LanguageSelector modal. · *Acc*: one hook; chrome mirrored. · *Test*: `(TBC)`.
- **7.4 Focus + title** — `D7-05`[M,M] focus management on route change; `D7-06`[M,S] documentTitle + SR page name update on language switch. · *Acc*: focus + title correct post-nav/lang-switch. · *Test*: `(TBC)`.

## §9 — S8 Transitions / Feedback / Design-System
**Contract**: one state-triad system, motion language with reduced-motion, unified shadows/haptics/refresh.
- **8.1 State triad** — `DS-1`[H,M] reuse loading/empty/error components everywhere; retire dead `LoadingScreen`/`ErrorState`. · *Acc*: every list/screen uses the shared triad. · *Test*: `src/components/common/__tests__/` (extend).
- **8.2 Motion** — `DS-3`[H,M] reduced-motion support (AccessibilityInfo); `DS-7`[L,M] screen-transition language; `DS-5`[M,M] press-scale + haptics. · *Acc*: animations respect OS setting; tactile feedback on primary touchables. · *Test*: `(TBC)`.
- **8.3 Primitives** — `DS-4`[M,M] one shadow API (theme.shadows); `DS-6`[M,M] pull-to-refresh on data lists; `DS-8`[L,S] coordinate OfflineNotice+Toast anchoring + localize OfflineNotice. · *Acc*: consistent shadows/refresh; no overlap; OfflineNotice localized. · *Test*: extend.

---

## §A — Agent army map + fan-out matrix
Reuses the harness + agent patterns proven this session (Agent tool / Workflow).

| Role | subagent_type | Tools | Brief |
|---|---|---|---|
| Architect/Interaction | `Plan` / `general-purpose` | read-only | flow design, anchor verification |
| UX/A11y | `general-purpose` | read-only + Playwright | WCAG 2.1, focus, SR, RTL |
| Implementer | `code-editor`/`general-purpose` | Edit/Write/Bash | smallest-change TDD; theme-only; i18n 4-lang parity |
| RED (logic) | `general-purpose` | read-only | refute the fix, hunt regressions |
| QA Visual | `general-purpose` | read-only (Read PNG) | capture+analyze via `e2e/audit2` |
| RED Visual | `general-purpose` | read-only | independently dispute QA screenshots |

**Fan-out matrix** (mandatory `x`):
| Task type | Arch | UX/A11y | Impl | RED | QA-Vis | RED-Vis |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Frontend/interaction | x | x | x | x | x | x |
| Shared primitive/util | x | . | x | x | . | . |
| i18n/RTL/a11y | x | x | x | x | x | x |
| Service/logic | x | . | x | x | . | . |
**Discipline**: read-only specialists fan out in ONE message (parallel); implementers NEVER parallel on the same file (group tasks by file-owner cluster or use worktree isolation); RED + RED-Visual always before DONE; subagent findings persist to `reports/test-e2e/goal-interaction/<wave>/<role>.json`.

---

## §X — Convergence waves
Default **sequential per wave**, parallel **within** each wave's read-only audit phase and across disjoint-file implementer clusters.

| Wave | Scope | Parallelism | Checkpoint (advance only if all true) | Interrupt-resume |
|---|---|---|---|---|
| **W0 Pre-flight** | commit audit baseline; branch `feat/interaction-ux-2026-06-18`; build dist; capture round-0 baseline (all 4 langs) | n/a | baseline build + capture exist; verify green | commit + `INTERRUPT_W0.md` |
| **W1 Foundations** | S2 (2.1 SSoT, 2.4 toast), S7 (7.1 toast-a11y, 7.2 number-fmt, 7.3 useRtl), S8 (8.1 state-triad, 8.2 reduced-motion) — shared primitives others reuse | impl clusters by file (utils / contexts / components-common) | verify green; new utils unit-tested; toast a11y+RTL verified; no raw-key leak | per Axis |
| **W2 Nav spine** | S1 (all NAV-*) incl. guest-upgrade + notif routing + titles + backstack | audit parallel; impl sequential (App.tsx shared) | guest-upgrade E2E green; notif deep-link test green; titles correct; no nav warnings | " |
| **W3 Home hub** | S3 (all D3-*) using W1 primitives | impl: HomeScreen cluster | quick-actions are buttons (AA); return-to-today; first-run state; e2e Home green 4 langs | " |
| **W4 Content & Chatbot** | S6 (all D6-*) | impl clusters: list/detail vs chatbot vs service | cross-link + bookmark + filters work; safety icon+label; e2e resources/chatbot green | " |
| **W5 Health loop** | S4 (all D4-*) | impl clusters per screen | health-hub; localized dates/units; milestones; inputs a11y; e2e health green | " |
| **W6 Calendar/Reminders/Notifs** | S5 (all CRN-*) | impl clusters: calendar vs reminders vs services | RDV notif routes; permission priming; RTL calendar; e2e calendar/reminders green | " |
| **W7 RTL/a11y/design polish** | remaining S7/S8 (focus mgmt, RTL mirroring, shadows, haptics, pull-to-refresh, OfflineNotice i18n) | impl clusters | focus on route change; reduced-motion; shadow unified; e2e RTL sweep green | " |
| **W8 Full convergence** | run `e2e/audit2` capture (4 rounds incrementally) + `review.workflow.js` adversarial review across all 4 langs to **P0+P1=0 ×2 consecutive rounds**; full `npm run verify` | review fan-out parallel | two clean rounds, identical findings; verify green; CONVERGENCE_FINAL written | " |

**Per-wave checkpoint** (all required): all tasks PASS or documented-deferred · `npm run verify` green · i18n 4-lang parity for new keys · adversarial RED done, P0/P1 healed · visual gate fired (screenshots Read) for frontend tasks · wave committed + report updated. **Convergence-failure protocol**: 3rd heal-loop on the same cluster → STOP, spawn `Plan` agent for pivot analysis → `STUCK_<wave>.md` → surface options to owner, don't auto-pick.

---

## §G — Owner gates (WHO / WHAT / WHERE)
| Gate | Description | WHO | WHAT | WHERE | Blocks |
|---|---|---|---|---|---|
| G1 | Firebase **Anonymous Auth** + App Check enabled (so guest-upgrade `linkWithCredential` + online content verify work beyond the offline harness) | Physical owner (Firebase console) | console screenshot / config diff | `docs/V1_AUTONOMOUS_RUN` operator log | online verification of W2 1.1 / W6 (local UX still buildable) |
| G2 | `firebase deploy --only firestore:rules` (guest content reads) | Physical owner | deploy log | commit tag | online content path (offline fallback unaffected) |
| G3 | Device smoke test fr/ar/tn on physical iOS+Android (motion/haptics/notif permission) | Physical owner | device video/notes | report path | W8 sign-off (web E2E unaffected) |
| G4 | Store credentials / EAS (if "lancer le projet" = store submit) | Physical owner | EAS secrets receipt | `eas.json` | store submission only |

**Gate-waiting protocol**: W1-W8 local/web work proceeds in parallel with G1-G4; only the online-verification + store-submit steps wait. State which waves are blocked in the wave log.

---

## §R — References
- `~/.claude/skills/{ultra-audit-profond,test-e2e,superpower-gstack}` (pipeline / convergence / single-task).
- Harness: `e2e/audit2/capture.mjs`, `e2e/audit2/review.workflow.js`, `reports/test-e2e/run-2026-06-17/CONVERGENCE_FINAL.md`.
- Findings: `docs/goal_carto/findings_compact.json` (67, full design specs), `cartography_raw.json`.
- Memory: [[reference-rnweb-rtl-gotchas]], [[project_v1_release]].

## §F — Final DONE rule
The GOAL is DONE when: all 8 systems' high+medium tasks land (low = disclose-or-do); the `e2e/audit2` adversarial loop is **green ×2 consecutive rounds, P0+P1=0, identical findings, all 4 languages**; `npm run verify` green; cross-feature flows have **zero dead-ends / silent no-ops / cross-surface contradictions**; a11y on every primary path; motion respects reduced-motion; and the convergence report + device-smoke gate (G3) are signed. Production-perfect, not "almost there."
