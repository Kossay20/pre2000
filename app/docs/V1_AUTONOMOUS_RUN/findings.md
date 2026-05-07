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

## F36 — 🟡 P2 — `ci.yml` n'exécute pas `e2e:web` — sera RÉSOLU T2

**Découvert** : 2026-05-07, adversary review T1.

**Cause** : `.github/workflows/ci.yml:46-48` n'invoque que `verify` (lint/tsc/test). E2E web reste local-only.

**Fix prévu** : T2 — création `.github/workflows/e2e-web.yml` job dédié.

**Verdict** : à fixer en T2 (déjà planifié).

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

## F38 — 🟡 P2 — Couverture E2E faible (~4 specs / 20+ écrans)

**Découvert** : 2026-05-07, adversary review T1.

**Constat** : 4 tests smoke couvrent : tabs visibles, navigation onglets, calendar→add appointment, reminders→tasks→stats. Restent NON COUVERTS : auth/login/register, language picker, language switch RTL, profile, profile delete, settings, resources article open, chatbot, add-task, edit-symptom, statistics-deep, etc.

**Décision** : T4 (Phase 5) ajoute Resources/Chatbot/Langue. T6 audit massif identifiera le gap réel screen-par-screen et T7 fix loop ajoutera les specs manquantes pour les chemins critiques v1.0 (auth, onboarding 3 modes, calendar, alerts cliniques).

**Verdict** : tracking actif T4→T6→T7.

---
