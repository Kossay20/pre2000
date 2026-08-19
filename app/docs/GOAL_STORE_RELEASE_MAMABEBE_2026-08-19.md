# 🚀 GOAL — STORE RELEASE (App Store + Google Play) · Mama & Bébé v1.0

**Slug** `STORE_RELEASE_MAMABEBE` · **Créé** 2026-08-19 · **Branche** `feat/interaction-ux-2026-06-18` @ `75dc554`
**Portée** : passer de « code validé » à **« binaire publié sur les deux stores »**.
**Statut baseline (vérifié cette session)** : `npm run verify` **GREEN — 73 suites / 1913 tests**, `tsc --noEmit` clean, `lint:colors` clean.

---

## §0 — Anti-duplication (lire avant d'ouvrir un autre doc)

Ce GOAL est **le document unique** du chemin vers les stores. Il **remplace** en tant que source de vérité :

| Doc antérieur | Ce qu'on en garde | Ce qui est périmé |
|---|---|---|
| `V1_AUTONOMOUS_RUN/GOAL_PATH_TO_STORE_2026-05-30.md` | la logique des gates owner G1–G5 | les vagues W1–W5 code (faites) ; branche `release/v1.0-ship` (dépassée) |
| `V1_AUTONOMOUS_RUN/SMART_TASKLIST_PATH_TO_STORE_2026-05-30.md` | rien (absorbé) | T1–T13 (T1–T9 faits ou reclassés) |
| `V1_AUTONOMOUS_RUN/STORE_LISTINGS_DRAFT.md` | le brouillon de copy FR/EN/AR/TN | les dimensions/checklists (incomplètes) → §6 ici |
| `V1_AUTONOMOUS_RUN/OWNER_RUNBOOK.md` | les clics Firebase | numérotation des gates (divergente) → §5 ici |
| `GOAL_ULTRA_DEEP_CONSOLIDATED_2026-06-22.md` | l'attestation de profondeur du code (W1–W10 convergés) | sa liste de gates (renumérotée ici) |
| `VALIDATION_DOSSIER_HUMAN_2026-06-02.md` | la matrice 14 pages × 4 langues | l'état « 1631 tests » (→ 1913) |

**Règle** : aucun nouveau doc de plan. Tout avancement s'écrit dans le **§9 Journal** de CE fichier.
Les gates ont **une seule numérotation** : celle du §5. Les anciens G1–G5 divergents sont annulés.

---

## §1 — Vérité terrain (mesurée le 2026-08-19, pas recopiée)

### §1.1 Ce qui est bon
| Fait | Preuve |
|---|---|
| Suite verte | `npm run verify` → 73 suites / 1913 tests / exit 0 |
| Expo SDK 54, RN 0.81.5, React 19.1 | `app/package.json` |
| Workflow **managed** (ios/ + android/ non trackés) | `.gitignore:/ios,/android` ; `git ls-files ios android` → 0 |
| Bundle IDs cohérents | `app.json` `ios.bundleIdentifier` = `android.package` = `com.mamabebe.app` |
| Manifeste de confidentialité iOS déjà rédigé | `app.json` `ios.privacyManifests` (10 types de données + 4 API reasons) |
| Chiffrement déclaré | `ITSAppUsesNonExemptEncryption: false` |
| Permissions Android minimales + `blockedPermissions` (9) | `app.json` `android` |
| Suppression de compte in-app (exigence Apple 5.1.1(v) **et** Play) | `AuthContext.deleteAccount` + `gdprPurge.ts` + `ProfileScreen.tsx:41` |
| Export de données (RGPD art.15) | `dataExportService` ← `SettingsScreen.tsx:33` |
| Whitelist de schémas URL (anti-`javascript:`/`intent:`) | `src/utils/safeOpenUrl.ts:21` |
| Site légal en ligne | `curl` → `mama-et-bebe.com` **200**, `/privacy.html` **200**, `/support.html` **200** |
| Bannière offline + live-region a11y | `src/components/common/OfflineNotice.tsx` (NetInfo) |
| Cache Firestore persistant | `src/config/firebase.ts` → `persistentLocalCache()` |
| Règles Firestore écrites + durcies | `app/firestore.rules` (12 Ko, helpers owner/schema/size) |
| Badge iOS désactivé volontairement (évite l'entitlement) | `notificationService.ts` `shouldSetBadge:false` |

### §1.2 Bloqueurs découverts cette session (aucun n'était tracké)

| # | Sévérité | Fait | Preuve | Conséquence si non traité |
|---|---|---|---|---|
| **B1** | 🔴 P0 build | `google-services.json` **absent** du repo alors que `app.json` le référence | `ls google-services.json` → *No such file* ; `app.json:android.googleServicesFile` | **Le build EAS Android échoue** (prebuild ne trouve pas le fichier) |
| **B2** | 🔴 P0 build | `GoogleService-Info.plist` **absent** ET `app.json` `ios` n'a **aucune** clé `googleServicesFile` | `ls` + dump `app.json.ios` | `@react-native-firebase/app` ne s'initialise pas sur iOS → **App Check mort en prod**, crash possible au boot natif |
| **B3** | 🔴 P0 runtime | `expo-font` — **peer dependency manquante** de `@expo/vector-icons` | `npx expo-doctor` : « Your app may crash outside of Expo Go without this dependency » | **Crash au démarrage du binaire store** (toutes les icônes Ionicons) |
| **B4** | 🟠 P1 build | 5 paquets Expo désalignés du SDK 54 | `expo-doctor` : expo 54.0.34→37, expo-constants, expo-file-system, expo-localization, expo-updates | Bugs natifs non reproductibles en web ; support Expo refusé |
| **B5** | 🟠 P1 store | `eas.json` `submit.production.ios` = `{}` (ni `appleId`, ni `ascAppId`, ni `appleTeamId`) ; `android.serviceAccountKeyPath` pointe sur `./google-service-account.json` **absent** | `cat eas.json` + `ls` | `eas submit` impossible sans intervention manuelle à chaque run |
| **B6** | 🟠 P1 store | **Icône iOS pré-arrondie avec coins opaques blancs** ; `adaptive-icon.png` est **le fichier identique** à `icon.png` (328 893 o des deux côtés) | `sips` + inspection visuelle des 2 PNG | iOS : liseré blanc dans les coins après masquage Apple. Android : le masque adaptatif rogne ~28 % → **la silhouette est coupée** |
| **B7** | 🟠 P1 store | **Aucun asset de listing** : 0 screenshot aux dimensions store, pas de feature graphic 1024×500 (obligatoire Play), pas d'icône 512×512 Play | `find . -iname "*store*"` → rien ; `assets/` = 4 PNG applicatifs | Impossible de soumettre |
| **B8** | 🟡 P2 | `@sentry/react-native` initialisé sans le **config plugin** `@sentry/react-native/expo` dans `app.json.plugins` | `app.json.plugins` (4 entrées, aucune Sentry) | Pas d'upload de sourcemaps → crashs prod illisibles |
| **B9** | 🟡 P2 | `expo-updates` configuré (`updates.url`, `runtimeVersion: appVersion`) mais **aucun `channel`** dans les profils `eas.json` | `cat eas.json` | Les OTA ne sont pas routées → pas de canal de hotfix après publication |
| **B10** | 🟡 P2 | Node par défaut de la machine = **18.20.7**, projet exige **20.20.2** | `nvm ls` (`default -> 18`) ; `.nvmrc` = 20.20.2 | `expo-doctor`/`expo export` cassent silencieusement hors `nvm use` |
| **B11** | 🟡 P2 | `firestore.indexes.json` = **47 octets** (vide) alors que le code fait des requêtes composées | `ls -la firestore.indexes.json` | Requêtes en échec `failed-precondition` en prod sur données réelles |
| **B12** | ⚪ décision | `ios.supportsTablet: true` | `app.json` | Apple **exige** alors un jeu de screenshots iPad 13" + une UI iPad correcte |

### §1.2b Bloqueurs trouvés pendant l'exécution (vague W3, captures réelles)

| # | Sévérité | Fait | Preuve | Conséquence |
|---|---|---|---|---|
| **B13** | 🔴 P1 review | L'écran **Ramadan & Grossesse** affiche en production un bandeau **« ⚠️ Contenu en cours de revue clinique. À valider avec votre médecin et un imam. »**, traduit dans les 4 langues, et il est accessible depuis l'accueil | `src/i18n/locales/{fr,en,ar,tn}/cycle8.json` clé `ramadan.draftBanner` ; `RamadanPregnancyScreen.tsx:193` ; `HomeScreen.tsx:956` | **Contenu marqué non validé, visible par le reviewer** → Apple 2.1 (App Completeness) + risque médical réel (jeûne pendant la grossesse). **Décision requise** : masquer l'entrée jusqu'à GT-4, ou obtenir la revue avant soumission |
| **B14** | 🔴 P1 comportement | Activer Anonymous Auth (**GT-2**) inverse le mode invité : `isGuest: !isAuthenticated` devient **false** pour une utilisatrice qui a choisi « Continuer en invitée », puisque `signInAnonymously` réussit | `AuthContext.tsx:407` (`isGuest: !isAuthenticated`) + `:345` + `:228` (`upgradeGuest` écrit explicitement pour `current.isAnonymous`) ; les entrées vers `GuestUpgrade` testent toutes `user?.isGuest` (`CalendarScreen.tsx:378`, `AddAppointmentScreen.tsx:390`) | Le parcours de conversion invité→compte devient **inatteignable** au moment même où il devient utile ; `upgradeGuest`'s anonymous-link branch devient du code mort. **Toute la campagne d'audit a tourné avec Anonymous Auth OFF** — cette configuration n'a jamais été exercée. Correctif ≠ une ligne : `isGuest` conditionne aussi la synchro profil→Firestore (`AuthContext.tsx:564`). **À traiter juste après GT-2, avant soumission** |
| **B15** | 🟠 P1 vitrine | **iPad** : la mise en page téléphone est étirée à 1032 pt — typographie minuscule, cartes pleine largeur, grandes zones vides | `store/screenshots/ipad-13/*` | Vous avez choisi de garder `supportsTablet: true` → il faut un conteneur `maxWidth` + une passe de revue par écran, sinon l'expérience iPad dessert l'app auprès du reviewer |
| **B16** | ✅ corrigé | L'onglet **Chatbot** n'avait aucun chemin de deep link, alors que les 4 autres en avaient un ; le catch-all `getStateFromPath` renvoyait silencieusement sur l'accueil | `App.tsx` linking config | Une notification pointant vers l'assistant n'ouvrait pas l'assistant. Corrigé + `__tests__/deepLinking.test.ts` (vérifié rouge sur le code d'avant) |
| **B17** | ⚪ vérifié, pas un défaut | Un invité ne peut ni charger ni enregistrer d'événement de calendrier | `calendarService.ts:206,244,266` + bannière et conversion de compte dans `AddAppointmentScreen.tsx:516` avec **préservation du brouillon** | Comportement produit assumé et correctement traité en UX. **Mais** : impossible de produire une capture calendrier non vide hors backend → écran retiré du jeu de screenshots, à re-shooter en W7 |
| **B18** | 🟡 P2 | `/recommendations` est vide en semaine 25 hors-ligne (« Aucune recommandation pour cette semaine ») | sonde des routes, 2026-08-19 | Soit dépendance Firestore, soit trou de données. À revérifier post-GT-2 |

### §1.3 Ce qui n'est pas prouvable en local (gates §5)
Compte EAS non connecté (`eas whoami` → *Not logged in*), donc : pas de build, pas de credentials, pas de submit.
Backend Firestore non déployé/seedé, Auth anonyme non activée → parcours invité non prouvable.

---

## §2 — Définition de DONE (non négociable)

DONE = **les deux conditions**, pas une seule :

1. **iOS** : build EAS `production` → binaire accepté par App Store Connect → **TestFlight (build « Ready to Test »)** → fiche 100 % remplie (3 locales) → **soumis à review** → *Ready for Sale*.
2. **Android** : build EAS `production` (AAB) → **Play Console internal testing** → fiche + 8 déclarations « App content » complètes → promu en **production (rollout progressif 20 %)**.

Plus, pour les deux :
- `npm run verify` vert au commit du tag `v1.0.0-store`.
- Le binaire **démarre et navigue** sur device physique iOS **et** Android (pas simulateur seul) — §7.1.
- Notifications reçues sur les deux OS (§7.4), reconnexion réseau prouvée (§7.5), suppression de compte prouvée sur backend live (§7.3).
- Zéro P0/P1 ouvert dans §1.2 et §7.

---

## §3 — Stratégie : 3 axes en parallèle

```
Axe A (Claude, sans gate)      Axe B (Owner, gates)        Axe C (Claude, post-gate)
─────────────────────────      ────────────────────        ─────────────────────────
W1 build-blockers B1..B4       GT-1 comptes stores          W6 builds EAS
W2 config store B5,B8..B11     GT-2 Firebase live           W7 vérif device réelle
W3 assets visuels B6,B7        GT-3 credentials             W8 soumission
W4 pack métadonnées §6         GT-4 revue clinique          W9 post-launch
W5 batterie de vérif §7        GT-5 fichiers natifs FB
```

Axe A démarre **immédiatement** et ne dépend d'aucune décision humaine.

---

## §4 — Vagues

### W1 — Débloquer le build natif (P0) · Claude · sans gate
| Tâche | Détail | Acceptation |
|---|---|---|
| **T1.1** | `npx expo install expo-font` (B3) | `expo-doctor` : check « peer dependencies » ✅ |
| **T1.2** | `npx expo install --check` → aligner les 5 paquets (B4) | `expo-doctor` : 18/18 ✅ |
| **T1.3** | Rendre `google-services.json` **optionnel-safe** : passer `app.json` en `app.config.ts` qui n'injecte `googleServicesFile` que si le fichier existe, + ajouter `ios.googleServicesFile` (B1, B2) | `npx expo config --json` OK **avec et sans** les fichiers Firebase ; `expo prebuild --no-install` passe |
| **T1.4** | Documenter dans `.env.example` + README l'obligation de déposer les 2 fichiers Firebase avant build prod | README à jour |
| **T1.5** | `npm run verify` + commit | vert, 0 régression vs 1913 |

**Garde-fou** : T1.3 touche la config de build → commit isolé, `expo config` diffé avant/après.

### W2 — Config de release (P1/P2) · Claude · sans gate
| Tâche | Détail | Acceptation |
|---|---|---|
| **T2.1** | `eas.json` : ajouter `channel` par profil (`development`/`preview`/`production`), `ios.resourceClass: m-medium`, `node: "20.20.2"`, cache (B9) | `eas.json` valide (`eas build:configure` non destructif) |
| **T2.2** | `eas.json` `submit.production` : placeholders documentés `appleId`/`ascAppId`/`appleTeamId` + `android.serviceAccountKeyPath` avec note « fourni par GT-3 » (B5) | doc + schéma valide |
| **T2.3** | Plugin `@sentry/react-native/expo` dans `app.json.plugins` + `SENTRY_ORG`/`SENTRY_PROJECT` en secrets EAS (B8) | plugin présent, `expo config` OK |
| **T2.4** | `firestore.indexes.json` : générer les index composites réellement requis par le code (audit des `where`+`orderBy`) (B11) | fichier non vide + `firebase deploy --only firestore:indexes --dry-run` OK |
| **T2.5** | `.nvmrc` respecté : script `preverify` ou note README ; ajouter `"engines": {"node": ">=20.19"}` (B10) | `npm run verify` refuse Node 18 avec message clair |
| **T2.6** | Bump : `version` 1.0.0 (garde), `ios.buildNumber` → géré par `autoIncrement`, `android.versionCode` → idem | `eas build` incrémente ; pas de collision |

### W3 — Assets visuels store · Claude · sans gate
| Tâche | Détail | Acceptation |
|---|---|---|
| **T3.1** | Régénérer **`icon.png`** : 1024×1024, **plein cadre**, sans coins arrondis, sans alpha (B6) | `sips` : 1024×1024, `hasAlpha: no`, aucun pixel blanc dans les coins |
| **T3.2** | Régénérer **`adaptive-icon.png`** : 1024×1024 **avec alpha**, logo contenu dans le cercle de sûreté (⌀ ~66 % = 676 px centré) | rendu masqué circulaire + carré vérifié |
| **T3.3** | **`play-icon-512.png`** 512×512 PNG-32 alpha (exigence Play) | dimensions exactes |
| **T3.4** | **`feature-graphic-1024x500.png`** (exigence Play, sans alpha) | dimensions exactes |
| **T3.5** | Pipeline **screenshots** : harnais Playwright existant, viewport + `deviceScaleFactor` calibrés pour tomber **pile** sur les tailles store (§6.3), × 3 locales (fr/en/ar), × 5 écrans | 3 × 5 PNG par cible, dimensions exactes |
| **T3.6** | **Framing marketing** : bezel device + bandeau titre localisé + fond dégradé marque, généré par script (reproductible, pas à la main) | script `scripts/make-store-shots.ts` rejouable |
| **T3.7** | Splash : vérifier le rendu `contain` sur ratio 19.5:9 et sur iPad | capture aux 2 ratios |

**Note honnête** : les captures viennent de l'export **web** de la même base de code. C'est représentatif de l'UI, mais la barre d'état et les safe-areas diffèrent du natif — d'où le framing. Dès que W6 produit un build natif, on **re-capture sur simulateur iOS + émulateur Android** et on remplace si l'écart est visible (T7.6).

### W4 — Pack métadonnées · Claude (copy) + Owner (validation) · §6
Fiches FR/EN/AR, déclarations App Privacy + Data Safety, classification d'âge, notes de review, compte de démo.

### W5 — Batterie de vérification pré-soumission · Claude · §7
Logique, duplication, sécurité, base de données, reconnexion, notifications, i18n/RTL, a11y, perf.

### W6 — Builds (gate GT-1 + GT-3 + GT-5)
`eas build -p ios --profile production` / `-p android` → artefacts.

### W7 — Vérification sur device réel (gate GT-1)
§7.1, §7.4, §7.5 rejoués sur iPhone + Android physiques, 3 locales dont AR (RTL natif).

### W8 — Soumission
TestFlight + Play internal → closed → production 20 %.

### W9 — Post-launch
Sentry, Crashlytics/vitals, alertes budget Firebase, App Check en **monitor** puis enforce, réponse aux avis, plan de hotfix OTA.

---

## §5 — Gates owner (numérotation unique — annule toutes les précédentes)

| Gate | Ce qu'il faut | Où | Bloque |
|---|---|---|---|
| **GT-1** | **Compte Apple Developer Program** (99 $/an) + **Google Play Console** (25 $). **Réponse owner 2026-08-19 : les deux seront payés une fois l'app prête et vérifiée.** ⚠️ **Cette séquence est risquée** — voir §5b. | apple.com/developer, play.google.com/console | W6, W8 — **et le calendrier entier** |
| **GT-2** | Firebase live : **Anonymous Auth activée** + `firebase deploy --only firestore:rules,firestore:indexes` + `npm run import-data` (seed) | Firebase Console + CLI | W7, §7.3 |
| **GT-3** | `eas login` (ou `EXPO_TOKEN`), credentials iOS (Apple ID + team) et Android (Play service account JSON) | terminal + Play Console → API access | W6, W8 |
| **GT-4** | **Revue clinique** (sage-femme/gynéco) : articles, dosages compléments, triage chatbot. Apple 1.4.1 / Play « Health apps » exigent l'exactitude médicale. | humain qualifié | W8 (risque de rejet + risque légal) |
| **GT-5** | Déposer `google-services.json` + `GoogleService-Info.plist` (Firebase Console → Paramètres du projet → Vos applications) à la racine `app/` | Firebase Console | W6 (App Check + init native) |
| **GT-6** | ~~Choisir iPad~~ — **TRANCHÉ 2026-08-19 : on garde `supportsTablet: true`.** Conséquences actées : jeu de screenshots iPad 13" produit (✅ W3) **et** correction de la mise en page iPad requise (**B15**) | décision owner | ✅ décidé |
| **GT-7** | Compte de **démo** pour les reviewers (email + mot de passe, données pré-remplies) | à créer après GT-2 | W8 |

### §5b — Le vrai chemin critique : ouvrir les comptes MAINTENANT, pas à la fin

Vous prévoyez de payer les deux comptes « une fois l'app prête ». C'est l'ordre le plus intuitif et le plus coûteux en délai. Raisons :

1. **Google Play, compte personnel** (le type n'est pas encore tranché) : un compte personnel créé après novembre 2023 doit faire tourner un **test fermé avec ≥12 testeurs pendant 14 jours consécutifs** avant même de pouvoir demander l'accès à la production. Ce chrono ne démarre qu'une fois le compte créé **et** un build publié sur le canal fermé. Attendre que tout soit parfait ajoute mécaniquement **2 à 3 semaines** à la fin.
   → **Recommandation** : créer le compte Play tout de suite, et **en type « Organisation »** si vous avez une structure (l'organisation est exempte de cette obligation). La vérification d'identité/entreprise prend elle-même plusieurs jours.
2. **Apple** : la validation du compte (identité, éventuellement D-U-N-S pour une organisation) prend de quelques heures à plusieurs jours. Sans compte : pas de certificat, pas de provisioning, donc **aucun build iOS signable** — et donc aucune vérification possible sur device réel (§7.1, §7.4, §7.5), qui est précisément l'étape « vraiment prêt ».
3. Sans GT-1, tout ce qui reste testable est le web. Les trois zones que vous avez citées — **notifications, reconnexion, base de données** — ne se prouvent que sur un binaire natif.

**Ce que ça ne bloque pas** : tout le travail W1–W5 (config, assets, fiches, vérifications statiques) se fait sans compte, et c'est ce qui est en cours.

---

## §6 — Spécification du pack store (exhaustive)

### §6.1 Locales
Les stores n'ont **pas** de locale « arabe tunisien ». Mapping :
| App | App Store Connect | Play Console |
|---|---|---|
| fr | French (fr-FR) | fr-FR |
| en | English (U.S.) — locale par défaut | en-US (défaut) |
| ar + tn | **Arabic** (une seule fiche, registre MSA compréhensible en Tunisie) | **ar** |

### §6.2 Textes (limites dures)
| Champ | Apple | Play |
|---|---|---|
| Nom | 30 car. | 30 car. |
| Sous-titre / description courte | 30 car. | 80 car. |
| Description longue | 4000 car. | 4000 car. |
| Mots-clés | 100 car. (virgules, sans espaces) | — (indexation via description) |
| Texte promo | 170 car. (modifiable sans review) | — |
| Nouveautés | 4000 car. | 500 car. |

### §6.3 Dimensions images (à respecter au pixel)
**Apple**
- Icône : 1024×1024, PNG, **sans alpha**, **sans coins arrondis** (livrée via le binaire).
- iPhone 6.9" — **obligatoire** : `1290×2796` (ou 1320×2868). 1 à 10 par locale ; on livre **5**.
- iPad 13" — **obligatoire si `supportsTablet: true`** (GT-6) : `2064×2752` (ou 2048×2732).

**Play**
- Icône : `512×512`, PNG 32 bits **avec alpha**.
- Feature graphic : `1024×500`, **sans alpha** — obligatoire.
- Téléphone : 2 à 8, ratio 9:16, côté 320–3840 px → on livre **5 × `1080×1920`**.
- Tablette 7" et 10" : recommandées (évite la mention « non optimisé pour tablette »).

**Recette de capture** (viewport × deviceScaleFactor = pixels finaux)
| Cible | viewport | DSF | résultat |
|---|---|---|---|
| iPhone 6.9" | 430 × 932 | 3 | 1290 × 2796 |
| iPad 13" | 1032 × 1376 | 2 | 2064 × 2752 |
| Play phone | 360 × 640 | 3 | 1080 × 1920 |

### §6.4 Écrans à montrer (5, ordonnés par force de vente)
1. **Accueil / semaine en cours** (le cœur du produit)
2. **Évolution du bébé** (visuel 3D, le plus « waouh »)
3. **Calendrier + rappels** (l'utilité récurrente)
4. **Assistant multilingue** (le différenciateur — avec la mention BÊTA visible)
5. **Suivi santé** (poids/TA/glycémie)

### §6.5 App Privacy (Apple) — réponses exactes à saisir
| Type de donnée | Collecté | Lié à l'identité | Tracking | Finalité |
|---|---|---|---|---|
| Santé (grossesse, poids, TA, glycémie, symptômes) | Oui | Oui | Non | App Functionality |
| Contact — Nom | Oui | Oui | Non | App Functionality |
| Contact — Email | Oui | Oui | Non | App Functionality |
| Contact — Autre (contacts d'urgence) | Oui | Oui | Non | App Functionality |
| Identifiants — User ID | Oui | Oui | Non | App Functionality |
| Sensible (données de santé reproductive) | Oui | Oui | Non | App Functionality |
| Contenu utilisateur — Autre | Oui | Oui | Non | App Functionality |
| Localisation approximative (pays, pour le n° d'urgence) | Oui | Non | Non | App Functionality |
| Diagnostics — Crash | Oui | Non | Non | App Functionality |
| Usage — Interaction produit | Oui | Non | Non | Analytics |

Cohérent avec `app.json.ios.privacyManifests` déjà en place — **les deux doivent rester alignés** (test de garde à écrire, §7.2).

### §6.6 Data Safety (Play) — points de vigilance
- Déclarer **Health & fitness → Health info** (données de santé reproductive = catégorie sensible).
- Déclarer le **partage tiers** : Google (Firebase Auth/Firestore/App Check), Sentry (crash).
- Chiffrement en transit : **oui**. Suppression des données à la demande : **oui** (+ fournir l'**URL de suppression de compte** — page dédiée sur `mama-et-bebe.com`, à créer si absente).
- Remplir la **Health apps declaration** (obligatoire si catégorie Médical/Santé).
- Déclarer l'**Advertising ID** : **non utilisé**.

### §6.7 Classification d'âge
- Apple : questionnaire → viser **12+** (contenu médical/sexuel éducatif). Cocher « Contenu médical/traitement rare ou modéré ».
- Play : questionnaire IARC → catégorie **Médical / Santé**, contenu éducatif.

### §6.8 Notes de review (Apple) — modèle
> Mama & Bébé est une application **compagnon** de grossesse, **pas** un dispositif médical et pas un outil de diagnostic. L'assistant est marqué BÊTA et affiche un avertissement médical permanent. Le bouton d'urgence compose le numéro d'urgence **local du pays déclaré par l'utilisatrice**.
> Un mode **invité** permet de tester sans compte (« Continuer en tant qu'invitée »). Compte de démo fourni : `<GT-7>`.
> Langues : FR / EN / AR (RTL). Basculer la langue depuis le premier écran.

---

## §7 — Batterie de vérification pré-soumission (le « vraiment prêt »)

Chaque ligne = une preuve à produire, pas une opinion.

### §7.1 Démarrage & navigation (device réel — W7)
- [ ] Cold start < 3 s, pas d'écran blanc, splash → contenu sans flash.
- [ ] Les 5 onglets + les 20+ écrans s'ouvrent sans crash (`src/screens/` = 33 écrans).
- [ ] Rotation bloquée en portrait (`orientation: portrait`) — cohérent iPad ?
- [ ] Retour Android matériel : ne quitte jamais l'app depuis un écran profond.
- [ ] AR : RTL natif — flèches retour, chevrons, carrousels du bon côté (le mémo `reference_rnweb_rtl_gotchas` note que le web ment sur `I18nManager.isRTL` → **seul le device tranche**).

### §7.2 Logique & duplication (statique — W5, Claude)
- [ ] Pas de double source de vérité entre `app.json.ios.privacyManifests` et le pack §6.5 → **test de garde**.
- [ ] Pas de doublon d'articles (déjà traité en `300ef99`) — re-vérifier après seed live.
- [ ] Écrans orphelins : `CompletedTasksScreen`, `DiagnosticScreen`, `RamadanPregnancyScreen` → routés ou retirés du bundle (poids + surface de review).
- [ ] Services en double : `reminderService` / `remindersV2Service` / `remindersScheduler` / `reminderPersistence` → cartographier qui appelle quoi, supprimer le mort.
- [ ] `console.*` résiduels en prod (`babel-plugin-transform-remove-console` actif ? vérifier `babel.config.js` en `production`).

### §7.3 Base de données & sécurité (W5 + GT-2)
- [ ] `firestore.rules` : rejouer une suite d'assertions (émulateur) — lecture d'un autre `user_id` refusée, écriture hors schéma refusée, garde de taille effective (le fix `323f699` a corrigé une règle **inerte** : vérifier qu'il n'en reste pas d'autres).
- [ ] Index composites déployés (B11) — sinon `failed-precondition` en prod.
- [ ] Quotas & **alerte budget** Firebase configurée (une app grand public sans plafond = facture surprise).
- [ ] App Check : **monitor d'abord**, enforce ensuite (l'enforce immédiat DoS les vrais utilisateurs).
- [ ] Secrets : les 7 `EXPO_PUBLIC_*` sont **publics par construction** (embarqués dans le binaire) → la protection réelle est : règles Firestore + App Check + **restrictions de clé API GCP** (bundle id iOS + package+SHA-1 Android). À faire.
- [ ] Suppression de compte → vérifier sur backend live que les 9 collections sont purgées **et** que l'utilisateur Auth disparaît.
- [ ] Export RGPD → fichier produit, lisible, complet (les historiques kick/contraction/valise/favoris étaient signalés incomplets).

### §7.4 Notifications (W5 statique + W7 device)
- [ ] Permission demandée au bon moment (pas au cold start brut).
- [ ] Android : canal `default` créé, `POST_NOTIFICATIONS` demandé à l'exécution (API 33+).
- [ ] iOS : `aps-environment: production` cohérent avec un build store.
- [ ] Rappel quotidien programmé → **reçu** ; tap → ouvre le bon écran.
- [ ] Rappel J-1 de rendez-vous → reçu, texte localisé (fr/ar).
- [ ] Notifications **récurrentes** : le point noté « native-only, web no-op » (S4 #5) doit être tranché sur device.
- [ ] Reprogrammation après **redémarrage** du téléphone (`RECEIVE_BOOT_COMPLETED` déclaré).
- [ ] Changement de fuseau / passage à l'heure d'été (`timezoneService`).
- [ ] Annulation propre à la suppression d'un rappel (pas d'orphelin — bug déjà attrapé en W4).

### §7.5 Reconnexion & résilience réseau (W5 + W7)
- [ ] Mode avion au lancement → l'app démarre, affiche le cache (`persistentLocalCache`) et la bannière offline.
- [ ] Perte de réseau **en cours d'écriture** → écriture rejouée à la reconnexion, pas de doublon.
- [ ] Retour de réseau → la bannière disparaît, les listes se rafraîchissent **sans reload manuel**.
- [ ] Token Auth expiré / session invalidée → re-login propre, pas de boucle.
- [ ] Backoff : `src/utils/retry.ts` couvre bien les appels Firestore critiques.
- [ ] Bascule Wi-Fi ↔ 4G en plein écran de chat.
- [ ] Timeout serveur → message d'erreur localisé + bouton Réessayer (jamais un écran blanc).

### §7.6 Visuel & i18n
- [ ] 5 écrans × 3 locales aux dimensions store, relus un par un.
- [ ] Aucune fuite de clé i18n brute (garde `multilang-audit.spec.ts` déjà en place).
- [ ] Contraste AA sur les textes des screenshots (ils sont aussi la vitrine).
- [ ] Comparaison capture web vs capture simulateur : écart visuel documenté ou nul.

### §7.7 Perf & poids
- [ ] Taille AAB / IPA (l'export iOS a déjà été ramené 26 → 16 Mo en `300ef99`).
- [ ] Pas de police/asset non utilisé embarqué.
- [ ] Hermes actif, `newArchEnabled: true` validé sur les deux OS.

---

## §8 — Risques & parades

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| Rejet Apple 1.4.1 (contenu médical) | moyenne | +7 j | GT-4 + disclaimer permanent + notes de review §6.8 |
| Rejet Apple 5.1.1 (données santé sans justification) | moyenne | +5 j | App Privacy §6.5 exact + privacy manifest déjà en place |
| Compte Play personnel ⇒ 14 j × 12 testeurs | **haute** | **+3 semaines** | **Vérifier GT-1 en premier** — c'est le chemin critique calendaire |
| Crash au boot (B3 `expo-font`) | haute si non corrigé | rejet immédiat | W1 T1.1 |
| App Check enforce trop tôt | moyenne | panne totale | monitor 7 j avant enforce |
| Screenshots jugés non représentatifs | faible | +3 j | re-capture simulateur (T7.6) |
| Facture Firebase | faible | € | alerte budget §7.3 |

**Rollback** : tag `v1.0.0-store` avant build ; en cas de crash post-publication → OTA `expo-updates` sur le canal `production` (nécessite B9 corrigé) ; sinon rollout Play stoppé à 20 % et retrait iOS.

---

## §9 — Journal d'exécution (source de vérité de l'avancement)

| Date | Vague | Fait | Preuve |
|---|---|---|---|
| 2026-08-19 | W0 | État des lieux ; `npm run verify` GREEN 73/1913 ; 12 bloqueurs identifiés (B1–B12) | §1 |
| 2026-08-19 | **W1** ✅ | **B3** `expo-font` installé · **B4** 5 paquets réalignés → `expo-doctor` **18/18** · **B1+B2** `app.config.ts` référence les fichiers Firebase quand ils existent, **refuse** un build `APP_ENV=production` sans eux, en les nommant · garde `__tests__/appConfig.test.ts` (13) | commit `620a0c2` |
| 2026-08-19 | **W3** ✅ | **B6** jeu d'icônes reconstruit (plein cadre iOS · foreground Android tenant dans le cercle ⌀66 dp garanti · fond + monochrome · **icône de notification blanche sur transparent**, elle pointait sur l'icône couleur = carré blanc dans la barre d'état) · splash refait (c'était une maquette carrée sur `#FF6B9D` → bandes discordantes à chaque démarrage) · garde `storeAssets.test.ts` (16, lecture directe de l'en-tête PNG) | commit `7647520` |
| 2026-08-19 | **W3** ✅ | **B7** pipeline complet : **54 screenshots** (3 formats × 3 langues × 6 écrans) aux dimensions exactes + **feature graphic Play** ×3 + `store/listing.json` (limites vérifiées par test — a attrapé une description courte FR à 81/80) | commit `b0e9334` |
| 2026-08-19 | **W3** ✅ | **B16** onglet Chatbot rendu adressable par URL + garde `deepLinking.test.ts` (vérifiée rouge sur le code d'avant) | commit `b0e9334` |
| 2026-08-19 | **W2** ✅ | **B11** `firestore.indexes.json` déployé était **vide** (une copie remplie traînait à la racine, orpheline) → 3 index dérivés du code + garde `firestoreIndexes.test.ts` qui **scanne les `query()` du source** · **duplication** : `reminderService.ts` (V1, 288 l.) + sa suite (615 l.) supprimés, plus aucun import · **B8** plugin Sentry conditionnel · **B9** `channel` EAS par profil · **B10** `npm run verify` refuse Node < 20.19 · **secret** `google-service-account.json` ajouté au `.gitignore` | commit `4fc9d61` |
| 2026-08-19 | **W5** ✅ | `babel.config.js` : `api.cache(true)` figeait la config → le retrait des `console.*` en prod pouvait ne jamais s'appliquer (cache Metro amorcé en dev). Clé de cache sur `NODE_ENV` + garde `babelConfig.test.ts` (7) | en cours |
| 2026-08-19 | **W3** ✅ | **B15** mise en page iPad : `TabletFrame` centre l'app dans une colonne de largeur téléphone au-delà de 700 pt (no-op en dessous) ; les 9 modules qui se dimensionnaient sur la **fenêtre** passent par `getContentWidth()` borné — sinon carrousels et graphiques débordaient la colonne | en cours |

---

*Plan ancré sur des commandes rejouées le 2026-08-19 (`expo-doctor`, `sips`, `curl`, `git`, `npm run verify`). Aucun chiffre recopié d'un doc antérieur sans re-mesure.*
