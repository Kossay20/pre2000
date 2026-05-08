# Cycle 3 — Master Plan v1.0 réellement production-ready

**Date** : 2026-05-08
**HEAD départ** : `d0942a5` (post Cycle 2)
**Demande utilisateur** : « v1.0 vraiment bien fait, fix tout ce qui peut l'être, tests massifs par feature, valider AVANT de passer au suivant — si un fix introduit un bug, c'est catastrophique. »

---

## Principes de discipline (non-négociables)

1. **Test-driven discipline** :
   - Avant chaque fix substantiel : identifier ou écrire le test qui prouve le bug.
   - Après chaque fix : `npm test` (jest unit) doit passer → si rouge, rollback ou fix avant de continuer.
   - Après chaque WAVE (batch de fixes liés) : `npm run e2e:web` doit passer.
   - **Aucun commit sans tests verts.** Si un test casse, on le résout AVANT de commiter le batch.

2. **Validation visuelle** :
   - Après les fixes UI/UX (waves A.4, B, C), re-run `audit-screens.spec.ts` et inspecter les captures.

3. **Granularité commits** :
   - Un commit par WAVE (pas par fix individuel) pour garder l'historique lisible, MAIS chaque fix dans la wave est testé au moment de son implémentation.

4. **Rollback plan** :
   - Si une wave échoue (>2 tests régressifs persistants après tentatives), on revert le HEAD de la wave et on documente comme dette dans `findings.md`.

5. **Pas de touche aux `node_modules` / config build** sauf si explicitement pour fix un finding identifié.

---

## Findings retenus pour Cycle 3 (priorité + faisabilité autonome)

Cycle 2 a laissé 55 findings ouverts. Sélection selon : impact + code-doable (pas op operator) + risque de régression maîtrisable.

### 🔴 P0 (must-fix — release blockers code-side)
| ID | Finding | Wave | Effort |
|----|---------|------|--------|
| F101 | Seeder Firestore écrit `calendar_templates`, app lit `calendarTemplates` | A.1 | 5 min |
| F100 | "Skip account" → écran vide perpétuel — soit signInAnonymously soit retirer CTA | A.2 | 30 min (decision: implement signInAnonymously avec fallback graceful) |
| F201 | Curious mode pas de marqueur `isCurious`, fake LMP, app le croit enceinte | A.3 | 30 min |
| F202 | TTC mode guards `!user?.isTTC` manquent dans 4 screens | A.4 | 45 min |

### 🟠 P1 (must-improve — quality release)
| ID | Finding | Wave | Effort |
|----|---------|------|--------|
| F303 | Placeholder contrast audit | B.1 | 15 min |
| F304 | Chatbot busy state accessibilityState | B.2 | 5 min |
| F305 | Home quickAction a11y labels | B.3 | 10 min |
| F312 | `textAlign:'right'` cond → `'start'` | B.4 | 5 min |
| F404 | authLimiter pas wired dans LoginScreen/RegisterScreen | B.5 | 30 min |
| F206 | Langue picker `Alert` → toast non-bloquant | B.6 | 15 min |
| F203 | Guest Alert pas de CTA "Create account" | B.7 | 10 min |
| F313 | EmptyState distinguer timeout vs erreur | B.8 | 15 min |
| F604 | Root `CLAUDE.md` absent | B.9 | 10 min |

### 🟠 P0 mode logic (large, scope contrôlé)
| ID | Finding | Wave | Effort |
|----|---------|------|--------|
| F211 | TTC home minimal (badge "Cycle day X", pas de tracker complet) | C.1 | 1 h |
| F212 | Curious banner "Mode découverte — semaine X" | C.2 | 30 min |

### 🧪 Tests à créer (consolidation)
| ID | Description | Wave |
|----|-------------|------|
| F504 | `useCurrentWeek.test.ts` (3 cas : lmp valide, future, absent + retry) | D.1 |
| F505 | Onboarding 3 modes integration test minimal | D.2 |
| Regression | Re-run audit-screens + inspection visuelle | D.3 |

### Findings explicitement EXCLUS Cycle 3 (justifié)
- **F102/F603** Apple credentials → operator action obligatoire.
- **F103** Analytics Hermes → migration `@react-native-firebase/analytics` = sprint dédié.
- **F403** PII migration `expo-secure-store` → cycle dédié post-v1.0.
- **F405-F409** Security P2 → trackés mais hors v1.0.
- **F58, F59, F60-F62** Designer P2 cosmétiques → post-v1.0.
- **F204, F205, F207, F208, F209, F210, F213, F214, F215** PM polish post-v1.0.
- **F306** Designer touchables hitSlop → audit ciblé futur.
- **F314, F315, F316** Designer states → futur.
- **F605-F609** Eng Mgr P2 (god component split, `as any` cleanup, deprecated re-export, Sentry upgrade, README nvmrc drift) → cycle dette.
- **F41** Jest worker leak → cycle qualité.

---

## Plan d'exécution séquentiel (waves)

### Wave A — P0 sans operator (durée estimée 2 h)

**A.1 — F101 Seeder collection rename**
- Read `scripts/sync-firestore-templates.ts:56` — confirmer `calendar_templates`.
- Edit → renommer en `calendarTemplates` (cohérent avec `calendarService.ts:164` + `firestore.rules:221`).
- Test : grep cross-app `calendar_templates` (hors history) → 0 hit attendu.
- Validation : `npm test` doit rester vert (ce script n'est pas testé unit, donc pas d'impact).

**A.2 — F100 Anonymous Auth implementation**
- Read `src/context/AuthContext.tsx` `loginAsGuest` actuel (uid `'guest_'+Date.now()`, pas Firebase Auth).
- Decision: implémenter `signInAnonymously` (firebase/auth) en priorité, garder le fallback local si l'API rejette (Firebase Anonymous Auth pas activé en Console = `auth/admin-restricted-operation`).
- Wrap dans try/catch avec branche : `if (e.code === 'auth/admin-restricted-operation') → fallback local + log warning "Activer Anonymous Auth dans Firebase Console pour vrai mode guest"`.
- Le `uid` retourné par `signInAnonymously` est un vrai uid Firebase → satisfait `isAuthenticatedReader()` rules.
- Test : créer test unit `loginAsGuest.test.ts` avec mock `signInAnonymously` (succès + fallback erreur).

**A.3 — F201 isCurious marker**
- Read `src/context/PregnancyContext.tsx` + `OnboardingScreen.tsx:1106-1153` (handleFinishCurious).
- Add `isCurious: boolean` au type Profile + persistance.
- Set `isCurious: true` dans `handleFinishCurious`.
- Test : ajouter cas dans test existant si présent.

**A.4 — F202 TTC/Curious guards (4 screens)**
- Cibles : `CalendarScreen.tsx`, `ProfileScreen.tsx`, `SettingsScreen.tsx`, `ChatbotScreen.tsx`.
- Pour chaque : si `user?.isTTC || user?.isCurious`, ne pas générer/afficher les RDV templates de grossesse, ne pas afficher BabyMessage toggle, etc.
- Identifier précisément les sections à guarder (lecture screen).
- Test : si tests existent, vérifier qu'ils passent. Sinon, smoke e2e via la mise en place d'un mode Curious dans le bootstrap helper (long, peut être différé).

**Wave A — Validation finale** :
- `npm test` → vert.
- `npm run e2e:web` → 23 passed.
- Commit `fix(v1): Cycle 3 wave A — P0 (F100/F101/F201/F202)`.

---

### Wave B — P1 quick wins (durée estimée 2 h)

**B.1 — F303 Placeholder contrast**
- Grep `theme.colors.placeholder` ou `placeholder=` dans `src/screens/`. Pour chaque, vérifier ratio sur fond.
- Si ratio < 4.5:1, remplacer par `theme.colors.textLight` (ou nouveau token `placeholderText` avec contraste OK).

**B.2 — F304 Chatbot busy state**
- `ChatbotScreen.tsx:294-312` send button : ajouter `accessibilityState={{ disabled, busy: loading }}`.

**B.3 — F305 Home quickAction a11y labels**
- `HomeScreen.tsx:389-414` 4 TouchableOpacity quick actions : ajouter `accessibilityLabel={t('home.quickAction.X')}` + clés i18n (4 langues).

**B.4 — F312 textAlign**
- `ChatbotScreen.tsx:122,286` : remplacer `isRTL && {textAlign:'right'}` par `{textAlign: 'start'}`.

**B.5 — F404 authLimiter wire**
- Read `utils/rateLimiter.ts` `authLimiter`.
- Wire dans `LoginScreen.handleLogin` + `RegisterScreen.handleRegister` : avant `signInWithEmailAndPassword`/`createUserWithEmailAndPassword`, vérifier limiter, en cas de blocage afficher message localisé "Trop de tentatives, réessayez dans X minutes".
- Test : ajouter unit test `authLimiter.test.ts` si pas existant, ou intégration via mock.

**B.6 — F206 Langue picker toast**
- `LanguageSelectScreen.tsx:54-66` `Alert.alert("languageUpdated")` → utiliser le `ToastContext` existant (`src/context/ToastContext.tsx`) pour notif non-bloquante.
- Auto-redirect après changeLanguage sans tap utilisateur.

**B.7 — F203 Guest Alert CTA**
- `CalendarScreen.tsx:359-364` + `AddAppointmentScreen.tsx:310` Alert "guestMode" : ajouter bouton "Create account" qui navigate('Register').

**B.8 — F313 timeout vs error**
- `useCurrentWeek.ts` (déjà touché Cycle 1) : différencier `error.code === 'unavailable'` (network) de `error.code === 'permission-denied'` (rules) → message différent dans `EmptyState`.

**B.9 — F604 Root CLAUDE.md**
- Créer `/Users/1millnonstop/Downloads/pregnancy-app/pre2000/CLAUDE.md` minimal pointant vers `app/README.md` + `app/docs/V1_AUTONOMOUS_RUN/`.

**Wave B — Validation** :
- `npm test` vert.
- `npm run e2e:web` 23 passed.
- Commit `fix(v1): Cycle 3 wave B — P1 quality (F203/F206/F303-F305/F312/F313/F404/F604)`.

---

### Wave C — TTC/Curious mode (durée estimée 1.5 h)

**C.1 — F211 TTC home minimal viable**
- Strategy: ajouter dans `HomeScreen.tsx` une branche `if (user?.isTTC)` qui affiche un screen minimal :
  - Card "Trying to conceive" + day count (depuis lastPeriodDate + cycleLength).
  - CTA "Track ovulation" → futur (post-v1).
  - Disable BabyGrowthCard, MomTipsCard, week reco.
- Test : si test exists, vérifier passage. Smoke e2e : skip (couverture future).

**C.2 — F212 Curious banner**
- `HomeScreen.tsx` : si `user?.isCurious`, afficher un banner haut "Mode découverte — vous explorez la semaine X" + CTA "Je suis enceinte" → reset onboarding pregnant.
- Pas de blocage des cards existantes (l'utilisatrice est en exploration, voit le contenu).

**Wave C — Validation** :
- `npm test` + `npm run e2e:web`.
- Commit `feat(v1): Cycle 3 wave C — TTC/Curious mode minimal (F211/F212)`.

---

### Wave D — Tests + regression visuelle (durée estimée 1 h)

**D.1 — F504 useCurrentWeek hook test**
- Créer `src/hooks/__tests__/useCurrentWeek.test.ts` avec :
  - Cas 1 : lmp valide → fetch Firestore mock → weekData renvoyé.
  - Cas 2 : Firestore reject `auth/permission-denied` → error set, retry callback expose.
  - Cas 3 : refetch après error → re-fetch déclenché.

**D.2 — F505 Onboarding modes minimal test**
- Créer `src/screens/__tests__/OnboardingScreen.modes.test.tsx` (ou similar) avec mocks navigation + AuthContext :
  - Cas 1 : pregnant + LMP → setProfile reçoit `{week: X}`.
  - Cas 2 : TTC → setProfile reçoit `{isTTC: true}`.
  - Cas 3 : curious → setProfile reçoit `{isCurious: true}`.

**D.3 — Regression visuelle**
- `pkill -f "expo start" && rm -rf audit-screenshots && npm run e2e:web`.
- Lire 5 captures clés : 02-auth-choice, 04-home, 13-home-after-settle, 14-profile, 16-articles.
- Comparer avec captures Cycle 2 : confirmer les fixes B (a11y), absence de régression visuelle.

**Wave D — Validation** :
- `npm test` doit inclure les nouveaux tests (>= 338 tests).
- `npm run e2e:web` doit toujours faire 23 passed (ou plus si Wave C ajoute).
- Commit `test(v1): Cycle 3 wave D — coverage + regression (F504/F505)`.

---

### Wave E — Final verdict v3

**E.1 — VERDICT_v3.md**
- État final 86 findings cumulés.
- Liste ce qui reste explicitement DIFFERED post-v1.0 (justifié).
- Verdict GO/NO-GO clair.

**E.2 — Update CYCLE3_PLAN.md statut**
- Marquer chaque wave ✅/❌.

**E.3 — Adversary final review**
- Lancer un sub-agent adversary qui relit VERDICT_v3.md + git log Cycle 3 et tente de invalidate le verdict (ratio fix vs régression, tests réels vs façade, file:line citations).

**E.4 — Commit final**
- `docs(v1): Cycle 3 — VERDICT_v3 + 18+ findings résolus`.
- Last `git log --oneline` pour confirmer chaîne.

---

## Métriques de succès Cycle 3

✅ Cycle 3 réussi si :
- Aucune régression : `npm test` ≥ 336 tests pass + Wave D ajoutés ; `npm run e2e:web` 23+ passed.
- ≥ 4 P0 résolus (F100, F101, F201, F202) ou explicitement marqués operator-dependent.
- ≥ 8 P1 résolus.
- TTC + Curious modes minimum viable shippable.
- Adversary final ne trouve pas d'inversion grossière.

❌ Cycle 3 échoué si :
- Toute régression non-fixée à fin Wave.
- Fix qui prétend marcher mais sans test pour le prouver.
- Plus de findings ouverts à la fin qu'au début.

---

## Statut courant

| Wave | Statut | Commit |
|------|--------|--------|
| Plan | ✅ DONE | `265881b` |
| A — P0 sans op (F100/F101/F201/F202) | ✅ DONE | `265881b` |
| B — P1 quality (8 fixes, F206 v2 après régression) | ✅ DONE | `be588e8` |
| C — TTC/Curious (F211/F212) | ✅ DONE | `670c972` |
| D — Regression visuelle (16/16 captures) | ✅ DONE | (no commit, verification only) |
| D — Tests new (F504/F505) | ⏸ DIFFÉRÉ Cycle 4 (mock complexity) | - |
| E — Verdict v3 | ✅ DONE | (this commit) |
