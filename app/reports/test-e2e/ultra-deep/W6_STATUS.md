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

## REMAINING P1/P2 (next passes)
- **#2 P1 (AR/TN over-escalation, cry-wolf)** — VERIFIED: "ما عنديش نزيف" (I do NOT have bleeding) → false EMERGENCY because Arabic Path B (chatbotService.ts:717-726) never consults the negative[] bucket. Fix: an Arabic-script negation guard SCOPED to Path B (mirror the latin romNegated window; keep "عندي نزيف ومش خايفة" escalating). **Test-driven like the P0** (red-team AR-negation cases). Deferred to a focused fire — over-escalation is less dangerous than the under-escalation P0, and the guard must be precise to avoid suppressing real emergencies.
- **#5b P1** — don't skip triage when rate-limited; needs a chatbotService split (cheap in-memory red-flag scan always runs; throttle only the semantic-search fallback). rate-limit is anti-spam (rapid-fire) so a lone emergency rarely hits it.
- **severity-taxonomy unification (P1/P2)** — schema.ts French `DbRedFlag.severity` (SQLite/non-active) vs active English; unify enum + a data-contract guard test so the SQLite path could never silently under-escalate.
- P2/P3/UX: FlatList perf (keyExtractor/memo), typing indicator, scroll-to-latest, suggestion-chip layout, 4-lang canned-reply parity audit.

## Gate
**P0 = 0 (the hemorrhage under-triage FIXED + test-locked)**, 3 of 6 P1 healed (the emergency-path legibility/announcement/delivery). verify GREEN (tsc + jest 1887 / 70 suites + lint:colors). **W6 = P0-clean, P1-partial** (#2 AR-negation + #5b + taxonomy remain). The most consequential program output to date. → finish #2 (test-driven) then W7 (Health tools).
