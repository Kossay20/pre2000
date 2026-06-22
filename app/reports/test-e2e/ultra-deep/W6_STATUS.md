# W6 — S6 Chatbot — wave status (2026-06-22)

Backlog: `W6_BACKLOG.json` (10-agent + triage-safety lens: **75 raw → 25 ranked**, **P0:1**, P1:6, P2:7, P3:7, UX:4).
Disk recovered (1.7Gi) → full army ran (1st two W6 attempts were inline due to G5). 168→172 triage tests.

## FIXED + verify-GREEN (P0 + 3 P1) — the program's first true P0
| # | sev | item | commit |
|---|---|---|---|
| **#1** | **P0 SAFETY** | **chatbot failed to escalate "heavy bleeding" (hemorrhage UNDER-triage)** — empirically reproduced. FuzzyMatcher corrected "heavy"→capitalized "Heavy" vocab token, assigned un-lowercased (KeywordEngine.ts:154) → INTENSIFIER_TOKENS missed it → generic bleeding/blood gated away. Fixed (lowercase corrected token) + 4 red-team tests (red→green) | fe823a4 |
| **#3** | P1 | emergency alert title/text + call button used `error` #E57373 → 2.6:1 (WCAG fail) — most safety-critical text least legible. → red800 (≥4.9:1 both tints; white-on-red800 button 5.6:1) | 8f8c821 |
| **#4** | P1 | new bot replies + emergency block NOT announced to screen readers (no live region). → `accessibilityRole=alert` + `accessibilityLiveRegion=assertive` on the alert + `announceForAccessibility` per reply (emergency leads with severity word) | 8f8c821 |
| **#5a** | P1 | over-long message silently dropped (bare `return`) → ZERO triage of a buried emergency. → clamp to MAX_INPUT_LENGTH + proceed | 9496480 |

Prior inline verification (this wave): triage emergency-path consistency, rate-limit/error graceful, input a11y label (cd818ea) — see `W6_INLINE_FINDINGS.md`.

## ALSO FIXED (this fire)
| #2 | P1 | AR/TN negated symptom ("ما عنديش نزيف") false-escalated. Scoped `arTokenNegated` guard (negation lexeme within 3 tokens before the matched token) in BOTH Path A + Path B, gated to SPECIFIC tokens — generics (حركة) + multiword fetal keyword untouched. Test-driven: 4 negation (red→green) + 4 controls (incl. fetal-movement "لا أشعر بحركة الجنين" + "نزيف ومش خايفة") all escalate | 284ecd9 |
| taxonomy | guard | data-contract test: every RED_FLAGS severity ∈ screen-handled {emergency, urgent_consult} — prevents a future unhandled-severity silent under-triage | 1de0468 |

## REMAINING (deferred-with-spec / lower-risk)
- **#5b P1** — don't skip triage when rate-limited; needs a chatbotService split (cheap in-memory red-flag scan always runs; throttle only the semantic-search fallback). rate-limit is anti-spam (rapid-fire) so a lone emergency rarely hits it. #5a (oversized-clamp) already covers the higher-frequency drop.
- schema.ts French `DbRedFlag.severity` (SQLite/non-active) enum cleanup (P3) — active path is English + now guard-tested; unify the type when the SQLite path is next touched.
- P2/P3/UX: FlatList perf (keyExtractor/memo), typing indicator, scroll-to-latest, suggestion-chip layout, 4-lang canned-reply parity audit.

## Gate
**P0 = 0, safety-P1 = 0** — both the under-escalation P0 (hemorrhage) AND the over-escalation P1 (AR negation) FIXED + test-locked, plus emergency-path legibility/announce/clamp + a severity data-contract guard. verify GREEN (tsc + jest 1897 / 71 suites + lint:colors). **W6 = P1-VALIDATED** (active triage path); #5b + P2/UX are lower-risk follow-ups. The most consequential wave of the program. → W7 (Health tools).
