# Audit AR / parcours invité / sécurité — 2026-08-07

Branche `feat/interaction-ux-2026-06-18`, base `a2eb408`.
Méthode : pilotage réel de l'app dans le navigateur (mode invité, langue arabe) +
audit statique + sous-agents adversariaux, chaque constat vérifié à la main avant
correction.

---

## 1. Ce qui bloquait l'utilisateur (reproduit en direct)

| # | Symptôme rapporté | Cause racine réelle | Fichier |
|---|---|---|---|
| A | « J'arrive pas à remplir le formulaire de création de compte » | `<Pressable onPress={Keyboard.dismiss}>` enveloppait le ScrollView. Sur react-native-web le responder de Pressable appelle `preventDefault()` sur pointer-down, ce qui annule le focus par défaut de l'`<input>` sous-jacent. Chaque tap laissait `document.activeElement` sur `<body>` → **Connexion ET Inscription intypables**. Le focus programmatique fonctionnait, d'où l'absence de détection par les tests et sur natif. | `LoginScreen.tsx`, `RegisterScreen.tsx` → `components/common/DismissKeyboardView.tsx` |
| B | « Il m'a demandé de créer un compte mais m'a pas redirigé » | `upgradeMode` lu avec `=== true`. La route est deep-linkable et React Navigation reconstruit les params depuis l'URL en livrant la **chaîne** `"true"`. L'écran partait donc dans la branche inscription-fraîche : `register()` au lieu de `upgradeGuest()`, puis `navigate('Onboarding')` — route absente de HomeStack → action ignorée, écran figé, compte créé en silence. Second essai : « email déjà utilisé ». | `RegisterScreen.tsx` |
| C | « Sur Calendrier je voulais ajouter un truc » | Le FAB n'était pas gated : l'invité remplissait tout le formulaire et n'était bloqué qu'au « Enregistrer », **saisie perdue**. Le chemin web utilisait un `window.confirm` brut, incapable d'afficher le libellé localisé du bouton. La branche « pas d'uid » était un cul-de-sac sans issue. | `AddAppointmentScreen.tsx` |

Correctifs : wrapper no-op sur web, parsing robuste du flag + garde `routeNames`,
bannière invité en amont du formulaire, brouillon persisté 24 h et restauré après
création du compte, `confirmAction` localisé partout.

---

## 2. Arabe / RTL — 3 causes racines, pas des retouches

1. **Styles logiques non miroités sur web.** react-native-web 0.21 compile
   `marginStart/End`, `paddingStart/End` et `start/end` en CSS **physique**
   (`marginEnd:16` → `margin-right:16px`). Le miroir a lieu au rendu dans
   `localizeStyle(style, isRTL)`, où `isRTL` vient de
   `props.dir || LocaleContext.direction` (défaut `ltr`). Ni `I18nManager`
   (volontairement non forcé sur web) ni `<html dir="rtl">` n'alimentent ce
   contexte → les 120+ usages de styles logiques restaient côté LTR.
   *Fix* : `LocaleProvider` de RN-Web, en `.web.tsx` (natif inchangé).
2. **Double retournement des chevrons.** `‹ › ❮ ❯` sont des caractères
   **Bidi_Mirrored** : le moteur de texte les retourne déjà en contexte RTL, en
   plus du swap de `resolveChevronGlyph`. Les deux flips s'annulaient → toutes
   les flèches à l'envers en arabe. (`→ ←` et `▶ ◀` ne sont pas miroités, d'où
   les variantes qui semblaient correctes.)
   *Fix* : isolat LTR `U+2066…U+2069` autour du glyphe.
3. **Flèches codées en dur dans les traductions.** `onboarding.{editInfos,back,changeWeek}`
   et `reminders.viewAll` pointaient du mauvais côté en ar/tn.

Divers : badge ✓ du sélecteur de langue en `position:absolute; right:20` (chevauchait
le drapeau), flèche retour de React Navigation non miroitée (`direction` prop),
`dir="auto"` de RN-Web résolvant en `ltr` sur les Text purement emoji.

**Parité i18n** : 0 clé manquante sur ar/tn/en (1513 clés), 0 chaîne française
codée en dur dans le JSX. Le contenu arabe était déjà complet — le problème
était bien le RTL.

---

## 3. L'arabe n'était pas réellement testé

`e2e/auth-onboarding-lang-audit.spec.ts` sélectionnait les cartes de langue par
emoji drapeau puis par index. Le commit `bef5be3` (2026-06-19) a remplacé le 🇩🇿
de la carte arabe par un 🌍 neutre : depuis, la regex ne matchait plus que
**trois** cartes et tous les index avaient glissé —

- `en` (index 3) → élément inexistant → timeout 120 s
- `tn` (index 2) → cliquait English → `dir=rtl` attendu, `ltr` obtenu
- `ar` (index 1) → **cliquait la carte tunisienne et passait au vert**, les deux
  étant RTL avec le même texte arabe

L'arabe — la locale la plus problématique — n'avait donc **aucune couverture E2E
réelle depuis sept semaines**, pendant que la suite affichait vert.
*Fix* : sélection par `data-testid="lang_card_<code>"`.

---

## 4. Sécurité

### Corrigé dans le code

| Sévérité | Constat | Vérification |
|---|---|---|
| **P0** | **ReDoS sur le chemin de triage d'urgence obstétricale.** La regex de négation « rupture des membranes » utilisait `([^a-zà-ÿ]+\w+){0,3}`, dont les deux classes se recouvrent sur les chiffres et `_` → backtracking exponentiel. | Mesuré sur la regex exacte : `" not " + "_"×60` = 1,6 s, ×80 = 12,5 s, ×100 = **63 s** de thread JS bloqué (kill watchdog iOS). Atteignable depuis le chatbot (limite 500 caractères). Après fix : **1 ms**, et 2000 caractères restent à 1 ms. 182 tests de triage verts, langage accepté inchangé. |
| **P0** | **Politique de confidentialité inaccessible une fois connecté** (blocage App Store). `AuthStack` et `MainTabs` sont mutuellement exclusifs et l'écran n'était enregistré que dans AuthStack → liens morts dans Réglages, Profil et le formulaire d'inscription. Le seul avertissement médical de l'app y réside aussi. | Constaté en direct : clic sans effet. |
| **P1** | **Purge RGPD Art.17 silencieusement inopérante.** En `rules_version 2`, `match /userProfiles/{userId}` ne couvre **pas** les sous-collections. Chaque lecture de `userProfiles/{uid}/{weights,events,journal,chatbot_history}` était refusée, avalée par le `catch` et rétrogradée en `log.warn` → « supprimer mon compte » renvoyait un succès pendant que les données de santé héritées survivaient. `users/{uid}` n'était pas balayé du tout. | Règles corrigées + `firebase deploy --dry-run` : **compilation réussie**. 2 tests de non-régression ajoutés. |
| **P1** | **UID Firebase brut envoyé à Sentry.** `log.error` est le seul niveau non gated par `__DEV__` et ses arguments partent vers Sentry tels quels, ce qui annulait le hachage SHA-256 délibéré de `logger.setUser()`. | Test asserte désormais que l'uid n'apparaît jamais. |
| **P1** | **Champs libres non bornés vers Firestore.** `firstName`/`lastName` sans `maxLength`, `validateProfile` jamais appelé sur l'écran d'édition. Taille/poids bornés uniquement par `maxLength` (999 cm, 99999 kg alimentaient l'IMC). Nom de contact d'urgence non borné, tableau sans plafond. | Bornes client + serveur (règles), plage alignée sur WeightTracker (100-250 cm / 30-200 kg), 10 contacts max. |
| **P2** | **Écran Diagnostic livré en production** : l'entrée du menu était gated `__DEV__` mais l'écran restait enregistré et deep-linkable à `/diagnostic`. | Enregistrement et deep link désormais `__DEV__`. |
| **P2** | `NSMotionUsageDescription` déclarait une capacité jamais utilisée (aucun consommateur CoreMotion). | Retiré. |
| **P2** | `SupplementDetailScreen` affichait des posologies et une pastille verte « sans risque » **sans avertissement médical** — seule surface de ce type sans disclaimer. | Ajouté dans les 4 langues. |

### Nettoyage

33 scripts orphelins d'un projet sans rapport (avis Google / proxies) supprimés :
leurs imports (`./server/db`, `./server/services/proxy.service`) pointent dans le
vide, aucun n'est référencé par `package.json`, et **onze portaient des
identifiants ou une configuration proxy en clair**. 28 artefacts de build
(`dist-dev/`, `dist-r3/`) retirés du suivi git.

### ⚠️ Actions opérateur — obligatoires, hors de ma portée

1. **Révoquer les identifiants proxy Bright Data.** Le dépôt
   `github.com/loeymot-sketch/pre2000` est **public** (vérifié) et les fichiers
   étaient suivis par git. La suppression ne défait pas l'exposition :
   l'historique reste public. Rotation impérative.
2. **Activer Anonymous Auth** (Firebase Console → Authentication). Console
   observée : `auth/admin-restricted-operation`. Conséquence mesurée : l'invité
   n'obtient pas d'UID Firebase, donc toutes les lectures Firestore échouent
   (`tipsService`, `babyMessageService`, semaine en cours) — le mode invité est
   une coquille vide.
3. **Déployer les règles Firestore** : `firebase deploy --only firestore:rules`
   (la correction RGPD n'a d'effet qu'une fois déployée).
4. **Restreindre la clé API GCP.** La clé web Firebase est publique par
   conception, mais elle est aussi une clé Google Cloud et apparaît dans deux
   documents versionnés. Sans restriction d'API/référent, elle est utilisable
   pour d'autres services Google facturés.
5. **Câbler `ios.googleServicesFile`** dans `app.json` : absent alors que
   `android.googleServicesFile` est présent → App Check inerte sur iOS.

---

## 5. Gate de vérification

- `npm run verify` : **73 suites / 1913 tests** ✅ (lint couleurs + `tsc --noEmit` + Jest)
- Playwright E2E : **38/38** ✅ (run isolé, 10,5 min — 4 langues × 5 onglets)
- `firebase deploy --only firestore:rules --dry-run` : compilation réussie ✅
- Parité i18n : 0 clé manquante ar/tn/en ✅

## 6. Commits

```
87423b2 fix(AR/RTL): mirror logical styles on web + un-collide language checkmark
e04e047 fix(AR/RTL): stop chevron double-flip, mirror nav back arrow, fix arrow glyphs
187fdb5 fix(auth,guest,security): unblock signup form, fix guest-upgrade route, kill chatbot ReDoS, restore privacy policy
65ab3de fix(home): give the empty Home state a way out instead of stranding the user
b06fd59 test(e2e): fix language-card selection — the "ar" test was exercising the TN card
50a3d7b fix(security,a11y,i18n): close GDPR purge no-op, PII leak, unbounded inputs; remove orphan credential scripts
```

## 7. Reste ouvert

- Contenu **TN** (beta) : suppléments et aliments interdits complétés (15 et 19
  entrées), mais la formulation Derja n'a pas été relue par un locuteur natif.
  Les règles de pluriel `tn` sont désormais alignées sur l'arabe — décision
  réversible en une ligne (`src/i18n/index.ts`) si un relecteur natif tranche
  autrement.
- `showAlert` utilise `window.alert`/`window.confirm` sur web (bloquants). Le
  double dialogue est corrigé, mais une vraie version web devrait router ces
  appels vers la modale interne.
