# Round 1 — findings & fixes (E2E audit 2026-06-17)

App: Mama & Bébé (Expo 54 / RN 0.81 / RN-Web static export). 4 languages FR/EN/AR/TN.
Method: 116 states captured (4 langs × 23 guest + 4 × 6 fresh), full artifact quartet each.
Review: 9 wave-agents × 4 langs (visual-first + technical) + adversarial verify + orchestrator independent scan.

## Verdict round 1: RED — 11 confirmed P0/P1 (2 P0, 9 P1) + P2/P3.
The branch's in-flight "offline content fallback" diff exposed the real issues (it converts Firestore-error
states into bundled-content, so content quality/localization now matters on the guest/offline path the harness runs).

## Blocking defects (P0/P1) — ALL FIXED
| ID | Sev | Screen / lang | Root cause | Fix |
|----|-----|---------------|-----------|-----|
| W2-001/002 | **P0** | Supplements list **blank**, ar+tn | MaterialTopTab pager computes LTR offsets (I18nManager.isRTL=false on web) but document dir=rtl → panel index 1 translated off-screen (probe: card x=-342, y=5853) | `ResourcesScreen.tsx`: on web, conditional-render segmented control (no pager transform); native keeps material-top-tabs |
| W2-003/004/005/006 | P1 | Supplement body content French on en/ar/tn | `supplements_db.json` had empty `short_description_en/ar` + French-only `pregnancy_notes/typical_dose_text/precautions` → getLocalizedContent falls back to _fr | Faithfully translated 15 supplements FR→EN+AR (120 fields, numbers/dosages preserved); tn inherits ar via fallback |
| W2-007 | P1 | Supplement category chip raw slug ('vitamine') all langs | screen rendered raw `item.category` | added `supplementCategories.*` i18n keys (×4 langs) + `t()` in SupplementsList/Detail |
| W2-008 | P1 | Article category chip raw slug ('symptomes') all langs | `categories.*` i18n missing most article slugs | added 16 missing `categories.*` keys (×4 langs); article screens already used `t()` |
| W1-001/002 | P1 | BabyEvolution carousel wrong month, ar+tn | initial `scrollTo` x-offset not mirrored for RTL row-reverse | `BabyEvolutionScreen.tsx`: `offsetIndex = isRTL ? (len-currentMonth) : (currentMonth-1)` |
| W5-002 | P1 | ContractionTimer FR call-link overlaps wrapped subtitle | insufficient vertical spacing when subtitle wraps to 2 lines | `ContractionTimerScreen.tsx`: controlBlock marginBottom l→xl, callRow marginTop l→xl |

## Non-blocking (P2/P3) — FIXED (polish)
| ID | Sev | Issue | Fix |
|----|-----|-------|-----|
| FIND-2 (orch) | P2 | Raw markdown `#` in article list-card preview (all langs) | `ArticlesListScreen.tsx` summary `{ stripMarkdown: true }` |
| W1-003 | P2 | Recommendations empty-state had no illustration/CTA | `WeekRecommendationsScreen.tsx` → shared `EmptyState` + CTA to Resources (+ i18n keys) |
| W5-003/004 | P2 | HospitalBag RTL checkbox-label gap on wrong side | `HospitalBagChecklistScreen.tsx` per-direction logical margin + textAlign |
| W8-001/002 | P2 | Register password placeholder clipped (hid last rule) | short `passwordPlaceholder` for input + full-rule `passwordMin` as helper line (F1004 test preserved) |
| W6-001 | P3 | LanguageSelect TN subtitle "Arabe + Darija" stayed French on EN | `langDesc*` i18n keys (×4) + `t()` |

## Verified clean in round 1 (GREEN waves)
Calendar/AddAppointment/Reminders/Statistics (W3); Health/Weight/ForbiddenFoods (W4);
Profile/Settings/Diagnostic/LanguageSelect (W6); Ramadan/Chatbot (W7); Auth entry (W8); Onboarding/Privacy (W9).
RTL mirroring correct on Home/Articles/etc. No crashes, no blank screens (except the W2 P0 now fixed),
no navErrors, no unexpected console/network errors, no raw-key leaks.

## Gate after fixes
`npm run verify` → lint:colors ✅ · tsc --noEmit ✅ · jest **1810/1810** ✅.

## Notes
- Supplement EN/AR translations are faithful translations of the existing vetted FR medical text (numbers,
  dosages, org names preserved). Recommend a native/clinical reviewer pass before store release.
- One review agent (recommendations empty-state) hit a transient API 529; its edit had landed and was completed
  by the orchestrator (navigate signature fixed, keys verified present).
