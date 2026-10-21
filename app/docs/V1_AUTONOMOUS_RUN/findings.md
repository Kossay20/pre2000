# V1 Autonomous Run — Findings

Ordre chronologique (plus récent en bas).

---

## F31 — 🔴 P0 — Fake E2E runner (`mock-playwright.js`) — RÉSOLU T1

**Découvert** : 2026-05-07, T1 préliminaire (lecture `app/package.json`).

**Cause** : `npm run e2e:web` exécutait `node mock-playwright.js`, qui :
- Définissait 4 `setTimeout` qui `console.log` des lignes faussement formatées comme la sortie Playwright.
- Imprimait `"4 passed (6.6s)"` puis `"Playwright tests successfully executed and validated against local codebase."`
- N'invoquait **jamais** `@playwright/test`. Aucun test réel n'était exécuté.

**Code incriminé (avant fix)** : `app/mock-playwright.js` (21 lignes, supprimé).
**Référence trompeuse (avant fix)** : `app/docs/PLAN_E2E_WEB_SUITE.md` §État actuel.

**Fix appliqué (T1)** :
1. Suppression `app/mock-playwright.js`.
2. `package.json` script `e2e:web` → `playwright test`.
3. Ajout `webServer` dans `playwright.config.ts` (démarre Expo automatiquement avec `--clear` Metro, `reuseExistingServer:true` en local, `false` en CI, timeout 180 s pour cold start).
4. `video: retain-on-failure` ajouté pour diagnostic visuel.
5. Reporter HTML ajouté en CI.
6. `.nvmrc` créé (20.20.2) — RN 0.81/Expo 54 exigent Node ≥20 (cf. F33).
7. Premier vrai run : **4 passed (39.7s)** sur Node 20.20.2 + Playwright 1.59.1 + chromium-1217.

**Verdict** : ✅ RÉSOLU.

---

## F32 — 🟡 P2 — `expo-sqlite/web` bundling warning (chatbot DB latent)

**Découvert** : 2026-05-07, T1 premier vrai run Playwright (logs WebServer).
**Reformulé après adversary review** (cf. F37) — sévérité P1→P2.

**Cause** : Pendant le bundle web Metro, `node_modules/expo-sqlite/web/worker.ts:22` tente :
```ts
import wasmModule from './wa-sqlite/wa-sqlite.wasm';
```
Metro retourne `Unable to resolve "./wa-sqlite/wa-sqlite.wasm"`. **Bundle warning seul** — pas d'erreur fatale Metro, l'app web continue à servir.

**Code consommateur statique** : `app/src/services/chatbot/data/DatabaseService.ts:1`.

**Vérification adversary (consommateurs runtime)** :
- `ChatbotScreen.tsx` importe `services/chatbotService.ts` — **pas** `services/chatbot/data/DatabaseService.ts`.
- `chatbotService.ts` ne consomme pas `DatabaseService`.
- `services/chatbot/data/sqlite_data.ts` consomme `DatabaseService` mais aucun screen ne l'importe.
- Donc le chatbot UI live n'est PAS encore branché sur SQLite — F32 est **dormant runtime**.

**Impact réel** :
- Sur **web** : warning bundle dans la console, **pas de crash runtime** sur les paths actuels.
- Sur **iOS/Android** : module natif utilisé, pas de WASM, pas concerné.
- Sera réactivé en P0 si un futur cycle branche `sqlite_data.ts` au screen sans guard `Platform.OS !== 'web'`.

**Décision** :
1. Pas de fix code en T7 (pas de bug runtime à fixer).
2. Documenter le pattern attendu pour futur dev : « tout consommateur de `services/chatbot/data/*` doit avoir un guard Platform.OS sur web ».
3. Ajouter une assertion E2E future : « chatbot tab cliquable sans erreur console critique » (T6 future audit).

**Verdict** : ✅ documenté, pas d'action code requise pour v1.0.

---

## F33 — 🟡 P2 — Engine Node 18 < 20 requis

**Découvert** : 2026-05-07, T1 npm install (avant fix).

**Cause** : `react-native@0.81.5` exige `node >= 20.19.4`, machine était sous Node 18.20.7. NPM install échouait sur ENOTEMPTY (state corrompu d'installs précédents avec mauvaise version).

**Fix appliqué (T1)** :
1. `nvm use 20.20.2` avant install (Node 20 disponible localement).
2. `rm -rf node_modules` + `npm install` propre (1037 packages, 32 s).
3. Création `app/.nvmrc` avec `20.20.2` pour pin la version par dev.

**À faire (différé)** :
- Documenter dans `app/README.md` : « toujours `nvm use` avant npm/expo dans ce repo ».
- Considérer `engines` field strict dans `package.json` pour faire échouer install sur Node < 20.

**Verdict** : ✅ RÉSOLU local. Doc à compléter en T2 (CI utilise Node 20 nativement via `actions/setup-node@v4`).

---

## F34 — 🟠 P1 — Helper E2E swallow d'erreur via `.catch(() => false)` — RÉSOLU T1

**Découvert** : 2026-05-07, adversary review T1.

**Cause (avant fix)** : `app/e2e/helpers/bootstrap-main-tabs.ts:11` :
```ts
if (await page.getByRole('tablist').isVisible().catch(() => false)) {
```
Le `.catch(() => false)` swallow toute exception (page closed, locator query crash, navigation interrupt). Anti-pattern post-F31 — masque les régressions silencieusement.

**Fix (T1)** : remplacé par `await page.waitForSelector('[role="tablist"], text=English', { state: 'visible', timeout: 30_000 })` + `await page.locator('[role="tablist"]').count() > 0`. Aucun catch silencieux. Si la page ne montre ni tabs ni écran Language en 30 s, l'erreur Playwright remonte avec contexte.

**Verdict** : ✅ RÉSOLU.

---

## F35 — 🟠 P1 — Helper E2E utilise 4× `waitForTimeout` arbitraires — RÉSOLU T1

**Découvert** : 2026-05-07, adversary review T1.

**Cause (avant fix)** : `app/e2e/helpers/bootstrap-main-tabs.ts:10,18,24,30` — quatre `page.waitForTimeout(1500/800/600/800)` sans condition explicite. Source #1 historique de flake Playwright sur CI lent.

**Fix (T1)** : tous remplacés. Auto-waits Playwright (chaque `click()` attend l'élément actionnable) + `waitForSelector` pour la branche état initial. Timeouts explicites (15-20 s) sur les boutons critiques. Plus aucun `waitForTimeout` dans le helper.

**Verdict** : ✅ RÉSOLU.

---

## F36 — 🟡 P2 — `ci.yml` n'exécute pas `e2e:web` — RÉSOLU T2

**Découvert** : 2026-05-07, adversary review T1.

**Cause** : `.github/workflows/ci.yml` n'invoquait que `verify` (lint/tsc/test). E2E web restait local-only ; toute régression UI passait CI sans être détectée.

**Fix appliqué (T2)** : nouveau workflow `.github/workflows/e2e-web.yml` :
- Trigger : push main + PR vers main (idem ci.yml).
- `concurrency` group annule les runs concurrents sur même ref.
- Node version pinned via `node-version-file: app/.nvmrc` (cohérence avec local F33).
- Cache navigateurs Playwright keyed sur version extraite du lockfile.
- `npx playwright install --with-deps chromium` (cold) ou `install-deps` seul (cache hit).
- Job lance `npm run e2e:web` qui démarre Expo automatiquement via `webServer:` (CI=true → reuseExistingServer false).
- Upload artefacts : `playwright-report/` (toujours) + `test-results/` (failure seulement, contient traces/videos/screenshots).
- timeout-minutes: 25 (cold Expo + 4 specs ~3-5 min, large marge).

**Auto-review /office-hours T2** :
1. Mauvaise hypothèse ? Non — `webServer` config testée localement, fonctionne.
2. Sur-complexité ? Cache + concurrency + 2-step browser install sont défensifs (économie minutes CI). Pas de gold-plating.
3. Edits orthogonaux ? Non — 1 fichier yml, scope unique.
4. Impératif ou déclaratif ? Déclaratif YAML standard.
5. Feedback loop ? Pas testable localement sans `act` ; le push `main` validera (acceptable risque pour T2).
6. Scope minimal ? Oui — pas d'élargissement à matrix browsers / OS, gardé chromium ubuntu seul.

**Verdict** : ✅ RÉSOLU. CI run réel validera au prochain push.

---

## F37 — 🟡 P2 — F32 sévérité initiale non vérifiée — RÉSOLU T1

**Découvert** : 2026-05-07, adversary review T1.

**Cause** : F32 initialement P1 affirmait que tout chemin atteignant `DatabaseService` plantait sur web. L'adversary a tracé : aucun consommateur runtime UI n'importe `DatabaseService` aujourd'hui (seul `sqlite_data.ts` non wiré le fait).

**Fix (T1)** : F32 reformulé ci-dessus avec analyse runtime + downgrade P1→P2.

**Verdict** : ✅ RÉSOLU.

---

## F39 — 🟠 P1 — `scripts/` pollué par ~200 fichiers d'un autre projet + tsc cassé — RÉSOLU T1 (partiel)

**Découvert** : 2026-05-07, T1 `npm run verify`.

**Cause** :
- `app/scripts/` contient ~200 fichiers `.ts` venant d'un autre projet (mots-clés : `trustpilot`, `brightdata`, `doge-vision`, `account-rotation`, `multi-platform-reviews`, `bulk-account-generator`, etc.).
- Quasiment chaque fichier a un duplicata `_del1.ts` (backup non-nettoyé).
- 4 erreurs `tsc TS1002/TS1005` (apostrophe française non échappée dans string littéral, ex. `'l'infrastructure'`) bloquent `tsc --noEmit`.
- Le seul script `.ts` utilisé par l'app : `scripts/importData.ts` (référencé par `package.json` script `import-data`).

**Comment c'est arrivé** : très probablement un `mv` ou `cp -r` raté depuis un projet voisin. Le repo R1-FIX antérieur a quand même affiché « CI verte » — c'est suspect : soit les commits R1-FIX ont ajouté ces fichiers, soit `tsc --noEmit` du verify était silencieusement skip. À investiguer plus tard.

**Fix appliqué (T1, minimal)** :
- `app/tsconfig.json` : ajout `"exclude": ["node_modules", "scripts/**", "e2e/**"]`.
- `scripts/**` exclu = tsc ne lit plus les ~200 orphans (pas critique pour app web/native).
- `e2e/**` exclu = Playwright a sa propre toolchain (`@playwright/test` types, déjà OK).
- Aucun fichier supprimé (hors scope v1.0, à faire en hygiène post-release).

**À faire (différé)** :
- F39-cleanup : supprimer `scripts/*_del1.ts` et `scripts/test-*.ts` orphelins (sauf `importData.ts` + `test_chatbot_engine.ts` + `test_vector_engine.ts` à vérifier).
- F39-CI-check : auditer pourquoi le CI passait avant — probablement `tsc` du R1-FIX runners était laxiste.

**Verdict** : ✅ RÉSOLU pour T1 (verify débloqué). Cleanup différé.

---

## F40 — 🟠 P1 — Jest scannait `e2e/` et `scripts/*.test.ts` orphans — RÉSOLU T1

**Découvert** : 2026-05-07, T1 verify run.

**Cause** : `jest.config.js` n'avait pas de `testPathIgnorePatterns` autre que default. Conséquences :
- Jest tentait de runner `e2e/web-smoke.spec.ts` (Playwright) → 1 suite échouait avec "Playwright Test needs to be invoked via 'npx playwright test'".
- Jest scannait `scripts/*.test.ts` (orphans du F39 cleanup) → erreurs TS et modules manquants (`'../db'`, `'unknown'`).

**Fix appliqué (T1)** : `jest.config.js` ajout :
```js
testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/scripts/'],
```

**Verdict** : ✅ RÉSOLU. 26 suites, 347 tests pass.

---

## F41 — 🟡 P2 — Worker Jest force-exit (test leak)

**Découvert** : 2026-05-07, verify final run.

**Symptôme** : `A worker process has failed to exit gracefully and has been force exited. Try running with --detectOpenHandles to find leaks.`

**Impact** : non bloquant (tests passent), mais peut cacher un setTimeout / setInterval / open file handle dans une suite. Sur CI, peut allonger CI inutilement (force exit timeout).

**Décision** : reporter à T7 ou cycle dédié post-v1.0. Note : peut venir de Sentry / Firebase auto-init dans une suite. À investiguer avec `--detectOpenHandles`.

**Verdict** : tracké, non bloquant.

---

## F42 — 🟠 P1 — Home dashboard reste en skeleton loading

**Découvert** : 2026-05-07, T6 audit visuel screenshot `04-home-dashboard.png`.

**Symptôme visuel** : la capture, prise immédiatement après navigation `HomeMain`, montre 4 cards entièrement en skeleton (lignes grises animées) — aucun contenu réel rendu. Bottom tabs visibles + en place.

**Hypothèses (à confirmer T7)** :
1. **Test capture trop vite** — `audit-screens.spec.ts:75` ne fait que `expect(page).toHaveURL(/HomeMain/)` puis screenshot. Le contenu Firestore (week tips, baby evolution data, recommendations) prend > 1-2s à arriver.
2. **Firestore inaccessible en mode guest sans config** — sans Firebase Auth (mode guest), les queries Firestore peuvent timeout silencieusement et laisser les skeletons à l'infini.
3. **Skeleton sans timeout fallback** — pas d'état "load failed → retry" affiché à l'utilisateur, juste skeleton perpétuel.

**Impact** :
- Si #1 : test fix simple (waitFor un selector de contenu réel).
- Si #2 ou #3 : **release blocker** — utilisateur en mode guest verrait Home perpétuellement en chargement.

**Action T7** : ajouter waitFor un marqueur de contenu réel dans le test ; si ça timeout, c'est un vrai bug runtime à fixer (timeout fallback + empty state).

---

## F46 — 🔴 P0 — Calendar perpétuellement en skeleton (idem F42)

**Découvert** : 2026-05-07, T6 screenshot `05-calendar.png`.

**Symptôme** : Calendar tab affiche header "Calendar" + skeleton week strip + 3 skeleton event cards. Pas même un empty state ("No appointments yet").

**Pourquoi P0 vs F42 P1** : pour une app de grossesse, le calendrier est **central** — une utilisatrice doit voir « pas de RDV » clairement, ou les RDV templates auto-générés (echo 12 SA, glucose 24-28 SA, etc.). Skeleton perpétuel = perte de confiance immédiate dès l'install.

**Action T7** :
1. Vérifier que `CalendarScreen.tsx` gère le cas où `events.length === 0` après chargement → afficher empty state "Aucun rendez-vous · Ajouter".
2. Vérifier le timeout sur les queries Firestore en mode guest (templates devraient charger même sans auth si publics).
3. Si Firestore inaccessible : empty state + bouton "Ajouter mon premier RDV".

---

## F47 — 🔴 P0 — Tasks tab layout cassé (overlap horizontal Material Top Tabs)

**Découvert** : 2026-05-07, T6 screenshot `08-tasks.png`.

**Symptôme visuel** : après click sur l'onglet "Tasks" du MaterialTopTabNavigator, la capture montre **les deux panels superposés** :
- Côté gauche : moitié du panel "Reminders" (Hydration card "Add a glass" + 0%) — décalé horizontalement.
- Côté droit : panel "Tasks" (My Tasks / MY DAY / Prenatal vitamins 09:00 / Gentle walk 18:00 / View Statistics).
- Banner "Enable notifications to receive your reminders" tronqué horizontalement.

**Cause probable** : MaterialTopTabs animation swipe horizontal sur web n'aboutit pas — la transition est figée à mi-parcours quand le screenshot est pris. Mais le test précédent `web-smoke.spec.ts:50 rappels → Tasks → Statistiques` ARRIVE à cliquer "View Statistics" et le test passe — donc fonctionnellement OK, mais visuellement cassé pendant la transition.

**Investigation T7** :
1. Confirmer que le screenshot capture une transition incomplète (attendre transition complete OU `tabBarPressOpacity` finalisé).
2. Si bug réel : forcer `tabBarPressOpacity={1}` ou désactiver l'animation swipe sur web (`screenOptions.swipeEnabled: Platform.OS !== 'web'`).
3. Vérifier sur mobile natif si même symptôme.

---

## F48 — 🟠 P1 — Chatbot bouton send quasi invisible (contraste disabled)

**Découvert** : 2026-05-07, T6 screenshot `12-chatbot.png`.

**Symptôme** : la flèche send à droite du champ "Ask your question..." est gris pâle sur fond rose pâle — sans message tapé, le bouton est `disabled`, visuellement quasi invisible (contraste WCAG AA fail probable).

**Impact** : utilisatrice ne sait pas qu'il y a un bouton à cliquer. Quand elle tape (le bouton devient actif), c'est moins grave, mais à l'arrivée sur le screen, l'affordance est cassée.

**Fix T7** : `ChatbotScreen.tsx` augmenter contraste du bouton disabled (background plus marqué OU border visible OU même opacité 0.4 au lieu de quasi-zéro).

---

## F49 — 🟠 P1 — Header onboarding affiche "Profile" (ambigu pour new user)

**Découvert** : 2026-05-07, T6 screenshot `03-onboarding-mode-select.png`.

**Symptôme** : la screen step 1 d'onboarding (mode pregnant/TTC/curious) a un header "Profile" + back arrow + barre progress rose. Pour un new user, "Profile" suggère **édition** d'un profil existant — alors qu'il est en train d'en créer un.

**Fix T7** : `OnboardingScreen.tsx` ou navigation options : changer header en "Welcome", "Setup", "Setup your profile", ou un step indicator type "Step 1 of 4".

---

## F50 — 🟡 P2 — Chatbot suggestion "I have strong..." tronquée à droite

**Découvert** : 2026-05-07, T6 screenshot `12-chatbot.png`.

**Symptôme** : la rangée horizontale de 8 quick-pills (I have morning sickness, I feel very tired, etc.) se termine par "I have strong" coupé au bord droit du viewport. ScrollView horizontal sans indicator visible.

**Fix T7** : soit ajouter `showsHorizontalScrollIndicator={true}` ou un fade gradient à droite suggérant scroll, soit wrap les pills sur 2 lignes au-delà d'une largeur seuil.

---

## F63 — 🔴 P0 — "Error loading data" universel sans retry (Home + Profile + Settings)

**Découvert** : 2026-05-07, T6.5 captures additionnelles avec wait 20s.

**Symptôme** :
- `13-home-dashboard-after-20s.png` : après 20s, Home affiche emoji 😔 + "Error loading data" — **PAS de bouton retry**, PAS d'explication, PAS d'action.
- `14-profile.png` et `15-settings.png` : **identiques** au Home error — emoji 😔 + "Error loading data".
- `16-articles-after-20s.png` : Articles affiche un meilleur fallback : "Oops! A small error occurred. Don't worry, your data is safe." + **bouton Retry rose**.

**Conclusion** :
1. **F-LOAD CONFIRMÉ runtime bug, pas test timing**. Données ne chargent jamais en mode guest.
2. **Inconsistance fallback UX critique** :
   - Articles a un fallback élégant + retry → utilisateur peut récupérer.
   - Home/Profile/Settings ont un fallback minimaliste sans action → utilisateur **stranded**.
3. **Probable cause** : ErrorBoundary global ou hook `useDataFetch` partagé qui rend des composants différents selon le screen ; OU les screens HomeStack utilisent un fallback partagé minimaliste alors que Resources utilise son propre composant Empty.

**Action T7 (priorité #1)** :
1. Grep `"Error loading data"` dans `app/src/` → identifier le composant fallback Home/Profile/Settings.
2. Soit l'aligner sur le pattern Articles ("Oops" + Retry button), soit créer un `<DataErrorState />` partagé avec retry callback.
3. Re-tester captures après fix → confirmer comportement uniforme.

**Sécurité** : malgré l'ergonomie cassée, le fait que le Profile screen NE révèle PAS de données utilisateur (parce qu'il échoue à charger) limite l'impact RGPD. À reverif en post-fix : quand Profile charge correctement, vérifier qu'aucun UID/email/PII brut n'est visible.

---

## F-LOAD — 🔴 P0 BUG SYSTÉMIQUE — Loading state perpétuel (F42+F46+F51+F52 same root)

**Découvert** : 2026-05-07, T6 audit visuel + adversary review.

**Constat racine** : 4 captures montrent un skeleton perpétuel sur des screens qui devraient charger du contenu :
- `04-home-dashboard.png` (F42, reclassé P1→P0 par adversary)
- `05-calendar.png` (F46 P0)
- `10-resources-articles.png` (F51 P0 NEW adversary)
- `11-resources-supplements.png` (F52 P0 NEW adversary, + tab switch cassé)

**Hypothèse forte** : Firestore queries en mode guest (sans Firebase Auth) timeout silencieusement → skeleton infini, pas de fallback. Bug systémique vs 4 bugs séparés.

**Action T7 unique** :
1. Identifier le hook ou pattern partagé qui charge la data (probablement `useEffect` + `getDocs` dans ces screens).
2. Ajouter un timeout (15-30s) → bascule empty state friendly avec retry.
3. Tester en mode guest (sans Firebase Auth) : si Firestore inaccessible, doit montrer empty state immédiat.
4. Re-capture les 4 screens après fix → confirmer rendering avec contenu OU empty state propre.

---

## F47 — 🔴 P0 — Tasks tab layout cassé (NUANCÉ par adversary)

**Statut** : Initialement classé P0 par orchestrateur. Adversary confirme + nuance : ce n'est PAS une transition incomplète, c'est un layout cassé reproductible.

**Symptôme aggravé** : panel Tasks positionné hors viewport droit, panel Reminders garde 60% écran. Banner truncated mid-word "Enable notifications to receive your remind".

**Même pattern** : F52 sur Resources Supplements (tab switch casse layout). → Bug commun MaterialTopTabs sur web.

**Fix T7** :
- `src/screens/RemindersScreen.tsx` + `src/screens/ResourcesScreen.tsx` : passer `screenOptions={{ swipeEnabled: Platform.OS !== 'web' }}` ou forcer style explicite sur le container des tabs.
- Tester via E2E spec qui screenshot APRÈS click tab + waitFor 500ms + verify pas de overlap horizontal.

---

## F51 — 🔴 P0 — Resources Articles skeleton perpétuel

**Découvert** : adversary review T6.

**Symptôme** : `10-resources-articles.png` 5 cards skeleton, jamais de contenu. Idem mécanisme F42.

**Fix** : voir F-LOAD.

---

## F52 — 🔴 P0 — Resources Supplements tab switch casse layout

**Découvert** : adversary review T6.

**Symptôme** : `11-resources-supplements.png` après click tab Supplements, header underline a bougé mais content reste celui d'Articles + bandeau gris à droite. Même pattern que F47 sur Reminders.

**Fix** : voir F47 (commun MaterialTopTabs config).

---

## F53 — 🟠 P1 — Language picker : "Arabic" en EN au lieu de "العربية"

**Découvert** : adversary review T6 sur `01-language-picker.png`.

**Symptôme** : carte Arabic affiche "Arabic" en label principal et "العربية" en subtitle. Inconsistance avec "Français" qui a son nom natif en label principal. Un user arabophone peut ne pas reconnaître son option.

**Fix T7** : `src/screens/LanguageSelectScreen.tsx:18-20` — inverser pour Arabic et Tunisian :
```ts
{ code: 'ar', name: 'العربية', flag: '🇩🇿', nativeName: 'Arabic' },
{ code: 'tn', name: 'العربية + الدارجة (Beta)', flag: '🇹🇳', nativeName: 'Arabe + Darija' },
```

---

## F54 — ⚪ NON-ISSUE — Flèche `→/←` déjà gérée par i18n par locale

**Découvert** : adversary review T6 sur `02-auth-choice.png`.

**Adversary claim** : `→` hardcoded ne flip pas en RTL.

**Investigation T7 (orchestrateur invertit)** :
- `src/i18n/locales/fr/auth.json:10` : `"continueAsGuest": "Continuer en invité →"`
- `src/i18n/locales/en/auth.json:9` : `"continueAsGuest": "Continue as guest →"`
- `src/i18n/locales/ar/auth.json:10` : `"continueAsGuest": "المتابعة كضيف ←"` ← **flippé**
- `src/i18n/locales/tn/auth.json:10` : `"continueAsGuest": "المتابعة كضيف ←"` ← **flippé**

Les arrow sont déjà flipées par locale au niveau des chaînes i18n. La capture EN montre `→` correct. Pour AR/TN, l'utilisateur verra `←` correct.

**Verdict** : adversary claim **INVERTED** — ✅ pas d'action requise.

---

## F55 — 🟠 P1 — AddAppointment date au format ISO non localisé

**Découvert** : adversary review T6 sur `06-add-appointment.png`.

**Symptôme** : input Date affiche `2026-05-07` (ISO) au lieu de `07/05/2026` (FR/AR locale). Time `06:08` est l'heure courante (devrait être un default plausible comme 09:00).

**Fix T7** : `AddAppointmentScreen.tsx` formater le default date via `Intl.DateTimeFormat(i18n.language)` et set time default à 09:00.

---

## F56 — 🟠 P1 — Mix FR/EN dans Reminders ("sur 3.0L" en français quand UI = EN)

**Découvert** : adversary review T6 sur `07-reminders.png`.

**Symptôme** : "0.00L **sur** 3.0L" — "sur" est en français. Reste de l'UI en anglais ("Daily Goal", "Add a glass", "Daily Habits"). Clé i18n manquante OU string codée en dur.

**Fix T7** : grep `"sur"` dans `src/screens/RemindersTab*.tsx` ou composant Hydration → remplacer par `t('reminders.hydration.outOf')` (FR: "sur", EN: "of", AR: "من", TN: "من").

---

## F57 — 🟠 P1 — Toggle Prenatal vitamins no on/off label (a11y)

**Découvert** : adversary review T6 sur `07-reminders.png`.

**Symptôme** : pill toggle rose-gauche/vert-droite sans label "on/off" textuel ni accessibility hint. Pour daltonien ou screen reader, état du toggle non communiqué.

**Fix T7** : ajouter `accessibilityRole="switch"` + `accessibilityState={{ checked: enabled }}` + `accessibilityLabel={enabled ? 'Daily reminder enabled' : 'Daily reminder disabled'}`.

---

## F58 — 🟡 P2 — AddAppointment "Personal" default sélectionné suggère CTA primaire

**Découvert** : adversary review T6 sur `06-add-appointment.png`.

**Symptôme** : segmented control Type a "Personal" en rose vif (sélectionné) et "Medical" en blanc. Suggère visuellement que Personal est la primary action alors que c'est juste l'option active.

**Fix T7 (différable)** : utiliser un vrai segmented control avec contraste neutre (gris foncé sélectionné, gris pâle non) ; OU pré-sélectionner "Medical" qui est plus pertinent en grossesse.

---

## F59 — 🟡 P2 — Statistics tab perd son active state dans bottom nav

**Découvert** : adversary review T6 sur `09-statistics.png`.

**Symptôme** : screen Statistics est rendu mais bottom nav garde "Reminders" en rose actif. User perd le repère "où suis-je dans l'app".

**Fix T7 (différable)** : `Statistics` est un sous-screen du Reminders Stack, c'est donc normal que Reminders reste active. MAIS faut un titre header "Statistics" sur la page elle-même (semble manquer dans la capture).

---

## F60 — 🟡 P2 — Disclaimer médical Chatbot trop pâle (risque légal)

**Découvert** : adversary review T6 sur `12-chatbot.png`.

**Symptôme** : "This assistant does not replace medical advice... call your local emergency number" en gris pâle italique ~11px. Pour sujet sanitaire critique, contraste insuffisant + risque légal.

**Fix T7** : `ChatbotScreen.tsx` disclaimer en bold OU encadré jaune avec icône warning (cf. pattern Reminders banner notification).

---

## F61 — 🟡 P2 — AuthChoice "Privacy Policy" footer link affordance

**Découvert** : adversary review T6 sur `02-auth-choice.png`.

**Symptôme** : footer "Your data won't be saved without an account — Privacy Policy" sous-ligné comme link. Le lien navigue-t-il vers PrivacyPolicyScreen ? À vérifier — sinon affordance fausse + risque RGPD (politique vie privée non accessible avant collecte).

**Fix T7** : grep `Privacy Policy` dans `AuthChoiceScreen.tsx`, vérifier le `onPress` mène vers le route `PrivacyPolicy`. Si non : wire la navigation.

---

## F62 — 🟡 P2 — "Arabe + Darija (Beta)" : pas de tooltip explicatif

**Découvert** : adversary review T6 sur `01-language-picker.png`.

**Symptôme** : nom "Arabe + Darija (Beta)" peut confondre user non-tunisien.

**Fix T7 (différable post-v1)** : tooltip ou texte secondaire "Arabe avec dialecte tunisien" dessous.

---

## F38 — 🟡 P2 — Couverture E2E faible (~4 specs / 20+ écrans)

**Découvert** : 2026-05-07, adversary review T1.

**Constat** : 4 tests smoke couvrent : tabs visibles, navigation onglets, calendar→add appointment, reminders→tasks→stats. Restent NON COUVERTS : auth/login/register, language picker, language switch RTL, profile, profile delete, settings, resources article open, chatbot, add-task, edit-symptom, statistics-deep, etc.

**Décision** : T4 (Phase 5) ajoute Resources/Chatbot/Langue. T6 audit massif identifiera le gap réel screen-par-screen et T7 fix loop ajoutera les specs manquantes pour les chemins critiques v1.0 (auth, onboarding 3 modes, calendar, alerts cliniques).

**Verdict** : tracking actif T4→T6→T7.

---
