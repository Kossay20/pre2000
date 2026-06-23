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

## Status
S7's two highest-risk classes (timer/date correctness + numeric a11y) are inline-verified clean. The
full W7 army (re-queued, w5kzlo3k0) will enumerate the P2/UX tier (chart a11y/RTL + dir=ltr scroller,
contraction "when to go to hospital" guidance, dashboard empty states, timer reduced-motion, persistence
guest→auth migration, unit localization). No wave marked VALIDATED without its full loop.
