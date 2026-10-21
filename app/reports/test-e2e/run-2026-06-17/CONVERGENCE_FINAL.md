# E2E Audit — CONVERGENCE FINAL (run 2026-06-17 → 06-18)

App: **Mama & Bébé** — Expo 54 / RN 0.81 / React 19 / RN-Web static export, served SPA on :8081.
Languages: **FR / EN / AR / TN** (ar+tn RTL). Method: full artifact quartet (PNG+DOM+console+network+meta)
per state, multimodal adversarial review (9 waves × 4 langs + adversarial verify) + orchestrator independent scan.

## VERDICT: CONVERGED ✅
Two consecutive clean adversarial rounds on the same build with **P0 = 0 and P1 = 0 across all 9 waves**:
- **Round 3**: all 9 waves GREEN — `confirmedBlocking: []`.
- **Round 4** (re-capture same build, independent cycle): all 9 waves GREEN — `confirmedBlocking: []`.
Blocking set empty and stable → flakes excluded. Deterministic gate green: `lint:colors` ✅ · `tsc --noEmit` ✅ · **jest 1810/1810** ✅.

## What this audit found and fixed (round 1 = RED: 2 P0 + 9 P1)
The branch's in-flight "offline/guest content fallback" turned Firestore-error states into bundled-content, so
content quality + localization on the guest/offline path (what the harness exercises) became load-bearing. That
surfaced real defects, all now fixed at the root:

| Sev | Defect | Fix |
|-----|--------|-----|
| **P0** | Supplements list **blank** under RTL (ar/tn) | `ResourcesScreen.tsx`: web conditional-render segmented control (kills the material-top-tab pager whose LTR offset math, `I18nManager.isRTL=false` on web, sent panel 1 off-screen under dir=rtl). Native keeps material-top-tabs. |
| P1 | Supplement body content shown in **French** on en/ar/tn | Faithfully translated 15 supplements' FR medical text → EN + AR (120 fields, dosages/numbers preserved); tn inherits ar via getLocalizedContent fallback. |
| P1 | Supplement + article **category chips raw slug** ('vitamine'/'symptomes') all langs | Added `categories.*` (16 article) + `supplementCategories.*` (5) i18n keys ×4 langs; wired supplement screens to `t()`. |
| P1 | BabyEvolution carousel **stranded on Month 9** (ar/tn) instead of current month | `BabyEvolutionScreen.tsx`: force carousel `direction:'ltr'` (standard positive scrollLeft), drop row-reverse, reset card text to rtl, standard offset. Probe-verified Month 5 centers in ar+tn. |
| P1 | ContractionTimer FR emergency-call link **overlaps** wrapped subtitle | `ContractionTimerScreen.tsx`: spacing l→xl. |
| P2 | Raw markdown `#` in article list preview (all langs) | `ArticlesListScreen.tsx` `{ stripMarkdown: true }`. |
| P2 | Recommendations empty-state bare (no illustration/CTA) | shared `EmptyState` + CTA to Resources (+ i18n). |
| P2 | HospitalBag RTL checkbox-label gap wrong side | per-direction logical margin + textAlign. |
| P2 | Register password placeholder clipped | short `passwordPlaceholder` + full-rule `passwordMin` helper line (F1004 test preserved). |
| P3 | LanguageSelect TN subtitle stayed French on EN | `langDesc*` i18n keys ×4. |

Each fix verified directly (multimodal PNG read + Playwright DOM/geometry probes + deterministic text scan) and
re-confirmed clean across rounds 3 and 4.

## Process note
A harness arg-passing quirk (`args:{round:N}` arrived stringified → script defaulted ROUND=1) caused one review
pass to score **stale round-1 captures** and falsely re-report the fixed defects. Caught by cross-checking against
the orchestrator's own round-3 visual/probe/scan evidence; fixed by hardcoding ROUND per run; re-reviewed correctly.

## Residual P2/P3 — DISCLOSED, not blocking (per protocol P2/P3 = disclose, don't loop)
1. **[P2] Latin units on ar/tn** — BabyEvolution + Home show `mm`/`cm`/`g`; should be `مم`/`سم`/`غ` (Home analogy already localizes). Units-localization gap in the size formatter.
2. **[P2] Arabic tab-bar ligature split** — bottom-nav labels render `الموارد`→`المو ارد`, `التذكيرات`→`التذكير ات` on some screens (Home renders fine). Shared tab bar, inconsistent across rounds → font-shaping / render-timing artifact (not introduced by this audit).
3. **[P2] ForbiddenFoods ar halal panel** — dense small text; readability check on device.
4. **[P3] Mango size** 14.2cm (Home) vs 14cm (BabyEvolution) — reconcile the constant across surfaces.
5. **[P3] Supplement-detail back chevron** sits left in RTL (icon flips but container doesn't mirror).
6. **[P3] ForbiddenFoods ar/tn source line drops "ANSES"** (fr/en cite "OMS et ANSES").
7. **[P3] Safety badge label** inconsistent: list "OK" vs detail "Sans danger"/"Safe".
8. **[P3] tn password term** label "كلمة المرور" vs placeholder "كلمة السر" (register+login).
9. **[by-design?] FR HospitalBag** uses Tunisia-specific "CIN"/"CNAM" for a France-seeded guest — likely intentional for the Maghreb-focused product; confirm with product.

## How to reproduce
```bash
cd app && nvm use            # 20.20.2
npm run verify               # lint:colors + tsc + jest (1810)
# static-export harness used for this audit:
npx expo export --platform web --output-dir dist && npx serve dist -l 8081 --single
node e2e/audit2/capture.mjs  # LANG_CODE=ar MODE=guest ROUND=N
```
Artifacts: `e2e/audit2/round-{1..4}/<mode>/<lang>/<state>.{png,dom.html,console.json,network.json,meta.json}`.
Reports: `reports/test-e2e/run-2026-06-17/`.

## Note on the supplement translations
The 15 EN/AR supplement bodies are faithful translations of the existing **vetted FR** medical text (numbers,
dosages, WHO/HAS references preserved). Recommend a native/clinical reviewer pass before store release.
