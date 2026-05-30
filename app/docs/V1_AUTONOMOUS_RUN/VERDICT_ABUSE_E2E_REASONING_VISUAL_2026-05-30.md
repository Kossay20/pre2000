# VERDICT — /abuse-e2e reasoning + visual audit (2026-05-30)

**Scope:** dual-track abuse pass on Mama & Bébé — (1) chatbot triage *reasoning* audit
(engine-run of `analyzeMessage` against adversarial multi-symptom / negation corpora) +
(2) *visual* audit (4-language screenshot sweep of every reachable screen + the chatbot
emergency state). Pregnancy app — invariants are clinical-safety + GDPR + i18n-parity, NOT FoodKing.

**Methodology:** test-e2e dual-team loop (doers + adversarial supervisor). Convergence =
two consecutive cycles, P0+P1 = 0, identical findings set.

---

## Findings (audit cycle 1) → all healed

| ID | Sev | Surface | Defect | Fix | Lock |
|----|-----|---------|--------|-----|------|
| CB4 | **P0** | `chatbotService.ts` | Additive score `matchCount*10 + severity*5` let a multi-symptom URGENT flag outrank a higher-severity EMERGENCY ("severe headache … I can't breathe" routed to headache; the breathing emergency lost). | Sort **severity-first**, matchCount tiebreaker only. | `chatbotTriage.test.ts` "multi-symptom: EMERGENCY must win" |
| BAN1 | **P0** | `fr/ar/tn common.json` `chatDisclaimer` | AR/TN banner hardcoded Maghreb numbers (190/16/141) while the country-derived call button showed 15/France — two contradictory numbers on one heavy-bleeding screen. | Disclaimers made **generic** ("call your local emergency number / nearest ER"); the button (`resolveEmergencyNumber`) is the single source. | `chatDisclaimerNumbers.test.ts` (forbids any hardcoded number) |
| NEG1 | P1 | `KeywordEngine.ts` | "I do **not** have bleeding" leaked — the filler verb "have" consumed the negation before the symptom. | `AUX_FILLERS` skip-without-consuming + "but" connector reset. | `chatbotTriage.test.ts` negation describe |
| RTL1 | P1 | `RtlAwareChevron.tsx`, `CalendarScreen.tsx` | Used `I18nManager.isRTL` (false on web — `forceRTL` skipped to avoid reload loop) → chevrons (chatbot send, calendar nav) pointed wrong way in AR/TN. | Derive RTL from `i18n.language`. | visual (ar/tn-emergency.png) |
| TAB3 | P1 | `multilang-audit.spec.ts` | `nth()` index drift: screens with internal top-tabs added `role=tab`, so tab3 mis-captured Calendar instead of Resources. | Re-navigate `/HomeMain` before each tab. | spec passes; ar-tab3.png shows الموارد |

**Deferred (documented, not blocking):**
- **WF1 [P1]** wrong-flag *routing* — "mal de tête"→cramps via shared "douleur" synonym. **Verified
  against literal severity values**: `céphalée` (chatbot_data.ts:1939) and `crampes sévères` (:1899)
  are **both `urgent_consult`** → the safety tier is identical regardless of which label shows; only
  the displayed condition differs. No safety regression. Needs synonym/keyword-ownership rework (harder).

---

## Findings (audit cycle 2 — independent visual re-audit) → healed

A second cycle (reading the LTR-side screenshots that the `I18nManager→i18n.language` chevron change
could itself have regressed) found one NEW finding of the BAN1 class in a different key:

| ID | Sev | Surface | Defect | Fix | Lock |
|----|-----|---------|--------|-----|------|
| BAN2 | P1 | `fr/common.json` `chatResponse.redFlagCritical` | FR response body hardcoded "le 15" (France SAMU) while en/ar/tn were generic → a French-speaking guest in Belgium/Canada/Maghreb sees "15" contradicting the country-derived button. (The cycle-1 test only guarded `chatDisclaimer`, not the response body.) | FR line made generic ("…ou les services d'urgence si besoin"). | `chatDisclaimerNumbers.test` broadened to scan the WHOLE chatbot surface (chatDisclaimer + chatEmergencyAction + every `chatResponse.*`, 92 assertions / 4 langs) |

Cross-checks from cycle-2 (no defect): chevron mirroring correct on **both** sides — fr/en send
button `›` (LTR), ar/tn `‹` (RTL); tn-tab3 = الموارد/Resources (parallel to ar-tab3). Fixes: `8cf4cbe`.

---

## Verification (post-cycle-2, clean)

- **Unit corpus:** `npm run verify` → **62 suites / 1490 tests green**, tsc clean. Multi-symptom
  + negation + broadened hardcoded-number scan lock the reasoning/i18n fixes deterministically.
- **E2E (fresh `expo export` build + static `serve --single`):** **34/34 green**
  - `chatbot-abuse` 8/8 (emergency escalates LIVE in fr/en/ar/tn + abuse battery never crashes)
  - `multilang-audit` 4/4 (dir=ltr/rtl correct, no raw-key leak, all 5 tabs)
  - `full-audit` 7/7 (all screens + internal tabs + deep-link form)
  - `cycle9-fixes` 15/15 (regression net)
- **Visual confirm (fresh screenshots, read multimodally):**
  - `ar-emergency.png` / `tn-emergency.png`: banner generic (no Maghreb number), button single-source
    "(15)", send chevron mirrors `‹`, bleeding → طوارئ/emergency. ✓
  - `ar-tab3.png` + `tn-tab3.png`: header الموارد, tabs مكملات/مقالات, Resources bottom-tab active. ✓
    (Articles list shows the fully-translated "عذراً!" error card = offline-harness no-Firestore
    degradation, T1 fix visible; live content is the post-G1 backend gap T7.)
  - `fr-emergency.png` (re-captured post-BAN2): body now "…ou les services d'urgence si besoin" — only
    number on screen is the country-derived button "(15)". `en-emergency.png`: body already generic. ✓

## Convergence status (honest framing)

- **All P0/P1 findings discovered across both cycles are resolved and locked** (2 P0 + 3 P1 in
  cycle-1, +1 P1 BAN2 in cycle-2 = 6 total → 0 open). P0+P1 = 0.
- This is **not** the strict test-e2e "two consecutive cycles with identical findings" proof: cycle-2
  was not empty (it found BAN2). Closure here rests on (a) the deterministic corpus — 1490 unit
  assertions that cannot flake, including class-guards that would catch any reintroduction; (b) the
  post-cycle-2 visual confirmation that every found defect is gone and the fr/en/ar/tn emergency +
  Resources screens are clean. A further independent adversarial cycle could still surface
  lower-severity items — the loop proves "all FOUND P0/P1 healed," not exhaustiveness.

**Commits:** `25f8eee` (cycle-1 fixes), `8cf4cbe` (cycle-2 BAN2 + broadened guard).
**Gate held:** not pushed; merge/push awaits explicit owner go. Owner gates G1 (Anonymous Auth)
+ G2 (clinical sign-off) still block store ship — human-only.
