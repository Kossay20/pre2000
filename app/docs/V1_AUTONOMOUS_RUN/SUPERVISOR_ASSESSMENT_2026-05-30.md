# 🧭 Supervisor Assessment — Mama & Bébé v1.0 (client/user lens)

**Date** : 2026-05-30 · **HEAD** : `6b4d06c` · **Méthode** : 7 lecteurs parallèles (doc+code) + vérification directe des P0 par le superviseur.
**Question posée** : « comme superviseur, côté client/user, qu'est-ce qui est validé vs pas encore validé, et qu'est-ce qui est le mieux pour chaque chose. »

---

## 0 · Verdict en une phrase

**L'app est *ship-CAPABLE*, pas *ship-PROUVÉE*.** La **logique** de base est solide et réellement testée (calculs, seuils cliniques, numéros d'urgence, migration, validation, contenu i18n). Mais les **parcours réels que vit une utilisatrice** sont en grande partie non prouvés, et **6 problèmes P0** touchent la sécurité patiente ou cassent silencieusement le premier lancement. Le label « 100% production-ready code-side » (Cycle 9) est **optimiste** : il repose sur des tests unitaires + 1 seul E2E joué sur un export statique avec un profil invité pré-injecté.

> Ce que tu as **validé toi-même** (« la fonction est bien, les suggestions sont bonnes, la date par défaut est bonne ») est vrai **en surface / UX**. Mon travail de superviseur est de te dire ce qui, **sous la surface**, n'est pas encore prouvé — surtout sur tes 3 priorités (chatbot, notifications, articles).

---

## 1 · ✅ VALIDÉ — à garder, ne pas re-toucher (prouvé par un vrai test)

| Domaine | Ce qui est réellement prouvé | Preuve |
|---|---|---|
| **Seuils cliniques** | TA ≥160/110 → alerte critique ; glucose bandes <3.5 / 3.5-5.5 / 5.6-6.9 / 7-10 / >10 ; poids -3kg sévère — bornes testées | `clinicalChecks.test.ts` |
| **Numéros d'urgence** | FR 15 / TN 190 / MA 141 / DZ 16 — **vérifiés réels via web** (US Embassy, SAMU), garde « never guess » si pays inconnu | `clinicalChecks.test.ts:193-262` |
| **Calcul grossesse/fertilité** | semaine/jour, terme, fenêtre fertile — sûr années bissextiles | `pregnancyCalculator.test.ts`, `fertility.test.ts` |
| **Validation saisie santé** | poids 0/négatif/>300 rejeté, TA diastole≥systole impossible rejetée | `validateHealthEntry.test.ts` |
| **Auth** | politique mdp (strict signup / permissif login legacy), rate-limiter login, résolution profil login | `validation.test.ts`, `rateLimiter.test.ts`, `AuthContext.login.test.ts` |
| **Migration invité→compte** | écrit les bonnes collections, isole par user_id, tolère échecs partiels | `migrateGuestData.test.ts` (exécution réelle) |
| **Règles Firestore** | couvrent tous les writes du client | `firestoreRulesParity.test.ts` |
| **Messages notif + RDV** | routing 4-langues correct + maths fuseau RDV H-2 (DST) | `notificationMessages.test.ts`, `rdvNotificationService.timezone.test.ts` |
| **Contenu i18n (texte UI)** | AR et **TN sont de vraies traductions humaines** (Darija authentique, 195 clés ≠ AR), parité structurelle **aujourd'hui** (19 namespaces, 1455 chaînes × 4, 0 vide) | inspection + `passwordMin.test.ts` |

**Suite totale : 368 tests, verts** (re-vérifié cette session). Cette fondation est bonne — l'investissement test n'est pas à refaire.

---

## 2 · 🔴 PAS ENCORE VALIDÉ — par priorité (la liste qui compte)

### ⭐ Priorité #1 — CHATBOT (le plus important pour toi)
| # | Problème | Risque client | Sev | Statut |
|---|---|---|---|---|
| C1 | **L'escalade d'urgence n'a AUCUN test automatisé**, dans aucune langue (aucun test sur `analyzeMessage`). Seule preuve historique : 1 capture FR (« saignement »). | Si les mots-clés/data changent, une vraie urgence peut ne déclencher **aucune** alerte ni bouton d'appel. Sécurité vitale, sans filet. | **P0** | **vérifié** (0 test analyzeMessage) |
| C2 | **Détection EN cassée — vérifiée sur le moteur réel** : « I have heavy bleeding » → **AUCUN red_flag** ; « I want to kill myself » → **AUCUN red_flag**. Cause racine : le FuzzyMatcher **corrompt les mots EN** vers le vocabulaire FR/AR (`kill`→« oil: », `mild`→« mal », `heavy`→« Heavy ») et « bleeding » n'est dans aucun `keywords_en`. | Utilisatrice anglophone en **vrai danger** : aucune alerte, aucun bouton d'appel. | **P0** | **vérifié par moi** |
| C2b | **Faux positifs EN** : « I have a mild headache » (bénin) → red_flag `urgent_consult` (« crampes sévères ») ; « I am bleeding a lot » escalade mais sur le **mauvais flag** (éclampsie, pas hémorragie). | Sur-triage anglophone : l'app « crie au loup » sur du bénin et étiquette la mauvaise pathologie → perte de confiance + désensibilisation aux vraies alertes. | P1 | **vérifié par moi** |
| C3 | `red_flags_db.json` a `keywords_tn` = copie de `keywords_ar` (le `chatbot_data.ts` in-app est OK). | Tout pipeline lisant le JSON perd la Darija. | P1 | agent |
| C4 | Articles « recommandés » avec un red-flag souvent **hors-sujet** (hémorragie → « Examens médicaux »). | Confiance érodée au pire moment. | P1 | agent |
| C5 | Vendu « **AI chatbot** » (CYCLE7_COMPETITIVE_STRATEGY) alors que c'est un matcher mots-clés + TF-IDF **offline** (pas de LLM). | Écart d'attente → déception, sur-confiance dans un triage non-intelligent. | P2 | agent |

### ⭐ Priorité #2 — NOTIFICATIONS / RAPPELS / ROUTINES (« prouve qu'elles partent »)
| # | Problème | Risque client | Sev | Statut |
|---|---|---|---|---|
| N1 | **Personne n'a confirmé qu'une notif arrive sur un vrai téléphone.** Aucun test auto ne peut le prouver (l'OS prend le relais) ; le smoke device (action opérateur #5) **n'a jamais été fait**. | C'est ta priorité #2 et elle est **totalement non confirmée**. Si permission/canal/trigger est faux → **zéro rappel**, l'utilisatrice ne le sait jamais. | **P0** | agent |
| N2 | **Le test censé prouver « rappel quotidien programmé avec le bon trigger » ÉCHOUE en isolation** (`Received: null`) — il ne passe que par fuite d'état de mock dans l'ordre complet. Et il ne vérifie même pas le type de trigger ni le canal Android. | « 368 tests passent » est **trompeur** exactement sur la question #2. | **P0** | **vérifié par moi** (`npx jest -t` → 1 failed) |
| N3 | `syncRemindersToNotifications` (ce qui tourne quand l'utilisatrice active un rappel) — **zéro test**, early-return sur web donc l'E2E ne le touche jamais. | Activer un rappel peut ne **rien** programmer, silencieusement. | P1 | agent |
| N4 | `babyMessageService` (le message quotidien de bébé) — aucun test. | Le message signature peut ne jamais partir. | P1 | agent |

### ⭐ Priorité #3 — ARTICLES / RESSOURCES (« 10 articles + compléments, améliorer l'archi »)
| # | Problème | Risque client | Sev | Statut |
|---|---|---|---|---|
| R1 | **Compléments en FRANÇAIS uniquement** pour les users AR/EN/TN : `name/dose/précautions/notes` = **0/15 traduits** (FR 15/15). | **Posologie/précautions dans la mauvaise langue sur un écran de sécurité grossesse = dangereux**, pas cosmétique. | **P0** | **vérifié par moi** (0/15 AR/EN/TN) |
| R2 | **Les compléments ne sont jamais semés dans Firestore** : `importData.ts` ne les importe pas, aucun writer vers `collection('supplements')` dans le repo (les écrans la **lisent**, Diagnostic attend 15). | L'onglet Compléments (et « compléments liés » des articles) **vide en prod** sauf seed manuel. | **P0** | **vérifié par moi** |
| R3 | **Articles non revus cliniquement** : 0/80 ont auteur/sources/`reviewedBy`. La revue sage-femme (gate G0b) est PENDING. | Conseil médical non revu envoyé à des femmes enceintes — risque légal/réputation que les disclaimers ne couvrent pas. | **P0** | agent |
| R4 | **TN = copie mot-à-mot de AR** sur 80/80 articles (pas de vraie Darija) malgré le marketing « Arabe + Darija ». | Le différenciateur promis n'est pas livré. | P1 | agent |
| R5 | **3 corpus d'articles en conflit** ; `app/articles_db.json` est **JSON INVALIDE** (virgule traînante → crash `JSON.parse`). | « Combien d'articles ? » n'a pas de réponse déterministe ; 1 fichier casse. | P1 | **vérifié par moi** (parse INVALID) |
| R6 | `contentService`/`tipsService`/fallback i18n — **aucun test** (dedup, chunking 'in'≤10, cache, fallback tn→ar→en→fr). Détails articles/compléments + ForbiddenFoods **jamais ouverts en E2E** (screenshot only). | Régression silencieuse : clés dupliquées, ou FR servi à une user AR, ou détail vide. | P1 | agent |

### ⭐ Invariant transverse — i18n / 4 LANGUES (ta règle dure)
| # | Problème | Risque client | Sev | Statut |
|---|---|---|---|---|
| I1 | **Aucun test de parité de clés** entre les 4 locales. La règle « tout traduit dans les 4, toujours » n'est gardée **par rien**. La parité tient aujourd'hui mais tout futur ajout en `fr/` seul livrera une clé brute / du FR aux users AR/TN. | Une user arabophone voit une clé brute (`tasks.confirmTime`) ou du FR dès qu'une feature ship sans les 4 trad. | **P0** | **vérifié** (seul `passwordMin.test.ts`) |
| I2 | **RTL jamais prouvé** par une assertion (le seul test AR ne fait qu'une capture). Sur web, mismatch possible « AR persisté vs LTR en mémoire » → **boucle de reload** plausible. | La user Maghreb (cœur de cible) peut avoir une mise en page LTR (lecture cassée) ou une page qui reload en boucle. | **P0** | agent |
| I3 | **Pluriels arabes faux** : suffixe `_plural` déprécié (i18next v25 utilise CLDR `_zero/_one/_two/_few/_many/_other`). | « 3 مهمة » (singulier) au lieu de « 3 مهام » → arabe qui paraît cassé/amateur. | P1 | agent |

### Transverse — PARCOURS INVITÉ & GUARDS (le blocage #1 silencieux)
| # | Problème | Risque client | Sev | Statut |
|---|---|---|---|---|
| G-A | **Le mode invité (chemin par défaut « Continuer en invité ») dépend du toggle « Anonymous Auth » dans la console Firebase.** S'il est OFF → fallback uid local qui échoue `isAuthenticatedReader()` → **tous les contenus refusés → coquille vide**, sans message. Zéro test. | **Majorité des premiers lancements** : app qui s'ouvre mais vide (0 article, 0 contenu semaine, 0 tip). | **P0** | agent |
| G-B | **Suppression de compte (RGPD Art.17)** prouvée seulement par un garde regex statique (noms de collections présents), **jamais exécutée** par un test. | On peut dire à une user « tes données sont effacées » alors qu'un bug de batch laisse des données santé orphelines. | P1 | agent |
| G-C | **Onboarding TTC & Curious non complétés en E2E** ; TTC rend l'UI grossesse avec semaine 0. | Une user TTC voit un « dashboard de grossesse fantôme ». | P1 | agent |

### Transverse — PREUVE E2E (la crédibilité du « prêt »)
| # | Problème | Sev |
|---|---|---|
| E1 | **Env E2E live cassé** (404 sur `/HomeMain`), et `npm run verify` **n'exécute pas l'E2E** (verify = lint + tsc + jest). Aucun parcours utilisateur n'est gardé en CI. | **P0** |
| E2 | **3 specs E2E sur 6 sont périmées** (cliquent l'ancien label emoji « 🏠 🏠 Home » remplacé au Cycle 9) → échoueront. Le « 15/15 » ne couvre que `cycle9-fixes` sur export statique + invité pré-injecté. | P1 |
| E3 | Écrans à plus fort enjeu **sans E2E fonctionnel** : triage chatbot, alertes TA/glucose, tout le surface AR/RTL. | P1 |

### Santé — 2 corrections rapides (1 ligne chacune presque)
| # | Problème | Sev |
|---|---|---|
| H1 | **Glucose : la cible affichée (3.5-7.8) contredit le seuil d'alerte (≥7.0 = SÉVÈRE)** — `meal_context` codé en dur « fasting ». Une lecture 7.5 (dans la « cible » affichée) déclenche une alerte effrayante. | P1 |
| H2 | `HealthDashboard:202` utilise `getEmergencyNumber(country)` au lieu de `resolveEmergencyNumber(country, locale)` (comme Chatbot/Contraction). User AR/TN sans `country` → alerte affichée **sans bouton d'appel**. | P1 |

---

## 3 · Mon verdict de superviseur — le mieux pour chaque chose

**Ship-blockers absolus (à faire avant store, non négociable) :**

1. **Parcours invité prouvé** (G-A) — c'est le **#1 blocage client**. Action opérateur : activer **Anonymous Auth** + déployer **firestore.rules** + seeder les collections, **puis** rejouer 1 parcours réel (invité frais → onboarding → Home affiche contenu). Sans ça, la majorité des premiers lancements = app vide.
2. **Chatbot triage** (C1+C2) — écris une **suite Jest sur `analyzeMessage`** avec un corpus d'urgence par langue (FR/EN/AR/TN + arabizi) qui asserte `type==='red_flag'` + bonne sévérité ; **corrige les mots-clés EN** (bleeding, idées suicidaires) ; les flags `emergency` doivent l'emporter sur les flags mineurs. Garde le badge **BETA** et **arrête de l'appeler « AI »** en copy store tant que le triage n'est pas testé.
3. **Compléments** (R1+R2) — confirme/écris le **seed Firestore** des compléments, **traduis name/dose/précautions/notes en AR + EN** au minimum. Posologie en mauvaise langue = sécurité patiente.
4. **Revue clinique** (R3) — fais signer le corpus articles+compléments par une sage-femme/OB avant lancement + attribution « revu par » visible.
5. **Garde de parité i18n** (I1) — **construis le test de parité de clés** sur les ressources fusionnées et câble-le dans `npm run verify`. ~30 lignes, c'est ce qui fait tenir ta règle dure « tout dans les 4, toujours ».
6. **RTL prouvé** (I2) — **1 test E2E AR** : `document.dir==='rtl'`, texte arabe rendu, **pas de boucle de reload** ; corrige le mismatch boot dans `rtl.ts`.
7. **Notif device** (N1) — traite le **smoke device fr/ar/tn (action #5) comme un gate dur**, pas un « nice-to-have » : 1 run enregistré iOS + Android (permission, canal, notif reçue + tap → bon onglet). Et **corrige le test fragile N2** (~20 min) pour que « 368 verts » veuille dire quelque chose.

**À corriger mais non bloquant store :** H1 glucose (relabel ou meal-context), H2 emergency resolver (1 ligne), C3/C4 chatbot, R4/R5/R6 contenu, I3 pluriels arabes, G-B test delete réel, G-C TTC/Curious (ou flag « beta » honnête), E1-E3 réparer l'env E2E + specs périmées.

**À planifier post-v1 (pas un blocage) :** App Check Enforce (jamais avant fenêtre de monitoring), migration secure-store PII, rate-limiter serveur, refacto ProfileScreen, desktop layout.

---

## 4 · Impact sur le GOAL (waves)

Les findings ci-dessus **remplacent** les audits que les waves W2.0 (chatbot) et W4.1 (contenu) devaient produire — ce document **EST** `CHATBOT_AUDIT` + `CONTENT_AUDIT`. Réordonnancement recommandé :

- **W1** garde sa place mais **ajoute** : corriger N2 (test fragile) + R5 (JSON invalide) — 2 quick wins de crédibilité.
- **W2 Chatbot** : scope figé = C1/C2 (P0 triage + test corpus) d'abord, C3/C4/C5 ensuite. **Plus besoin de gate G0** (l'audit est fait) — owner valide juste la liste.
- **W3 Notifications** : N2 (fix test) + N3/N4 (tests) + N1 (gate device, dur).
- **W4 Articles** : R1/R2 (compléments AR/EN + seed) + R3 (gate clinique) prioritaires sur le reste.
- **i18n (W1)** : I1 (parité) + I2 (RTL) sont P0, pas P1 comme initialement écrit.
- **Owner gates** : Anonymous Auth + rules deploy ne sont **PAS** « après le code » — G-A en fait des **blocages du parcours invité** ; à faire en parallèle tôt pour pouvoir prouver le parcours.

---

## 5 · Ce que j'ai vérifié moi-même (pas seulement les agents)

- ✅ `app/articles_db.json` = **JSON invalide** (`node JSON.parse` → token `}` @69515).
- ✅ Compléments : **FR 15/15, AR/EN/TN 0/15**.
- ✅ Aucun seed `supplements` dans le repo (lecture par 4 écrans, écriture nulle).
- ✅ Test notif `'schedule with correct parameters'` → **échoue en isolation** (`Received: null`), passe seulement en suite complète.
- ✅ Suite = **368 tests**, i18n = **seul** `passwordMin.test.ts` (aucune parité).
- ✅ **Chatbot — moteur réel rejoué** (replica fidèle de `_analyzeMessage` l.206-312 + vrai `KeywordEngine` + vraies `RED_FLAGS`) : EN « heavy bleeding » & « kill myself » → **NO red_flag** ; « mild headache » → faux `urgent_consult` ; FR/AR/TN → `emergency` OK. EN systématiquement cassé.
- ✅ **G-A confirmé via `firestore.rules`** : tout le contenu (`articles/weeks/tips/supplements`…) = `allow read: if isAuthenticatedReader()` (l.218-231) = `request.auth != null`. Contenu **NON public** → invité sans session Firebase anonyme = lecture refusée = coquille vide. (Le « public read » du FEATURE_MAP était imprécis.)
- Restent attribués aux agents (non re-vérifiés par commande) : RTL boucle reload, GDPR delete non-exécuté, TTC ghost-pregnancy, env E2E 404, TN article=copie AR — fiables mais marqués comme tels.

---

*Superviseur : Claude. Lentille : utilisatrice enceinte FR/Maghreb, dans sa langue. Aucun rapport avec un quelconque projet tiers — Mama & Bébé seulement.*
