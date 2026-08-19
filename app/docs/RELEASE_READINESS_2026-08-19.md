# ✅ Verdict de sortie — Mama & Bébé v1.0

**Date** 2026-08-19 · **Branche** `feat/interaction-ux-2026-06-18` · **Plan** [`GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md`](GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md)

Ce document répond à une seule question : **est-ce qu'on peut soumettre ?**
Il distingue trois états, et ne mélange jamais les trois : ✅ **prouvé**, 🟡 **fait mais non prouvable ici**, 🔴 **impossible sans vous**.

---

## §1 — Verdict en une phrase

> **Le code et le pack store sont prêts. La soumission ne l'est pas — et elle ne peut pas l'être, parce que quatre choses n'existent pas encore : les deux comptes développeur, les deux fichiers Firebase natifs, le backend activé, et la signature clinique.**

Rien de ce qui reste n'est du travail de code. Tout ce qui reste demande soit un paiement, soit une console, soit un professionnel de santé.

---

## §2 — Ce qui est PROUVÉ ✅

Prouvé = une commande le rejoue et échoue si quelqu'un casse la propriété.

| Domaine | Preuve | Commande |
|---|---|---|
| Suite applicative | **83 suites / 2031 tests**, `tsc --noEmit` strict, garde de tokens de thème | `npm run verify` |
| Outillage Expo | **18/18** | `npx expo-doctor` |
| **Sécurité Firestore** | **44 assertions contre l'émulateur réel** : isolation inter-utilisateurs sur 6 collections + profils + santé (lecture, écrasement, suppression) ; garde de taille prouvée **active** ; sous-collections couvertes (RGPD art. 17) ; docId `symptomsLog` verrouillé sur le propriétaire ; bornes physiologiques poids/TA/glycémie ; contenu statique non inscriptible ; deny par défaut | `npm run test:rules` |
| Index Firestore | 3 index composites dérivés **du code** ; un scanner refuse toute requête multi-filtre non couverte | inclus dans `verify` |
| Configuration de release | 20 invariants build/submit (source de version, canaux OTA, AAB, identifiants, conformité export, manifeste de confidentialité, permissions Android, secrets gitignorés) | inclus dans `verify` |
| Assets store | 7 assets, dimensions et canal alpha lus dans l'en-tête PNG | inclus dans `verify` |
| Fiches store | limites de caractères des deux consoles, disclaimer médical présent, aucune allégation diagnostique | inclus dans `verify` |
| Contenu hebdomadaire | 40/40 semaines avec recommandations, **0 référence orpheline** | inclus dans `verify` |
| Mode invité sous Anonymous Auth | prédicat testé dans les **deux** configurations Firebase + les 3 points de câblage + la copie en 4 langues | inclus dans `verify` |
| Reconnexion réseau | 11 cas de détection de front, dont les 4 cas « ne doit PAS déclencher » | inclus dans `verify` |
| Contenu non revu | écran Ramadan inatteignable par les 3 chemins (accueil, route, deep link) | inclus dans `verify` |
| Parcours web | suite Playwright multilingue (rendu, fuites de clés i18n, direction RTL, erreurs console) | `npm run e2e:web` |

---

## §3 — Ce qui est FAIT mais NON PROUVABLE ici 🟡

Fait correctement, vérifié par lecture et par les tests disponibles — mais aucun de ces points n'a jamais tourné sur un binaire natif, parce qu'aucun binaire natif n'a jamais été construit.

| Point | Pourquoi ce n'est pas prouvable ici | Ce qui le prouvera |
|---|---|---|
| L'app démarre sans crasher | `expo-font` manquait ; corrigé, mais seul un binaire le démontre | premier build EAS |
| App Check s'initialise | dépend des 2 fichiers Firebase natifs, absents | build prod (il **refuse** de démarrer sans) |
| Les notifications arrivent | planification testée unitairement ; la livraison, la reprogrammation après redémarrage et le passage à l'heure d'été demandent un téléphone | smoke device iOS + Android |
| RTL natif en arabe | le web ment sur `I18nManager.isRTL` — seul l'appareil tranche | smoke device en `ar` |
| Retrait des `console.*` en prod | le piège de cache babel est corrigé et testé ; l'effet réel se constate sur un bundle prod | inspection du bundle de release |
| Suppression de compte de bout en bout | la purge est testée, les règles autorisent l'effacement complet — mais sur un backend vide | après activation du backend |
| Screenshots représentatifs | ce sont des captures RN-Web encadrées, même code et même UI, mais chrome système synthétique | re-capture sur simulateur |

---

## §4 — Ce qui est IMPOSSIBLE sans vous 🔴

Aucune de ces lignes n'est du travail de développement. Elles sont dans cet ordre parce que chacune débloque la suivante.

| # | Action | Où | Pourquoi c'est bloquant |
|---|---|---|---|
| 1 | **Ouvrir le compte Google Play** — en type **Organisation** si vous avez une structure | play.google.com/console | Un compte *personnel* impose **12 testeurs pendant 14 jours consécutifs** avant l'accès à la production, et ce chrono ne démarre qu'après création du compte **et** publication d'un build en test fermé. C'est le seul vrai risque calendaire du projet. |
| 2 | **Ouvrir le compte Apple Developer** | developer.apple.com | Sans lui : pas de certificat, pas de provisioning, donc **aucun binaire iOS signable** — et donc aucune des vérifications du §3. |
| 3 | **Déposer les 2 fichiers Firebase** `google-services.json` + `GoogleService-Info.plist` | Firebase Console → Paramètres → Vos applications, puis racine de `app/` | Le build de production **refuse de démarrer** sans eux et vous dit lequel manque. Sans eux, App Check serait inerte dans le binaire publié. |
| 4 | **Activer le backend** : Anonymous Auth, `firebase deploy --only firestore:rules,firestore:indexes`, puis `npm run import-data` | Firebase Console + CLI | Débloque le calendrier, la santé, le parcours invité complet — et rend enfin testable la configuration que le mode invité n'a jamais connue. |
| 5 | **Revue clinique** : articles, dosages de compléments, seuils de triage de l'assistant, et le contenu Ramadan | sage-femme / gynécologue | Pour une app de santé, c'est un prérequis légal et éthique, pas une option. L'écran Ramadan restera masqué tant que ce n'est pas signé. |
| 6 | **Compte de démo pour les relecteurs** | après l'étape 4 | Les notes de review le référencent déjà (`store/listing.json`). |

---

## §5 — Ce que je fais dès que 1 à 4 sont faits

1. Premier build EAS sur les deux plateformes, et correction de ce que le build natif révèle.
2. Smoke device : notifications reçues, reconnexion, RTL natif `ar`, suppression de compte sur backend live.
3. Re-capture des screenshots sur simulateur, comparaison avec le jeu actuel, remplacement si l'écart se voit.
4. Re-capture de l'écran Calendrier — impossible aujourd'hui, un invité ne pouvant pas avoir de rendez-vous par conception.
5. Téléversement TestFlight + canal interne Play, avec les fiches déjà rédigées et validées.

---

## §6 — La règle que je m'applique

Je ne dirai pas « on est prêt à publier » tant que je n'aurai pas vu un binaire démarrer sur un appareil réel. Tout ce qui est écrit au §2 est prouvé et le restera ; tout ce qui est au §3 est du travail correct qui attend sa preuve. Confondre les deux serait la seule vraie faute possible à ce stade.

**État actuel : prêt à construire. Pas encore prêt à publier — et l'écart n'est plus du code.**
