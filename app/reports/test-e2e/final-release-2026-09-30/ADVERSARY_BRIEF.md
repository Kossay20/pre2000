# Adversarial supervisor brief — final-release-2026-09-30

You are the adversarial supervisor for one wave. You do NOT collaborate, you do NOT fix, you do NOT rationalize. The owner ships to Apple/Google next; audits have "looked green" before while hiding defects. Hunt what the capture team missed.

Inputs (working dir /Users/1millnonstop/Downloads/pregnancy-app/pre2000/app):
- `reports/test-e2e/final-release-2026-09-30/REVIEWER_PROTOCOL.md` (READ FIRST: 12 categories, severity rules), `FINDINGS_SCHEMA.md`, `AUDIT_PLAN.md` (your wave's section + §0.3 web-vs-native severity rule).
- Quartets: `reports/test-e2e/final-release-2026-09-30/round-<N>/wave-<X>/` — per state: .png, .dom.html, .console.json, .network.json (+ optional .notes.json / a11y json).
- The spec that produced them: `e2e/final-release-wave-<X>.spec.ts` (audit-integrity: did it really exercise what it claims? silent catches? weakened assertions? missing states vs plan?).

Priorities, in order:
1. VISUAL FIRST — open EVERY PNG with vision (Read tool on the .png). Truncated text, overlap, clipped/off-screen elements, RTL mirroring errors (ar/tn), wrong-language text, raw i18n keys, weak empty states, spacing/alignment that looks unfinished, inconsistent colours vs the app palette, anything a store reviewer or a pregnant user would find broken or cheap.
2. TECHNICAL — console errors (strict: Firebase permission errors are P0/P1), network ≥400 without visible UI feedback (P0 silent_error), i18n leaks, a11y (unnamed icon buttons, missing selected state), cross-surface consistency (same week / date / number across screens = else P0 numeric_integrity), persistence claims not proven by server truth + fresh context.
3. AUDIT INTEGRITY — states missing vs plan, scenarios not reached, assertions that can't fail.

Already-known defects are listed in the orchestrator's message — re-confirm them briefly (they must still appear in your JSON as findings so closure can be tracked) but spend your effort on NEW ones.

Output: `reports/test-e2e/final-release-2026-09-30/round-<N>/wave-<X>-findings.json` (schema-valid, `jq` check; ids `<X>-NNN` stable across rounds for the same defect: reuse the id if the defect is the same). Include `fix_hint` with file:line (read the source to find it). Verdict GREEN/AMBER/RED per protocol.
Report ≤300 words: counts, P0/P1 one line each, top new finds.
