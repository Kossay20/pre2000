# Functional E2E audit — Mama & Bébé (2026-06-19)

Goal: "audit et test-e2e **tout les fonctionalité**" — beyond the visual convergence, *drive* each
feature's primary flow (tap/type/save) and verify the outcome (state change + persistence) across the
guest/offline build on :8081. 12 core flows, FR (+ AR/TN/EN where relevant).

## Result: 12 / 12 PASS ✅

| # | Feature | Flow driven | Verified outcome |
|---|---|---|---|
| 1 | Add Appointment | fill form → Save (guest) | window.confirm → routes to GuestUpgrade (`create-account?upgradeMode=true`); Cancel keeps form; guest server-persist correctly blocked (no silent fail). NAV-01/CAL-01 validated. |
| 2 | Hydration | +1 verre | 0 L → 0,3 L, 0%→8%, `hydration_data_v1.currentIntake=250`, survives reload |
| 3 | Kick counter | start + 3 taps → end | count 0→1→2→3, `kick_counter_v1.history[0].kicks=3`, survives reload |
| 4 | Contraction timer | start → ~2.5s → stop | history row `0:03`, `contraction_timer_v1` logged, survives reload |
| 5 | Hospital bag | check 1 item | `0 / 26` → `1 / 26`, aria-checked false→true, survives reload |
| 6 | Tasks (My Day) | complete a task | progress 0%→50%, strikethrough+grey, `@daily_checklist_v2_<date>` completed, survives reload |
| 7 | Bookmark | toggle on supplement detail | `@bookmarks_v1=[{supplement,s01_acide_folique}]`; ★ Favoris filter shows only it |
| 8 | Chatbot | type "j'ai des nausées" → send | user echo + non-empty bot reply (triage responds) |
| 9 | Forbidden-foods | search "alcool" + category chip | list 19→1 on search; chip filters |
| 10 | Language switch | fr → العربية → reload | `app_locale=ar`, `dir=rtl`, `htmlLang=ar`, Arabic UI — **persists across reload** (sentinel-verified) |
| 11 | Weight | setup 60/165 → add 68.5 → Enregistrer | entry saved + shown, survives reload |
| 12 | Onboarding | full Language→AuthChoice→…→Onboarding | maintained spec `auth-onboarding-lang-audit.spec.ts` **4/4 PASS** (fr/en/ar/tn) |

## Method notes (for future functional runs)
- Guest/offline: FirebaseError "permission-denied" in console is EXPECTED (fallback trigger) — local features persist via AsyncStorage→localStorage and work fully.
- RN-Web gotchas hit & documented: (a) material-top-tab keeps BOTH pager pages mounted → the inactive page duplicates labels at negative-x; click must filter `rect.x>=0`. (b) `onPress` fires on the TouchableOpacity (`div[tabindex=0]`), not the leaf Text. (c) **Playwright `addInitScript` re-runs on every navigation/reload** — a naive `setItem('app_locale','fr')` clobbers a runtime language switch on reload (caused a false "language doesn't persist"); guard with a `window.name` sentinel. (d) display rounding: hydration shows `0,3 L` for 250 ml (formatDecimal 1dp) — underlying value exact.
- Combined with the VISUAL convergence (adversarial rounds 5/7/10 all GREEN, P0+P1=0, 4 langs) → the app is functionally + visually validated end-to-end.
