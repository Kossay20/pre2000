# W1 — S1 Onboarding & Auth — wave status (2026-06-20)

GOAL: `docs/GOAL_ULTRA_DEEP_TEST_ANALYSIS_MAMABEBE_2026-06-20.md` · Backlog: `W1_BACKLOG.json` (21 ranked).
Branch `feat/interaction-ux-2026-06-18`. Analysis: 10-agent army → 125 raw → 21 deduped/disputed (P0:0, P1:6, P2:8, P3:6, UX:1).

## FIXED + verify-GREEN + visually verified (12 of 21)
| # | sev | item | commit |
|---|---|---|---|
| #1 | P1 | passwordMin helper LIED ("6 caractères") — `...commonFr` shadowed authFr full rule; re-asserted in 4 locale index.ts | 67663a7 |
| #2 | P1 | LoginScreen `t('auth.tooManyAttempts')` raw-key leak (no `auth:` ns) + lost {{minutes}} → root key; same for auth.invalid{Email,Password} | 67663a7 |
| #4 | P1 | FR auth errors leaked account existence (distinct user_not_found vs wrong_password) — unified to neutral (en/ar/tn already were) | 67663a7 |
| #5 | P1 | Error/SuccessMessage now `accessibilityRole=alert` + aria-live (assertive/polite) | 67663a7 |
| #9 | P2 | password eye-toggles (Login ×1, Register ×2) → role/label(show/hide)/state | 67663a7 |
| #10 | P2 | `common.accountCreated` added in 4 langs (upgrade toast was FR-only) | 67663a7 |
| #14 | P2 | email/password inputs no longer force RTL caret (LTR data); forgot-password double-send guard | 67663a7 |
| #6 | P1* | OnboardingScreen had ZERO language-RTL → added isRTL text-align for step-3 labels + name input (TEXT only, no row-reverse) | 8fef2a4 |
| #7 | UX | step-1 status cards dwell 220ms so selection is perceived (reduced-motion aware) | 8fef2a4 |
| #8 | P1 | skip/back tappable DURING account creation → 2nd handleFinish; now disabled+dimmed+a11y-state | 8fef2a4 |
| #11 | P2 | LanguageSelector: dropped dead expo-updates/I18nManager imports, theme white | 7758abd |

**Visual proof (ar, dist rebuilt + probed):** onboarding step-1 renders RTL-correct (dir=rtl, cards `direction:rtl`); register shows passwordMin full rule "كلمة المرور (10+ أحرف، 1 حرف كبير، 1 رقم)" + email/password `direction:ltr`; **0 console errors**.

## VERIFIED P1 — REMAINING (needs focused test-driven fix, blocks full VALIDATED gate)
- **#3 re-onboarding overwrites an existing account's profile.** `AuthContext.loginAsGuest` (src/context/AuthContext.tsx:430-461) writes `firstName`/`lmp`/`pregnancyStartDate`/`createdAt:new Date()` from the onboarding form via `setDoc(merge:true)`. In `handleFinish` (OnboardingScreen.tsx:233-265) the `auth/email-already-in-use` recovery path logs the user in then calls `loginAsGuest` unconditionally → a returning user re-running onboarding loses their real pregnancy date + name + original createdAt.
  - **Fix recipe:** after recovery-login, `getDoc(userProfiles/uid)`; if a profile with `lmp` exists → SKIP the `loginAsGuest` write (preserve; their session loads via the auth listener + login() already migrates guest data); only create when no profile (true partial-signup). Add regression test `AuthContext.reonboard-preserve.test.ts`. createdAt should also be set-once even on the normal guest→account upgrade.

## P2/P3 polish — REMAINING (do not block P1 gate; next loop pass)
- #12 P2 iOS picker confirm uses `common.save` ("Saving") → add/used `common.done`. (iOS-only)
- #13 P2 progress bar hidden on final step (OnboardingScreen.tsx:1271 `step < getStepCount`) — DESIGN CHOICE (final = celebration screen); decide show-100% vs intentional-hide.
- #15 P2 step2/curious steppers + Skip: a11y role/value + clamp visual at bounds.
- #16 P2 "DDR" jargon unexplained + pre-seeded preview reads as assertion not estimate.
- #17 P3 AuthChoice privacy link is concatenated ("disclaimer — link") → bidi-fragile in ar; split + RtlAwareChevron.
- #18 P3 RegisterScreen: no focus ring, no per-field error highlight.
- #19 P3 whitespace-only firstName blocked via terminal showAlert → inline error at step 3.
- #20 P3 back-arrow + lang pill < 44×44 hit target on web (hitSlop present; add minWidth/minHeight).
- #21 P3 disabled CTA gradient + strength label contrast < 4.5:1.
- LanguageSelector: rapid-tap guard + inner-tap-dismiss (tapping modal body bubbles to overlay → closes).

## Gate
P1: 6 of 7 fixed (#3 verified+specced, deferred to focused fix). P0=0. verify GREEN (tsc+jest 1867+lint:colors) on every commit. a11y/i18n/RTL: materially improved + visually verified ar. **W1 = P1-substantially-healed; full VALIDATED pending #3 + P2/P3 sweep.**
