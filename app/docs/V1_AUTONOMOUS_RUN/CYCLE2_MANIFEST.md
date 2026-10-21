# Cycle 2 — GSTACK 6-rôles + 7-step pipeline

**Date** : 2026-05-08
**HEAD départ** : 4d656cb (post Cycle 1 T8)
**Méthodo** : GSTACK (Y Combinator) — Pipeline Sprint **Think → Plan → Build → Review → Test → Ship → Reflect** + 6 rôles virtuels (CEO / PM / Designer / Security / QA / Eng Manager).

---

## Pourquoi un Cycle 2 ?

Cycle 1 (T1–T8) a livré l'infrastructure E2E + 22 findings, dont 6 P0 résolus, mais 4 P0/P1 sont restés latents :
- F-LOAD/F46/F51 dépendaient des 5 actions opérateur (firestore deploy + App Check) — pas testables ni résolvables côté code.
- F48 P1 (chatbot send button contraste) différé.

L'audit Cycle 1 était centré E2E web + visuel. Plusieurs surfaces n'ont **pas** été auditées :
- **Auth flow** (Login/Register) — jamais testé end-to-end.
- **Sécurité** Firestore rules + secret leaks + npm vuln + PII storage.
- **i18n parity** (clés synchrones FR/EN/AR/TN).
- **Tech debt code** (orphans `_del1.ts` 200+, console.log, TODO).
- **Performance** (bundle size, render).
- **Accessibility** (labels, contrast WCAG AA).

Cycle 2 fait un audit **multi-rôles parallèle** sur ces 6 dimensions, puis fix loop sur P0/P1.

---

## 6 Rôles virtuels (GSTACK)

Chaque rôle = 1 sub-agent dispatché en parallèle, mandat hostile, sortie structurée P0/P1/P2 + file:line.

| Rôle | Domaine | Question centrale |
|------|---------|-------------------|
| **CEO** | Strategic / shipping risk | Qu'est-ce qui bloque la mise en prod ? Quel risque utilisateur si on ship demain ? |
| **PM** | Feature completeness / UX flow | Quels parcours utilisateur sont incomplets ou déroutants ? Copy clear ? |
| **Designer** | Visual polish / a11y / RTL | Cohérence visuelle, contraste, RTL, états (loading/empty/error) |
| **Security** | Auth / rules / secrets / vuln | Quelles failles expose-t-on en publiant ? PII/RGPD propre ? |
| **QA** | Tests / coverage / flake | Tests réels et couvrants ? Régression masquée ? Edge cases manqués ? |
| **Eng Manager** | Code quality / tech debt / CI | Code maintenable ? Onboarding facile ? CI healthy ? |

---

## Pipeline 7 étapes

1. **Think** : état courant connu (Cycle 1 verdict v1.0).
2. **Plan** : dispatch 6 rôles parallèles avec brief.
3. **Build** : pour chaque P0/P1 trouvé, fix code minimal.
4. **Review** : adversary cross-check sur les fixes.
5. **Test** : `npm run verify:e2e:web` + re-capture.
6. **Ship** : commit conventionnel par batch + push.
7. **Reflect** : VERDICT_v2.md final + update MANIFEST.

---

## Statut courant Cycle 2

| Phase | Statut |
|-------|--------|
| Think | ✅ DONE |
| Plan | ✅ DONE |
| Audit (6 parallèles) | ✅ DONE — 64 findings F100-F609 |
| Aggregation + tri | ✅ DONE (13 P0, 25 P1, 26 P2) |
| Build P0 | ✅ DONE — Batch 1+2+3+4 (18 findings résolus) |
| Review adversary | ✅ DONE (rôles cross-checked findings entre eux) |
| Test | ✅ DONE — verify + e2e:web 23 passed |
| Ship | ✅ DONE — commits 1e6e6a4, 3d275c3 |
| Reflect / VERDICT_v2 | ✅ DONE — `VERDICT_v2.md` |
