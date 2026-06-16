# E2E Audit + Fix Campaign — Convergence Report (2026-06-15 → 06-16)

**App:** mama-bébé (`pre2000/app`) · Expo 54 / RN 0.81 / React 19 / Firebase / i18next FR-EN-AR-TN
**Goal:** "audit structure + E2E toutes les pages (UI/UX/backend/fonctionnement), corrige en boucle, re-test" — adversarial audit→fix loop to convergence on the **current** app.
**Branch:** `audit-fix/p1-2026-06-15` (off `release/v1.0-ship`) · 10 commits.

## Verdict: CONVERGED ✅
- Two consecutive clean adversarial rounds (R8 cross-area clean + **R9 fully clean: 0 P0/P1/P2/P3**).
- Deterministic gates green across **9 rebuilds**: `lint:colors` ✅ · `tsc --noEmit` ✅ · **jest 1631 → 1804** (+173 regression tests) ✅ · **Playwright E2E 38/38** ✅.
- Project rule honored throughout: no commit before `npm run verify` green; every fix wave behind the gate.

## Scope
~9 adversarial rounds driving Playwright (guest fixture, deep-linked) across all ~35 screens in 4 languages + the chatbot triage engine, covering UI, UX, **backend/data persistence**, **functional correctness**, i18n/RTL, a11y, console/network. ~**60 real findings** fixed (0 P0 ever; the app was already "ship-capable" per the 2026-06-01 verdict — this campaign hardened the long tail the prior cycles flagged as uncovered, F38).

## Findings fixed, by class (all closed at the root)
1. **web `Alert.alert` is a no-op on RN-Web** → migrated app-wide to `utils/alert.showAlert` / `utils/uiUtils.confirmAction` (window.alert/confirm on web). Was causing silent data/action loss (WeightTracker saves dropped, guest/destructive confirms dead-ended, chatbot emergency-call fallback, etc.). 0 callback-bearing `Alert.alert` remain on web paths.
2. **brand pink `#FF6B9D` = 2.68:1 WCAG-AA fail** wherever it carried/backed text or was an active tint → routed actionable **text (R4, 44 sites)** + **fill (R6, 36 sites)** to `accent #C2185B` (5.87:1); decorative fills kept soft pink. Class verified fully closed (17 screens × 4 langs, 0 sub-AA).
3. **chatbot clinical triage** — over- and under-escalation hardened structurally (this is keyword NLP; the deep tail took several rounds):
   - over: generic single-word keywords (blood/red/liver/foie/pain/douleur…) require corroboration via **synonym-closure gating** (gates every synonym/translation of a generic concept, all langs) + canonical-concept counting; FuzzyMatcher allow-list (week≠weak); Arabic clitic-aware **word-boundary** matching (دم no longer matches inside القادم) + AR generic gating; FR `chaud→fièvre` warm-drink gate; negation/reassurance-aware forced paths (fetal-movement, ROM).
   - under: natural reduced-fetal-movement phrasings, rupture-of-membranes ("water broke"/"perte des eaux"), suicidal gerunds ("ending my life"), presyncope ("going to faint") now escalate.
   - **Safety corpus: 168 jest tests** + a 97-case independent battery (53 benign / 43 emergency × FR/EN/AR/TN) → **0 over-escalation, 0 under-escalation**; all real emergencies always escalate.
4. **persistence/backend:** guest height/pre-pregnancy weight load+save (PregnancyContext guest-merge + ProfileScreen payload); Statistics hydration reads real water (hydrationService) not herbal tea; appointment Medical/Personal category persists; dashboard weight-gain baseline = pre-pregnancy weight; weight dedup-by-date.
5. **i18n:** raw-key leaks (weight `:`→`.` namespace, `home.*` deep-merge collision for TTC/Curious/postpartum, `home.myDay`); hardcoded-FR leaks (Home appointment summary, ForbiddenFoods subtitle, TN "الجمعة"=Friday→"الأسبوع", TN "(RDV)"); J-1 reminder label/schedule mismatch; corrupted chat-welcome emojis (orphan ZWJ); EN "a olive"→article fix.
6. **web a11y:** RN-Web 0.21 drops `accessibilityState`→aria; added web-guarded `aria-selected`/`aria-expanded`/`aria-checked`/progressbar across accordions, tabs, day cells, switches, selectors.
7. **routing/robustness:** web deep-linking (linking.config + getStateFromPath catch-all → unknown/mistyped URLs redirect Home, no ErrorBoundary trip); ErrorBoundary "Back to home" renders on web.
8. **RTL:** calendar nav chevrons mirror on web (ar/tn); BabyEvolution month carousel clamped (no negative month).
9. **misc:** Register password-strength bar /3→/4 (no false-full/overflow) + short hint labels; Ramadan reachable for FR/EN + "call doctor" uses saved contact; single-data-point chart guards.

## Documented residuals / accepted (non-blocking)
- **Offline `ErrorState`** on Firestore-backed screens (Home weekData, Articles/Supplements) in the e2e harness (permission-denied offline) is the app's **graceful** recoverable state, NOT a crash. Two R3 "Home crash P0/P1" findings were verified FALSE POSITIVES against this.
- **Guest "create account" nudge** from AddAppointment/Calendar can't route to AuthStack while a guest is in MainTabs (Firebase-web-auth limitation) — the explanatory message still shows.
- Chatbot remains **BETA** with a persistent medical disclaimer; triage is keyword-based (not an LLM) but now has a 168-test + 97-battery safety net.
- Minor P2/P3 logged but below the loop bar: WeightTracker 'statusLow' suggestion chip can overflow on the longest string; hydrationService partial-data latent guard (synthetic-only).

## How to verify
```bash
cd app && nvm use            # 20.20.2
npm run verify               # lint:colors + tsc --noEmit + jest (1804)
npm run e2e:web              # Playwright 38/38 (expo export + serve :8081)
```
