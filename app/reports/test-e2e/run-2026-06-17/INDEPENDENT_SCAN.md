# Orchestrator independent scan — round 1 (2026-06-17)

Static export served on :8081. 116 states captured (4 langs × 23 guest + 4 langs × 6 fresh).
Artifact quartet per state (png + dom.html + console.json + network.json + meta.json).

## Automated technical scan (all 116 states)
- navErrors: **0**
- Real console errors (excluding documented offline FirebaseError perm-denied + vendor noise): **0**
- Network anomalies (>=500, or 4xx other than expected 401/403): **0**
- i18n raw-key leaks (regex namespace.key in visible text): **0**

## i18n / wrong-language findings (AR/TN low arabic-ratio heuristic)
### FIND-1 [P1 candidate] Supplement content is French-only on EN/AR/TN (offline fallback)
- `supplements_db.json`: `short_description_en` / `short_description_ar` are **empty strings**;
  `pregnancy_notes`, `typical_dose_text`, `precautions` exist **only as `_fr`** (no `_en/_ar/_tn`).
- `getLocalizedContent(supplement, field, lang)` fallback chain (lang→en→fr) therefore lands on French.
- Effect: with the new offline/guest **bundled fallback** active (the in-flight diff), Supplement **list cards**
  and **detail** show French body text on EN/AR/TN. AR/TN detail = Arabic title + Arabic section
  HEADERS (حول / الجرعة المعتادة) + **French body** → clearly-broken mixed-language screen.
- Evidence: `guest/ar/05-supplement-detail.png` (arabic_ratio 0.14: "Vitamine essentielle pour la
  formation du tube neural du bébé..."), `guest/en/05-supplement-detail.png` (English title "Folic acid"
  + French description). Same on tn.
- Note: Articles are **fully localized** (`title_*`, `summary_*`, `content_markdown_*` for all 4 langs) —
  AR/EN/TN article list + detail render correctly. The gap is supplements-only.
- Severity reasoning: wrong-language UI text on a core content surface = P1. BUT it is a data gap on a
  degraded (offline) path that previously showed an error; fabricating medical translations is unsafe.
  → fix options to weigh: (a) localize the bundled supplement data, (b) hide French-only sections on
  non-FR langs, (c) accept + document. Hold for verify-stage + owner decision.

### FIND-2 [P2] Raw markdown `#` leaks into article list-card preview (ALL langs)
- Article list cards show "# Les symptômes de grossesse : comment les ..." / "# أعراض الحمل: كيف ..." —
  a leading markdown heading marker in the card preview.
- Evidence: `guest/fr/03-resources-articles.png`, `guest/ar/03-resources-articles.png`.
- Likely: preview renders `content_markdown_*` raw (or summary with a leading `#`) instead of stripped text.
- Fix: strip markdown / use `summary_*` for the card preview (getLocalizedContent has a `stripMarkdown` option).

### FIND-3 [P3] Category tag inconsistency in article cards
- First card category shows raw slug "symptomes" (Latin) on FR **and** AR, while others show localized
  labels ("Nutrition"/"التغذية", "Examens"/"الفحوصات").
- Evidence: `guest/fr/03-resources-articles.png`, `guest/ar/03-resources-articles.png`.

## Accepted / not-a-defect
- `20-diagnostic` shows technical/English text (collection names "weeks", "articlesAntigravity",
  "Missing/insufficient permissions") — it is a developer diagnostic screen; technical text is expected.
- FirebaseError "permission-denied" / Firestore 403 across screens = documented offline trigger; screens
  recover gracefully (content fallback or clean empty-states).
