# 🩺 GOAL — CLINICAL & PRODUCT READINESS · Mama & Bébé v1.0

**Slug** `CLINICAL_PRODUCT_READINESS_MAMABEBE` · **Créé** 2026-08-25
**Branche** `feat/interaction-ux-2026-06-18` @ `8e8278f`
**Portée** : passer de « binaire publiable » à **« contenu médical signé et profil utilisateur suffisant pour que les règles produit s'appliquent »**.

**Baseline mesurée aujourd'hui, pas recopiée** :
`npm run verify` → **83 suites / 2046 tests** · `npm run test:rules` → **44/44** contre l'émulateur Firestore réel · `npm run e2e:web` → **38/38** en 4,6 min.

---

## §0 — Anti-duplication (à lire avant d'ouvrir un autre doc)

`GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md` impose : *« aucun nouveau doc de plan »*. Ce GOAL-ci **ne l'enfreint pas et ne le remplace pas** — il décompose **un seul de ses gates**, `GT-4 (revue clinique)`, qui y tient en une ligne alors qu'il porte le plus long délai humain du projet après l'ouverture des comptes.

| Axe | Document | Statut |
|---|---|---|
| **Store** — build, config, assets, fiches, soumission | `GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md` (§1–§9, gates GT-1…GT-7) | **reste la source de vérité unique.** Ne rien y dupliquer |
| **Clinique & produit** — contenu à signer, profil médical, config jamais exercée | **ce fichier** | nouveau, ne recouvre aucune vague W1–W9 |

**Frontière stricte.** Ce GOAL ne parle jamais de : EAS, icônes, screenshots, fiches store, App Check, comptes développeur. Si un sujet apparaît dans les deux, il appartient au GOAL Store et ce fichier n'y fait que **référence**.

**Règle de journal.** L'avancement s'écrit dans le **§J** de ce fichier pour l'axe clinique, et dans le §9 du GOAL Store pour l'axe store. Une ligne, un seul journal.

### §0.1 — Décision arbre de travail (obligatoire avant W1)

État constaté ce jour (`git status --porcelain`) :

```
 D DATA_PACK_MVP_V3_FINAL.zip      <- suivi par git, supprimé du disque, suppression non commitée
 D DATA_PACK_V1_1_FINAL.zip        <- idem
?? w1-onboarding-step1-ar.png      <- non suivi, à la racine du dépôt
```

**Décision : hors périmètre, à trancher par l'owner avant W1.** Les deux `.zip` sont des paquets de données historiques ; leur suppression est peut-être volontaire, peut-être un accident de nettoyage. Je ne commite pas la suppression d'archives de données à la place de leur propriétaire.
→ Owner : soit `git rm --cached` + entrée `.gitignore` (si volontaire), soit `git restore` (si accident). Le `.png` est une capture de travail : `rm` ou déplacement dans `store/screenshots/_raw/`.
**Aucune vague ne démarre tant que `git status` n'est pas propre** — sinon le diff de vague est illisible.

### §0.2 — Pipeline par tâche

Chaque tâche T-x.y.z s'exécute via `~/.claude/skills/ultra-audit-profond/`. Ce GOAL ne redécrit pas le pipeline. Discipline test-driven du `CLAUDE.md` racine : **aucun commit avant `npm run verify` vert ; régression = rollback**.

### §0.3 — Critères de convergence (repris de `test-e2e`, appliqués littéralement)

Convergence = **deux cycles consécutifs avec P0+P1 = 0 ET jeux de constats identiques**. Un seul cycle vert ne converge pas — c'est le garde-fou anti-flake.

### §0.4 — Ce que ce GOAL refuse par construction

| Refus | Raison |
|---|---|
| Écrire du contenu médical | Je ne suis pas clinicien. Je **prépare le dossier**, je ne rédige ni ne valide un dosage, un seuil de triage ou un avis sur le jeûne |
| Flipper un flag de gating sans commit de signature | `unreviewedContent.test.ts:43` l'interdit et c'est voulu |
| Supprimer un bandeau « en cours de revue » pour débloquer un écran | Le pire scénario du dépôt : retirer l'avertissement au lieu d'obtenir la revue |

---

## §1 — Vérité terrain (mesurée le 2026-08-25)

### §1.1 Ce qui est prouvé aujourd'hui

| Domaine | Preuve | Commande rejouée ce jour |
|---|---|---|
| Suite applicative | 83 suites / **2046** tests, `tsc --noEmit` strict, garde de tokens de thème | `npm run verify` |
| Sécurité Firestore | 44 assertions contre l'émulateur **réel** | `npm run test:rules` |
| Parcours web 4 langues | 38 scénarios, rendu + fuites de clés i18n + `dir=rtl` + erreurs console | `npm run e2e:web` |
| Contenu non revu inatteignable | Ramadan gaté sur 3 fronts (accueil, route, deep link) ; volet halal gaté sur la carte | `__tests__/unreviewedContent.test.ts` (10 cas) |
| Aucun secret au dépôt | balayage `AIza…` / clés privées / `sk_live_` / `ghp_` → 0 | `grep -rnE` sur `src`, `app.json`, `eas.json` |
| Aucun test neutralisé | 0 `.skip`, 0 `xit`, 0 `.only` dans `src`, `e2e`, `firestore-rules-tests` | `grep -rnE` |

### §1.2 Bloqueurs découverts aujourd'hui (aucun n'était tracké)

| # | Sévérité | Fait | Ancre vérifiée | Conséquence |
|---|---|---|---|---|
| **C1** | ✅ **corrigé** `8e8278f` | La règle « désactiver le rappel glycémie si pas de diabète gestationnel » n'a **jamais** fonctionné : `matchContext` compare en égalité stricte et le drapeau valait `undefined`, donc `undefined !== false` | `src/utils/contextMatcher.ts:44-60` + `src/data/REMINDERS_V2.json` → `rem_follow_glucose` `when {has_gestational_diabetes:false} → disable` | « Contrôle glycémie » / « فحص السكر » était **listé pour toutes les utilisatrices** dans la section médicale. Rouge prouvé avant correctif : `applyContextRules` rendait `{}` au lieu de `null` |
| **C2** | ✅ **corrigé** `8e8278f` | `is_ramadan` figé à `false` pendant que `isRamadan()` n'était appelé de **nulle part** ; la docstring décrivait un calcul qui ne tournait pas | `src/utils/contextMatcher.ts:136-145` (défini), 0 appelant hors tests | Latent seulement : l'unique consommateur est `rem_hyd_water`, exclu du catalogue à 3 endroits (`remindersV2Service.ts:88,107,116`) |
| **C3** | 🔴 **P1 produit — OUVERT** | **Aucun écran ne collecte de diagnostic.** `ContextProfile` déclare `has_gestational_diabetes`, `has_hypertension`, `is_twins` ; les deux appelants de production passent zéro drapeau | `src/screens/reminders/RemindersTab.tsx:286` (`buildContextProfile(week)`) · `src/services/dailyChecklistService.ts:74-77` (TODO explicite) · `src/types/remindersV2.ts:75-84` | **Conséquence directe de C1** : le rappel glycémie n'est désormais proposé à **personne**, y compris aux femmes réellement diabétiques. 3 règles du catalogue sont inertes par construction. Voir §3 |
| **C4** | 🟠 P2 — OUVERT | `RAMADAN_WINDOWS` s'arrête à **2030** ; au-delà `isRamadan()` renvoie `false` sans bruit | `src/utils/contextMatcher.ts:126-134` | Bombe à retardement documentée, repli sûr. Traité en W4 |
| **C5** | 🟠 P1 — OUVERT | `ramadan_pregnancy_guidance.json` porte `"review_status": "TODO_clinician_review"` en clair, ligne 4 | `src/data/ramadan_pregnancy_guidance.json:4` | C'est **la** donnée qui prouve que GT-4 n'est pas commencé. Le fichier est le livrable central du dossier de revue (§2) |

### §1.3 Ce qui n'est pas prouvable ici

Identique au GOAL Store §1.3 — **ne pas re-décrire**. Rappel d'une ligne : compte EAS non connecté, backend Firestore non déployé/seedé, Anonymous Auth non activée.

**Point aggravant, non écrit ailleurs** : toute la campagne d'audit a tourné avec **Anonymous Auth OFF**. Le correctif `3b470c2` (B14) est testé unitairement (`src/context/__tests__/accountMode.test.ts`, 20 cas) mais la configuration réelle n'a **jamais** été exercée par un parcours. C'est le système 4 de ce GOAL.

---

## §2 — Carte des systèmes

| # | Système | Maturité | Ancre principale vérifiée | Tests existants |
|---|---|---|---|---|
| **S1** | Dossier de revue clinique (GT-4) | 🔴 non commencé | `src/data/{articles_db,supplements_db,ramadan_pregnancy_guidance}.json` + `src/services/chatbotService.ts` | `supplementsSafety.test.ts`, `chatbotSeverityTaxonomy.test.ts`, `chatbotTriage.test.ts` |
| **S2** | Profil médical utilisateur | 🔴 absent | `src/types/remindersV2.ts:75-84`, `src/screens/OnboardingScreen.tsx` (1334 l.), `src/screens/SettingsScreen.tsx` | `contextMatcher.test.ts` (25), `remindersV2Service.test.ts` |
| **S3** | Protocole de levée des gatings | 🟡 gaté, propre | `src/config/featureFlags.ts` (2 constantes) | `__tests__/unreviewedContent.test.ts` (12) |
| **S4** | Configuration jamais exercée (Anonymous Auth ON) | 🟡 corrigé, non exercé | `src/context/AuthContext.tsx` | `accountMode.test.ts` (20), `firestore-rules-tests/` (44) |

Aucun système « séparé » (mobile/web distincts) : le dépôt est un seul arbre Expo. La rubrique §2 « map separated » du gabarit ne s'applique pas.

---

## §3 — S1 · Dossier de revue clinique

### Contrat
Produire le **dossier qu'un professionnel signe**, pas le contenu lui-même. Sortie : un document par domaine, chacun listant les affirmations à valider, leur emplacement exact dans les données, et une case de signature. Apple 1.4.1 et Play « Health apps » exigent l'exactitude médicale ; c'est un prérequis légal, pas une option.

### Zones interdites
- Ne pas modifier une valeur clinique dans `supplements_db.json` / `articles_db.json` / `ramadan_pregnancy_guidance.json`. **Extraire, ne pas éditer.**
- Ne pas toucher aux seuils de `SEVERITY_PRIORITY` (`chatbotService.ts:25-27`) : le triage a été réglé sur des cas réels documentés en commentaires (`:55-111`, `:335-339`, `:428`, `:623`).

### Ancres (vérifiées 2026-08-25)
```
src/data/articles_db.json                  1 457 586 o
src/data/supplements_db.json                  60 499 o
src/data/ramadan_pregnancy_guidance.json      11 274 o   ← review_status: TODO_clinician_review
src/data/forbidden_foods.json                 31 211 o
src/services/chatbotService.ts                76 148 o   ← SEVERITY_PRIORITY:25
src/data/chatbot_data.ts                      32 805 o
```

### Sub 1.1 — Extraction des affirmations à valider
**Ancres** : les 4 JSON ci-dessus + `src/i18n/locales/fr/cycle8.json`
- **T-1.1.1** Extraire les dosages de compléments en table signable — une ligne par substance, avec `pregnancy_safety`, la valeur, et le chemin JSON exact
  • anchor: `src/data/supplements_db.json`
  • test: `src/data/__tests__/supplementsSafety.test.ts` (existe, `describe` ligne 13) — étendre pour exiger que **chaque** substance extraite ait un `pregnancy_safety` non vide
  • sortie: `docs/clinical-review/SUPPLEMENTS_DOSSIER.md`
- **T-1.1.2** Extraire les seuils de triage de l'assistant : chaque token d'urgence, sa sévérité, et la phrase-test qui le déclenche
  • anchor: `src/services/chatbotService.ts:25-27` + `:93-111`
  • test: `src/services/__tests__/chatbotSeverityTaxonomy.test.ts` (existe)
  • sortie: `docs/clinical-review/TRIAGE_DOSSIER.md`
- **T-1.1.3** Extraire le contenu Ramadan intégralement, 4 langues en regard, avec la recommandation en clair
  • anchor: `src/data/ramadan_pregnancy_guidance.json` (`review_status:4`)
  • test: *(à créer)* `src/data/__tests__/ramadanGuidanceDossier.test.ts` — exige que `review_status` reste `TODO_clinician_review` tant que `RAMADAN_GUIDANCE_CLINICALLY_REVIEWED === false` (les deux marqueurs ne doivent jamais diverger)
  • sortie: `docs/clinical-review/RAMADAN_DOSSIER.md`
- **T-1.1.4** Extraire le volet halal (5 items : `alcohol`, `pork`, `gelatin`, `nonHalalMeat`, `cookingWine`) — relecteurs **distincts** : imam + diététicien·ne
  • anchor: `src/screens/ForbiddenFoodsScreen.tsx:123` (`halalItemKeys`) + `src/i18n/locales/*/cycle8.json` clé `forbiddenFoodsHalal`
  • test: `__tests__/unreviewedContent.test.ts:75-107` (existe, garde déjà les 4 locales)
  • sortie: `docs/clinical-review/HALAL_DOSSIER.md`

**Acceptance Sub 1.1** : `npm run verify` vert + les 4 dossiers existent + chaque affirmation extraite porte son chemin JSON exact (aucune paraphrase) + `ramadanGuidanceDossier.test.ts` PASS.

### Sub 1.2 — Contenu hebdomadaire & articles
**Ancres** : `src/data/weeks_db.json` (333 661 o), `src/data/articles_db.json` (1 457 586 o)
- **T-1.2.1** Échantillonner les 40 semaines : recommandations présentes, aucune allégation diagnostique
  • test: `src/data/__tests__/weeklyRecommendations.test.ts` (existe — créé en `101cc46`)
- **T-1.2.2** Balayer les articles pour toute formulation à valeur de diagnostic ou de prescription
  • test: *(à créer)* `src/data/__tests__/articlesNoDiagnosticClaims.test.ts` — liste de tournures interdites, en 4 langues
- **T-1.2.3** Vérifier la présence du disclaimer médical sur chaque surface de conseil
  • anchor: `store/listing.json` (le test store le vérifie déjà côté fiche), écrans applicatifs à couvrir
  • test: *(à créer)* `src/screens/__tests__/medicalDisclaimerPresence.test.ts`

**Acceptance Sub 1.2** : 3 tests PASS + 0 tournure diagnostique + disclaimer présent sur toute surface de conseil.

### Sub 1.3 — Remise et signature
- **T-1.3.1** Assembler `docs/clinical-review/README.md` : qui signe quoi, dans quel ordre, avec les 4 dossiers en pièces jointes
- **T-1.3.2** Définir la forme de la preuve de signature : nom, qualification, date, périmètre signé — inscrite dans le **message de commit** qui flippe le flag (voir §5, S3)
- **T-1.3.3** Owner : transmettre à la sage-femme/gynécologue (dossiers 1.1.1–1.1.3 + 1.2) et à l'imam + diététicien·ne (dossier 1.1.4)

**Acceptance Sub 1.3** : gate **GC-1** passé (§G).

---

## §4 — S2 · Profil médical utilisateur

### Contrat
Donner à l'application un endroit où une utilisatrice **déclare** un diabète gestationnel, une hypertension, une grossesse gémellaire — pour que les règles déjà écrites dans le catalogue s'appliquent. C'est la suite directe de C1/C3 : le correctif d'aujourd'hui a rendu le moteur honnête, il faut maintenant lui donner des données.

### Décision produit préalable (bloquante, owner)
Le rappel glycémie est aujourd'hui invisible pour **tout le monde**. Trois voies :

| Voie | Effet | Recommandation |
|---|---|---|
| **A — collecter le diagnostic** | La règle s'applique enfin comme écrite | ✅ **recommandée** — c'est ce que la donnée demande depuis le début |
| B — retirer la règle du catalogue | Le rappel redevient visible pour toutes | ❌ suggérer une surveillance glycémique sans indication sous-entend une condition |
| C — statu quo | Le rappel reste inatteignable | ⚠️ acceptable comme état transitoire, pas comme état de sortie |

**Aucune tâche de S2 ne démarre avant ce choix** — voir gate **GC-2** (§G).

### Zones sensibles
`OnboardingScreen.tsx` fait 1334 lignes et porte **trois** parcours (enceinte / TTC / curieuse) avec des numérotations d'étapes distinctes (`:1241-1252`). Toute étape ajoutée doit l'être dans le seul parcours « enceinte » et ne pas décaler les deux autres.

### Ancres (vérifiées 2026-08-25)
```
src/types/remindersV2.ts:75-84          ContextProfile — les 3 drapeaux déclarés
src/utils/contextMatcher.ts:159-181     buildContextProfile — signature userFlags déjà prête
src/screens/reminders/RemindersTab.tsx:286   buildContextProfile(week)   ← appelant 1
src/services/dailyChecklistService.ts:74-77  buildContextProfile(week,{}) ← appelant 2, TODO en clair
src/screens/OnboardingScreen.tsx:325,368,492,602   étapes parcours enceinte
src/screens/SettingsScreen.tsx                     surface de modification après coup
src/types/index.ts:265-289                         UserProfile — où loger les drapeaux
```

### Sub 2.1 — Modèle et persistance
- **T-2.1.1** Ajouter les 3 drapeaux à `UserProfile`, optionnels, avec un `undefined` signifiant « jamais demandé » distinct de `false` « répondu non »
  • anchor: `src/types/index.ts:265-289`
  • test: *(à créer)* `src/types/__tests__/medicalFlagsShape.test.ts`
- **T-2.1.2** Persister pour les deux modes : Firestore (compte) et AsyncStorage `guestProfile` (invitée) — même schéma que `emergencyContacts` (`types/index.ts:270`)
  • test: *(à créer)* `src/context/__tests__/medicalFlagsPersistence.test.ts`
- **T-2.1.3** Étendre les règles Firestore : les 3 drapeaux sont des données de santé, mêmes garanties d'isolation que `symptomsLog`
  • anchor: `firestore.rules` (12 358 o)
  • test: `firestore-rules-tests/` — **ajouter des assertions** à la suite existante (44 aujourd'hui) ; ne pas créer une seconde suite
- **T-2.1.4** Migration : un profil existant sans les champs reste valide et lit `undefined`
  • test: `src/context/__tests__/reonboardPreserve.test.ts` (existe) — étendre

**Acceptance Sub 2.1** : `npm run verify` vert + `npm run test:rules` ≥ 44 + 0 régression sur les 2046.

### Sub 2.2 — Collecte
- **T-2.2.1** Étape d'onboarding « suivi médical particulier ? » — **facultative, sautable**, parcours enceinte uniquement
  • anchor: `src/screens/OnboardingScreen.tsx:1241-1252` (routage des étapes)
  • test: *(à créer)* `src/screens/__tests__/onboardingMedicalStep.test.ts` — doit prouver que les parcours TTC et Curieuse ne sont **pas** décalés
  • visual: parcours onboarding en `fr` / `ar` (RTL)
- **T-2.2.2** Surface de modification après coup dans les réglages
  • anchor: `src/screens/SettingsScreen.tsx`
  • test: *(à créer)* `src/screens/__tests__/settingsMedicalFlags.test.ts`
- **T-2.2.3** Traductions 4 langues, formulation non anxiogène, sans valeur diagnostique
  • anchor: `src/i18n/locales/{fr,en,ar,tn}/onboarding.json` + `profile.json`
  • test: `src/i18n/__tests__/` — la suite de parité de clés existante couvre automatiquement les nouvelles clés
  • ⚠️ **la formulation part au dossier S1** : une question sur un diagnostic est du contenu médical

**Acceptance Sub 2.2** : `npm run e2e:web` ≥ 38 + aucune clé i18n brute + `dir=rtl` conservé.

### Sub 2.3 — Câblage
- **T-2.3.1** Brancher les 2 appelants de `buildContextProfile` sur le profil réel
  • anchor: `RemindersTab.tsx:286` et `dailyChecklistService.ts:74-77` (retirer le TODO)
  • test: `src/utils/__tests__/contextMatcher.test.ts` (25 cas aujourd'hui) — étendre
- **T-2.3.2** Prouver de bout en bout que `rem_follow_glucose` apparaît **si et seulement si** le diagnostic est déclaré
  • test: *(à créer)* `src/services/__tests__/glucoseReminderVisibility.test.ts` — **la garde de régression de C1**, à vérifier rouge sur le code d'avant
- **T-2.3.3** Idem pour `rem_follow_bp` (`when {has_hypertension:true} → override_intensity:2`)
  • test: même fichier

**Acceptance Sub 2.3** : les 3 règles du catalogue prouvées actives + `glucoseReminderVisibility.test.ts` vérifié rouge-vert.

---

## §5 — S3 · Protocole de levée des gatings

### Contrat
Deux surfaces sont éteintes en attendant deux signatures **différentes**. Le protocole doit rendre la levée triviale à exécuter et impossible à faire par accident.

### Ancres (vérifiées 2026-08-25)
```
src/config/featureFlags.ts:29   RAMADAN_GUIDANCE_CLINICALLY_REVIEWED = false
src/config/featureFlags.ts:48   HALAL_GUIDANCE_REVIEWED = false
src/screens/HomeScreen.tsx:60,962        entrée accueil Ramadan
App.tsx:39,143,333                        route + deep link Ramadan
src/screens/ForbiddenFoodsScreen.tsx:31,122   carte halal
__tests__/unreviewedContent.test.ts       10 cas, garde les 2 flags
```

### Sub 3.1 — Levée
- **T-3.1.1** Rédiger le protocole : signature reçue → commit unique qui (a) passe le flag à `true`, (b) retire le bandeau de brouillon des 4 locales, (c) inscrit nom/qualification/date/périmètre en message de commit
  • sortie: `docs/clinical-review/FLAG_LIFT_PROTOCOL.md`
- **T-3.1.2** Adapter `unreviewedContent.test.ts` pour qu'il bascule proprement : tant que le flag est `false`, il exige le bandeau ; quand il passe `true`, il exige son **absence**
  • anchor: `__tests__/unreviewedContent.test.ts:33` (« this test is about gating, not deletion »)
  • ⚠️ le test doit rester **impossible à satisfaire en supprimant le bandeau sans lever le flag**
- **T-3.1.3** Aligner `review_status` du JSON Ramadan sur le flag (garde croisée de T-1.1.3)
  • anchor: `src/data/ramadan_pregnancy_guidance.json:4`

**Acceptance Sub 3.1** : les 10 cas existants PASS dans les deux positions du flag (vérifié en basculant localement, puis restauré).

---

## §6 — S4 · Configuration jamais exercée

### Contrat
Anonymous Auth OFF a été l'unique configuration de toute la campagne d'audit. B14 (`3b470c2`) a corrigé `isGuest` pour que l'activation ne casse pas le parcours invité, avec 17 cas unitaires — **mais aucun parcours réel n'a tourné avec le drapeau activé**. Ce système existe pour que « ça devrait marcher » devienne « ça a tourné ».

### Dépendance
Bloqué par **GT-2** du GOAL Store (Firebase live). Ne rien tenter avant.

### Ancres (vérifiées 2026-08-25)
```
src/context/AuthContext.tsx        isGuest / hasPermanentAccount / upgradeGuest
src/context/__tests__/accountMode.test.ts   20 cas — la théorie
firestore-rules-tests/             44 assertions — contre émulateur
firestore.rules                    12 358 o
firestore.indexes.json                735 o (3 index dérivés du code)
```

### Sub 4.1 — Exercice réel
- **T-4.1.1** Activer Anonymous Auth, rejouer `npm run e2e:web` complet
  • test: `e2e/` (38 scénarios existants) — attendu ≥ 38
- **T-4.1.2** Parcours invitée → compte permanent, sur backend live
  • test: `src/context/__tests__/accountMode.test.ts` (existe) + relevé manuel
- **T-4.1.3** Suppression de compte de bout en bout sur données réelles (RGPD art. 17)
  • anchor: `src/services/dataExportService.ts` + sous-collections couvertes par les règles
  • test: `src/services/__tests__/dataExportService.test.ts` (existe, `:212` anonymisation UID)
- **T-4.1.4** Les 3 index composites tiennent sur données réelles (pas de `failed-precondition`)
  • anchor: `firestore.indexes.json` + `__tests__/firestoreIndexes.test.ts` (scanner de `query()`)

**Acceptance S4** : e2e ≥ 38 en configuration ON + suppression prouvée sur backend live + 0 `failed-precondition`.

---

## §7 — S5 · Dette mineure identifiée

- **T-5.1** `RAMADAN_WINDOWS` s'arrête à 2030 (`contextMatcher.ts:126-134`). Soit étendre la table, soit basculer sur une bibliothèque hégirienne. Repli actuel sûr (`false`), donc **P2**.
  • test: `src/utils/__tests__/contextMatcher.test.ts` — ajouter un cas 2031
- **T-5.2** `src/types/index.ts:274` et `OnboardingScreen.tsx:1085` portent le même TODO « Strategy B » : remplacer `isTTC` + `isGuest` + `isCurious` par un `mode` discriminé. **Refacto structurante — hors périmètre v1.0**, à tracer pour v1.1.

---

## §A — Carte des rôles

Ce dépôt n'a pas d'armée d'agents configurée et **ce GOAL n'en réclame pas** : les tâches sont séquentielles et se tiennent dans un seul contexte. La matrice de fan-out du gabarit s'applique si l'owner demande explicitement une exécution multi-agents.

Un seul rôle est **non négociable et humain** : le relecteur clinique. Il n'est pas délégable à un agent, et c'est tout l'objet de S1.

---

## §X — Vagues

| Vague | Périmètre | Parallélisme | Dépendance | Checkpoint |
|---|---|---|---|---|
| **W0** | Arbre de travail propre (§0.1) | — | owner | `git status --porcelain` vide |
| **W1** | S1 Sub 1.1 + 1.2 — extraction des dossiers | séquentiel | aucune | 4 dossiers + 3 tests créés PASS |
| **W2** | S1 Sub 1.3 — remise | — | W1 | **GC-1** transmis |
| **W3** | S3 — protocole de levée | ‖ possible avec W2 | aucune | 12 cas PASS dans les 2 positions |
| **W4** | S5 — dette mineure | ‖ possible avec W2/W3 | aucune | cas 2031 PASS |
| **W5** | S2 Sub 2.1 + 2.2 + 2.3 — profil médical | séquentiel | **GC-2** | 3 règles prouvées actives |
| **W6** | S4 — configuration réelle | séquentiel | **GT-2** (GOAL Store) | e2e ≥ 38 en ON |
| **W7** | Levée des flags | — | **GC-1** signé | commit de signature |

**Parallélisme.** W2/W3/W4 sont disjoints : W2 n'écrit que dans `docs/`, W3 dans `__tests__/unreviewedContent.test.ts` + `featureFlags.ts`, W4 dans `contextMatcher.ts`. W5 touche `contextMatcher.ts` → **jamais en parallèle de W4**.

### Checkpoint de vague (les 5 points, tous requis)
1. Toutes les tâches PASS, ou échec de base documenté avec sa raison
2. `npm run verify` vert **au commit de clôture**, pas avant
3. `npm run test:rules` ≥ 44 si la vague a touché `firestore.rules`
4. `npm run e2e:web` ≥ 38 si la vague a touché un écran
5. §J mis à jour avec le SHA et la preuve

Un « non » → **la vague n'est pas close**. Soigner ou documenter, ne pas avancer.

### Protocole d'interruption
1. Commiter le partiel en `wip(<vague>): partiel jusqu'à T-x.y.z`
2. Écrire `docs/clinical-review/INTERRUPT_<vague>_<horodatage>.md` : dernier SHA vert, dernière tâche + statut, tâche suivante
3. Reprise : lire le manifeste, `git status`, rejouer la dernière tâche en fumée, puis continuer

### Échec de convergence
3 boucles de soin sur le même amas → **stop**, écrire `docs/clinical-review/STUCK_<vague>.md`, remonter à l'owner avec 4 options (accepter-et-documenter / pivot / reporter v1.0.x / gate humain). **Ne pas trancher seul.**

---

## §G — Gates owner (axe clinique — numérotation `GC-*`, disjointe des `GT-*`)

| Gate | Description | WHO | WHAT | WHERE | Statut |
|---|---|---|---|---|---|
| **GC-0** | Trancher le sort des 2 `.zip` supprimés et du `.png` à la racine | Owner | `git status` propre | arbre de travail | **PENDING** |
| **GC-1** | **Signature clinique** — sage-femme/gynécologue sur compléments + triage + Ramadan + articles ; imam + diététicien·ne sur le volet halal | Owner (relecteur humain qualifié) | nom, qualification, date, périmètre signé | message du commit qui lève le flag + `docs/clinical-review/README.md` | **PENDING** — c'est `GT-4` du GOAL Store, ici décomposé |
| **GC-2** | **Décision produit C3** : voie A (collecter le diagnostic), B (retirer la règle) ou C (statu quo) — §4 | Owner | choix écrit | §J de ce fichier | **PENDING — bloque toute la vague W5** |
| **GC-3** | Validation de la formulation des questions médicales d'onboarding (T-2.2.3) | Relecteur clinique | formulation approuvée | `docs/clinical-review/` | PENDING (dépend de GC-1) |

**Protocole d'attente.** Pendant qu'un gate est PENDING : n'exécuter aucune vague qui en dépend, **exécuter celles qui n'en dépendent pas**. Concrètement, W1/W3/W4 tournent sans aucun gate. Seules W5 (GC-2), W6 (GT-2) et W7 (GC-1) attendent.

---

## §R — Références

- `docs/GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md` — **axe store, source de vérité unique**, gates GT-1…GT-7
- `docs/RELEASE_READINESS_2026-08-19.md` — verdict prouvé / fait-non-prouvable / impossible-sans-vous
- `docs/V1_AUTONOMOUS_RUN/findings.md` — registre F31-F609
- `CLAUDE.md` (racine) — méthodologie GSTACK, discipline test-driven
- `~/.claude/skills/ultra-audit-profond/` — pipeline par tâche
- `~/.claude/skills/lock-plan/` — sans objet ici : ce dépôt n'a pas de zones gelées déclarées

---

## §F — Règle finale

DONE pour ce GOAL = **les quatre**, pas trois :

1. **GC-1 signé** — les 4 dossiers portent une signature humaine qualifiée, et les 2 flags sont levés dans le commit qui la consigne.
2. **C3 résolu** — la voie choisie en GC-2 est implémentée et prouvée par un test vérifié rouge sur le code d'avant.
3. **Configuration réelle exercée** — au moins un parcours complet avec Anonymous Auth **activée** contre un backend live.
4. **`npm run verify` + `test:rules` + `e2e:web` verts au commit de clôture**, et deux cycles consécutifs à constats identiques.

Un contenu médical qui se déclare lui-même non revu ne part pas en production. Un moteur de règles qui ne peut pas être vrai ne compte pas comme une fonctionnalité. Le reste est négociable ; ces deux points ne le sont pas.

---

## §J — Journal d'exécution (axe clinique)

| Date | Vague | Fait | Preuve |
|---|---|---|---|
| 2026-08-25 | W-audit | Audit de contrôle des 4 portes, rejouées et non recopiées : `verify` 83/2046, `test:rules` 44/44, `e2e:web` 38/38. 5 constats ouverts (C1–C5), 2 corrigés | commit `8e8278f` |
| 2026-08-25 | W-audit | **C1** règle glycémie inerte depuis toujours — corrigée aux deux bouts (`buildContextProfile` déclare `false`, `matchContext` lit une absence booléenne comme `false`) · **C2** `isRamadan()` câblé. Rouge-vert vérifié sur les 3 correctifs par revert-puis-restauration | `src/utils/contextMatcher.ts`, `contextMatcher.test.ts` (+6 cas) |
| 2026-08-25 | — | Ce GOAL écrit. Ancres vérifiées par `grep`/`find`/`ls`/`node` rejoués ce jour ; aucun chemin cité sans sortie de commande correspondante | ce fichier |

---

*Plan ancré sur des commandes rejouées le 2026-08-25. Aucun chiffre recopié d'un document antérieur sans re-mesure. Les tests marqués « à créer » le sont explicitement ; aucune acceptance ne dit « les tests passent » sans nommer son fichier.*
