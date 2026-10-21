# W5 — S5 Content — wave status (2026-06-22)

Backlog: `W5_BACKLOG.json` (10-agent analysis: **91 raw → 24 ranked**, P0:0, P1:4, P2:8, P3:1, UX:11).
First fan-out hit API 529 Overloaded; retry succeeded (1 lens, adversarial-break, dropped mid-response — synthesis ran on 9 lenses).

## FIXED + verify-GREEN (3, incl. the program's most consequential catch)
| # | sev | item | commit |
|---|---|---|---|
| (inline) | — | ForbiddenFoods search was case- but not diacritic-insensitive → "pate" missed "pâté", Arabic needed exact harakat/alef. Added tested `normalizeForSearch` (NFD + Latin/Arabic strip) + search a11y label/clear | cc95816 |
| **#1** | **P1 SAFETY** | **supplements mislabeled SAFE**: `supplements_db` shipped accented `à_surveiller` for 4 incl. **Vitamine A** (teratogen) → `SAFETY_CONFIG['à_surveiller'] \|\| .ok` rendered them GREEN ✓Safe + the caution filter found none. Bundled DB is the de-facto primary source (Firestore never seeded) → every user affected. Fixed data→ASCII + getSafetyConfig NFD-normalize + **fail-safe to caution** (never green) + guard test | b6cdb12 |
| **#4** | P1 | 7 horizontal scrollers missed the proven `dir=ltr` web-RTL fix → filter chips (incl. safety) unreachable in ar/tn. Extracted `useRtlScrollFix` hook; applied to the 3 filter-chip rows (Supplements/Articles/ForbiddenFoods) | 84cc475 |

## ALL 4 P1 FIXED ✅ (#2/#3 contrast healed — commit 1cccbae)
- **#2** DONE: card safety pill icon+label now render in dark tokens (green800/greenTint 4.56:1, deepOrange900/orangeTint 5.11:1, red800/rose 4.91:1 — verified) on the unchanged tint. Applied to SupplementsList SAFETY_CONFIG + WeekRecommendations (new getSafetyTextColor). deepOrange900 (existing token) served as the dark-amber — no new token needed.
- **#3** DONE: selected safety filter chip now fills with the dark token (white label ≥4.98:1) via a new `fill` field on SAFETY_FILTERS; was white-on-pastel (1.7–3.0:1).

## REMAINING (P2 ×8, P3 ×1, UX ×11)
Notably: #5 WeekRecommendations has NO bundled fallback (guests/offline always empty — Firestore-only); the 2 detail-screen related-content scrollers still need `useRtlScrollFix`; empty-state interpolates `{{query}}` on filter-only empties ('Aucun résultat pour ""'); EN favorites 'Saved' collides with saved-state; stripMarkdown leaks list/blockquote markers; 2 of 3 search inputs lack a11y labels; clear-✕ mislabeled `a11y.close`. (See W5_BACKLOG.json.)

## Gate
**P0 = 0, P1 = 0 ✅** — all 4 P1 healed: #1 patient-safety mislabel (Vitamine A) + guard test, #4 RTL filter chips, #2/#3 safety-signal contrast (WCAG AA, theme-token-only). + search hardened (diacritic/script-insensitive). verify GREEN (tsc strict + jest 1883 / 70 suites + lint:colors) every commit. **W5 = P1-VALIDATED.** Remaining = P2 (#5 WeekRecommendations fallback, 2 detail-screen RTL scrollers, empty-state {{query}}, stripMarkdown, search a11y labels) + UX-tier — next passes. → W6 (S6 Chatbot).
