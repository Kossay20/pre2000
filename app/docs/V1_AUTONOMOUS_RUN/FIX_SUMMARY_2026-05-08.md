# V1 Fix Summary — 2026-05-08

**Branch:** `main` @ `88c1dae` (pre-fix)
**Trigger:** `/ultrareview` + `/ultraplan` cloud backends returning HTTP 503; local fallback executed.
**Companion docs:**
- `LOCAL_ULTRAREVIEW_2026-05-08.md` — 4-agent hostile audit + 9 P0s identified
- `E2E_DEEP_AUDIT_2026-05-08.md` — parallel Playwright MCP audit (6 P0 + 11 P1 + 9 P2)
- `GSTACK_FIX_REPORT_2026-05-08.md` — parallel tool's 6-role GSTACK fix run

---

## What was fixed in this session

### Tier A — single-file low-blast-radius (verified test-driven)

| ID | Fix | File(s) | Test |
|---|---|---|---|
| F1004 | Removed root-level `passwordMin` duplicate from `common.json` so `auth.json:14` "10+ chars, 1 uppercase, 1 digit" wins via `index.ts` spread order | `src/i18n/locales/{ar,en,fr,tn}/common.json` | `src/i18n/__tests__/passwordMin.test.ts` (NEW, 5 cases) |
| P0-8 | Reordered `useEffect`/`loadStats` in StatisticsScreen so deps `[loadStats]` (which itself memoizes on `[timeRange, user?.uid, i18n.language]`) — stats now refetch on language/login change | `src/screens/reminders/StatisticsScreen.tsx` | covered by tsc + existing tests |
| F53 | **No-op — verified false positive.** Release-readiness sub-agent only inspected `:117` (subtitle render) and missed `:111` (primary). AR users do see `العربية` as the big bold primary; `Arabic` is the small grey English subtitle for non-AR readers. T7 fix is correct in production. | `src/screens/LanguageSelectScreen.tsx:107-118` | n/a |

### Tier B — wider fixes

| ID | Fix | File |
|---|---|---|
| P0-7 | Rewrote `linking.config.screens` — removed fake `*Stack` intermediate keys (component names, not navigator names), fixed `Resources` → `Ressources` to match `Tab.Screen name` at line 199, dropped `as any` cast on linking pass-through | `App.tsx:226-265` |
| P0-5 | Removed `--passWithNoTests` from `verify` script — empty test directory now fails the gate as it should | `package.json:13` |
| P0-2 | Replaced placeholder Apple submit credentials (`YOUR_APPLE_ID@email.com` etc.) with empty `"ios": {}` — operator must pass real values via CLI flags or `EXPO_APPLE_ID` / `EXPO_ASC_APP_ID` / `EXPO_APPLE_TEAM_ID` env vars at submit time | `eas.json:46-47` |

### Adversary follow-up (single hostile sub-agent reviewed full diff)

| ID | Adversary finding | Action |
|---|---|---|
| P0-1 (adv) | `metro.config.js` references untracked `__mocks__/empty-module.js`; `playwright.config.ts` references untracked `e2e/global-setup.ts` | Both files staged in this commit (verified to exist) |
| P1-1 (adv) | Briefing undercounted scope (17 modified files, not 11) | Resolved by full diff review |
| P1-3 (adv) | OnboardingScreen step 4 submit button `accessibilityLabel` ignored loading state — visible text said "Creating Account…" while screen reader announced "Start" | Fixed: 3-way ternary on label + `accessibilityState.busy = loading` (`src/screens/OnboardingScreen.tsx:670-683`) |

### Bundled from parallel tool (per user instruction)

The parallel `GSTACK_FIX_REPORT` tool also landed:
- i18n web `<html lang>` / `<html dir>` sync on language change
- `Updates.reloadAsync` web/dev guards in `rtl.ts`
- `unmountOnBlur: true` on Tab navigator (P0-3 stacking)
- `errors.*` namespace deep-merge fix for raw-key leak (P0-2 from E2E audit)
- a11y testIDs + role on onboarding buttons
- ErrorBoundary expansion
- `e2e/global-setup.ts` + Playwright globalSetup wiring
- Metro `empty-module.js` stub for sqlite worker on web

All bundled into the same commit per user's confirmed scope choice.

---

## Verify state

```
Test Suites: 30 passed, 30 total
Tests:       368 passed, 368 total
tsc --noEmit: clean
lint:colors:  passed
```

---

## Deferred — operator-only (cannot be fixed from code)

| # | Action | Status | Why deferred |
|---|---|---|---|
| 1 | `firebase deploy --only firestore:rules` | NOT done | requires Firebase Console / CLI access |
| 2 | Firebase Console → Anonymous Auth + App Check (App Attest iOS / Play Integrity Android) | NOT done | E2E_DEEP_AUDIT P0-1 root cause; code wiring already correct (`src/config/firebase.ts:47-86`, `src/context/AuthContext.tsx:281-301`) |
| 3 | EAS Secrets: 6 Firebase keys + 3 Apple keys | UNCERTAIN | `eas.json` no longer has literal Firebase keys; verify via `eas secret:list --scope project` |
| 4 | GCP API Key restrictions (referrer / bundle) | NOT done | console-only |
| 5 | V1-smoke physical device fr/ar/tn | NOT done | no `V1_SMOKE_REPORT.md` exists |
| 6 | Apple credential VALUES into EAS Secrets | NOT done | placeholders removed in this commit; operator now sets `EXPO_APPLE_ID`, `EXPO_ASC_APP_ID`, `EXPO_APPLE_TEAM_ID` |

---

## Deferred — code-level (advisor-cut, follow-up session)

| # | Item | Why deferred |
|---|---|---|
| D-1 | **P0-1 leaked Firebase API key scrub from tracked docs** (`ULTRA_AUDIT_360_2026-05-04.md:132`, `SECURITY_NOTES.md:137`, `R1_FIX_FINAL_DELIVERABLE.md:124`, `scripts/migrate-secrets-to-eas.sh:9`) | Per advisor: scrubbing without operator rotation creates a false audit trail. Rotate first, then scrub. |
| D-2 | **P0-6 Android release keystore** (`android/app/build.gradle:100-115` uses debug keystore for release) | `/android/` is git-ignored (`.gitignore:42`); editing the prebuild artifact is a no-op for the repo. Real lever is EAS-managed credentials in `eas.json` build profile + documenting prebuild as throwaway. |
| D-3 | **Adversary P1-2 HospitalBag Pressable backdrop** — `e.stopPropagation?.()` on RN gesture-responder model is a silent no-op on native. Tap inside modal card may close modal on iOS/Android. | Requires physical-device test (out of scope for verify-only flow). |
| D-4 | **P1 OnboardingScreen auth recovery race** — `auth.currentUser` read sync after `await login()`; `onAuthStateChanged` is async, may be `null`. Falls through to guest profile on race. | Timing-dependent, hard to reproduce/test in unit form. |
| D-5 | **P1 hollow E2E rewrites** — `e2e/feature-tests.spec.ts:80-94` (guest-mode no-op assertion), `e2e/deep-interactive.spec.ts` (10 screenshot-takers), `e2e/audit-screens.spec.ts:152-158` (F-LOAD swallowed) | 10+ test files; high blast radius; defer to focused E2E hardening session. |
| D-6 | **CI E2E wiring** — `.github/workflows/ci.yml:46` runs only `npm run verify`, not `e2e:web` | Env-dependent (needs CI runner config); follow-up. |
| D-7 | **Stale `test_results.txt` and `lint_results.txt` in repo root** | Not safety-critical; cleanup in same future PR. |
| D-8 | **~10 zombie orphan files** (`CompletedTasksScreen.tsx`, `validationSystem.ts`, `uploadArticles.ts`, 5× `components/home/*`, `WeekHeader.tsx`, `notificationBuilder.ts`) | Out of scope; documented in `LOCAL_ULTRAREVIEW`. |
| D-9 | **F53 LanguageSelectScreen field naming** — `nativeName` field actually holds the English/French Latin description, not the native name. Render is correct but variable names are inverted. | Renaming risks regressing the working render; cosmetic only. |

---

## Source attribution

- Hostile audit: 4 parallel sub-agents (Security `aa423e5ad5eb08fe3`, Test `af53fd7c3302b7b77`, Architecture `a3f48051020f5462b`, Release `a5f34838cfa3928f1`)
- Adversary diff review: agent `a351e9ce5db4a48d3`
- Methodology: GSTACK 7-step (Think → Plan → Build → Review → Test → Ship → Reflect) with hostile sub-agent at each substantial step
- Test-driven discipline: every Tier completed with `npm run verify` green before moving to next

---

## Next steps for operator

1. Run the 6 operator actions above (rotation, deploys, console toggles, smoke).
2. Once Anonymous Auth is enabled + Firestore rules deployed, re-run E2E suite from a clean device — confirm P0-1 (E2E audit) ErrorBoundary is gone.
3. Decide on D-2 (Android release keystore) — either commit `/android/` artifact and fix it, or document EAS-only build path.
4. Schedule D-3 through D-8 as a follow-up PR.
5. Tag `v1.0` only after physical-device smoke passes on fr/ar/tn.
