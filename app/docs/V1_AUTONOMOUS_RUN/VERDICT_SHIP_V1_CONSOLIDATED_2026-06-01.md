# CONSOLIDATED SHIP-V1 VERDICT — Mama & Bébé (2026-06-01)

Single durable summary of the full autonomous audit+fix campaign across this session's goals
(ultraplan → supervisor → massive-audit → abuse-e2e loop → auth/onboarding lang audit →
P2/P3 cleanup). Pregnancy app — invariants: clinical-safety + GDPR + i18n-parity. NOT FoodKing.

## State: ship-CAPABLE pending owner gates. P0+P1 actionable = 0.

---

## Test & coverage state (current)

- **Unit/integration:** 62 suites / **1631 tests** green, `tsc --noEmit` clean.
- **E2E (static-export harness):** 5 maintained specs, all green:
  - `auth-onboarding-lang-audit` — Language→AuthChoice→Register→Login→Onboarding, 4 langs (20 shots)
  - `chatbot-abuse` — live emergency escalation + abuse battery, 4 langs (8/8)
  - `multilang-audit` — 5 tabs × dir/raw-key, 4 langs (4/4)
  - `full-audit` — whole-project screens + internal tabs + deep-link form (7/7)
  - `cycle9-fixes` — cold-boot + guest regression net (15/15)
- **abuse-e2e convergence:** two consecutive clean cycles, identical findings set (P0+P1=0).

## Findings fixed this campaign (all verified + locked)

**Clinical-safety (P0):**
- Chatbot EN triage silently not escalating (heavy bleeding / suicide) — fixed + 47-assertion corpus.
- Suicide-ideation i18n parity: FR/AR/TN had thin keywords vs EN's 12 paraphrases — fixed.
- HELLP syndrome unreachable (multiword-only keywords) — single-token keywords added.
- Eclampsia inflected forms (évanouie / أغمي) missed — added.
- Multi-symptom severity inversion (CB4: urgent outranked emergency) — severity-first sort.
- Negation leak through filler verbs — AUX_FILLERS skip.

**i18n / clinical disclosure (P1):**
- BAN1/BAN2: hardcoded Maghreb/France emergency numbers in disclaimers + FR response body —
  made generic; country-derived button is single source; guard scans full surface incl. RED_FLAGS data.
- TN untranslated French ("Tableau de bord", "Politique de confidentialité") — translated.
- TN chatbot symptom mis-gloss ("القلق" anxiety → "العوارض" symptoms).
- Language-update toast showed previous language (hook lag) — getFixedT(newLang).

**RTL / a11y (P1/P2):**
- Chatbot send + calendar nav chevrons wrong direction on web (I18nManager.isRTL false) — language-derived.
- Calendar header double-mirror (row-reverse + glyph swap) — both removed.
- Emergency call button 37px → 44px tap target (WCAG 2.5.5).
- 5 reminder icon-only controls missing accessibilityLabel/Role — added.
- RTL water-tracker droplet/title overlap — gap-based layout.

**Quality / cry-wolf (P1/P2):**
- SUG1: suggestion path exposed emergency call-button UI on low-confidence/benign input — redFlag
  now never surfaced via suggestion path (direct red_flag path only).
- Benign-side guards: removed over-broad suicide keywords ("vais mourir"/"me tuer" idioms).

**Test infrastructure / hygiene:**
- i18n parity test extended to value-level (empty + Latin-in-AR detection).
- 16 orphan i18n JSON stubs deleted.

## Accepted residuals (documented, NOT defects to fix)

- **T02 bare-"douleur" over-escalation** ("je dors mal" → crampes sévères, urgent_consult). This is
  OVER-triage = the SAFE side (project policy: pain in pregnancy can signal pre-eclampsia, erring
  toward escalation is correct). Tightening is the inverse lever of the P0 under-triage fixes and
  risks re-opening a missed escalation — deliberately NOT changed. Both involved flags are
  urgent_consult; no safety-tier difference.

## Owner-gated — cannot be done autonomously (terminal blockers to store ship)

| Gate | What | Why blocked |
|------|------|-------------|
| G1 | Firebase Anonymous Auth (Console toggle) | Human-only Console action. Until set, guest data is local-only (Home/data screens render error/empty offline — T7). |
| G2 | Clinical sign-off on triage + supplement content | Requires a clinician; must not be fabricated. |
| G3 | EAS secrets migration (6 secrets) | Owner credentials. |
| G4 | GCP API key restrictions | Owner Console. |
| G5 | Device smoke test fr/ar/tn | Physical device. |

**Coupled to G1 (do WITH the toggle, not before):**
- **GDPR1** — Privacy policy guest-mode claim ("data stored only on your device") is TRUE in the
  current pre-G1 build (signInAnonymously throws → no Firestore writes). When G1 is enabled, guest
  data WILL go to Firestore — the claim must be reworded in all 4 locales AT THAT TIME. Flagged in
  the G1 runbook. Editing it now would make it inaccurate today.

**Post-G1/G2 follow-ups (tracked):**
- T7 — Live-backend E2E of the deep screens (Profile/Settings/HealthDashboard/Weight/Foods/
  KickCounter/ContractionTimer) — unreachable offline because Home requires Firestore.
- T8/T9 — Chatbot red-flag → relevant-article mapping + content translation review.
- Analytics consent gate — owner architectural decision (opt-in vs error-only Sentry).

## Gate held
All work committed locally on `release/v1.0-ship`. **Nothing pushed.** Merge/push awaits explicit
owner go. The merge to `main` + store submission are owner actions.
