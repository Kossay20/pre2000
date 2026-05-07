# V1 Autonomous Run — MANIFEST

**Date début** : 2026-05-07
**Orchestrateur** : Claude Opus 4.7 (1M context)
**Méthodo inspirée** : GSTACK (Garry Tan) — pipeline Think → Plan → Build → Review → Test → Ship → Reflect + `/office-hours` STOP-checklist avant chaque cycle.
**Adversary** : sub-agent invoqué après chaque step pour challenger.

---

## Objectif

Livrer **v1.0 sans faute** de l'app grossesse :
1. Infrastructure E2E web réelle (remplacer fake mock + CI + assertions strictes).
2. Couverture E2E étendue (Resources, Chatbot, Langue).
3. Audit global massif (signup → toutes pages, captures).
4. Fix loop autonome sur tout finding P0/P1.

**Hors scope** : 5 actions opérateur consoles externes (R1_FIX_FINAL_DELIVERABLE.md §6) + différés post-v1.0 (F22, F16 plein, Expo SDK upgrade).

---

## Pipeline par cycle (GSTACK-inspired)

1. **/office-hours STOP** — répondre AVANT de coder (mauvaise hypothèse / sur-complexité / edits orthogonaux / impératif vs déclaratif / feedback loop / scope minimal).
2. **Think + Plan** — file:line, dépendances, risques.
3. **Build** — implémentation minimale.
4. **Review (adversary)** — sub-agent challenge la livraison.
5. **Test** — lint + typecheck + unit + e2e ciblé.
6. **Ship** — commit conventionnel.
7. **Reflect** — checkpoint findings dans `findings.md`, update MANIFEST.

---

## Plan d'exécution

| # | Cycle | Dépend | Pourquoi cet ordre |
|---|-------|--------|---------------------|
| T1 | replace mock-playwright + webServer | — | Sans ça tout est aveugle. |
| T2 | CI workflow e2e-web | T1 | Lock CI une fois local OK. |
| T3 | testID statistics_screen_root assert | T1 | Bundle frais via webServer. |
| T4 | E2E extension Resources/Chatbot/Langue | T1 | Couverture avant audit global. |
| T5 | verify:e2e:web wrapper | T1 | Convenience. |
| T6 | Audit global massif | T2,T3,T4 | Infra solide requise. |
| T7 | Fix loop autonome | T6 | Itère jusqu'à GO. |

---

## Statut courant

| # | Cycle | Statut | Commit |
|---|-------|--------|--------|
| T1 | mock-playwright + webServer + cleanup verify | ✅ DONE (4 e2e + 347 unit passed) | 60046d2 |
| T1.adv | Adversary review T1 (BLOCK→fix→ré-PASS) | ✅ DONE | (inclus T1) |
| T2 | CI workflow `.github/workflows/e2e-web.yml` | ✅ DONE | a173be2 |
| T3 | testID `statistics_screen_root` assertion | 🔄 IN PROGRESS | - |
| T4 | E2E extension | ⏸ pending | - |
| T5 | verify wrapper | ⏸ pending | - |
| T6 | Audit massif | ⏸ pending | - |
| T7 | Fix loop (incl. F41 worker leak) | ⏸ pending | - |

**Findings produits par T1** :
- F31 ✅ RÉSOLU (mock-playwright supprimé).
- F32 🟡 P2 reformulé (sqlite/web bundle warning, runtime dormant — pas de fix v1.0).
- F33 ✅ RÉSOLU (nvm 20.20.2 + .nvmrc).
- F34 ✅ RÉSOLU (`.catch(()=>false)` swallow retiré).
- F35 ✅ RÉSOLU (4× `waitForTimeout` remplacés par auto-waits + `Locator.or()`).
- F36 🟡 P2 ouvert → sera RÉSOLU T2 (CI workflow).
- F37 ✅ RÉSOLU (F32 reformulé après vérification adversary).
- F38 🟡 P2 ouvert (couverture E2E faible — T4/T6/T7).
- F39 ✅ RÉSOLU partiel (tsc débloqué via exclude `scripts/`+`e2e/` ; orphans non supprimés, hygiène différée).
- F40 ✅ RÉSOLU (jest exclude `/e2e/`+`/scripts/`).
- F41 🟡 P2 ouvert (Jest worker leak — non bloquant).
