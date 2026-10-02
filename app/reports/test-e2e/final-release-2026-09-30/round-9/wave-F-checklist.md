# Wave F checklist, round 9 (static store compliance)

HEAD 3bfd0b3 (branch feat/interaction-ux-2026-06-18), audited 2026-10-02. No browser, no emulator, no export.
Verdict: **GREEN** (zero open P0/P1 that are not owner gates). Owner-gated P0/P1 remain open, see the end.
Finding ids F-001..F-035 are the round-2 baseline; F-036..F-039 were added in round 7; no new finding in rounds 8 and 9.

**Delta vs round 8:** none. `git status` clean and `git log -1` = 3bfd0b3, identical to round 8; no commit, so app.json, app.config.ts, eas.json, store/, ../website, firestore.rules, src/data are unchanged. Re-verified at HEAD with read-only commands: app.json/eas.json jq (ids, version, runtimeVersion, permissions, blocked, allowBackup, accountDeletionUrl app.json:218, submit placeholders), libs.versions.toml targetSdk 36, grep of Sentry/logger/notification/Settings __DEV__ lines, listing.json placeholders, screenshot dates, live curl of the site. All results identical to round 8. Not re-run (forbidden): test:rules, expo export, expo-doctor, introspect, emulator, playwright; F-02/F-03/F-23/F-27 carry the round 8 evidence. F-01 from the orchestrator. No new finding, no closure. Check ids F-01..F-30 are AUDIT_PLAN section 7.

| Check | What was checked | Evidence | Verdict |
|---|---|---|---|
| F-01 Invariant suites | npm run verify | Orchestrator (R9): last run exit 0, 147 suites / 3391 tests (includes releaseConfig, storeListing, storeAssets, appConfig, babelConfig, unreviewedContent, deepLinking, firestoreIndexes, privacyPolicy, marketingClaims, seedData). Not re-run here (forbidden). | PASS (orchestrator evidence) |
| F-02 Rules suite | npm run test:rules | Forbidden this round. Static only: firestore-rules-tests/rules.test.ts has 34 `it` and 107 assertSucceeds/assertFails calls; firestore.rules last changed 366a959 (round 3). Deployed rules are owner action G1. | NOT RE-RUN (carry baseline PASS); G1 owner |
| F-03 expo-doctor | `npx expo-doctor` | "18/18 checks passed. No issues detected!" (shell was Node 18, only a warning) | PASS |
| F-04 Ids, versions | introspect + eas.json | ios.bundleIdentifier and android.package = com.mamabebe.app; eas.json `appVersionSource: remote`, production `autoIncrement: true`; `runtimeVersion {policy: appVersion}`; version 1.0.0 | PASS |
| F-05 Android permissions | introspect `android` | permissions: RECEIVE_BOOT_COMPLETED, VIBRATE, POST_NOTIFICATIONS, INTERNET; blockedPermissions = the 10 listed; allowBackup false. Merged manifest `tools:node=remove` is generated at prebuild and was not built here. | PASS (config level) |
| F-06 targetSdk | libs.versions.toml | node_modules/react-native/gradle/libs.versions.toml:3-4 targetSdk "36" (>= 35). No pinning test (grep __tests__ = none). | PASS, hardening F-037 (P3) |
| F-07 iOS usage strings | app.json + introspect | app.json ios.infoPlist has only ITSAppUsesNonExemptEncryption; no NSUserNotificationsUsageDescription. Introspect shows it and NSMotionUsageDescription only because it reads the gitignored stale ios/MamaBb/Info.plist (git check-ignore ios); EAS regenerates. | PASS |
| F-08 Privacy manifest vs code | app.json:29-95, App.tsx:19-25, logger.ts | CrashData, PerformanceData, OtherDiagnosticData, ProductInteraction all Linked true, no Analytics purpose, tracking false; pinned by releaseConfig.test.ts:106-140. No Sentry beforeSend; logger.ts:111-118 forwards non-Error extras (callers mostly pass Error objects). | PASS, hardening F-036 (P3) |
| F-09 iPad orientation | introspect ios.infoPlist | `UISupportedInterfaceOrientations~ipad` lists all 4, `UIRequiresFullScreen: false`; either condition satisfies multitasking validation. Source is the template-generated plist; EAS prebuild uses the same template. | PASS |
| F-10 Export compliance | app.json:26 | `ITSAppUsesNonExemptEncryption: false` (also in introspect) | PASS |
| F-11 In-app deletion | SettingsScreen.tsx:474-484, ProfileScreen, round-7 wave D | Delete row wired in Settings and Profile; gdprPurge throws PurgeIncompleteError before Auth delete; wave D round 7 GREEN with states 26-delete-confirm-cancel, 27-delete-full. | PASS |
| F-12 Web deletion URL, domains | curl, grep | Live `delete-account.html` and `delete-account-en.html` = **404** (privacy*.html and / = 200). Domain drift fixed: App.tsx:361 has no https prefix; contact@mama-et-bebe.com everywhere (MX mx00/mx01.ionos.fr), old support@mamabebe.app removed (contact.ts:6). | FAIL live (F-001, owner G4); drift PASS |
| F-13 Privacy policy accuracy | in-app, website | In-app: 30 septembre 2026 in 4 locales, glucose/symptoms listed, Sentry processor, privacyPolicy.test.ts. Repo website/privacy*.html has Base légale/Legal basis and guest-data section. **Live privacy.html still dated 24 Février 2026, no Base légale (diff 157 lines).** | PASS in repo; FAIL live (F-005, F-034, owner G4) |
| F-14 Data safety / App Privacy answers | store/, RELEASE_READINESS | No store/data-safety.json or app-privacy.json; answers are prose in RELEASE_READINESS rows 9-10 and list the manifest types plus Sentry. Nothing machine-checks them. | PASS (prose), F-038 (P3) |
| F-15 Medical disclaimer | grep MedicalDisclaimer | ArticleDetailScreen, WeekRecommendationsScreen, HomeScreen, Chatbot, plus OnboardingScreen.tsx:445 states it once before content (the plan's recommended onboarding line). | PASS |
| F-16 Health claims | listing.json, marketingClaims.test.ts | No diagnosis/monitoring claim; copy guarded by marketingClaims.test.ts; ChatbotScreen has no BETA badge. | PASS |
| F-17 Age rating | listing.json shared.contentRating | Apple note updated: tiers 4+/9+/13+/16+/18+, "12+ no longer exists"; questionnaire guidance written. Answers are an owner console action. | PASS |
| F-18 Localized listing, screenshots | listing.json, store/screenshots | fr/en/ar listing present, limits enforced by storeListing.test.ts. Screenshots (gitignored, 113 PNGs) dated 19 août 2026, predate BETA removal and the 720pt tablet column, RN-web framed. | PASS listing; FAIL screenshots (F-032, owner G8) |
| F-19 Icons, splash | storeAssets.test.ts, app.json | Adaptive icon fg/bg/monochrome and notification icon configured; storeAssets.test.ts in green verify. | PASS |
| F-20 Notification permission timing | notificationService.ts, RemindersTab.tsx | `hasNotificationPermission` is read-only (:84-106); `requestPermissionsAsync` only at :150 via a tap (RemindersTab banner, Settings row, notificationPermissionFlow.ts:53). Nothing on mount. | PASS (F-015) |
| F-21 Dev surfaces | SettingsScreen.tsx | "Test notifications" is `__DEV__`-gated (:344); Developer Tools :521 gated; Ramadan unreachable (unreviewedContent.test.ts). | PASS (F-016) |
| F-22 Crash reporting | App.tsx:19-25, app.config.ts | Sentry.init only `!__DEV__`; DSN from EXPO_PUBLIC_SENTRY_DSN is not enforced (only "recommended" in RELEASE_READINESS row 4), so a production build can ship with Sentry off while the policy declares it. | PASS with caveat, F-036 (P3) |
| F-23 Console noise | babel.config.js, validationSystem.ts:131 | transform-remove-console (exclude error) in production, cache keyed on NODE_ENV; the `console.log` in validationSystem.ts:131 is stripped. Bundle grep not run (export forbidden). 4 TODO/FIXME remain, none user-visible; Halal TODO is behind a flag. | PASS (static) |
| F-24 Content parity prod vs code | seedCollections.json, hooks | import-data seeds articles, redFlags, chatbotSuggestionsAG, babyMessages, supplements (src/data, 4 locales) and calendarTemplates. `weeks` falls back to bundled data (useCurrentWeek.ts:55-64), articlesAntigravity falls back (contentService.ts). Production `weeks` content refresh = owner G2. | PASS; G2 owner |
| F-25 Supplements import source | seedCollections.json | `src/data/supplements_db.json` (4 locales), not the repo-root French file; seedData.test.ts. | PASS (F-012) |
| F-26 EAS submit | eas.json | `$APPLE_ID`, `$ASC_APP_ID`, `$APPLE_TEAM_ID` placeholders; Android `./google-service-account.json`, track internal. | OWNER GATE G9 |
| F-27 Emulator switch | firebaseEmulator.test.ts | src/config/__tests__/firebaseEmulator.test.ts present; no EXPO_PUBLIC_FIREBASE_EMULATOR_HOST in eas.json, app.json, app.config.ts, .env.example; `/dist-e2e*/` gitignored. Bundle grep not run. | PASS (static) |
| F-28 Offline claim | listing.json | grep offline / hors ligne = no claim in the listing. | PASS |
| F-29 Review notes, demo account | listing.json:76 | Still `email: <fill from GT-7>` / `password: <fill from GT-7>`. | OWNER GATE G6 (F-014) |
| F-30 Permissions x features | introspect, ChatbotScreen.tsx:70 | No location, camera, contacts, audio permission (all blocked); emergency button uses `tel:` link, no permission. Emergency numbers MA 141 / DZ 16 await owner confirmation (G5, F-039). | PASS; G5 owner |

## Baseline finding status (F-001..F-035)

| Id | Sev | Status | Note |
|---|---|---|---|
| F-001 | P0 | open, owner G4 | live delete-account pages 404 |
| F-002 | P0 | closed | country default '' (OnboardingScreen.tsx:142) |
| F-003 | P1 | open, owner G3 | EAS env vars; code guard exists (app.config.ts:110-141) |
| F-004 | P1 | closed | Settings delete row |
| F-005 | P1 | open, owner G4 | live privacy stale |
| F-006 | P1 | closed | in-app policy refreshed |
| F-007 | P1 | partial, owner G7 | SourcesFooter wired; 0/80 articles, 0/40 weeks cite sources; supplements 15/15 |
| F-008 | P1 | closed | BETA gone |
| F-009 | P1 | closed | placeholder gone |
| F-010 | P1 | closed | appattest entitlement |
| F-011 | P1 | closed | JS SDK App Check bridge |
| F-012 | P1 | closed | seed from src/data |
| F-013 | P1 | open, owner G7 | clinical signatures |
| F-014 | P1 | open, owner G6 | demo account placeholders |
| F-015..F-019 | P2 | closed | |
| F-020 | P2 | partial | 720pt column, still phone layout |
| F-021 | P2 | closed | RELEASE_READINESS rows 8-14 |
| F-022 | P2 | closed | |
| F-023..F-028 | P3 | closed | |
| F-029 | P3 | open, owner G9 | key in 2 tracked docs, GCP restriction |
| F-030, F-031 | P3 | closed | |
| F-032 | P1 | open, owner G8 | screenshots dated Aug 19, pre-fix |
| F-033 | P1 | closed | README lists articles/weeks/fetalGrowth, art_003 hidden |
| F-034 | P2 | open, owner G4 | live policy lacks consent text |
| F-035 | P1 | open, owner G4 | live home still says "centaines d'articles validés" |
| F-036..F-038 | P3 | open (new, not owner) | Sentry DSN/scrub, targetSdk pin, store-answer files |
| F-039 | P1 | open (new), owner G5 | MA/DZ emergency numbers unconfirmed |

Counts: 39 findings; closed 24, partial 2 (F-007, F-020), open 13. Open P0 1 (owner), open P1 7 (all owner), open P2 1 (owner), open P3 4. Open non-owner P0/P1: 0.

## Owner gates still blocking submission

G1 deploy firestore rules; G2 re-run weeks sync in production; G3 EAS Firebase env vars; G4 `vercel deploy --prod` (live site 404 on deletion pages, stale privacy and "centaines d'articles validés"); G5 confirm MA/DZ emergency numbers; G6 demo account; G7 clinical signatures (also the real fix for F-007 per-record sources); G8 real screenshots and visuals; G9 Apple credentials, App Check consoles, GCP key restriction.


## Round 9 re-verification notes

- Introspect (Node 18): version 1.0.0; ids com.mamabebe.app x2; runtimeVersion appVersion; Android perms INTERNET, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, VIBRATE + 10 blocked; allowBackup false; ITSAppUsesNonExemptEncryption false; aps + appattest production; ipad orientations all 4, UIRequiresFullScreen false; CFBundleLocalizations fr/en/ar; schemes mama-bebe, com.mamabebe.app. NSUserNotificationsUsageDescription, NSMotionUsageDescription, CFBundleVersion 4 come from the gitignored stale ios/ and are not in app.json ios.infoPlist (only ITSAppUsesNonExemptEncryption).
- eas.json: appVersionSource remote, production autoIncrement true, submit placeholders (G9). targetSdk 36 (libs.versions.toml:4), still unpinned by a test (F-037).
- Live site 2026-10-02: delete-account.html 404, delete-account-en.html 404, privacy.html/privacy-en.html/ 200; live privacy dated 24 Février 2026 without Base légale; live / still contains centaines d'articles. Repo website copy is the corrected text. All owner G4.
- Content: articles 0/80 and weeks 0/40 cite sources, supplements carry sources (F-007 partial, G7). docs/clinical-review/README.md still says no health professional reviewed content (F-013, G7).
- store/listing.json:76 demo credentials placeholders (G6); screenshots still Aug 19 2026 (G8); key AIzaSyBC7HcO in 2 tracked docs (G9); MA 141 / DZ 16 unconfirmed (G5).

**Verdict round 9: GREEN.** Open non-owner P0/P1: 0. Open owner-gated: P0 F-001; P1 F-003, F-005, F-013, F-014, F-032, F-035, F-039 (F-007 partial); P2 F-034; P3 F-029. Open non-owner P3: F-036, F-037, F-038. Partial non-owner P2: F-020.

- R9 live curl 2026-10-02: delete-account.html 404, delete-account-en.html 404, privacy.html 200, privacy-en.html 200, live privacy still 24 Février 2026 (no Base légale), live home still has centaines d'articles. Unchanged, owner G4.
