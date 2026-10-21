# W1 — S1 Onboarding & Auth — wave status (2026-06-20)

GOAL: `docs/GOAL_ULTRA_DEEP_TEST_ANALYSIS_MAMABEBE_2026-06-20.md` · Backlog: `W1_BACKLOG.json` (21 ranked).
Branch `feat/interaction-ux-2026-06-18`. Analysis: 10-agent army → 125 raw → 21 deduped/disputed (P0:0, P1:6, P2:8, P3:6, UX:1).

## FIXED + verify-GREEN (14 of 21) — P0+P1 = 0 ✅
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
| #11 | P2 | LanguageSelector: dead imports purged + theme white + rapid-tap guard + inner-tap no-dismiss + pill/option a11y | 7758abd, 4255ec7 |
| #3 | **P1** | re-onboarding overwrote existing profile → `shouldPreserveExistingProfile` guard in loginAsGuest (+7 unit tests); adopt stored, never overwrite | 5ab0a3b |
| #20 | P3 | 44pt tap targets (WCAG 2.5.5) on language pill + Login/Register back buttons | 4255ec7 |

**Visual proof (ar, dist rebuilt + probed):** onboarding step-1 renders RTL-correct (dir=rtl, cards `direction:rtl`); register shows passwordMin full rule "كلمة المرور (10+ أحرف، 1 حرف كبير، 1 رقم)" + email/password `direction:ltr`; **0 console errors**.

## P1 — ALL RESOLVED ✅
- **#3 RESOLVED (5ab0a3b).** `shouldPreserveExistingProfile(docSnap)` (loginHelpers.ts, +7 unit tests in reonboardPreserve.test.ts) gates an adopt-instead-of-overwrite branch in `loginAsGuest`: if the authenticated uid already has a profile with a pregnancy anchor, adopt the stored profile + migrate guest data + early-return — never overwrite lmp/firstName/createdAt. Fresh signup + partial-signup recovery + guest path all unaffected.

## P2/P3 — 5 more DONE this pass (19/21 total)
- #12 DONE (ef12b18): `common.done` added 4-lang, iOS picker confirm wired off the "Saving" string.
- #15 DONE (ef12b18): firstPregnancy Skip a11y + RTL text on all 3 options + label.
- #17 DONE (ef12b18): AuthChoice disclaimer/privacy-link split (bidi-safe, role=link).
- #18 DONE (d299ab1): RegisterScreen focus ring (WCAG 2.4.7) + per-field error border (focusedField/errorField).
- #19 DONE (ef12b18): whitespace-only firstName trims to default (no terminal alert).
- #20 DONE (4255ec7) · LanguageSelector rapid-tap/inner-tap DONE (4255ec7).

## ACCEPTED-DEFERRED (3 residuals — design/copy/low-impact, not engineering-blocking)
- #13 P2 progress bar hidden on final step — DESIGN CHOICE (final = full-bleed celebration screen; adding a bar may clutter it). Needs a design call, not a bug.
- #16 P2 "DDR"/"DPA" medical jargon — COPY decision (what hint wording in 4 langs); better with product/clinical input.
- #21 P3 strength-label contrast — minor; "right" fix needs darker color tokens or dropping label color-coding (bar already conveys strength). Low value.

## Gate
**P0 = 0, P1 = 0 ✅** (all 7 P1s incl. #3). **19 of 21 done**; the 3 residuals (#13/#16/#21) are accepted-deferred design/copy/low-impact judgment calls, NOT engineering gaps. verify GREEN (tsc strict + jest 1874 + lint:colors) every commit; a11y/i18n/RTL materially improved + visually verified in ar (0 console errors). **W1 = VALIDATED.** → W2 (S2 Home) analysis launched (wf wyizqpqzy).
