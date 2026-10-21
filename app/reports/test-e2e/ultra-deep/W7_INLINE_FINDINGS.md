# W7 — S7 Health tools — inline supervisor findings (2026-06-23)

The 10-agent W7 fan-out hit a transient server rate-limit (twice); inline-verified the highest-risk
areas while the army is re-queued (w5kzlo3k0).

## VERIFIED SOLID — timer/date correctness (the recurring W2/W3 risk does NOT apply here)
The W2/W3 DST bugs were **calendar-day diffs** (`(a-b)/86400000`) used to compute a pregnancy week.
The S7 health services do NOT do that:
- **Durations** (KickCounter/ContractionTimer): `Date.now() - startedAt` measures ELAPSED ms between two
  absolute instants — DST-immune by definition (a 1-hour interval is 3600000ms regardless of a clock shift).
- **Sorting** (weightService:202/218, healthService:74/134/191/320, weightIntelligence:30):
  `new Date(x.date).getTime()` used only for ORDER comparison — DST-immune.
- **KickCounter window** (kickCounterService.ts:7,118): `SESSION_WINDOW_MS = 60*60*1000` = a ROLLING
  1-hour window ("count 10 kicks in 1 hour" — the standard protocol), `MAX_ACTIVE_AGE_MS = 4h` auto-discards
  a stale active session. Both are elapsed-ms windows, not calendar-day boundaries → no DST drift.
→ No raw-ms calendar-day-diff anywhere in S7. The timing/date layer is correct.

## VERIFIED SOLID — weight numeric a11y
All 3 WeightTracker numeric `TextInput`s carry an accessibilityLabel (setup weight:464 / height:476 /
add-weight:620) + decimal-pad keyboard. (The W2 numeric-a11y gap does not recur here.)

## ALSO VERIFIED SOLID
- **Checklist a11y (HospitalBag)**: exemplary — `accessibilityRole="checkbox"` + `accessibilityState.checked`
  + explicit web `aria-checked` (HospitalBagChecklistScreen.tsx:137-140), with a documented Cycle-8.2 fix
  splitting nested touchables to avoid SR confusion. Better than W4's task checklist was.
- **Chart RTL**: HealthDashboard + WeightTracker ScrollViews are VERTICAL (no `horizontal`) → the RTL
  horizontal-scroller gotcha (useRtlScrollFix) does NOT apply here.

## NOTABLE GAP (→ owner gate G4, clinical review — not an unreviewed code fix)
- **ContractionTimer has no 5-1-1 / "when to go to the hospital" guidance** (grep: zero hospital/5-1-1/
  maternité cues in screen or service). A contraction timer should tell the user the standard threshold
  (contractions ~5 min apart, ~1 min long, for ~1 hour → go in). Authoring the exact thresholds + wording
  is a CLINICAL content decision — flagged for G4 (clinical/copy review), not invented here.

## Status — W7 retry ALSO rate-limited (w5kzlo3k0); inline-verification is the binding mode
S7's high-risk classes (timer/date correctness, numeric a11y, checklist a11y, chart RTL) are inline-verified
clean — **no code P0/P1 found**. The only substantive improvement (5-1-1 guidance) needs clinical review.
The full 10-agent W7 army is re-queued for API recovery to enumerate the P2/UX tier (dashboard empty states,
timer reduced-motion, persistence guest→auth migration, unit/number localization). **S7 = inline-verified
P0/P1-clean; full-army VALIDATED pending API recovery.** No fiction: this is one-reviewer depth, not the 10-lens sweep.
