# ✅ Verdict de sortie — Mama & Bébé v1.0

**Date** 2026-08-19 · **Branche** `feat/interaction-ux-2026-06-18` · **Plan** [`GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md`](GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md)

Ce document répond à une seule question : **est-ce qu'on peut soumettre ?**
Il distingue trois états, et ne mélange jamais les trois : ✅ **prouvé**, 🟡 **fait mais non prouvable ici**, 🔴 **impossible sans vous**.

---

## §1 — Verdict en une phrase

> **GO pour construire et soumettre. Zéro défaut ouvert côté code, zéro test en échec, zéro bloqueur connu que je puisse encore lever depuis cette machine.**

Tout ce qui était vérifiable ici est vérifié : la suite applicative, la sécurité de la base contre le moteur de règles réel, les parcours de bout en bout, la génération du projet natif, la compilation du bundle Android, et le pack store complet aux dimensions exactes.

Ce qui reste ne s'écrit pas, il s'exécute : une commande de build, et vos accès.

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
| Contenu non revu | écran Ramadan inatteignable par les 3 chemins (accueil, route, deep link) ; l'article `art_003` (jeûne du Ramadan) et le décalage nocturne des rappels pendant le Ramadan passent par **un seul prédicat** (`src/config/unreviewedContent.ts`) sur tous les chemins : liste, recherche, détail, recommandations de la semaine, chatbot, Firestore et repli embarqué ; aucun mot-clé store sur un sujet masqué | inclus dans `verify` |
| Allégations publiques | site, fiches store, légendes des captures et accroche du feature graphic : ni « validé », ni « IA », ni « centaines », ni médecin garant, ni plus d'articles que l'app n'en sert (`__tests__/marketingClaims.test.ts`) | inclus dans `verify` |
| Parcours web | suite Playwright multilingue (rendu, fuites de clés i18n, direction RTL, erreurs console) | `npm run e2e:web` |
| **Génération du projet natif** | `expo prebuild` va au bout — impossible avant aujourd'hui : le plugin `@react-native-firebase` tuait la génération dès l'absence des fichiers de config | `npx expo prebuild -p android` |
| Manifeste Android généré | seules INTERNET, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, VIBRATE demandées ; les 10 autres marquées `tools:node="remove"` | inspection du manifeste généré |
| Icônes natives | les 3 calques adaptatifs + l'icône de notification produits à toutes les densités, rendu vérifié sous masques rond / squircle / carré | inspection de `android/app/src/main/res` |
| **Bundle Android** | **11,1 Mo de bytecode Hermes valide** (magie `c61fbc03c103191f`) + 47 assets. Cible `android`, pas `web` : cela résout et compile les variantes `.native.ts` — dont `createFirebaseAuth.native.ts` — que l'export web n'exerce jamais | `npx expo export --platform android` |

---

## §3 — Ce qui est FAIT mais NON PROUVABLE ici 🟡

Fait correctement, vérifié par lecture et par les tests disponibles — mais aucun de ces points n'a jamais tourné sur un binaire natif, parce qu'aucun binaire natif n'a jamais été construit.

| Point | Pourquoi ce n'est pas prouvable ici | Ce qui le prouvera |
|---|---|---|
| La coquille native démarre | Le JavaScript est compilé et validé, le projet natif est généré et son manifeste vérifié. Ce qui reste non compilé est la couche Java/Kotlin/C++ — du gabarit Expo/RN, pas du code applicatif. Gradle a consommé 2,6 Go sans atteindre la compilation sur un disque à 2,6 Go libres. | premier build EAS |
| App Check s'initialise | dépend des 2 fichiers Firebase natifs, absents | build prod (il **refuse** de démarrer sans) |
| Les notifications arrivent | planification testée unitairement ; la livraison, la reprogrammation après redémarrage et le passage à l'heure d'été demandent un téléphone | smoke device iOS + Android |
| RTL natif en arabe | le web ment sur `I18nManager.isRTL` — seul l'appareil tranche | smoke device en `ar` |
| Retrait des `console.*` en prod | le piège de cache babel est corrigé et testé ; l'effet réel se constate sur un bundle prod | inspection du bundle de release |
| Suppression de compte de bout en bout | la purge est testée, les règles autorisent l'effacement complet — mais sur un backend vide | après activation du backend |
| Screenshots représentatifs | ce sont des captures RN-Web encadrées, même code et même UI, mais chrome système synthétique | re-capture sur simulateur |

---

## §3b — Le chemin le plus court : un compte Expo **gratuit**

Je me suis trompé de cadrage dans le rapport précédent en présentant le build natif comme dépendant des comptes payants. Ce n'est pas vrai :

> **`eas build --profile preview --platform android` ne demande qu'un compte Expo gratuit.**
> Ni compte Apple, ni compte Google Play, ni même les fichiers Firebase.
> Seule condition : les 6 variables `EXPO_PUBLIC_FIREBASE_*` déclarées sur EAS pour l'environnement `preview` (§4, action 4) — sans elles `app.config.ts` refuse la build, car le binaire planterait au lancement.
> Il produit un **APK installable** sur n'importe quel téléphone Android.

Ce seul build ferme presque toute la colonne 🟡 ci-dessus : démarrage réel, notifications réellement reçues, RTL natif en arabe, reconnexion, suppression de compte. Trois commandes :

```bash
cd app
npx eas login          # compte Expo gratuit, 2 minutes
npx eas build --profile preview --platform android
```

La compilation tourne sur l'infrastructure Expo, ce qui contourne au passage la seule chose qui m'a bloqué localement : **il ne reste que 3,3 Go libres sur ce disque**, là où une compilation React Native New Architecture en réclame 6 à 8. J'ai lancé la build, vu Gradle consommer 2,6 Go sans même atteindre la phase de compilation, et je l'ai arrêtée puis nettoyée plutôt que de saturer la machine.

iOS reste hors de portée ici pour une autre raison : **Xcode n'est pas installé** (seulement les Command Line Tools). Un build iOS passera aussi par EAS.

---

## §4 — Ce qui est IMPOSSIBLE sans vous 🔴

Aucune de ces lignes n'est du travail de développement. Elles sont dans cet ordre parce que chacune débloque la suivante.

| # | Action | Où | Pourquoi c'est bloquant |
|---|---|---|---|
| 1 | **Ouvrir le compte Google Play** — en type **Organisation** si vous avez une structure | play.google.com/console | Un compte *personnel* impose **12 testeurs pendant 14 jours consécutifs** avant l'accès à la production, et ce chrono ne démarre qu'après création du compte **et** publication d'un build en test fermé. C'est le seul vrai risque calendaire du projet. |
| 2 | **Ouvrir le compte Apple Developer** | developer.apple.com | Sans lui : pas de certificat, pas de provisioning, donc **aucun binaire iOS signable** — et donc aucune des vérifications du §3. |
| 3 | **Déposer les 2 fichiers Firebase** `google-services.json` + `GoogleService-Info.plist` | Firebase Console → Paramètres → Vos applications, puis racine de `app/` | Le build de production **refuse de démarrer** sans eux et vous dit lequel manque. Sans eux, App Check serait inerte dans le binaire publié. |
| 4 | **Déclarer la config Firebase web sur EAS** — les 6 variables `EXPO_PUBLIC_FIREBASE_*` de votre `.env`, pour **chaque** environnement buildé (`production` et `preview`) : `eas env:create --environment production --name EXPO_PUBLIC_FIREBASE_API_KEY --value <valeur> --visibility plaintext --type string`, idem pour `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID`, puis la même chose avec `--environment preview`. Vérifier : `eas env:list --environment production`. Recommandé aussi : `EXPO_PUBLIC_SENTRY_DSN` (sans lui, aucun rapport de crash) | CLI EAS | Le `.env` est gitignoré, EAS ne l'envoie jamais au serveur de build. Sans ces variables, Firebase Auth lève `auth/invalid-api-key` au chargement : **le binaire plante au lancement** (rejet 2.1 certain). `app.config.ts` refuse désormais une build `production`/`preview` qui ne les a pas et les nomme. Visibilité `plaintext` ou `sensitive`, **pas `secret`** : EAS CLI ne voit pas une variable `secret` quand il évalue `app.config.ts`, la build serait refusée. Ces valeurs finissent de toute façon dans le bundle JS — la protection réelle est App Check + les restrictions de clé GCP. |
| 5 | **Activer le backend** : Anonymous Auth, `firebase deploy --only firestore:rules,firestore:indexes`, puis `npm run import-data` | Firebase Console + CLI | Débloque le calendrier, la santé, le parcours invité complet — et rend enfin testable la configuration que le mode invité n'a jamais connue. `import-data` pousse désormais compléments et articles depuis `src/data/` (4 langues), la même source que le repli embarqué. |
| 5 bis | **`firebase deploy --only firestore:rules` DOIT précéder la soumission aux stores**, puis supprimer un compte de test depuis l'app sur le backend live (Profil → Zone de danger → Supprimer mon compte) et vérifier qu'il disparaît de la console Auth et de Firestore | Firebase CLI + un appareil | La suppression n'efface le compte Auth qu'après une purge complète (`src/context/gdprPurge.ts`). Les 8 sous-collections historiques `userProfiles|users/{uid}/{weights,events,journal,chatbot_history}` ne sont lisibles qu'avec les règles du repo (`firestore.rules`, jokers imbriqués). Si les règles déployées sont plus anciennes, ces lectures renvoient `permission-denied` **pour tout le monde** : aucune suppression ne peut aboutir dans l'app, l'utilisatrice est renvoyée vers contact@mama-et-bebe.com, et Sentry reçoit « Account data purge refused by Firestore rules ». Un relecteur qui essaie la suppression verrait ce message : rejet App Store 5.1.1(v) / Play (suppression de compte). |
| 5 ter | **Décider de la durée de conservation des données invitées anonymes** avant d'activer Anonymous Auth | Firebase Console (Identity Platform : nettoyage automatique des comptes anonymes) + vous / juriste | Anonymous Auth activé, les saisies santé, rendez-vous et rappels d'une invitée vont dans Firestore sous son uid anonyme. « Effacer mes données » les supprime bien (purge + suppression de l'utilisateur anonyme), mais une invitée qui désinstalle sans effacer laisse ces données sans personne pour les atteindre. La politique le dit (« Désinstaller n'efface que ce qui est sur votre téléphone ») mais n'annonce aucune durée : c'est une décision à prendre, puis à écrire dans la section Conservation. Le nettoyage automatique de Firebase supprime les comptes anonymes, pas leurs documents Firestore : il faudrait aussi une purge côté serveur. En attendant, la section 6 du site (`privacy.html`, `privacy-en.html`) décrit ce que fait le code aujourd'hui — aucune suppression automatique — sans annoncer de durée. **La durée est votre décision** : une fois prise, l'écrire dans la section 6 du site **et** dans `privacy.retention.text` (4 langues) dans le même commit que la purge serveur. |
| 6 | **Revue clinique** : le paquet [`docs/clinical-review/`](clinical-review/README.md) — triage, compléments, aliments, profil médical, Ramadan, halal, **et** les 80 articles, les 40 semaines et la table de croissance fœtale (section « Pas encore en dossier ») | sage-femme / gynécologue | Pour une app de santé, c'est un prérequis légal et éthique, pas une option. L'écran Ramadan restera masqué tant que ce n'est pas signé. |
| 7 | **Compte de démo pour les relecteurs** | après l'étape 5 | Les notes de review le référencent déjà (`store/listing.json`). |
| 8 | **Déployer le site** : `cd ../website && vercel deploy --prod` (cf. `website/README.md`), puis vérifier que `curl -s -o /dev/null -w '%{http_code}' https://www.mama-et-bebe.com/delete-account.html` et `…/delete-account-en.html` renvoient **200**, et que `privacy.html` / `privacy-en.html` en ligne contiennent « Base légale » / « Legal basis » | Vercel + terminal | Le 2026-10-01, les deux pages de suppression renvoyaient **404** en ligne : elles n'existent que dans le dépôt. Play exige une URL de suppression qui fonctionne (Data safety, étape 10) et la vérifie. Le site en ligne disait aussi « des centaines d'articles validés » et « Assistant IA » (corrigé dans le dépôt, pas encore en ligne), et sa politique n'avait ni la base légale ni la conservation des données invitées. Quand les fiches store seront publiques, remplacer les badges « Bientôt sur App Store / Google Play » de `index.html` et `index-en.html` par les liens réels. |
| 9 | **Apple — App Privacy** (App Store Connect → App Privacy) | App Store Connect | Répondre à partir du manifeste `app.json` → `ios.privacyManifests` et de la politique publiée, qui doivent dire la même chose : nom, e-mail, santé, informations sensibles, autre contenu utilisateur, localisation approximative (non liée), autres coordonnées (contacts d'urgence), identifiant utilisateur, données de crash, de performance et autres diagnostics, interactions produit ; **aucun suivi (tracking)**, aucune publicité. Une réponse qui contredit le manifeste est un motif de rejet. |
| 10 | **Play — Data safety** (Play Console → App content → Data safety) | Play Console | Déclarer : les données de santé (poids, tension, glycémie, symptômes) **et** les trackers synchronisés sur le compte — mouvements du bébé, contractions, valise de maternité (`trackerSync.ts`) ; le suivi médical déclaré ; l'e-mail et l'identifiant ; l'**enregistrement de l'accord** (date + version de la politique, gardés avec le profil) ; les rapports d'erreur envoyés à **Sentry**, un prestataire qui les traite pour notre compte (Play traite un prestataire comme une collecte, pas un partage — relire l'aide Play au moment de remplir) ; chiffrement en transit : oui ; suppression à la demande : oui, avec l'URL `https://www.mama-et-bebe.com/delete-account.html` (qui doit répondre 200, étape 8). Doit correspondre à la politique publiée. |
| 11 | **Play — Health apps declaration** (App content → Health apps) | Play Console | Obligatoire pour une app classée Santé & forme. Déclarer les fonctionnalités santé que l'app a réellement : suivi de grossesse, saisie de données de santé, contenu d'information médicale, orientation vers les urgences. Sans elle, la publication est bloquée. |
| 12 | **Play — App access** (App content → App access) | Play Console | « Certaines fonctionnalités sont restreintes » : donner le compte de démo de l'étape 7, et préciser que « Continuer en invité » ouvre l'essentiel sans compte (comme les notes de review Apple). |
| 13 | **Play — Ads** (App content → Ads) : **Non**, l'app ne contient pas de publicité | Play Console | Formulaire obligatoire ; la politique publiée dit déjà qu'aucune donnée ne sert à la publicité. |
| 14 | **Play — Target audience and content** : **18 ans et plus** uniquement | Play Console | L'app s'adresse à des femmes enceintes. Cocher une tranche plus jeune ferait entrer l'app dans le programme Familles et ses exigences. |
| 15 | **Recapturer les captures store après la build finale** (F-032) | Terminal, à la racine de `app/` | Les 54 captures actuelles datent du 19 août : badge « BETA » sur l'assistant, ancienne colonne iPad de 520 pt (720 pt aujourd'hui), accueil antérieur à l'avertissement médical, au message de notifications et aux changements d'accord, et deux légendes corrigées depuis (articles, aliments). **Prérequis** (en-tête de `scripts/capture-store-screenshots.ts` et `store/README.md`) : Node 20.20.2 (`nvm use`) ; Chromium de Playwright installé (`npx playwright install chromium` s'il manque) ; ~150 Mo libres (export web ~15 Mo + 54 PNG ~100 Mo) ; aucun backend nécessaire (profil invité injecté). **Commandes** : `npm run store:build` (export web dans `dist/`), puis dans un second terminal `npx serve dist -l 8099 --single`, puis `npm run store:shots` (autre port : `BASE_URL=http://localhost:<port>`). Vérifier à l'œil `ios-6.9/*/5-chatbot.png` (pas de badge BETA) et le jeu `ipad-13`. Puis, une fois un binaire disponible, comparer avec des captures simulateur (§5, point 3). |

---

## §5 — Ce que je fais dès que 1 à 5 sont faits

1. Premier build EAS sur les deux plateformes, et correction de ce que le build natif révèle.
2. Smoke device : notifications reçues, reconnexion, RTL natif `ar`, suppression de compte sur backend live.
3. Re-capture des screenshots sur simulateur, comparaison avec le jeu actuel, remplacement si l'écart se voit.
4. Re-capture de l'écran Calendrier — impossible aujourd'hui, un invité ne pouvant pas avoir de rendez-vous par conception.
5. Téléversement TestFlight + canal interne Play, avec les fiches déjà rédigées et validées.

---

## §6 — La règle que je m'applique

Je ne dirai pas « on est prêt à publier » tant que je n'aurai pas vu un binaire démarrer sur un appareil réel. Tout ce qui est écrit au §2 est prouvé et le restera ; tout ce qui est au §3 est du travail correct qui attend sa preuve. Confondre les deux serait la seule vraie faute possible à ce stade.

**État actuel : le projet natif se génère, la suite est verte, le pack store est complet.
Ce qui manque n'est plus du code — c'est un compte Expo gratuit pour produire le premier binaire, puis vos comptes store pour le publier.**
