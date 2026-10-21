# Cycle 4 — Master Plan : Ultra-validation v1.0 (sécurité + design + tests massifs)

**Date** : 2026-05-08
**HEAD départ** : `aa16de6` (post Cycle 3)
**Demande utilisateur** : « Audit, skills sécurité + ultra-review tout valider techniquement. Puis design améliorer pour chaque page (même Profile, Onboarding) en s'inspirant de concurrents grossesse. Multi-lingue. Puis test fonctionnalité par fonctionnalité (first-connection, second-connection, invité, multi-langue). Final report méticuleux. »

---

## Phases (séquentiel + parallèle quand sans conflit)

### Phase 1 — Ultra Security & Technical Review
- 1.1 — Skill `/security-review` sur tout le diff Cycle 3 (verifie que les fixes n'introduisent pas de fuite).
- 1.2 — `npm audit --omit=dev` + audit Firestore rules + grep secrets résiduels.
- 1.3 — Adversary subagent général "tech audit" — technique + sync + connectivity.

### Phase 2 — Design Audit + Improvements (per-screen)
- 2.1 — Sub-agent "Design competitor" — recherche web concurrents grossesse (BabyCenter, Ovia, What to Expect, Pregnancy+, Flo, Glow) → analyse leurs onboarding/home/calendar/profile.
- 2.2 — Pour chaque écran du repo, comparer rendu actuel vs best-in-class concurrent → recommandations P0/P1/P2.
- 2.3 — Implémenter les amélioration P0 + P1 réalistes en 1 cycle (ne pas refondre tout l'app).

### Phase 3 — Multilingual i18n parity + RTL deep
- 3.1 — Script audit i18n complet : clés manquantes par locale, clés non utilisées, traductions vides, longueurs aberrantes.
- 3.2 — RTL audit visuel : capture Home/Calendar/Profile/Settings en AR puis comparer avec EN.
- 3.3 — Fixer les écarts trouvés.

### Phase 4 — Functionality testing exhaustif
- 4.1 — E2E spec dédié `first-connection.spec.ts` (Language → Register → Onboarding 3 modes → MainTabs → check empty states).
- 4.2 — E2E spec `second-connection.spec.ts` (Login existing user → MainTabs → données récupérées).
- 4.3 — E2E spec `guest-mode.spec.ts` (Continue as guest → onboarding → MainTabs → check guards limitations).
- 4.4 — E2E spec `multi-language.spec.ts` (switch langue + verify each tab in chaque langue).
- 4.5 — Run tous + capture screenshots → review visuelle exhaustive.

### Phase 5 — Final Report (VERDICT_v4)
- 5.1 — Résumé Cycle 1+2+3+4.
- 5.2 — Liste exhaustive ce qui marche (tested + verified).
- 5.3 — Liste exhaustive ce qui reste (différé + actions opérateur).
- 5.4 — Verdict final GO/NO-GO production.

---

## Discipline maintenue

- Chaque fix → `npm test` après.
- Chaque batch → `npm run e2e:web` + capture audit-screens.
- Aucun commit avant tests verts.
- Régression = rollback ou fix avant continuer.

## Statut

| Phase | Statut |
|-------|--------|
| Plan | ✅ DONE |
| 1 Sec ultra-review (skill) | ✅ DONE — 0 vuln HIGH/MEDIUM |
| 2 Design competitor (sub-agent) | ✅ DONE — 17 findings F700-F799, 5 P0 appliqués |
| 3 i18n RTL (sub-agent) | ✅ DONE — parité 1460/1460, 30 findings F800-F829, 3 fixes appliqués |
| 4 Functionality tests | ✅ DONE — 10 nouveaux specs feature-tests.spec.ts, 33/33 passed |
| 5 VERDICT_v4 | ✅ DONE |
