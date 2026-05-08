# Cycle 5 — Design Deep Refinement (page par page, test+screenshot après chaque étape)

**Date** : 2026-05-08
**HEAD départ** : `898c0bc`
**Demande utilisateur** : « Audit + améliore le design avec skill dédié : Onboarding → Home → autres pages chaque fonctionnalité, sans affecter leur fonctionnement. E2E test + screenshot après chaque étape pour valider visuel puis technique. Breakdown détaillé. Ultra review. »

---

## Principes (non-négociables)

1. **Design only, no logic** : améliorer styles / spacing / typography / hierarchy / colors / a11y. **Ne pas toucher** : navigation, state, data fetching, business logic.
2. **Per-page workflow strict** :
   - a. Read screen source
   - b. Read current screenshot (`audit-screenshots/`)
   - c. Identifier 3-5 améliorations P0 (effort small, impact haut)
   - d. Appliquer
   - e. `npm test` (verify no unit regression)
   - f. Re-capture screenshot via `npx playwright test e2e/audit-screens.spec.ts -g "<test name>"` ou full
   - g. Comparer before/after visuel
   - h. Si régression → rollback
   - i. Commit incrémental par batch (groupe 2-3 pages liées)
3. **i18n** : tout texte ajouté → 4 locales (en/fr/ar/tn).
4. **A11y** : tout élément interactif → touch target ≥44pt, accessibilityLabel.
5. **RTL** : `marginEnd/Start` jamais `Left/Right`, `textAlign:'auto'` jamais hardcoded.

---

## Pages à traiter (ordre demandé)

### Phase 1 — Onboarding (priorité utilisateur)
- Step 1 (mode select : pregnant / TTC / curious)
- Step 2-4 selon mode (date pickers, name, etc.)
- Hero + progress bar

### Phase 2 — Home Dashboard
- Pregnancy mode (BabyGrowthCard + recommendations + tips + quick links)
- TTC mode (EmptyState dédié — Cycle 3)
- Curious mode (banner + content)
- Error state ("Oops! Retry")

### Phase 3 — Calendar
- Month/week view
- AddAppointment form
- Empty state (no events)

### Phase 4 — Reminders / Tasks / Statistics
- Reminders tab (Hydration card)
- Tasks tab
- Statistics empty state + future data view

### Phase 5 — Resources
- Articles list
- Supplements list
- Article detail / Supplement detail (best-effort)

### Phase 6 — Chatbot
- Welcome message + suggestions
- Input + send button
- Disclaimer médical

### Phase 7 — Profile / Settings
- Profile screen (edit form)
- Settings screen

### Phase 8 — Auth
- AuthChoice
- Register
- Login

---

## Design system — Targets

| Token | Valeur cible | Rationale |
|-------|--------------|-----------|
| Typography hierarchy | h1=28/700, h2=22/600, h3=17/600, body=15/400, caption=12/400 | Cohérence iOS HIG / Material |
| Spacing scale | xs=4, s=8, m=16, l=24, xl=32, xxl=48 | Multiples 4 |
| Touch targets | ≥44pt iOS / ≥48dp Android | Apple HIG + Material |
| Contraste texte normal | ≥4.5:1 (WCAG AA) | Validé F301/F302 Cycle 2 |
| Contraste texte large 18+ | ≥3:1 | Acceptable |
| Border radius | 8 small / 12 medium / 16 large / 24 hero | Cohérence |
| Shadows | level1 (cards), level2 (modals), level3 (FABs) | Material elevation |

---

## Per-page deliverables

Pour CHAQUE page traitée, livrer :

1. **Before screenshot** : capture courante.
2. **Findings** : 3-5 améliorations identifiées P0/P1.
3. **Code diff** : Edit/Write appliqué.
4. **Tests verts** : `npm test` 336/336.
5. **After screenshot** : capture re-générée.
6. **Verdict per-page** : ✅ amélioré / 🟡 partiel / 🔴 régression rollback.

---

## Statut courant

| Phase | Statut |
|-------|--------|
| Plan | ✅ DONE |
| 1 Onboarding | ⏸ |
| 2 Home | ⏸ |
| 3 Calendar | ⏸ |
| 4 Reminders/Tasks/Stats | ⏸ |
| 5 Resources | ⏸ |
| 6 Chatbot | ⏸ |
| 7 Profile/Settings | ⏸ |
| 8 Auth | ⏸ |
| Final report VERDICT_v5 | ⏸ |
