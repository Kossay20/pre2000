# 🎯 GOAL — AUDIT FINAL DE RELEASE (boucle capture → adversaire → correctif) · Mama & Bébé v1.0

**Slug** `FINAL_RELEASE_AUDIT_MAMABEBE` · **Créé** 2026-10-02 · **Branche** `feat/interaction-ux-2026-06-18` @ `d01e275`
**Portée** : amener l'app au point où **deux rounds consécutifs d'audit E2E (vagues A–E + F) ne trouvent ni P0 ni P1**, avec le même ensemble de constats ouverts. C'est le préalable technique à la soumission décrite dans `GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md`.
**Baseline (mesurée le 2026-10-02)** : `npm run verify` vert — 144 suites / 3342 tests, `tsc --noEmit` et `lint:colors` propres (Node 20.20.2 via `nvm use` obligatoire ; le shell par défaut est en Node 18 et `preverify` le refuse).

Ce fichier est la source de vérité de ce goal. Pas de nouveau doc de plan : l'avancement s'écrit au §7.

---

## §1 — Définition de DONE (non négociable)

1. **Convergence** : deux rounds consécutifs avec **P0 + P1 = 0** sur les vagues A, B, C, D, E (et F, sans navigateur), avec des ensembles de constats identiques (méthode `test-e2e`, `CONVERGENCE_RULES`).
2. **Chaque round** repart d'un bundle reconstruit depuis du code **commité** après `npm run verify` vert. Aucun round ne s'appuie sur des modifications non vérifiées.
3. **Persistance = serveur** : un état n'est « PASS » que si `serverDoc/serverQuery` **et** un contexte de navigateur vierge sont d'accord. Un rechargement dans le même contexte n'est qu'un état.
4. **Aucune assertion affaiblie** pour faire passer un test ; aucun `.catch(() => {})` sur un contrôle.
5. Le rapport `CONVERGENCE_FINAL.md` est écrit dans `reports/test-e2e/final-release-2026-09-30/` et tout est commité.

Les P2/P3 sont déclarés, pas bouclés.

## §2 — La boucle

```
ROUND N
 1. orchestrateur : npm run verify (Node 20) → commit → bash e2e/emulator-stack.sh rebuild
 2. capture : 6 specs e2e/final-release-wave-{A,B-plan,B-track,C,D,E}.spec.ts en parallèle
    E2E_BASE_URL=http://localhost:8090 E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-N/wave-X
 3. adversaire : 1 agent par vague, VISUEL D'ABORD (PNG), puis DOM/console/réseau
    → round-N/wave-X-findings.json (schéma FINDINGS_SCHEMA.md), n'écrit aucun correctif
 4. P0+P1 > 0 → agents de correction groupés par cause racine → verify → commit → N+1
    P0+P1 = 0 → N+1 pour confirmer ; convergence = deux rounds propres identiques
```

Règles d'exploitation (apprises sur les rounds précédents) :
- Seul l'orchestrateur reconstruit le bundle, entre deux rounds, jamais pendant qu'une vague tourne.
- Ne jamais lancer `emulator-stack.sh down`, ni vider les émulateurs (`clear-all`).
- macOS n'a pas `timeout` : lancer `npx playwright test …` directement.
- La vague D est la plus longue (deux tests de ré-authentification de cinq minutes chacun).
- Commiter les correctifs avant de lancer un nouveau round (défense contre les stashes).

## §3 — État des rounds

| Round | Capture | Adversaire | Corrigé |
|---|---|---|---|
| 1 | A, C, D, E, F | oui (+ relecture adverse de `8fe610c`) | oui |
| 2 | A–F | oui | oui |
| 3 | A–E | oui (A–E) | commit `366a959` |
| 4 | A–E | **A seulement** (49 Ko, 40 constats ; B–E : captures sans fichier de constats) | polish A et lot E, commit `d01e275` |
| 5 | A–E sur le bundle de `d01e275` | oui (A–E) | `cad4878`, `e1418b0` |
| 6 | A–E sur `cad4878` | oui (A–E) | `c4ace82` |
| 7 | A–E sur `c4ace82`+ | oui (A–F) : GREEN | `f4188d6`, `3bfd0b3` |
| 8 | A–E sur `3bfd0b3` | oui (A–F) : GREEN | aucun |
| 9 | A–E sur `3bfd0b3` (bundle reconstruit) | oui (A–F) : GREEN, ensemble identique à r8 | aucun |

Constats P0/P1 de la vague A au round 4, à recroiser avec les captures du round 5 : P0 `A-001` (silent_error), `A-025` (numeric_integrity) ; P1 `A-002` (overlap), `A-003` (aria), `A-004` (i18n_leak), `A-006` (console_error), `A-008` (silent_error), `A-009`, `A-010` (numeric_integrity). Les correctifs `A-034`→`A-040` sont dans `d01e275` mais **pas encore revérifiés dans un navigateur**.

## §4 — Points connus ouverts (à confirmer ou clore au prochain round)

Repris des comptes rendus de session, **non revérifiés** depuis :

| Zone | Point |
|---|---|
| Daily loop | quatre formats de date coexistent (B-023) |
| Export | n'inclut pas le profil TTC, la checklist quotidienne ni les tâches complétées (D-024) |
| Déconnexion | deux chemins sans confirmation s'il reste des données non synchronisées (en-tête d'onboarding ; après suppression inachevée) ; en mise au point, retour « connectée » 3 essais sur 6 |
| Compte | nom vidé jamais effacé côté serveur ; prénom non enregistré perdu à l'ajout d'un contact d'urgence ; contact d'urgence invité perdu au rechargement et au passage à un compte ; langue non enregistrée dans le compte ; `/language` → « Continuer » sans effet ; écran Réglages vide pendant l'export PDF |
| Bandeau hors ligne | recouvre titre/accueil/avatar ; sur le web n'apparaît que si l'événement réseau est déclenché à la main |
| Contraste | « Sauvegarder » (hydratation) 3,76:1 ; « Poids normal » 3,81:1 |
| Navigation | retour des Statistiques sans rôle ni nom (corrigé dans `d01e275`, à revérifier) |
| Calendrier | bouton flottant sur les cases du dimanche ; à 280 pt l'avatar mord le message et la date du rendez-vous est tronquée |
| Libellés | écran Poids : « 3e trimestre » au lieu de « 3ème Trimestre » |
| Accueil | pastille « Ma Journée » possiblement absente avant une première visite de l'onglet Rappels (à confirmer : défaut app, pas de spec) |
| Mise en page | titres répétés entre en-tête et corps (E-026), D-027 |
| Visuels | image du mois 1 (C-036) et vignettes d'articles (E-027) : il faut de vrais visuels ; images fœtales mois 1–2 à remplacer, mois 4 et 8 imparfaites |
| Bouton partagé | autorise deux lignes : le round 5 doit vérifier qu'aucun autre bouton n'a changé d'aspect |
| Specs | six assertions de la vague D à aligner sur le libellé d'export sans « (JSON) » |

## §5 — Relecture clinique requise avant toute promesse publique

À signer par une sage-femme / un·e gynécologue (dossiers dans `docs/clinical-review/`) :
`HEALTH_THRESHOLDS_DOSSIER.md` (glycémie à jeun ≥ 5,1 mmol/L ; 140/90 → contacter la sage-femme sous 24 h), `CONSISTENCY_CHANGES.md` (vitamine A, sélénium, poissons fumés et à mercure, fromages au lait cru, rillettes passés à « à éviter »), la liste des puces de chat qui déclenchent le bloc d'urgence (« J'ai des contractions » ne déclenche plus d'alerte), les poids arrondis de la table de croissance, la frontière du 3ᵉ trimestre (27 SA dans `weeks_db.json`, 28 dans l'app), le mot « الفصل » pour trimestre dans les articles en arabe et tunisien, et les traductions anglaises des 280 messages bébé.
Tant que ce n'est pas signé, aucun texte public ne dit que le contenu est relu.

## §6 — Gates qui dépendent du propriétaire (hors de portée de l'agent)

| # | Action |
|---|---|
| G1 | `firebase deploy --only firestore:rules` avant la soumission (les règles ont changé au round 3) |
| G2 | relancer `scripts/sync-firestore-weeks.ts` en production (`weeks_db.json` corrigé : poids en kg, tailles, « (34 SA) » retirés) |
| G3 | déclarer les 6 variables Firebase dans EAS (le build est bloqué sans elles) |
| G4 | `cd website && vercel deploy --prod` |
| G5 | confirmer les numéros d'urgence du Maroc et de l'Algérie |
| G6 | créer le compte de démo pour les relecteurs des stores |
| G7 | signatures cliniques (§5) |
| G8 | fournir de vrais visuels (mois 1–2, vignettes d'articles) |
| G9 | credentials Apple dans `eas.json` ; App Check (App Attest / Play Integrity) ; restrictions de clé GCP |

## §7 — Journal d'exécution

| Date | Événement |
|---|---|
| 2026-10-02 | Reprise. `verify` : 1 test périmé (`planningWiring` attendait `getHistoricalData(days, tasks)` ; l'appel passe maintenant `today`) → corrigé ; 144 suites / 3342 tests verts. |
| 2026-10-02 | Commit `d01e275` (round-4 : polish A, bouton à deux lignes, stats « Ma Journée », specs). |
| 2026-10-02 | Pile relancée (`:9099`, `:8080`, `:8090`), bundle reconstruit depuis `d01e275`. Premier lancement des vagues raté (`timeout` absent sous macOS), relancé : les 6 specs du round 5 tournent, quartets dans `round-5/`. |
| 2026-10-02 | Round 5 rendu : A, B GREEN ; C, E AMBER (C-036 image mois 1, E-048 spec). Vague D : 13/18 puis les 5 assertions périmées rejouées seules (un worker) → 18/18 verts. Lots de correction (layout/a11y, santé, contenu, specs) commités `cad4878` après `verify` vert (146 suites / 3369 tests). Adversaire D lancé sur `round-5/wave-D`. |
| 2026-10-02 | Bundle reconstruit depuis `cad4878` ; round 6 : 6 specs lancées en parallèle, quartets dans `round-6/`. Les images mois 1–2 sont abstraites (honnêtes) ; vrais visuels toujours dus (G8). |
| 2026-10-02 | Round 6 (bundle `cad4878`) : A AMBER (A-012 : hero Home resté à ~20 % d'opacité), B GREEN (B-032 : écran Rappels décalé de 98 px = vrai bug du pager web, reproduit à la main), C AMBER (spec périmée sur `redFlagHigh` ; tn « ما عنديش نزيف » recommandait un article), D AMBER (D-036 fromage, corrigé `e1418b0` hors bundle), E AMBER (E-048 spec statistiques ; 280 pt avatar/date ; a11y : puces 7/30 j sans rôle, contraste des badges verrouillés, interrupteurs 40×20). |
| 2026-10-02 | Correctifs round 6 : `overflow: clip` sur la vue d'onglets Rappels (web) ; garde de 1,5 s sur l'entrée animée de Home ; salutation sous l'avatar < 340 pt ; date du RDV `flex 3/2` ; puces Statistiques en `tab` ; badges verrouillés sans opacité globale ; interrupteurs web 52×26 ; négation tunisienne « ما عنديش » ; specs C/E alignées. `verify` 147 suites / 3390 tests verts. |
| 2026-10-02 | Rounds 7, 8, 9 : A–E GREEN (0 P0 / 0 P1) ; F sans P0/P1 non-propriétaire. Ensembles de constats ouverts identiques entre r8 et r9 (comparaison scriptée). `CONVERGENCE_FINAL.md` écrit. Restent : gates propriétaire G1–G9, smoke-test sur appareil, signatures cliniques. |
