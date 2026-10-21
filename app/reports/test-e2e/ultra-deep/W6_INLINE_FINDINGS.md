# W6 — S6 Chatbot — inline supervisor findings (2026-06-22)

The 10-agent W6 army was NOT launched: the build volume is at **99% (≈211Mi free)** — launching 11 agents
(each streaming a transcript to disk) risks ENOSPC mid-run. Did a focused inline verification of the
highest-risk area (medical triage / emergency escalation — a prior supervisor "untested" concern) instead.

## VERIFIED CORRECT — emergency-triage rendering path is consistent
Traced the full active path and confirmed severity values agree end-to-end (no mismatch):
- `ChatbotScreen.tsx:139-148` renders the emergency alert + tel: call action when
  `item.data.redFlag.severity === 'emergency' || 'urgent_consult'` (English).
- `chatbotService.ts:26-27` scores flags via a map keyed `{'emergency':3,'urgent_consult':2,…}` (English).
- `analyzeMessage` → `getRedFlagsCached()` → `src/data/chatbot_data.ts` (`"severity":"emergency"` @1878,
  `"urgent_consult"` @1899/1920) — the active red-flag data is English-severity.
- `resolveEmergencyNumber(user.country, locale)` picks the call number (ChatbotScreen:34). Both
  emergency AND urgent_consult expose the call action.
→ The emergency call-doctor UI **does** fire for critical/urgent flags. The earlier FuzzyMatcher
  over-escalation guards (CB-R5-02) are present. No live triage bug found in this pass.

## ALSO VERIFIED SOLID (inline) + 1 fix
- **a11y/RTL**: message bubbles mirror correctly in ar/tn (ChatbotScreen:118-119 isRTL alignSelf flip); send/retry/emergency-call/article/tip/reminder/suggestion buttons all carry role+label; send button has disabled+busy state. **Fix shipped (cd818ea):** the composer input lacked an accessibilityLabel (placeholder-only) → added label + returnKeyType=send + onSubmitEditing.
- **Rate-limit UX**: `chatbotLimiter.tryRequest()` gate (ChatbotScreen:62) degrades gracefully — pushes a localized `common.chatRateLimit` bot message, no crash/silent-fail. Oversized input capped by maxLength.
- **Error state**: catch pushes a localized `chatError` bot message with a retry action (verified).
→ S6's high-risk surface (triage + a11y/RTL + rate-limit + error) is solid by inline verification. Army-dependent depth deferred to G5-clearance: full 4-lang canned-reply parity audit, streaming/empty-state micro-states, severity-taxonomy unification + guard test, perf of the FlatList.

## LATENT (P3, note for the full W6) — severity-token type inconsistency
`schema.ts:18 DbRedFlag.severity` is typed French (`'faible'|'modéré'|'élevé'|'critique'`) — the SQLite
shape — while the ACTIVE engine + screen use English (`'emergency'|'urgent_consult'|…`). The SQLite/
DatabaseService path is not the active source (analyzeMessage uses chatbot_data.ts), so this is a
type/schema-cleanliness inconsistency, not a live defect — but if the SQLite path were ever activated the
emergency UI would silently not fire. Recommend: unify the severity taxonomy (one enum) + a guard test, and
have the full W6 army sweep the rest (streaming/empty/error states, RTL bubbles, input+send a11y, 4-lang
canned replies, rate-limit UX).

## OPERATOR GATE (new) — G5: disk space
Root volume at 99% (211Mi free) — APFS/container-level (12Gi used of 460Gi; snapshots/other volumes hold the
rest). Blocks: dist rebuilds (ar visual probes) and large parallel-agent runs (transcript writes). Freed what
was safe (dist, .playwright-mcp, .expo, node cache, old workflow transcripts). Operator action needed to
reclaim space before W6's full army + remaining visual probes can run; inline code-path verification is the
fallback meanwhile.
