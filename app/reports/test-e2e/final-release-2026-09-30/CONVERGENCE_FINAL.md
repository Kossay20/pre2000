# Convergence finale — audit de release Mama & Bébé v1.0

**Date** 2026-10-02 · **Branche** `feat/interaction-ux-2026-06-18` · **Commit audité** `3bfd0b3` (rounds 8 et 9, arbre propre, bundle reconstruit depuis ce commit avant chaque round) · `npm run verify` vert : 147 suites / 3391 tests, `tsc` et `lint:colors` propres.

## Verdict

**Convergence atteinte sur le code** : les rounds 8 et 9 ont chacun **0 P0 et 0 P1 ouverts** sur les vagues A, B, C, D, E, avec **des ensembles de constats ouverts identiques** (comparés id par id, sévérité et statut, par script sur les `wave-X-findings.json`). La vague F (statique) n'a **aucun P0/P1 ouvert qui dépende du code** ; ses P0/P1 restants sont des gates propriétaire (G1–G9).

| Vague | Round 8 | Round 9 | Ouverts (P0/P1/P2/P3) | Identique r8 = r9 |
|---|---|---|---|---|
| A | GREEN | GREEN | 0 / 0 / 0 / 6 | oui |
| B | GREEN | GREEN | 0 / 0 / 4 / 7 | oui |
| C | GREEN | GREEN | 0 / 0 / 3 / 8 (partiels inclus) | oui |
| D | GREEN | GREEN | 0 / 0 / 7 / 11 (partiels inclus) | oui |
| E | GREEN | GREEN | 0 / 0 / 5 / 12 | oui |
| F | GREEN (hors gates) | GREEN (hors gates) | non-propriétaire : 0 / 0 / 1 / 3 | oui |

Captures : A 19/19, B-plan 7/7, B-track 3/3, C 8/8 (4 langues), D 18/18, E 13/14 aux rounds 8 et 9 — l'unique échec (`E07-24`) ne porte que sur les constats P3 connus E-026 (titre répété entre en-tête et corps) et E-027 (vignettes d'articles 📚).

## Parcours

| Round | Résultat |
|---|---|
| 5 (`d01e275`) | A, B GREEN ; C, E AMBER ; D 13/18 puis 18/18 après correction des assertions périmées ; D AMBER (D-036). Lots de correction → `cad4878`, `e1418b0`. |
| 6 (`cad4878`) | A AMBER (A-012 hero figé), B GREEN, C/D/E AMBER. Vrai bug : écran Rappels décalé de 98 px (B-032). → `c4ace82`. |
| 7 (`c4ace82` + `f4188d6`) | A–E GREEN, F sans P0/P1 non-propriétaire. Bouton d'appel en double en tn (C-041) → `f4188d6`, `3bfd0b3`. |
| 8 (`3bfd0b3`) | A–E GREEN ; fermés : C-041, D-050 ; aucun nouveau, aucune régression. |
| 9 (`3bfd0b3`, bundle reconstruit) | A–E GREEN ; delta vs round 8 : aucun. |

Défauts de produit corrigés pendant la boucle (hors lots précédents) : question « Puis-je manger du fromage ? » répondue par l'article sur les jumeaux (D-036) ; écran Rappels décalé de 98 px au premier passage sur « Tâches » (B-032) ; hero d'accueil figé à ~20 % d'opacité (A-012) ; négation tunisienne « ما عنديش » (C-021) ; deux boutons d'appel visibles dans le chat (C-041) ; avatar qui mord la salutation et date tronquée à 280 pt (E-008, E-019) ; puces 7/30 jours sans rôle, contraste des badges verrouillés, interrupteurs web 40×20 (E56).

## Ce que cette convergence ne dit PAS

1. **Les P2/P3 sont déclarés, pas bouclés** (§1 du goal) : 19 P2 et 44 P3 ouverts sur A–E, listés dans les `wave-X-findings.json`. Parmi eux, à connaître : E-026 titres répétés (article, réglages, compteur de coups, valise), E-027 vignettes 📚 (vrais visuels dus, G8), D-042 / B-043 « données synchronisées » affiché alors que des écritures sont en attente, D-044 déconnexion d'onboarding sans confirmation, D-041 contraste des badges de contact, C-056 « Alternative : à éviter » sur la fiche rillettes, D-024 export incomplet.
2. **Vérifié sur la build web (Chromium, émulateurs)**, pas sur appareil : le goal exige encore le smoke-test sur device physique fr/ar/tn (CLAUDE.md, action 5). Les constats « web-harness » (B-032) peuvent se comporter autrement en natif.
3. **La vague F reste RED au sens littéral du schéma** (1 P0 et 7 P1 ouverts, tous gates propriétaire) — voir ci-dessous.
4. **Aucun texte public ne peut dire que le contenu médical est relu** : §5 du goal, signatures cliniques non obtenues.

## Gates propriétaire bloquant la soumission

| # | Action | Constat F lié |
|---|---|---|
| G1 | `firebase deploy --only firestore:rules` | — |
| G2 | relancer `scripts/sync-firestore-weeks.ts` en production | — |
| G3 | déclarer les 6 variables Firebase dans EAS | F-003 |
| G4 | `cd website && vercel deploy --prod` (en ligne : `delete-account*.html` en **404**, politique de confidentialité datée du 24 fév. 2026, accueil « centaines d'articles validés ») | **F-001 (P0)**, F-005, F-034, F-035 |
| G5 | confirmer les numéros d'urgence Maroc (141) et Algérie (16) | F-039 |
| G6 | créer le compte de démo (les notes de relecture contiennent encore `<fill from GT-7>`) | F-014 |
| G7 | signatures cliniques (§5 du goal) ; 0/80 articles citent des sources | F-013, F-007 |
| G8 | vrais visuels (mois 1–2, vignettes d'articles) et captures d'écran des stores re-capturées | F-032, E-027 |
| G9 | credentials Apple, App Check, restriction de clé GCP | F-029 |

Durcissements non-propriétaire déclarés (P3, wave F) : F-036 (DSN Sentry non imposé, pas de `beforeSend`), F-037 (aucun test n'épingle `targetSdk ≥ 35`), F-038 (réponses de confidentialité des stores seulement en prose).

## Preuves

`round-8/` et `round-9/` : `wave-{A..F}-findings.json`, `run-*.log`, quartets (PNG/DOM/console/réseau, non versionnés : `.gitignore`), `wave-F-checklist.md`.
