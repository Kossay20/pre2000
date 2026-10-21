# Local Ultrareview — V1 ship audit (2026-05-08)

**Branch:** `main` @ `88c1dae`
**Methodology:** 4 parallel hostile sub-agents (Security, Test Integrity, Architecture, Release Readiness) → reconciliation
**Trigger:** `/ultrareview` cloud backend returning HTTP 503; local fallback per insights recommendation

---

## Final verdict: **NO-GO**

The code base is genuinely in good shape — TypeScript strict passes, 336/336 unit tests green, locale parity perfect across 4 languages × 18 namespaces, Firestore rules well-written, password policy enforced, App Check correctly wired in code. The audit/verdict docs largely correspond to real code-side fixes (8/10 sampled findings verified fixed).

But three categories of blocker make ship impossible right now:

1. **Secret hygiene failure** — the Firebase Web API key is committed in 3 tracked markdown files and at least one tracked shell script, and was never rotated despite "R1_FIX FINAL — 13 cycles security" claim.
2. **Status laundering in verdict docs** — F46/F51 marked "PARTIELLEMENT RÉSOLU"; F1004 (Cycle 6 claimed fix) is silently overridden by a stale duplicate i18n key; F53 fix is in the wrong direction (shows "Arabic" where users expect "العربية").
3. **Operator actions all still pending** — including blocking ones: Apple credentials in `eas.json` are placeholders, no V1-smoke device sign-off exists, Firestore rules undeployed.

Reconciled severity counts: **9 P0**, **11 P1**, **15+ P2**.

---

## Convergent P0 findings (≥2 agents agree)

| # | Finding | Evidence | Agents |
|---|---|---|---|
| **P0-1** | Firebase Web API key `AIzaSyBC7HcOFJqICM1JOXUa8pUtdCBF0IUm4aU` committed in tracked files and never rotated | `app/docs/ULTRA_AUDIT_360_2026-05-04.md:132`, `app/docs/SECURITY_NOTES.md:137-146`, `app/docs/R1_FIX_FINAL_DELIVERABLE.md:124`, `app/scripts/migrate-secrets-to-eas.sh:9`, plus git history (`4cdc2f2`, `4ba64c9`, `a156255`) | Security, Release |
| **P0-2** | `eas.json` Apple submit credentials are placeholders — `eas submit -p ios` impossible | `app/eas.json:46-50` (`YOUR_APPLE_ID@email.com`, `YOUR_APP_STORE_CONNECT_APP_ID`, `YOUR_TEAM_ID`) | Security (P1-2), Release |
| **P0-3** | Firestore rules NOT deployed (operator action #1 pending) — F3a/F8/F13 dormant in prod | `app/firestore.rules` well-written but no deploy log; CLAUDE.md §1; R1_FIX §6 row 1 | Security, Release |

## Single-agent P0 findings (verified high confidence — elevate)

| # | Finding | Evidence | Source |
|---|---|---|---|
| **P0-4** | **F1004 fix is overridden** — Cycle 6 commit claims `passwordMin` updated to "10+ chars" but `common.json` still has the stale "8 chars" key, and `index.ts` spreads it AFTER `auth.json`. `RegisterScreen.tsx:152` calls `t('passwordMin')` → resolves to OLD value. **The most recent claimed fix in production is broken.** | `src/i18n/locales/{en,fr,ar,tn}/common.json:707`, `src/i18n/locales/en/index.ts:19-25`, `src/screens/RegisterScreen.tsx:152` | Test |
| **P0-5** | `npm run verify` gate is gameable — uses `--passWithNoTests`. CI workflow `.github/workflows/ci.yml:46` only runs `verify` (not E2E). A PR can land with zero tests run and still be "green." | `package.json:13`, `.github/workflows/ci.yml:46`, empty `app/__tests__/` directory | Test |
| **P0-6** | Android `release` build signs with the **debug keystore** (`storePassword 'android'`, public well-known key) — direct gradle releases would be rejected by Play Store and trivially impersonatable | `app/android/app/build.gradle:100-115` | Security |
| **P0-7** | Deep linking config is structurally wrong — wraps tab children inside fake `*Stack` nodes that don't exist in the navigator; tab keyed `Resources` while real name is `Ressources`. Notifications + universal links silently no-op. Hidden by `linking={linking as any}` cast. | `App.tsx:186, 214-261, 266` | Architecture |
| **P0-8** | `StatisticsScreen` `useEffect` deps lie — `loadStats` deps are `[timeRange, user?.uid, i18n.language]` but the `useEffect` lists only `[timeRange]`. Stats won't refetch on language change or login. | `src/screens/reminders/StatisticsScreen.tsx:52-54, 116` | Architecture |
| **P0-9** | No V1-smoke physical-device sign-off doc exists despite root CLAUDE.md §5 listing it as required | searched `app/docs/` for `V1_SMOKE*`/`smoke*` → 0 hits | Release |

---

## P1 findings (consolidated)

1. **Anonymous Auth fallback silently degrades** — `AuthContext.tsx:298-301` returns `'guest_'+Date.now()` UID that satisfies no Firestore rule; guest mode shows empty screens with no diagnostic surface. (Security)
2. **EAS Secrets state is unverifiable from repo** — `eas.json` no longer contains literal Firebase keys (commit `4ba64c9`), but `SECURITY_NOTES.md §F21:143-148` still claims they're there. Doc/reality drift. Run `eas secret:list --scope project` to confirm. (Security)
3. **iOS `aps-environment = development`** in working `app/ios/MamaBb/MamaBb.entitlements` while `app.json:21` says `production`. EAS prebuild regenerates this so prod builds OK; risk is local Xcode archives. (Security)
4. **Sensitive PII in plaintext AsyncStorage** — first name, country, LMP/pregnancy date, fertility window persisted unencrypted. `app.json:149` `allowBackup:false` is the principal mitigation. F16 deferred per `SECURE_STORE_MIGRATION_PLAN.md`. (Security)
5. **Guest-mode E2E test is a no-op** — `e2e/feature-tests.spec.ts:80-94` only asserts `retryCount > 0` *if* `oopsCount > 0`; success path asserts literally nothing. F100 has zero meaningful E2E coverage. (Test)
6. **F211/F212/F202 click-then-screenshot tests have zero `expect()` after the click.** If TTC/Curious crashes silently, the test still passes. F202 P0 fix has no regression test that would fail without the fix. (Test)
7. **`deep-interactive.spec.ts` (10 tests, 156 lines, "MCP-like") is 10 screenshot-takers** with one visibility check each + `waitForTimeout` (anti-pattern explicitly forbidden by F501). (Test)
8. **`pageerror`s logged but never asserted** — `audit-screenshots/mcp-console-errors.json` shows real `expo-updates` errors collected by `trackErrors()`, written to disk, never `expect`ed. (Test)
9. **`OnboardingScreen` auth recovery race** — `auth.currentUser` read synchronously after `await login()`; `onAuthStateChanged` is async, may still be `null`. Falls through to guest profile on race. Author acknowledges in comment. (Architecture)
10. **Tunisian locale 68–79% identical to MSA Arabic** (`auth` 73%, `common` 68%, `onboarding` 79%) — TN users see formal MSA most of the time. Document or fix. (Architecture)
11. **F46/F51 status-laundered as "PARTIELLEMENT RÉSOLU"** — only the *error UX* has retry; root cause (Firestore guest inaccessible) deferred to operator actions; Articles screen has no Oops/Retry pattern at all. (Release)

## P2 findings (top set)

1. `validSymptoms()` doesn't bound symptom array element size; `firestore.rules:206-212` (Security)
2. No client-side rate limit on `register()`; only login has `authLimiter`; enables email enumeration via `auth/email-already-in-use` (Security)
3. Non-null assertions on every Firebase config field — `firebase.ts:7-13`. If `.env` missing, cryptic init failure (Security)
4. ~10 zombie orphan files contradict "161 orphans cleanup" claim — `src/utils/validationSystem.ts`, `src/utils/uploadArticles.ts`, `src/services/notificationBuilder.ts`, `src/screens/CompletedTasksScreen.tsx` (317 LOC, openly admitted dead in `App.tsx:60`), 5 `src/components/home/*` files, `src/components/calendar/WeekHeader.tsx` (Architecture)
5. `scripts/` contains 72 files, ~24 are unrelated trustpilot/brightdata/doge-vision experiments (Architecture)
6. `clean_emojis.js` and `cleanup_console.sh` at repo root are non-idempotent, destructive `find … sed` rewrites; commit-time scaffolding never removed (Architecture)
7. 205 `: any` / `as any` in `src/`; `types/navigation.ts` `event?: any` route param (Architecture)
8. `OnboardingScreen.tsx` is 1264 lines with `handleFinish`/`handleFinishTTC` 80% duplicate (Architecture)
9. Stale `test_results.txt` and `lint_results.txt` checked into repo — show 4 FAILing tests that have since been fixed (Test)
10. Operator-action count varies across docs: 5 (V1) vs 3 (V3/V5) vs 6 (V4 + root CLAUDE.md). No single source of truth (Release)
11. `findings.md` only covers F31-F62; F100-F829 live only in verdict prose, hard to audit (Release)
12. `app/dist/` is an empty directory (mtime Apr 5) — no build artifact verified (Release)
13. No `v1.0` git tag (`git tag --list` empty) despite repeated "v1.0 sign-off code-side" verdict claims (Release)
14. F53 fix is in the **wrong direction** — `LanguageSelectScreen.tsx:22` shows `name:'العربية', nativeName:'Arabic'`; `:117` displays `nativeName` → AR users see English label "Arabic" (Release)
15. `MCP_TEST_REPORT.md` opens "Playwright MCP installé" then admits "tools non exposés sans restart, Plan B exécuté" — methodology was scripted Playwright, same as other 3 specs (Release)

---

## Operator actions reality check

| # | Action (root CLAUDE.md) | Code-side state | Operator-side state | Blocker? |
|---|---|---|---|---|
| 1 | `firebase deploy --only firestore:rules` | rules file ready | NOT deployed | YES (P0-3) |
| 2 | App Check + Anonymous Auth (F100) | code wired correctly | Console toggle NOT verified | YES |
| 3 | EAS Secrets migration (6 secrets) | `eas.json` cleaned | `eas secret:list` not run; doc drift | UNCERTAIN (P1-2) |
| 4 | GCP API Key restrictions | n/a | NOT verified | YES (especially with P0-1 leak) |
| 5 | V1-smoke physical-device fr/ar/tn | n/a | **No sign-off doc** | YES (P0-9) |
| 6 | Cycle 2 Apple credentials in eas.json | placeholders | NOT done | YES (P0-2) |

**Net: 5/6 operator actions remain blocking.**

---

## 10 sampled `findings.md` claims — verification

| # | Finding | Status |
|---|---|---|
| 1 | F31 fake mock-playwright deleted | FIXED-VERIFIED |
| 2 | F100 signInAnonymously fallback | FIXED-VERIFIED (code only) |
| 3 | F101 collection rename `calendar_templates`→`calendarTemplates` | FIXED-VERIFIED |
| 4 | F47/F52 swipeEnabled false on web | FIXED-VERIFIED |
| 5 | F49 onboarding header "Welcome" | FIXED-VERIFIED |
| 6 | F53 lang picker AR native names | **NOT-FIXED — wrong direction** |
| 7 | F56 hydration "of {{goalL}}L" i18n | FIXED-VERIFIED |
| 8 | F300 Button minHeight 44 | FIXED-VERIFIED |
| 9 | F404 authLimiter wired in LoginScreen | FIXED-VERIFIED |
| 10 | F600 orphans cleanup (138→72) | PARTIAL — count matches but ~24 unrelated orphans remain |

**Net: 8 verified, 1 partial, 1 wrong-direction.**

---

## Per-agent verdicts (raw)

- **Security:** CONDITIONAL-GO (medium-high confidence)
- **Test Integrity:** SUSPECT — unit tests are genuine (~336 real tests), E2E layer is screenshot-takers and the most-recent claimed P0 fix (F1004) is broken in production
- **Architecture:** CONDITIONAL-GO (high confidence on locale/TS, medium on auth race)
- **Release Readiness:** NO-GO (high confidence — secret never rotated, Apple creds placeholder, no smoke sign-off, no tag, F53 wrong-direction, status laundering)

**Reconciled:** **NO-GO**. Release readiness is the binding constraint; the code is shippable but the operator + secret + verdict-honesty layer is not.

---

## Required before V1 ship (in priority order)

1. **Rotate Firebase Web API key in GCP Console** (P0-1). Old key is in git history, so rotation is mandatory regardless of cleanup.
2. **Scrub key from tracked docs and scripts** — `ULTRA_AUDIT_360_2026-05-04.md`, `SECURITY_NOTES.md`, `R1_FIX_FINAL_DELIVERABLE.md`, `scripts/migrate-secrets-to-eas.sh`.
3. **Fill `eas.json` Apple credentials** (P0-2) — preferably via EAS Secrets, not literal values.
4. **Deploy Firestore rules** (P0-3): `firebase deploy --only firestore:rules`.
5. **Fix F1004 properly** (P0-4) — delete `passwordMin` from all 4 `common.json` files, or change `index.ts` merge order, and add a regression test asserting `t('passwordMin')` matches `/10/`.
6. **Fix `verify` gate** (P0-5) — drop `--passWithNoTests`; add E2E to CI.
7. **Fix Android release signing** (P0-6) — point `release` buildType at EAS-managed credentials, not debug keystore. Or delete the `/android` prebuild artefact.
8. **Fix deep-link config** (P0-7) — remove fake `*Stack` wrappers, fix `Resources` → `Ressources` mismatch, drop `as any` cast.
9. **Fix StatisticsScreen deps** (P0-8) — one-line change, restore `[timeRange, user?.uid, i18n.language]` to the `useEffect`.
10. **Fix F53** — display `name` ("العربية") not `nativeName` ("Arabic") on AR row, or correct the data so `nativeName` is the native name.
11. **Run physical-device V1-smoke** (P0-9) on fr/ar/tn; produce `V1_SMOKE_REPORT.md`.
12. **Enable Anonymous Auth + App Check** in Firebase Console.
13. **Restrict GCP API key** (referrer/bundle).
14. **Reconcile operator-action count** to a single source of truth across `VERDICT_v*.md` and root `CLAUDE.md`.
15. **Tag v1.0** once all of the above are green.

---

## Confidence

- **High** on every P0 except P1-2 (EAS Secrets state) — all directly verified file:line.
- **Medium-high** on the verdict-doc status-laundering claims (F46/F51, F600 partial cleanup) — verdict docs hedge enough that "PARTIELLEMENT RÉSOLU" is technically not a lie, just misleading.
- **Lower** on App Check / GCP / Firestore deploy operational state — needs Firebase + GCP console access; code wiring verified correct.

---

## Source agents

- Security: agent `aa423e5ad5eb08fe3`
- Test Integrity: agent `af53fd7c3302b7b77`
- Architecture: agent `a3f48051020f5462b`
- Release Readiness: agent `a5f34838cfa3928f1`

(Agents can be resumed via SendMessage for follow-up drilldowns.)
