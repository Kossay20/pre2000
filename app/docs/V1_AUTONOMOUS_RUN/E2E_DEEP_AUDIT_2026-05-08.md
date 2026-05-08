# E2E Deep Audit — 2026-05-08

**Reviewer**: Claude (auto)
**Branch**: main @ 88c1dae
**Method**: Playwright MCP + grep code-trace (file:line) + 6-rôles GSTACK
**Scope**: web preview (Expo SDK 54), viewport iPhone-12 (390×844), tablet (768×1024), desktop (1440×900), iPhone SE (320×568)
**Parcours testé** : Language → AuthChoice → Register (validation) → Onboarding 4 steps (guest) → HomeMain → Calendar → Reminders → Resources → Chatbot (red-flag triage)

---

## 0 · Executive summary

| Sévérité | Total | Bloquants release |
|---|---|---|
| 🔴 P0 (bug fonctionnel) | 6 | 4 |
| 🟠 P1 (UX/A11y impactant) | 11 | 3 |
| 🟡 P2 (qualité code, deprecation) | 9 | 0 |
| 🟢 P3 (nice-to-have) | 5 | 0 |

**Verdict** : ❌ **NOT SHIP-READY**. Quatre bloquants : (i) anonymous auth Firebase 400 → erreur boundary à l'Accueil, (ii) clé i18n brute affichée à l'utilisateur, (iii) tabs cumulent dans le DOM (3-4 H1 simultanés), (iv) règles mot de passe contradictoires sur 3 écrans.

---

## 1 · 🔴 P0 — Bloquants release

### P0-1 · Anonymous auth Firebase échoue, ErrorBoundary s'affiche à l'Accueil
**Preuve** : console `accounts:signUp` HTTP 400, puis `Missing or insufficient permissions` (babyMessageService, tipsService).
**File:line** : règles côté Firebase Console (CLAUDE.md §6 action #2 toujours pendante).
**Reasoning** : le bouton "Continuer en invité" tente `signInAnonymously()`. Si Anonymous Auth n'est pas activé, signUp renvoie 400 → toutes les requêtes Firestore qui suivent échouent → l'Accueil boot en mode dégradé, l'écran d'erreur global s'affiche au lieu du Home. **L'utilisateur n'a aucun moyen de comprendre ce qui se passe.**
**Fix** : (1) activer Anonymous Auth en console, (2) afficher un message contextuel (« Mode invité indisponible ») au lieu de l'ErrorBoundary générique, (3) côté code : ne pas tenter le query si `auth.currentUser === null` au lieu de laisser remonter l'erreur Firestore.

### P0-2 · `errors.emailRequired` affiché en clair à l'utilisateur
**Preuve** : sur Register, submit vide → snapshot affiche `⚠️ errors.emailRequired`.
**File:line** : `src/utils/validation.ts:21` retourne `error: 'errors.emailRequired'` ; la clé existe dans `src/i18n/locales/fr/auth.json:53` sous le namespace `auth.errors.emailRequired`. Le call `t('errors.emailRequired')` dans `RegisterScreen.tsx:73` cherche la clé dans le namespace par défaut (probablement `common`) → fallback : on rend la clé brute.
**Reasoning** : i18next n'a pas trouvé de namespace `errors`, n'a pas de fallback configuré, donc le t() retourne la string brute. Trois niveaux de défense ont raté : (a) pas de test snapshot pour les états d'erreur (b) le linting i18n n'a pas levé la clé manquante (c) `defaultValue` non passé à t(). Le `validation.test.ts` couvre les retours mais pas leur traduction.
**Fix** :
- court : `src/utils/validation.ts:21` → `error: 'auth:errors.emailRequired'` (préfixe namespace) ; idem pour `passwordRequired`, `passwordLength`, `passwordTooLong`, `passwordMismatch`, `passwordComplexity`, `passwordUppercase`.
- long : ajouter test e2e Playwright sur cas validation vide pour les 4 langues.

### P0-3 · Tab navigator empile les écrans dans le DOM (3-4 H1 simultanés)
**Preuve** : `browser_evaluate` retourne `h1Count: 3` puis `4` au fil des clics tabs (`Calendrier`, `Rappels`, `Ressources`, ...). Snapshots successifs montrent `region "Oups !"` qui persiste cross-tab et headings empilés.
**File:line** : `App.tsx:163` `<Tab.Navigator detachInactiveScreens …>`. La prop `detachInactiveScreens` n'a aucun effet sur `react-native-web` (elle dépend de `react-native-screens`, native uniquement).
**Reasoning** : sur web RN-Web monte tous les écrans une fois visités et les laisse dans le DOM (display:none ou opacity:0). Impacts : (i) **a11y catastrophe** — `axe-core` faillirait sur duplicate-h1, lecteurs d'écran annoncent du contenu fantôme ; (ii) **fuites mémoire** : timers, listeners Firestore et abonnements `useEffect` continuent de tourner sur les écrans non-visibles ; (iii) **état pollué** — l'ErrorBoundary affichée sur Home reste rendue sur Calendrier/Rappels/Ressources/Chatbot.
**Fix** : `unmountOnBlur: true` au niveau `screenOptions` du Tab.Navigator (option officielle bottom-tabs v7), OU englober chaque écran dans un wrapper qui retourne `null` quand `useIsFocused() === false`. Validation : `h1Count` doit retomber à 1 après le fix.

### P0-4 · Règles mot de passe contradictoires (3 écrans, 3 règles différentes)
**Preuve trois sources** :
| Écran | Texte affiché | Règle |
|---|---|---|
| Register placeholder | `Mot de passe (8 car. min + 1 chiffre)` | 8+1 chiffre |
| Register helper | `Min. 10 caractères` | 10+ |
| Onboarding step 4 | `Mot de passe (min. 6 caractères)` | 6+ |
| `validation.ts` réelle | 10 chars + 1 digit + 1 uppercase | 10+1d+1U |

**File:line** :
- `src/screens/RegisterScreen.tsx:62` : `'Min. 10 caractères'` (defaultValue)
- `src/screens/RegisterScreen.tsx` placeholder password (à grepper) : `'8 car. min + 1 chiffre'`
- `src/screens/OnboardingScreen.tsx` : `'Mot de passe (min. 6 caractères)'`
- `src/utils/validation.ts:47` : règle réelle = 10/100/digit/upper

**Reasoning** : trois auteurs/cycles successifs ont touché ces strings sans synchroniser. La règle "1 majuscule" n'est mentionnée nulle part dans l'UI → l'utilisateur soumet un mdp 12 chars+digit (passes le placeholder) et reçoit un rejet sans préfixe → frustration garantie. Onboarding step 4 est encore pire : 6 chars créerait un mdp invalide qui passerait Onboarding mais serait refusé après par Register/Firebase.

**Fix** : centraliser une constante `PASSWORD_HINT` (i18n) calquée sur la règle de `validation.ts`, l'utiliser partout. Idéalement extraire `validatePassword` règles dans un objet partagé.

### P0-5 · `Updates.reloadAsync` levé en dev → CodedError répété
**Preuve** : console `[ERROR] CodedError: You cannot use the Updates module in development mode in a production app. … at Object.reloadAsync … i18n/rtl.ts`.
**File:line** : `src/i18n/rtl.ts:26` (et `:25` setTimeout), appelé depuis `setupRTL` quand `I18nManager.isRTL` ne matche pas.
**Reasoning** : en dev, `expo-updates` n'est pas chargé en mode prod, le `reloadAsync` throw. La regex anti-loop empêche la boucle, mais l'erreur remonte quand même car aucun guard `if (!__DEV__) {...}` ou `Constants.appOwnership === 'expo'`. Sur le fond, `reloadAsync` n'est pas idéal sur web — il fait un full hard reload ce qui détruit le store, AsyncStorage flushed, chatbot history perdu.
**Fix** : guard `if (!__DEV__ && Platform.OS !== 'web') { … reloadAsync }`. Sur web, utiliser `window.location.reload()`. En dev, juste log + `i18n.reloadResources()`.

### P0-6 · Onboarding step 4 affiche bouton "Créer mon compte & Démarrer" sans rôle button
**Preuve** : snapshot `e191` = `generic` (cursor:default, pas pointer), rendu avec `Continuer sans compte` (e193 generic[cursor=pointer]) et `← Modifier mes infos` (e195 generic[cursor=pointer]).
**File:line** : `src/screens/OnboardingScreen.tsx` autour du final summary view.
**Reasoning** : sans `accessibilityRole="button"` ni `<Pressable>` → impossible d'atteindre le bouton au clavier (pas focusable), invisible aux lecteurs d'écran, et `e191` n'a même pas `cursor:pointer`. Le test E2E n'a pas pu cliquer dessus de manière déterministe.
**Fix** : remplacer par `TouchableOpacity` ou `Pressable` avec `accessibilityRole="button"` et `accessibilityLabel`.

---

## 2 · 🟠 P1 — UX & a11y (impactant mais non-bloquant strict)

### P1-1 · Title HTML non-localisé pour la majorité des écrans
**Preuve** : `Page Title: Language` (au lieu de "Choisir la langue / Choose language"), `AuthChoice` (au lieu de "Bienvenue"), `HomeMain`, `CalendarMain`, `RemindersMain/RemindersTab`. Le seul écran correctement intitulé : `Créer un compte`.
**Reasoning** : l'auto-titling Expo Router remonte le nom de route brut. Bad SEO, bad share-link UX (l'URL apparaît dans l'historique navigateur sans contexte).
**Fix** : sur chaque screen, `<head><title>{t('screen.X')}</title></head>` via `expo-router` Head ou `useDocumentTitle` hook custom.

### P1-2 · `<html lang>` figé sur "en" même en français
**Preuve** : `evaluate` retourne `htmlLang: "en"` alors que tout le contenu est FR.
**Reasoning** : aucun code ne sync `document.documentElement.lang = i18n.language` au boot. Impact : extensions de traduction auto (Google) suggèrent à tort "translate from English". Affecte aussi le hyphenation, lecteurs d'écran (voix EN sur texte FR).
**Fix** : dans `i18n/index.ts` après init + dans le listener `languageChanged`, si `Platform.OS === 'web'` : `document.documentElement.lang = lng; document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';`.

### P1-3 · Aucun moyen de changer la langue depuis l'app après onboarding
**Preuve** : naviguer manuellement vers `/Language` redirige vers `/HomeMain`. Pas de bouton dans la nav, pas de Profile screen accessible depuis tab bar.
**Reasoning** : 4 langues annoncées (FR/EN/AR/TN) mais switcher uniquement au premier launch → impossible de réessayer en TN si on s'est trompé. `LanguageSelector.tsx` existe (`src/components/common/LanguageSelector.tsx`) mais n'est branché qu'à `LanguageSelectScreen` et `ProfileScreen`.
**Fix** : ajouter un 6e tab "Profil" ou un bouton header global donnant accès à Profile (qui contient le LanguageSelector).

### P1-4 · Inputs sans label associé / autocomplete générique
**Preuve** : `evaluate` sur Register :
```
[{type:"email", placeholder:"votre@email.com", autocomplete:"on", aria-label:null, id:"", required:false},
 {type:"password", autocomplete:"on", ...},
 {type:"password", autocomplete:"on", ...}]
```
**Reasoning** : (a) `autocomplete="on"` est générique → password manager ne propose pas correctement la création (devrait être `new-password` pour le second et confirm). (b) pas d'`aria-label`, pas de `<label for>`, l'utilisateur lecteur d'écran entend "edit text" sans contexte. (c) `required` absent = pas de fallback navigateur.
**Fix** sur `RegisterScreen.tsx` (et `LoginScreen.tsx`, `OnboardingScreen.tsx` step 4) : passer `textContentType="emailAddress" / "newPassword" / "newPassword"`, `accessibilityLabel={t('email')}`, `autoComplete="email" / "new-password" / "new-password"`. Sur RNWeb cela génère le bon `autocomplete` HTML.

### P1-5 · Tab labels dupliquent l'emoji (snapshot tab "🏠 🏠 Accueil")
**Preuve** : `tab "🏠 🏠 Accueil"` ; structure `tab > generic > generic:🏠 + generic:🏠 + generic:Accueil`.
**File:line** : `App.tsx:172-180` — `tabBarIcon` rend `<Text style={{fontSize:size}}>{iconName}</Text>`. RNWeb wrap le `<Text>` avec un span qui a aussi `aria-label` ou un span dupliqué au DOM web (souvent dû à `accessibilityRole="text"` qui réémet le contenu).
**Reasoning** : avant production, soit (a) remplacer les emoji par de vraies icônes vector (`@expo/vector-icons` est déjà installé) → résout aussi l'a11y label, soit (b) wrapper le Text dans `<View accessible={false}>` pour exclure du tree.
**Fix** : `<MaterialCommunityIcons name="home" />` etc., et `tabBarLabel` reste textuel.

### P1-6 · ErrorBoundary fallback non-actionnable
**Preuve** : "Oups ! Une petite erreur est survenue. Pas de panique, vos données sont en sécurité." + bouton Réessayer qui ne semble pas relancer la fetch (l'erreur est résiduelle).
**Reasoning** : message rassurant mais sans action utile. L'utilisateur devrait pouvoir : (a) voir un identifiant d'erreur pour le support, (b) signaler le problème, (c) revenir à l'accueil propre. Et le bouton Réessayer doit faire un `errorBoundary.reset()` + retry de la query qui a planté.
**Fix** : `src/components/ErrorBoundary.tsx` (à confirmer) — afficher l'errorId Sentry + button "Contacter le support".

### P1-7 · Date par défaut Onboarding step 2 = aujourd'hui → résultat "Semaine 1, 0 SA + 1 jours" absurde
**Preuve** : input prefilled `2026-05-08` (today), résultat affiché : `Semaine 1, Soit 0 SA + 1 jours`.
**Reasoning** : 0 SA est mathématiquement valide mais l'UX est confuse — la majorité des grossesses arrivent ici à 4-12 SA. Le placeholder "today" sous-entend que l'utilisateur a encore ses règles aujourd'hui. Mieux : pas de pré-remplissage + placeholder "JJ/MM/AAAA" + bouton "Sélectionner".
**Fix** : `src/screens/OnboardingScreen.tsx` step 2 — `value={lastPeriodDate ?? null}` + helper text "Date de vos dernières règles (DDR)".

### P1-8 · Onboarding step 3 — "Je préfère ne pas dire" rendu comme texte cliquable, pas comme bouton
**Preuve** : snapshot `generic [ref=e167] [cursor=pointer]: Je préfère ne pas dire` (pas `button`).
**Fix** : ajouter `accessibilityRole="button"` au `Pressable` underlying.

### P1-9 · Police par défaut "Times" (Inter non chargée)
**Preuve** : `getComputedStyle(body).fontFamily === "Times"`.
**Reasoning** : la stack design parle de Inter/SF mais la fallback est encore le Times serif system. Soit la font ne load pas (CSP, manifest), soit aucune `@font-face` sur web n'a été configurée. Impact branding immédiat.
**Fix** : ajouter `@font-face` Inter dans `index.html` template ou via `expo-font` `loadAsync`. Vérifier que la chaîne `fontFamily` s'applique au `body`.

### P1-10 · Bouton "← Modifier mes infos" en step 4 → si cliqué, perd l'état déjà saisi ?
**Preuve** : non testé totalement (générique, n'a pas pu valider qu'il reset ou réhydrate).
**Reasoning à instrumenter** : revenir à step 3 doit conserver pseudo/age/pays (sinon UX cassée).

### P1-11 · Two back-buttons sur Register (header link "AuthChoice, back" + bouton "←" dans le content)
**Preuve** : snapshot `link "AuthChoice, back" [ref=e79]` + `button "←" [ref=e88]`.
**Fix** : `src/screens/RegisterScreen.tsx:114-121` — supprimer le bouton custom et utiliser uniquement le header navigation (déjà fourni par expo-router/navigation).

---

## 3 · 🟡 P2 — Qualité code & deprecations

### P2-1 · Require cycle `i18n/index.ts ↔ i18n/rtl.ts` + `Cannot read properties of undefined (reading 'isInitialized')`
**Preuve console** : `Require cycle: src/i18n/index.ts -> src/i18n/rtl.ts -> src/i18n/index.ts` puis `[i18n] Failed to register RTL listener: TypeError: Cannot read properties of undefined (reading 'isInitialized')`.
**Fix** : extraire les helpers RTL dans un module pur (sans import `i18n` lui-même), passer `i18n` en argument à `registerRTLListener(i18nInstance)`.

### P2-2 · 169 occurrences de `shadowOpacity / shadowOffset / shadowRadius / shadowColor`
**Preuve** : `grep -rn "shadow*" src/ | wc -l` = 169. Console warning RNWeb : `"shadow*" style props are deprecated. Use "boxShadow"`.
**Fix** : migration scriptable — créer `src/styles/shadows.ts` avec presets `boxShadow` (et fallback shadow* pour iOS<14 si nécessaire).

### P2-3 · `TouchableWithoutFeedback` deprecated (Register, Login)
**File** : `RegisterScreen.tsx:108-257`, `LoginScreen.tsx:123-...`.
**Fix** : remplacer par `<Pressable onPress={Keyboard.dismiss}>`.

### P2-4 · `props.pointerEvents` deprecated, utiliser `style.pointerEvents`
**Preuve** : warning console.
**Fix** : grep `pointerEvents=` dans tous les composants, déplacer dans `style`.

### P2-5 · Firebase namespaced API deprecated (v22 migration)
**Preuve** : warning `Please see migration guide for more details: https://rnfirebase.io/migrating-to-v22 Please use 'getApps()' instead.`
**Fix** : migration globale vers le modular SDK (`getApp`, `getAuth`, `getFirestore`).

### P2-6 · `expo-notifications` listener no-op sur web (warning silencieux)
**Preuve** : `[expo-notifications] Listening to push token changes is not yet fully supported on web. Adding a listener will have no effect.`
**Fix** : guard `if (Platform.OS !== 'web')` autour de `addPushTokenListener`.

### P2-7 · Articles "recommandés" du red-flag chatbot non-pertinents
**Preuve** : pour "Je saigne un peu" → articles recommandés = "Examens médicaux pendant la grossesse" et "Grossesses multiples". Aucune relation avec saignement.
**Reasoning** : map `keyword → articleIds` partielle ou fallback générique.
**Fix** : enrichir le mapping triage → articles, idéalement dédier un article "Saignements en cours de grossesse — Que faire ?" et le lier.

### P2-8 · `meta description` et `meta theme-color` absents
**Preuve** : `evaluate` retourne `undefined` pour les deux.
**Fix** : ajouter dans `app.json` web config et dans le `<Head>` Expo Router.

### P2-9 · Calendar : 3 CTA empty-state simultanés (« + Ajouter un RDV », FAB +, header `Suggestions`)
**File** : `src/screens/CalendarScreen.tsx`.
**Fix** : choisir un canonical CTA selon le contexte, masquer le FAB tant que la liste est vide.

---

## 4 · 🟢 P3 — Polish

| ID | Sujet | Note |
|---|---|---|
| P3-1 | Heading `<h1>` reste "Bienvenue" sur les 4 steps Onboarding | Mauvais pour SR users + analytics segmentation. Utiliser un h1 par step. |
| P3-2 | Empty `viewport` meta sur certaines navigations | `meta[name=viewport]` présent mais sans `viewport-fit=cover` — impact safe-area iOS notch. |
| P3-3 | Boutons "Semaine précédente" / "Semaine suivante" ont l'icône vide en snapshot | Probable rendu d'un emoji RTL (`generic [ref=e270]: ` ) — faire un screenshot test pour vérifier. |
| P3-4 | Onboarding pas de barre de progression visuelle | `Étape 1 sur 4` est texte uniquement → ajouter une `<ProgressBar>`. |
| P3-5 | Politique de confidentialité = texte gris non `<a>` | Pas focusable, pas indexable. Wrap dans `Linking.openURL`. |

---

## 5 · Captures (référentiel)

Captures stockées dans `app/audit-screenshots/E2E_2026-05-08/` :

| # | URL | Fichier | Sévérité visible |
|---|---|---|---|
| 01 | /Language | e2e-01-language.png | A11y (no buttons), font Times |
| 02 | /AuthChoice | e2e-02-authchoice.png | OK structurellement |
| 03 | /Register (validation vide) | e2e-03-register-validation.png | **P0-2 clé i18n brute** + P0-4 règle pwd |
| 04 | /Onboarding step 1 | e2e-04-onboarding-1.png | OK |
| 05 | /HomeMain post-guest | e2e-05-home.png | **P0-1 ErrorBoundary** |
| 06 | /CalendarMain | e2e-06-calendar.png | P0-3 stale ErrorRegion |
| 07 | /Ressources | e2e-07-resources.png | P0-3 stack 3 H1 |
| 08 | /Chatbot | e2e-08-chatbot.png | OK red-flag triage |
| 09 | /Chatbot saignement | e2e-09-chatbot-redflag.png | ✅ triage correct + P2-7 articles |
| 10 | /Articles | e2e-10-articles.png | Vide (Firestore perms) |
| 11 | desktop 1440 | e2e-11-desktop.png | **Aucun layout desktop** (fullscreen mobile) |
| 12 | tablet 768 | e2e-12-tablet.png | idem |
| 13 | iPhone SE 320 | e2e-13-iphone-se.png | OK no-overflow |

---

## 6 · Plan de remédiation suggéré (priorisation)

**Sprint 1 — Bloquants (1-2 jours)**
1. Activer Anonymous Auth Firebase (op CLAUDE.md §6 #2).
2. Corriger les clés i18n `errors.*` (P0-2) — 6 lignes dans `validation.ts` + `RegisterScreen.tsx`.
3. Ajouter `unmountOnBlur` au Tab.Navigator (P0-3) — 1 ligne.
4. Centraliser règle password (P0-4) — extraire constante + 4 strings.
5. Guard `Updates.reloadAsync` en dev/web (P0-5).
6. Bouton "Créer mon compte" Onboarding step 4 → vrai bouton (P0-6).

**Sprint 2 — UX/A11y (3-4 jours)**
- Document title localisé par écran.
- `<html lang>` + `dir` synchronisés.
- LanguageSwitcher accessible post-onboarding.
- Inputs `textContentType` + `accessibilityLabel`.
- Vector icons à la place des emojis tabbar.
- Errorboundary actionnable.

**Sprint 3 — Cleanup (1 jour)**
- Migration `boxShadow`.
- TouchableWithoutFeedback → Pressable.
- Firebase v22 modular API.
- Inter font @font-face.

---

## 7 · Méthodologie & limites

- **Tools utilisés** : `mcp__playwright__*` pour interactions browser, `Bash`/`grep` pour code-trace.
- **Limite** : test sur web preview uniquement. Comportement natif iOS/Android peut différer (notamment P0-3 `detachInactiveScreens` fonctionne en natif).
- **Limite** : Firestore en mode dégradé (anon auth KO) → impossible de tester en profondeur Articles, Reminders, Babytracker données.
- **Non-testé** : flow login (compte existant), photo upload, push notifications, RTL en arabe, animations, `npm run verify` (lint+test).
- **Adversary check** : lecteur final devrait challenger : (a) est-ce que `unmountOnBlur` casse l'état React des screens ? À vérifier sur écrans à state critique (chatbot history). (b) règle password centralisée doit aussi mettre à jour les tests `validation.test.ts`.

---

**Fin du rapport.**
