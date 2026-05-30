# ✅ Verdict — Whole-project test campaign (max coverage)

**Date** : 2026-05-30 · **Branch** : `release/v1.0-ship` · **Goal** : "test the whole project entirely, a lot of tests for each system to the maximum" — supervisor + GStack + Superpowers + test-e2e + adversary.

---

## 0 · Headline

**Unit/integration: 368 → 1391 tests green** (60 suites), `tsc` + `lint:colors` clean, 0 regression.
**E2E audit: 7/7 green** across every offline-reachable surface, dual-team (capture + adversary) reviewed, visual gate passed — **no P0/P1 app defects** on tested surfaces.

This is on top of the earlier ship-remediation run (chatbot triage, notifications, supplements, GDPR, health, RTL). Everything proven by a command actually run; two real bugs found and fixed.

---

## 1 · Track 1 — Unit/integration to the maximum (+970 tests)

Every previously-untested service/util now has a comprehensive suite (real behavior: happy + edge + boundary + error + locale/guest branches), fanned out via workflow, healed to green in isolation, then **verified together** (no mock/global collisions):

| Layer | Modules (tests) |
|---|---|
| services | calendarService(68) · reminderPersistence(54) · weightIntelligence(48) · weightService(45) · notificationBuilder(43) · timezoneService(40) · taskService(35) · reminderService(34) · useCurrentWeek(30) · hydrationService(24) · tipsService(24) · dataExportService(22) · appointmentService(19) · supportService(19) |
| utils | firebaseErrors(138) · i18nHelpers(74) · validationSystem(68) · hexToRgba(48) · textParsers(44) · pickerLocale(28) · styleUtils(26) · uiUtils(20) · alert(19) |

Combined with the prior remediation suites (chatbotTriage 27, remindersScheduler, babyMessageService, contentService, gdprPurge, i18nParity, rtl, …) → **1391 tests, 60 suites, all green.**

### Bugs found by the new tests → FIXED (`17b12e6`)
- **calendarService.getCombinedEventsForWeek dropped `UserEvent.location`** → a user appointment's address vanished in the combined/grouped calendar view. Now carried through. (E2E confirms the AddAppointment form has a Location field feeding this.)
- **calendarService importance→color mismatch**: the `CalendarTemplate.importance` typed union (`essential|recommended|optional`) had no `PRIORITY_COLORS` entry → all fell to grey. Now mapped (essential→high, recommended→moderate, optional→info).

---

## 2 · Track 2 — E2E whole-project audit (dual-team)

Standardized on the static-export harness (cycle9-fixes still 15/15). New `e2e/full-audit.spec.ts` audits every offline-reachable surface with 3 gates + a screenshot:
**renders · no raw-i18n-key leak · no real console error** (documented offline-harness artifacts filtered).

Surfaces, all GREEN + visually reviewed: **Home · Calendar · Reminders · Resources · Chatbot** (5 tabs, nav proven via selected-state), **Resources→Articles + Supplements** internal tabs, **AddAppointment** (deep-link `/appointment/add`). 8 screenshots in `audit-screenshots/full-audit/`.

### Dual-team adversarial result
- Independent adversary + supervisor visual gate → **0 P0/P1 app defects** on tested surfaces. Chatbot confirmed clean ("Pregnancy guidance" — AI claim removed, BETA + disclaimer present); Calendar/Reminders chrome clean; AddAppointment form clean (all fields incl. Location).
- The adversary first flagged deep screens showing the global "Oops" fallback → **root-caused to a coverage artifact, not bugs**: those screens (Profile, Settings, HealthDashboard, WeightTracker, ForbiddenFoods, KickCounter, ContractionTimer, BabyEvolution) are **not in the linking config** (App.tsx:248-274), so direct-URL navigation fell back to Home. The spec was corrected to honestly scope them out.
- **P2 disclosed (non-blocking)**: the Supplements data-error card lacks the "Oops!" heading the global ErrorBoundary uses (error-state design inconsistency across components). Pre-existing F55 ISO date format also visible.

---

## 3 · Honest scope — what E2E does NOT cover, and why

The offline static-export harness has **no Firebase backend** (the e2e guest is a local uid, not a real anonymous session), so:
- Firestore-backed CONTENT is empty/erroring (article/supplement lists, week content) — harness limitation, not app defects.
- Deep screens not in the linking config are reached only via in-app nav from a backend-dependent Home → **cannot be E2E'd offline**. Their LOGIC is covered by the Track-1 unit tests (kickCounterService, contractionTimerService, weightService, healthService, taskService, calendarService, …). **Their full screen-level E2E requires the same owner gate that gates the guest content path: Anonymous Auth + firestore.rules deploy + seeded collections.**

This boundary is the truth of the harness, documented rather than papered over.

---

## 4 · Owner actions (unchanged, human-only — still the store blockers)
★ Firebase Console: enable **Anonymous Auth** + deploy `firestore.rules` + seed collections (`npm run import-data` — now seeds supplements). ★ **Clinical sign-off** of articles + supplement dosing. Then: device notification smoke fr/ar/tn; EAS secrets + GCP key restrictions; supplement dosing/Darija translations.

Once ★ is done, the deep-screen + content E2E can be run for real against a live backend.

---

## 5 · Reproduce
```bash
cd app && git checkout release/v1.0-ship
npm run verify                              # 60 suites / 1391 tests, tsc, lint:colors
npx expo export --platform web --output-dir dist && npx serve dist -l 8099 --single &
E2E_BASE_URL=http://localhost:8099 npx playwright test e2e/cycle9-fixes.spec.ts e2e/full-audit.spec.ts --workers=1
# → cycle9-fixes 15/15 + full-audit 7/7
```

## 6 · Verdict
🟢 Code-side comprehensively tested: **1391 unit/integration green + 22 E2E (cycle9 15 + full-audit 7) green, dual-team reviewed, 0 P0/P1**. 2 real bugs fixed. 🔴 Store ship still gated on owner actions ★ (Anonymous Auth + clinical sign-off). Branch `release/v1.0-ship` ready for human merge review (not auto-pushed).

*Supervisor: Claude. Track 1: 23-agent workflow. Track 2: dual-team E2E + adversary. Pregnancy app — Mama & Bébé only.*
