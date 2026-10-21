# 🎯 GOAL — SHIP v1.0 · Mama & Bébé

**Mission slug** : `SHIP_V1_MAMABEBE` · **Date** : 2026-05-29 · **Branch** : `main` · **HEAD** : `6b4d06c`
**Methodo** : GSTACK 7-step + 6 rôles + Superpowers (brainstorming/TDD/verification) + **Adversary team** par step.
**Per-task pipeline** : `ultra-audit-profond` (5-specialist read-only audit → implement → RED → test → visual → adversary). Ce GOAL ne ré-décrit PAS le pipeline.

> **Invariants load-bearing de Mama & Bébé** (app santé grossesse) : **clinical-safety + GDPR + i18n-parity + link-safety** (§2). Toute modification du code les préserve ; toute régression sur l'un d'eux bloque la wave.

---

## §0 — Préambule

### §0.1 Working-tree decision
Working tree **clean** au lancement (`git status` = clean, HEAD `6b4d06c`). Décision : **branche dédiée** `release/v1.0-ship` créée depuis `main` avant Wave 1. Backup tag `backup/pre-ship-2026-05-29` + dump des baselines (test count, screenshots) avant toute modification. Chaque wave commit sur la branche release ; merge sur `main` seulement après Wave 7 (final convergence) + owner sign-off.

### §0.2 Scope
**App-only** (React Native 0.81 / Expo SDK 54, dossier `app/`). 9 systèmes in-app (§1). **Hors scope** : `website/` (marketing) + `privacy-policy/` (site légal) à la racine — non liés au code app, traités dans un GOAL séparé si besoin.

### §0.3 Priorité utilisateur (ré-ordonne les waves)
L'utilisateur a fixé l'ordre de valeur explicitement :
1. **Chatbot** — « le plus important pour moi, je veux l'améliorer ». → Wave 2.
2. **Notifications / reminders / routines** — « les rappels quotidiens (prendre un cachet, faire une marche…) déjà implémentés ; **teste que les notifications partent vraiment** ». → Wave 3.
3. **Articles / Resources** — « améliorer l'architecture : 10 articles + ceux des compléments ». → Wave 4.
4. Invariant transverse : **tout traduit en FR / EN / AR / TN selon le choix user, toujours.** → guard construit Wave 1, asserté partout.
5. Owner gates (Firebase / EAS / GCP / device) → **après** le code (Wave 6), non-bloquants pour Waves 1-5.

### §0.4 Convergence criteria (DONE = shippable, pas « ready code-side »)
Un système / wave / GOAL est DONE quand **toutes** ces règles passent (rejection literal — cf. §6) :
- `npm run verify` vert (lint:colors + `tsc --noEmit` + jest) — 0 régression vs **baseline mesurée Wave 1** au HEAD `6b4d06c` (ne PAS présumer le compte ; VERDICT_v9 rapportait ~368 à un autre HEAD).
- **i18n 4-lang parity green** : `i18nParity.test.ts` (à créer §6) — 0 clé manquante FR/EN/AR/TN.
- Clinical-safety + GDPR invariants intacts (§2) — tests d'attestation verts à chaque wave-close.
- E2E déterministe (build statique `expo export` + `serve --single`) vert pour tout écran touché.
- Visual gate : screenshots Read + analysés, 0 raw-key leak, 0 layout break, 0 console error.
- RED-team adversary : 0 P0/P1 NEW non-traité.
- **Convergence = 2 cycles consécutifs avec P0+P1=0 ET findings sets identiques.**

### §0.5 Interrupt-resume (usage limit / session boundary)
Toute wave interrompue : (1) commit WIP `wip(<wave>): partial through T-N.X.Y`, (2) écrire `docs/V1_AUTONOMOUS_RUN/INTERRUPT_<wave>_<ts>.md` (last green SHA + last task + status + next task + reports écrits), (3) update ce GOAL §X checklist. Reprise : lire le manifest, `git status` + last-commit, smoke 1-task, continuer.

---

## §1 — Map principal (9 systèmes · ancres vérifiées 2026-05-29)

| # | Système | Maturité (Cycle 9) | Ancre code vérifiée (`ls`/`find`) | Tests existants |
|---|---|---|---|---|
| S1 | **Chatbot** ⭐P1 | 🟢 ready, **0 test** | `chatbotService.ts` (544 L) · `ChatbotScreen.tsx` (542 L) · `chatbot/engines/{Fuzzy,Keyword,Vector}.ts` · `chatbot/data/{DatabaseService,local_data,repository,schema,sqlite_data}.ts` · `src/data/chatbot_data.ts` (2396 L) · `red_flags_db.json` (21 K) | **AUCUN** (`scripts/test_chatbot_engine.ts` = script, pas Jest) |
| S2 | **Notifications/Reminders/Routines** ⭐P2 | 🟢 ready, runtime non testé | `notificationService.ts` (428) · `rdvNotificationService.ts` (429) · `remindersScheduler.ts` (132) · `remindersV2Service.ts` (562) · `reminderPersistence.ts` (**747, 0 test**) · `notificationBuilder.ts` (134) | `notificationService.test.ts` · `rdvNotificationService.timezone.test.ts` · `remindersV2Service.test.ts` · `notificationMessages.test.ts` · `calculateStreak.test.ts` · `dailyChecklistService.test.ts` |
| S3 | **Resources/Articles** ⭐P3 | 🟢 ready, contenu à enrichir | `contentService.ts` (**179, 0 test**) · `tipsService.ts` (104) · `ArticlesListScreen.tsx` · `ArticleDetailScreen.tsx` · `SupplementsListScreen.tsx` · `SupplementDetailScreen.tsx` · `ForbiddenFoodsScreen.tsx` · `articles_db.json` · `supplements_pregnancy.json` | `safeOpenUrl.test.ts` (22 t, link safety) |
| S4 | **i18n / Langue** ⭐INV | 🟢 ready, **parity non gardée** | `src/i18n/index.ts` · `src/i18n/rtl.ts` · `locales/{fr,en,ar,tn}/*.json` (19 namespaces) · `LanguageSelectScreen.tsx` | `passwordMin.test.ts` (seul) |
| S5 | Auth/Onboarding | 🟢 ready | `RegisterScreen.tsx` · `LoginScreen.tsx` · `OnboardingScreen.tsx` (63 K) · `AuthContext.tsx` (35 K, **high-risk**) · `AuthChoiceScreen.tsx` | `AuthContext.login.test.ts` · `AuthContext.gdpr.test.ts` · `migrateGuestData.test.ts` · `validation.test.ts` · `rateLimiter.test.ts` |
| S6 | Home/Week content | 🟢 ready | `HomeScreen.tsx` (48 K) · `PregnancyContext.tsx` · `BabyEvolutionScreen.tsx` · `WeekRecommendationsScreen.tsx` · `useCurrentWeek.ts` | `pregnancyCalculator.test.ts` · `fertility.test.ts` |
| S7 | Calendar/Appointments | 🟢 ready | `CalendarScreen.tsx` (28 K) · `AddAppointmentScreen.tsx` (34 K) · `calendarService.ts` | `rdvNotificationService.timezone.test.ts` |
| S8 | Health (Weight/BP/Glucose/Symptoms) | 🟢 ready (high-risk: clinical) | `HealthDashboardScreen.tsx` (32 K) · `WeightTrackerScreen.tsx` (36 K) · `KickCounterScreen.tsx` · `ContractionTimerScreen.tsx` · `healthService.ts` | `clinicalChecks.test.ts` · `validateHealthEntry.test.ts` · `kickCounterService.test.ts` · `contractionTimerService.test.ts` · `healthService.merge.test.ts` |
| S9 | Profile/Settings/Export | 🟢 ready (high-risk: GDPR) | `ProfileScreen.tsx` (33 K) · `SettingsScreen.tsx` (23 K) · `dataExportService.ts` · `pdfExportService.ts` · `DiagnosticScreen.tsx` | `AuthContext.gdpr.test.ts` · `EmergencyContacts.contract.test.ts` |

**§2 (separated systems)** : *aucun* (app-only). `website/` + `privacy-policy/` documentés hors scope.

---

## §2 — Invariants load-bearing + zones high-risk

### Invariants — ne JAMAIS régresser (attestation à chaque wave-close)
| Invariant | Ce qui ne doit pas casser | Test d'attestation (réel) |
|---|---|---|
| **Clinical-safety** | seuils alertes BP >160/110, glucose >15 mmol/L, prise de poids rapide ; numéros d'urgence par pays (TN/MA/DZ/FR) ; triage red-flag chatbot → escalade emergency | `src/utils/__tests__/clinicalChecks.test.ts` · `validateHealthEntry.test.ts` · `EmergencyContacts.contract.test.ts` · `EmergencyContactsSection.tel.test.ts` |
| **GDPR / RGPD** | `deleteAccount` purge 9 collections + Firebase Auth + AsyncStorage ; reauth avant delete ; export PDF dispo | `src/context/__tests__/AuthContext.gdpr.test.ts` |
| **i18n-parity** | toute clé existe en FR + EN + AR + TN ; aucune raw-key leak ; RTL flip AR/TN | `i18nParity.test.ts` *(TO BE CREATED — T-1.3.1)* + `passwordMin.test.ts` |
| **Link safety** | liens externes via whitelist scheme uniquement ; `tel:` sanitize | `src/utils/__tests__/safeOpenUrl.test.ts` |
| **Firestore rules** | owner-only sur collections privées, write:false sur contenu public | `src/services/__tests__/firestoreRulesParity.test.ts` |

### Zones high-risk — modifier UNIQUEMENT avec adversary sign-off + commit isolé
- `src/context/AuthContext.tsx` (35 K — auth + GDPR purge)
- `app/firestore.rules` (sécurité données)
- `src/utils/clinicalChecks.ts` + `clinicalChecks.test.ts` (sécurité médicale)
- `src/i18n/locales/{fr,en,ar,tn}/*` (parité = invariant utilisateur)

Wave-close attestation : exécuter les 5 tests invariants ci-dessus + `git diff --stat` sur les 4 zones high-risk → toute ligne touchée doit citer une task avec adversary OK.

---

## §3 — Système S1 : CHATBOT ⭐ (priorité #1)

### Contract
Assistant grossesse **offline/local** : retrieval hybride (Keyword + Vector embeddings + Fuzzy) sur base de connaissances (`chatbot_data.ts` 2396 L + `red_flags_db.json`), réponses multilingues, triage red-flag → escalade urgence. **Le plus important pour l'utilisateur.**

### Anchors (vérifiés 2026-05-29)
`chatbotService.ts:1-544` (orchestrateur : repository + KeywordEngine + VectorEngine + i18n + `chunkArticle` fr/en/ar/tn) · `chatbot/engines/KeywordEngine.ts` (8.4 K) · `VectorEngine.ts` (7 K) · `FuzzyMatcher.ts` (2.5 K) · `chatbot/data/DatabaseService.ts` (14.5 K) · `ChatbotScreen.tsx:1-542` · `red_flags_db.json` · `chatbot_suggestions.json`.

> **Anti-fiction** : « améliorer » est sous-spécifié. **T-2.0.0 = AUDIT-FIRST qui PRODUIT le backlog d'amélioration concret.** On n'invente AUCUNE feature chatbot dans ce plan. L'owner choisit au checkpoint Wave 2.

### Sub 2.0 — Audit chatbot (produit le backlog)
**Anchors** : tout S1. **Tasks** :
- T-2.0.1 Audit **couverture d'intents** : matrice questions-types × réponse trouvée (keyword vs vector vs fuzzy). Mesure le % de fallback "je n'ai pas compris".
- T-2.0.2 Audit **4-lang response parity** : `chunkArticle` fallback fr/ar (chatbotService.ts:60-103) → lister les réponses absentes en EN/AR/TN.
- T-2.0.3 Audit **red-flag triage** : `SEVERITY_PRIORITY` (chatbotService.ts:25-32) + `red_flags_db.json` → emergency/urgent_consult correctement escaladés ? Faux négatifs = P0.
- T-2.0.4 Audit **emergency-number resolution** par pays (lien clinicalChecks) + disclaimer médical (F60 différé : italique pâle).
**Acceptance** : rapport `docs/V1_AUTONOMOUS_RUN/CHATBOT_AUDIT_2026-05-29.md` listant P0/P1/P2 améliorations → **owner gate G0 (choix scope)** au checkpoint.

### Sub 2.1 — Test suite chatbot (0 → couverte) **[flat requirement, indépendant du choix owner]**
**Anchors** : engines + service. **Tasks** :
- T-2.1.1 `KeywordEngine.test.ts` — match exact + stop-words + ranking. *(test TO BE CREATED at `src/services/chatbot/engines/__tests__/KeywordEngine.test.ts`)*
- T-2.1.2 `FuzzyMatcher.test.ts` — distance/seuil + typos. *(TO BE CREATED at `src/services/chatbot/engines/__tests__/FuzzyMatcher.test.ts`)*
- T-2.1.3 `chatbotService.test.ts` — `analyzeMessage` : red-flag emergency escalation + severity ordering + cache. *(TO BE CREATED at `src/services/__tests__/chatbotService.test.ts`)*
- T-2.1.4 `chatbotRedFlag.contract.test.ts` — chaque red-flag de `red_flags_db.json` a severity valide + (si emergency) numéro pays résolu. *(TO BE CREATED at `src/services/__tests__/chatbotRedFlag.contract.test.ts`)*
**Acceptance** : 4 fichiers verts dans `npm test` ; coverage chatbotService > 70 % branches red-flag ; **0 régression** sur les 368 tests existants.

### Sub 2.2 — Améliorations (scope = sortie de T-2.0.x, owner-approved)
**Anchors** : selon backlog. **Tasks (seeds, à confirmer Wave 2 checkpoint)** :
- T-2.2.1 Combler les gaps EN/AR/TN identifiés T-2.0.2 (contenu réponses) — i18n-parity invariant.
- T-2.2.2 Corriger faux-négatifs triage T-2.0.3 (P0 si emergency manqué).
- T-2.2.3 F60 disclaimer contraste WCAG AA (anchor `ChatbotScreen.tsx` disclaimer block).
**Acceptance** : pour chaque amélioration retenue → test (Sub 2.1 étendu) PASS + E2E `e2e/chatbot.spec.ts` *(TO BE CREATED)* GREEN + visual gate (4 langues) + RED adversary 0 P0.

---

## §4 — Système S2 : NOTIFICATIONS / REMINDERS / ROUTINES ⭐ (priorité #2)

### Contract
Rappels quotidiens récurrents (hydratation, vitamines, marche, « prendre un cachet »), RDV (J-1/J/H-2), baby messages. **Déjà implémenté ; objectif = PROUVER que les notifications partent vraiment.**

### Anchors (vérifiés 2026-05-29)
`remindersV2Service.ts:1-562` · `reminderPersistence.ts:1-747` (**0 test**) · `remindersScheduler.ts:1-132` (**0 test**) · `notificationService.ts:1-428` · `rdvNotificationService.ts:1-429` · `notificationBuilder.ts:1-134` (**0 test**). Sync : `syncRemindersToNotifications(week, locale, uid)`.

> **Split acceptance obligatoire** (sinon « notifications work » = invérifiable). (a) **Automatable** : mock de l'API Expo Notifications, asserte ce qui est scheduled/cancelled/rescheduled. (b) **Manuel** : on-device → owner gate **G5**.

### Sub 3.1 — Scheduling logic (mock-based, automatable)
**Anchors** : scheduler + persistence + builder. **Tasks** :
- T-3.1.1 `reminderPersistence.test.ts` — persist/restore settings (guest AsyncStorage `reminders_v2_settings_guest` vs auth Firestore `reminder_settings_v2`) + idempotence. *(TO BE CREATED at `src/services/__tests__/reminderPersistence.test.ts`)*
- T-3.1.2 `remindersScheduler.test.ts` — `syncRemindersToNotifications` : mock `expo-notifications`, asserte `scheduleNotificationAsync`/`cancelScheduledNotificationAsync` appelés avec bons IDs/heures. *(TO BE CREATED at `src/services/__tests__/remindersScheduler.test.ts`)*
- T-3.1.3 `notificationBuilder.test.ts` — payload (title/body/data) localisé selon locale active, triggers récurrents (daily). *(TO BE CREATED at `src/services/__tests__/notificationBuilder.test.ts`)*
- T-3.1.4 Re-sync triggers : étendre `remindersV2Service.test.ts` — login / week advance / locale change / toggle → cancel+reschedule cohérent.
**Acceptance** : 3 nouveaux fichiers + extension verts ; `notificationMessages.test.ts` toujours vert ; payloads vérifiés dans les **4 locales** (i18n-parity).

### Sub 3.2 — Notification content i18n + deep links
**Anchors** : `notificationBuilder.ts` · `App.tsx:345-362` (highlightId deep link) · `locales/*/notifications.json`. **Tasks** :
- T-3.2.1 Parité `notifications.json` FR/EN/AR/TN (couvert par i18nParity guard §6) — 0 clé manquante.
- T-3.2.2 Deep link tap → bonne route (RDV→Calendar/AddAppointment ; reminder→TasksTab highlightId ; baby→Home). E2E `e2e/deep-interactive.spec.ts` (existe) à étendre.
**Acceptance** : `i18nParity.test.ts` PASS sur `notifications` namespace + `e2e/deep-interactive.spec.ts` GREEN.

### Sub 3.3 — On-device runtime proof (→ owner gate G5)
**Anchors** : build EAS. **Tasks** :
- T-3.3.1 Procédure de test on-device documentée : créer reminder « cachet » daily + RDV J-1 → vérifier réception physique iOS + Android, en fr ET ar (RTL). *(doc `docs/V1_AUTONOMOUS_RUN/NOTIF_DEVICE_SMOKE.md` TO BE CREATED)*
**Acceptance** : **owner gate G5** — reçu photo/log notification reçue sur device (WHO=owner). Non-bloquant pour Waves 1-5.

---

## §5 — Système S3 : RESOURCES / ARTICLES ⭐ (priorité #3)

### Contract
Articles éducatifs + compléments (suppléments) + aliments interdits. **Objectif user : améliorer l'architecture du contenu (« 10 articles + ceux des compléments »).**

### Anchors (vérifiés 2026-05-29)
`contentService.ts:1-179` (**0 test**, cache in-memory + fetch chunked 'in' limit 10) · `tipsService.ts:1-104` · `ArticlesListScreen.tsx` · `ArticleDetailScreen.tsx` (Markdown safe render) · `SupplementsListScreen.tsx` · `SupplementDetailScreen.tsx` · `articles_db.json` · `supplements_pregnancy.json` · `red_flags_db.json`.

### Sub 4.1 — Audit contenu + architecture
**Anchors** : `articles_db.json` · `supplements_pregnancy.json` · `contentService.ts`. **Tasks** :
- T-4.1.1 Audit **complétude 4-lang** de chaque article (`title/content_markdown` _fr/_en/_ar/_tn) → matrice manquants. Lien direct invariant i18n.
- T-4.1.2 Audit **les 10 articles cibles + compléments** : qualité contenu, recommandations sage-femme (P2-7 différé Cycle 9 — clinician review), liens articles↔suppléments.
- T-4.1.3 Audit `contentService` : dédup `articlesAntigravity`, chunked fetch (Firestore 'in' ≤10), cache invalidation logout.
- T-4.1.4 Audit **cohérence 2 corpus** : article corrigé côté Firestore (`articles_db.json`) vs copie locale chatbot (`src/data/chatbot_data.ts`) — lister les divergences ; proposer unification ou sync. (cf. §X nuance dual-source)
**Acceptance** : rapport `docs/V1_AUTONOMOUS_RUN/CONTENT_AUDIT_2026-05-29.md` + matrice 4-lang + diff 2-corpus → **owner gate G0b** (valider scope contenu + review sage-femme + décision unification corpus).

### Sub 4.2 — contentService test + safe render
**Anchors** : `contentService.ts` · `ArticleDetailScreen.tsx`. **Tasks** :
- T-4.2.1 `contentService.test.ts` — dédup par `article_id`, chunked 'in' batching, cache hit/clear. *(TO BE CREATED at `src/services/__tests__/contentService.test.ts`)*
- T-4.2.2 Markdown safe render : pas de HTML, liens via `safeOpenUrl` — étendre `safeOpenUrl.test.ts` si nouveaux schemes.
**Acceptance** : `contentService.test.ts` PASS + `safeOpenUrl.test.ts` vert + E2E `e2e/feature-tests.spec.ts` (resources) GREEN.

### Sub 4.3 — Contenu 4-lang + architecture (scope = sortie T-4.1.x)
**Tasks (seeds, owner-approved)** :
- T-4.3.1 Combler traductions manquantes articles/suppléments (FR/EN/AR/TN) — i18nParity guard étendu au contenu data.
- T-4.3.2 Liens articles↔suppléments + safety badges suppléments cohérents.
**Acceptance** : matrice 4-lang 0 manquant sur les 10 articles + compléments retenus + visual gate liste/detail (4 langues) + RED adversary.

---

## §6 — Système S4 : i18n / PARITY ⭐ INVARIANT (build guard FIRST — Wave 1)

### Contract
Tout texte traduit FR/EN/AR/TN selon choix user, **toujours**. Aujourd'hui : 19 namespaces × 4 locales, **aucun test de parité** → invariant non gardé. **Construire le guard AVANT tout, puis l'asserter partout.**

### Anchors (vérifiés 2026-05-29)
`src/i18n/index.ts` · `src/i18n/rtl.ts` (`registerRTLListener` injection — Cycle 9 1.2) · `locales/{fr,en,ar,tn}/` (19 JSON : add_appointment, article, auth, babyEvolution, babyGrowth, calendar, common, cycle8, dashboard, forbiddenFoods, home, notifications, onboarding, profile, reminders, support, tasks, ui, weight).

### Sub 1.3 — Parity guard (construit en Wave 1, bloquant pour tout le reste)
**Tasks** :
- T-1.3.1 `i18nParity.test.ts` — pour chaque namespace, l'ensemble des clés FR == EN == AR == TN (deep key diff). Échec liste les clés manquantes par locale. **Wire dans `npm run verify`.** *(TO BE CREATED at `src/i18n/__tests__/i18nParity.test.ts`)*
- T-1.3.2 `i18nRawKeyGuard` E2E — aucun raw key (`/^[a-z]+\.[a-z]/` pattern) visible dans le DOM rendu sur les écrans clés (Language, Home, Chatbot). Étendre `e2e/cycle9-fixes.spec.ts` (a déjà P0-2 raw-key check).
- T-1.3.3 RTL : `dir=rtl` + `lang=ar/tn` synced sur web (Cycle 9 P1-2 — déjà testé, ré-asserter dans i18n wave).
**Acceptance** : `i18nParity.test.ts` PASS (0 manquant sur les 19 namespaces) + intégré `npm run verify` + E2E raw-key GREEN. **Cette task est la fondation : toute wave suivante ajoute « i18nParity green » à son acceptance.**

---

## §7 — Systèmes ready (S5-S9) : audit-confirm léger + backlog ciblé

> Ces zones sont 🟢 au Cycle 9. Pas de full décompo : **audit-confirm chaque fonction (cf. §8 backbone) + fermer CES items de backlog nommés.** Toute modif passe par i18nParity + invariants §2.

### S5 — Auth/Onboarding (Wave 5)
**Anchors** : `RegisterScreen.tsx` · `LoginScreen.tsx` · `OnboardingScreen.tsx` (63 K) · `AuthContext.tsx` (high-risk). **Confirm** : `AuthContext.login.test.ts` · `AuthContext.gdpr.test.ts` · `migrateGuestData.test.ts` · `validation.test.ts` · `rateLimiter.test.ts` PASS. **Backlog à fermer** : F406 (session expiration P2 — décision : documenter Firebase auto-refresh, accept-with-doc). **Owner-gate dep** : Anonymous Auth (P0-1) → G1.
**Acceptance** : 5 tests verts + E2E auth flow (`e2e/audit-screens.spec.ts`) GREEN + Onboarding 3 modes (pregnant/TTC/curious) sans dead-end.

### S6 — Home/Week content (Wave 5)
**Anchors** : `HomeScreen.tsx` (48 K) · `PregnancyContext.tsx` · `useCurrentWeek.ts`. **Confirm** : `pregnancyCalculator.test.ts` · `fertility.test.ts` PASS. **Backlog** : P1-3 (LanguageSwitcher CTA post-onboarding dans Home — léger ajout, i18n-parity). **Gap** : `useCurrentWeek.test.ts` *(TO BE CREATED at `src/services/__tests__/useCurrentWeek.test.ts`)* — mock weeks Firestore + refetch on error.
**Acceptance** : tests verts + `useCurrentWeek.test.ts` créé/PASS + E2E home dashboard GREEN.

### S7 — Calendar/Appointments (Wave 5)
**Anchors** : `CalendarScreen.tsx` (28 K) · `AddAppointmentScreen.tsx` (34 K) · `calendarService.ts`. **Confirm** : `rdvNotificationService.timezone.test.ts` PASS. **Backlog** : F55 (date input ISO non localisé — fix date format selon locale, i18n) ; P2-9 (Calendar empty-state CTAs — design refinement, accept-or-fix au checkpoint).
**Acceptance** : timezone test vert + date localisée 4 langues + E2E calendar→add appointment GREEN.

### S8 — Health (Wave 5, high-risk clinical)
**Anchors** : `HealthDashboardScreen.tsx` (32 K) · `WeightTrackerScreen.tsx` (36 K) · `healthService.ts` · `clinicalChecks.ts` (high-risk). **Confirm (invariant attestation)** : `clinicalChecks.test.ts` · `validateHealthEntry.test.ts` · `kickCounterService.test.ts` · `contractionTimerService.test.ts` · `healthService.merge.test.ts` PASS. **Backlog** : F403 (PII AsyncStorage non chiffré — accept-with-doc, cycle post-v1).
**Acceptance** : 5 tests verts (clinical-safety invariant intact) + seuils alertes BP/glucose inchangés + numéros urgence 4 pays vérifiés.

### S9 — Profile/Settings/Export (Wave 5, high-risk GDPR)
**Anchors** : `ProfileScreen.tsx` (33 K) · `SettingsScreen.tsx` (23 K) · `dataExportService.ts` · `pdfExportService.ts`. **Confirm (invariant attestation)** : `AuthContext.gdpr.test.ts` (purge 9 collections) · `EmergencyContacts.contract.test.ts` PASS. **Backlog** : god-component refactor ProfileScreen (différé post-v1, accept-with-doc).
**Acceptance** : GDPR purge test vert + export PDF fonctionnel + reauth-before-delete vérifié.

---

## §8 — Backbone : 43 fonctions × chemin de confirmation (traçabilité « chaque fonction confirmée »)

> Demande user littérale : « compose chaque fonction, confirme-la ». Source = FEATURE_MAP_AND_AUDIT §2 (43 fonctions, file:line). Chaque fonction a un chemin de confirmation. ✅ = test existant ; 🆕 = à créer (cf. waves).

| Zone (fn #) | Confirmation path |
|---|---|
| Auth 1-3 (register/login/anon) | ✅ `AuthContext.login.test.ts` · `validation.test.ts` · `migrateGuestData.test.ts` |
| Onboarding 4-6 (3 modes) | ✅ `passwordMin.test.ts` + E2E onboarding step1 ; 🆕 F505 integration 3 modes (E2E `audit-screens`) |
| Home 7-14 (8 cards) | ✅ `pregnancyCalculator.test.ts` ; 🆕 `useCurrentWeek.test.ts` (T-S6) |
| Calendar 15-19 | ✅ `rdvNotificationService.timezone.test.ts` + E2E ; date-locale 🆕 (F55) |
| Reminders/Tasks/Stats 20-27 | ✅ `remindersV2Service.test.ts` · `calculateStreak.test.ts` · `dailyChecklistService.test.ts` ; 🆕 `reminderPersistence/Scheduler/Builder.test.ts` (Wave 3) |
| Resources 28-31 | ✅ `safeOpenUrl.test.ts` ; 🆕 `contentService.test.ts` (T-4.2.1) |
| Chatbot 32-34 | 🆕 `KeywordEngine/FuzzyMatcher/chatbotService/chatbotRedFlag.test.ts` (Wave 2) |
| Health 35-38 | ✅ `clinicalChecks.test.ts` · `validateHealthEntry.test.ts` · `healthService.merge.test.ts` |
| Profile/Settings 39-43 | ✅ `AuthContext.gdpr.test.ts` · `EmergencyContacts.contract.test.ts` ; i18n switch via `i18nParity.test.ts` (T-1.3.1) |

**Règle** : aucune fonction ne quitte sa wave sans son chemin de confirmation **vert**. 🆕 = `(test TO BE CREATED)` déjà adressé dans les waves correspondantes.

---

## §A — Agent army map + fan-out matrix

### Rôles (adaptés pregnancy app)
| Rôle | Subagent type | Tools | Brief |
|---|---|---|---|
| Architect | `Plan` | Read-only | cartographie + décompo task |
| Security | `general-purpose` | Read | Firestore rules + auth + link-safety + rate-limit |
| Clinical-safety | `general-purpose` | Read | seuils alertes BP/glucose + emergency numbers par pays + red-flag triage chatbot |
| UX/A11y | `general-purpose` | Read + axe | WCAG 2.1 AA + RTL + contraste + hit-target 44pt |
| i18n | `general-purpose` | Read | parité FR/EN/AR/TN + raw-key + RTL flip |
| Implementer | `general-purpose` | Edit/Write/Bash | **TDD-first**, jamais 2 implementers en // |
| RED-team | `general-purpose` | Read | dispute hostile, file:line obligatoire |
| QA Visual | `general-purpose` | Read + Playwright | build statique + capture + analyse screenshot |
| RED Visual | `general-purpose` | Read | ré-analyse indépendante screenshots QA |

### Fan-out matrix (qui tire par type de task)
| Type de task | Arch | Sec | Clinical | UX/A11y | i18n | Impl | RED | QA-Vis | RED-Vis |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Frontend visual (screen) | x | x | . | x | x | x | x | x | x |
| Service logic (chatbot/notif/content) | x | x | x | . | x | x | x | . | . |
| Red-flag / clinical / emergency | x | x | **x** | . | x | x | x | . | . |
| i18n / parity / RTL | x | . | . | x | **x** | x | x | x | x |
| Data/content (articles/suppléments) | . | . | x | . | x | x | x | . | . |
| Cross-surface E2E | x | x | x | x | x | x | x | x | x |

**Dispatch discipline** : 5 read-only specialists = **1 message multi-Agent** (parallèle). Implementer jamais //. QA-Vis + RED-Vis // OK (read-only). RED adversary TOUJOURS après commit implementer, AVANT DONE. Reports persistés disque : `reports/test-e2e/SHIP_V1/<wave>/wave-<W>-<role>.json` (schéma `[P0-P3] file:line — titre / repro / evidence / reco`, cap ~1200 mots).

---

## §X — Convergence waves (ré-ordonnées par priorité user)

| Wave | Scope | Parallélisme | Checkpoint criteria | Gate dep |
|---|---|---|---|---|
| **W1** Pre-flight + i18n guard | branche `release/v1.0-ship`, backup tag, **mesurer baselines** (test count réel au HEAD, screenshots) ; **T-1.3.1 i18nParity.test.ts construit + wiré verify** | Séquentiel | i18nParity PASS + verify vert baseline + branche/backup OK | — |
| **W2** Chatbot ⭐ | Sub 2.0 audit → **G0 owner choix** → Sub 2.1 test suite → Sub 2.2 improvements | Audit phase = 5 specialists // ; impl séquentiel | 4 tests chatbot verts + audit doc + 0 régression + i18nParity green + visual 4-lang + RED 0 P0 | G0 |
| **W3** Notifications ⭐ | Sub 3.1 scheduling mock tests + 3.2 i18n/deeplink ; 3.3 doc device | Audit // ; impl séquentiel | 3 nouveaux tests + deep-link E2E + notifications.json parity + clinical (RDV) intact | G5 (device, async) |
| **W4** Resources/Articles ⭐ | Sub 4.1 audit → **G0b owner choix** → 4.2 contentService test → 4.3 contenu 4-lang | Audit // ; impl séquentiel | contentService test + 4-lang matrice 0 manquant (10 articles+suppl) + safe render | G0b |
| **W5** Ready zones S5-S9 | audit-confirm + backlog ciblé (peut tourner **en // avec W2-W4** si domaines disjoints) | 2 waves // possibles (disjoint) | tous tests zone verts + invariants §2 attestés + backlog items closed/documented | G1 (anon auth) |
| **W6** Owner gates | G1 Firebase / G3 EAS / G4 GCP / G5 device | Owner-driven, // au code | chaque gate WHAT reçu (§G) | G1-G5 |
| **W7** Final convergence | full `npm run verify:e2e:web` + cross-surface E2E + visual 4-lang tous écrans + invariants attestation + zones high-risk diff review | Séquentiel | **2 cycles consécutifs P0+P1=0 + findings identiques** ; tag `v1.0.0-ship-ready` | — |
| **W8** Store submission | App Store + Play : metadata, screenshots 4-lang, privacy nutrition labels, EAS build prod, internal track | Séquentiel, post-merge | binaire TestFlight + Play internal track ✅ | G1,G3,G4 |

### Wave-checkpoint protocol (6 points, fin de chaque wave)
- [ ] Toutes tasks PASS ou baseline-known fail documenté
- [ ] Zones high-risk §2 : `git diff --stat` = 0 ligne OU citée+adversary OK
- [ ] Invariants : 5 tests attestation verts (clinical/GDPR/i18n/link/rules)
- [ ] Visual gate tiré (screenshots Read + analysés) si frontend touché
- [ ] RED adversary : 0 P0/P1 NEW non-traité
- [ ] Ce GOAL §X + memory `project_v1_release.md` updated (HEAD + wave close)

### Convergence-failure protocol
3e heal-loop sur même cluster → STOP, spawn `Plan` subagent (analyse pivot), écrire `docs/V1_AUTONOMOUS_RUN/STUCK_<wave>_<ts>.md`, surface owner : A) accept-with-doc B) pivot archi C) défer v1.0.1 D) human gate. **Ne pas auto-choisir.**

### Parallélisme autorisé
W2/W3/W4 touchent des services disjoints (chatbot ≠ notif ≠ content) → audit phases parallélisables ; **mais implementer jamais //** (1 seul writer). W5 peut tourner // avec W2-W4 (zones ready, domaines disjoints). W6 (owner) // tout.

> **Corpus disjoints (vérifié 2026-05-29, `grep`)** : le chatbot lit `ARTICLES` depuis le **fichier local statique** `src/data/chatbot_data.ts` (`chatbot/data/local_data.ts:2`), tandis que `contentService` lit depuis **Firestore** (`collection(db,'articles'/'supplements'/'articlesAntigravity')`). Donc T-2.2.1 (édite `chatbot_data.ts`) et T-4.3.1 (édite seed Firestore / `articles_db.json`) touchent des fichiers différents → **W2∥W4 valide, 0 conflit writer**.
> **⚠️ Nuance — deux sources de vérité** pour le contenu article (local chatbot vs Firestore content). **Add task T-4.1.4** : auditer la cohérence des deux corpus (un article corrigé côté Firestore ne se propage pas au chatbot). Décision cohérence/unification = owner gate G0b.

---

## §G — Owner gates (WHO / WHAT / WHERE)

| Gate | Description | WHO | WHAT (artefact débloquant) | WHERE (preuve) | Status | Bloque |
|---|---|---|---|---|---|---|
| G0 | Choix scope améliorations chatbot | Owner (+ Claude reco) | sélection items dans `CHATBOT_AUDIT_2026-05-29.md` | checkpoint W2 + memory | PENDING | Sub 2.2 |
| G0b | Choix scope contenu + besoin review sage-femme | Owner | sélection dans `CONTENT_AUDIT_2026-05-29.md` | checkpoint W4 | PENDING | Sub 4.3 |
| G1 | Firebase backend : `firebase deploy --only firestore:rules` + App Check (App Attest/Play Integrity) + **Anonymous Auth ON** (P0-1) | Physical owner | deploy log + Console screenshots | commit tag + memory | PENDING | W6, ship |
| G3 | EAS Secrets migration (6 secrets) | Physical owner | `eas secret:list` ✅ + retrait `.env`/`eas.json` | deploy report | PENDING | W6, build prod |
| G4 | GCP API key restrictions | Physical owner | Console Credentials screenshot (referrer/bundle/API allowlist) | memory | PENDING | W8 |
| G5 | Device smoke fr/ar/tn iOS+Android + **notification reçue physiquement** (lien T-3.3.1) | Physical owner | photo/log notif reçue + RTL device | `NOTIF_DEVICE_SMOKE.md` | PENDING | W7 sign-off |

**Owner-gate-waiting protocol** : pendant qu'un gate est PENDING, Claude N'EXÉCUTE PAS la wave qui en dépend, mais EXÉCUTE les waves indépendantes. Ex : G1 bloque W6/W8 mais PAS W2-W5 (code local). User a précisé : gates G1/G3/G4/G5 = **après** le code → Claude attaque W1-W5 d'abord.

---

## §R — Références

- Pipeline par task : `~/.claude/skills/ultra-audit-profond/SKILL.md`
- Composition : `superpower-gstack` · `superpowers:{brainstorming,writing-plans,TDD,verification-before-completion,dispatching-parallel-agents}` · `test-e2e` (règle convergence)
- État projet : `docs/V1_AUTONOMOUS_RUN/VERDICT_v9.md` (HEAD `b98fddb`, 368 tests, 12 fixes) · `FEATURE_MAP_AND_AUDIT.md` (43 fn + 6-rôles audit) · `findings.md` (F31-F609) · `ADVERSARY_BRIEF.md`
- Backlog résiduel : VERDICT_v9 §3 (P0-1, P1-3, P2-1/2/5/6/7/8/9)
- CLAUDE.md (repo root) — méthodo GSTACK + adversary + test-driven
- Memory : `project_v1_release.md` · `feedback_adversary_loop.md` · `reference_audit_docs.md`

---

## §F — Règle finale (DONE = SHIPPABLE)

Ce GOAL est DONE quand, et seulement quand :
1. **W2-W4 (priorités user) convergés** : chatbot amélioré + testé (0→suite), notifications prouvées (mock + device G5), articles 4-lang complets.
2. **Chaque fonction (§8) confirmée** : chemin de test vert, aucune en l'air.
3. **i18n-parity green partout** : `i18nParity.test.ts` 0 manquant sur 19 namespaces, asserté chaque wave — FR/EN/AR/TN toujours, invariant utilisateur.
4. **Invariants §2 intacts** : clinical-safety + GDPR + link-safety + rules attestés.
5. **Convergence finale** : 2 cycles P0+P1=0 + findings identiques + `npm run verify:e2e:web` vert + cross-surface E2E + visual 4-lang.
6. **Owner gates débloqués** : G1/G3/G4/G5 reçus.
7. **Binaire en TestFlight + Play internal track.**

**Pas « presque » — production-perfect ou bloqué.** Pas de caveat. Pas de « good enough ».

---

*GOAL généré 2026-05-29 par orchestrateur Claude (ultra-architect-planify). Ancres vérifiées via `ls`/`find`/`Read` 2026-05-29. Advisor consulté avant écriture. Lancement : « lance le GOAL » → Axis 10 (pre-flight W1 → ultra-audit-profond par task).*
