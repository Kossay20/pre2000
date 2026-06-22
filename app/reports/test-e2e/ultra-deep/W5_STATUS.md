# W5 — S5 Content — wave status (2026-06-22)

Backlog: `W5_BACKLOG.json` (10-agent analysis: **91 raw → 24 ranked**, P0:0, P1:4, P2:8, P3:1, UX:11).
First fan-out hit API 529 Overloaded; retry succeeded (1 lens, adversarial-break, dropped mid-response — synthesis ran on 9 lenses).

## FIXED + verify-GREEN (3, incl. the program's most consequential catch)
| # | sev | item | commit |
|---|---|---|---|
| (inline) | — | ForbiddenFoods search was case- but not diacritic-insensitive → "pate" missed "pâté", Arabic needed exact harakat/alef. Added tested `normalizeForSearch` (NFD + Latin/Arabic strip) + search a11y label/clear | cc95816 |
| **#1** | **P1 SAFETY** | **supplements mislabeled SAFE**: `supplements_db` shipped accented `à_surveiller` for 4 incl. **Vitamine A** (teratogen) → `SAFETY_CONFIG['à_surveiller'] \|\| .ok` rendered them GREEN ✓Safe + the caution filter found none. Bundled DB is the de-facto primary source (Firestore never seeded) → every user affected. Fixed data→ASCII + getSafetyConfig NFD-normalize + **fail-safe to caution** (never green) + guard test | b6cdb12 |
| **#4** | P1 | 7 horizontal scrollers missed the proven `dir=ltr` web-RTL fix → filter chips (incl. safety) unreachable in ar/tn. Extracted `useRtlScrollFix` hook; applied to the 3 filter-chip rows (Supplements/Articles/ForbiddenFoods) | 84cc475 |

## REMAINING P1 (2 — contrast; need a dark-amber theme token, next pass)
- **#2** card safety pill text/icon uses raw color on its matching light tint → WCAG fail (#81C784/#E8F5E9=1.79:1; #FFB74D/#FFF3E0=1.58:1; #E57373/#FFEBEE=2.61:1) — the *primary safety signal* is barely legible. Fix: render text+icon in dark tokens (green800/red700 exist; add a dark-amber token — no inline hex) on the same tint. Same for WeekRecommendations getSafetyColor.
- **#3** selected safety filter chip = white on raw safety color (1.7–3.0:1). Fix: map selected fill→dark token / dark text for amber; add a leading color-dot legend on inactive chips.

## REMAINING (P2 ×8, P3 ×1, UX ×11)
Notably: #5 WeekRecommendations has NO bundled fallback (guests/offline always empty — Firestore-only); the 2 detail-screen related-content scrollers still need `useRtlScrollFix`; empty-state interpolates `{{query}}` on filter-only empties ('Aucun résultat pour ""'); EN favorites 'Saved' collides with saved-state; stripMarkdown leaks list/blockquote markers; 2 of 3 search inputs lack a11y labels; clear-✕ mislabeled `a11y.close`. (See W5_BACKLOG.json.)

## Gate
**P0 = 0.** The critical **patient-safety P1 (#1) is FIXED + guard-tested** + the RTL-functional-access P1 (#4) fixed + search hardened. **2 contrast P1s (#2/#3) remain** → S5 is **NOT yet fully P1-validated**; next pass adds the dark-amber token + the contrast mapping. verify GREEN (tsc + jest 1883 / 70 suites + lint:colors) every commit.
