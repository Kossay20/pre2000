# Open findings that need the owner, a clinician or a product decision

State: final-release audit round 9, HEAD 3bfd0b3. Code-side work is converged (0 P0 / 0 P1 open that depend on code). Everything below is outside what an agent can close. Source of truth for ids: `reports/test-e2e/final-release-2026-09-30/round-9/wave-*-findings.json`; gates G1-G9 are defined in `docs/GOAL_FINAL_RELEASE_AUDIT_MAMABEBE_2026-10-02.md` section 6.

## Owner gates (G1-G9)

| Gate | Action | Findings | Sev |
|---|---|---|---|
| G1 | `firebase deploy --only firestore:rules` before submission, then delete a test account on the live backend | (no open finding id; precondition of D-014 and of account deletion working) | gate |
| G2 | Re-run `scripts/sync-firestore-weeks.ts` in production (corrected `weeks_db.json`) | (no open finding id) | gate |
| G3 | `eas env:create` for the 6 `EXPO_PUBLIC_FIREBASE_*` variables, `production` and `preview`; also set `EXPO_PUBLIC_SENTRY_DSN` | F-003 (P1); F-036 (P3, Sentry DSN not enforced) | P1 |
| G4 | `cd website && vercel deploy --prod`; re-curl both delete-account URLs for 200; check live privacy pages for "Base legale / Legal basis"; re-grep live for "centaines", "valides", "Assistant IA" | F-001 (P0), F-005 (P1), F-034 (P2), F-035 (P1) | P0 |
| G5 | Confirm the Morocco and Algeria emergency numbers with a local contact, or drop MA/DZ from `EMERGENCY_NUMBERS` so they fall back to 112 | F-039 (P1) | P1 |
| G6 | Create the store-reviewer demo account, seed week-24 data, enter credentials in both consoles | F-014 (P1) | P1 |
| G7 | Clinical signatures (see next section) | F-013 (P1), F-007 (P1, partial: per-record `sources`) | P1 |
| G8 | Capture real screenshots on simulator or device (do not upload the Aug-19 set); supply real month 1-2 and article visuals | F-032 (P1); F-020 (P2, iPad shots stale; optional two-pane or `supportsTablet:false`) | P1 |
| G9 | Apple credentials in `eas.json`; App Check (App Attest, Play Integrity) and Anonymous Auth in the Firebase console; restrict the GCP API key (iOS bundle id, Android package + SHA-1, API allowlist) | F-029 (P3) | P3 |

Console answers to confirm by hand (drafted from the code, not verified against the consoles): `store/app-privacy.json` (App Store Connect > App Privacy) and `store/data-safety.json` (Play Console > Data safety). Closes the evidence side of F-038. Both list an owner checklist, including whether App Check needs a device-identifier row.

## Clinician sign-off (G7 detail)

| Id | Sev | Question | Where |
|---|---|---|---|
| B-037 | P3 | Kick counter: state one rule ("10 movements within 2 h"); subtitle says "sur 1 heure", counter "sur la derniere heure", advice says "10 mouvements en moins d'1 h ... moins de 10 en 2 h" | `src/i18n/locales/fr/kick*.json` |
| C-025 | P2 | Tunisian week texts and article bodies are Modern Standard Arabic (tn-04 equals ar-04, tn-00 lungs, tn-14 fallback): add tn variants or explicitly accept the MSA fallback. Needs a native Tunisian reviewer, not only a clinician | `src/data/weeks_db.json` `*_tn`, articles `*_tn` |
| C-050 | P3 | Fetal-growth chart index: completed weeks or week in progress ("Semaine 32 / Jour 218" vs chart row 32 = 42,4 cm / 1,7 kg). Confirm, then align copy ("31 SA + 1 j") or shift the table | `src/utils/fetalGrowth.ts` |
| C-052 | P3 | Selenium: red tag "A eviter" vs dose text "doit etre evitee sauf carence averee". Choose `a_surveiller` or `deconseille` | `src/data/supplements_db.json` `s15_selenium.pregnancy_safety` |

Also in the G7 pack (`docs/clinical-review/`): glucose 5,1 mmol/L and 140/90 thresholds, vitamin A / selenium / smoked and mercury fish / raw-milk cheese / rillettes classification, chat chips that trigger the emergency block, rounded growth weights, the 27 vs 28 SA trimester boundary, the Arabic and Tunisian word for "trimester", the 280 English baby messages. Until signed, no public text may say the content is reviewed.

## Product decisions

| Id | Sev | Decision needed | Where |
|---|---|---|---|
| B-040 | P2 | Do unsynced tracker writes survive a logout? Copy says "Ils seront perdus si vous vous deconnectez maintenant" but the re-login capture shows the 4 kicks still there (`deviceWipedAtLogout` true on the online path). Align the wording or the behavior, then assert it in `e2e/final-release-wave-B-track.spec.ts:1205` (currently soft-asserts only `told === null`) | logout flow and the fr key behind the warning |
| D-037 | P2 | Is chatbot history meant to persist across reload? Capture `40-rules-chatbot-history-reload.png` is identical to the fresh chat. Persist it, or stop claiming `chatbot_history` writes and rename the spec state; then assert the assistant bubble text (and the raw-milk cheese answer for D-036) | `e2e/final-release-wave-D.spec.ts` ~1865-1885 |

## Decisions already taken or analysed, for the record

- F-020: keep as is (centred 720 pt column, `supportsTablet: true`). Store does not reject on this; a two-pane layout is a later-version item. See `docs/RELEASE_READINESS_2026-08-19.md` and F-032 for the stale iPad screenshots.
- D-014: rules and purge already match and are test-pinned; see `docs/D014_RULES_PURGE_MATCH_2026-10-02.md`. Residual part is e2e coverage.
- F-036: Sentry stays optional until G3 is done; crash rows in the store privacy answers overstate collection if the DSN is missing.
- Guest-data retention duration (RELEASE_READINESS row 5 ter) is the owner's decision and must be written in the website policy section 6 and `privacy.retention.text` (4 languages) in the same commit as any server-side purge.
- F-040: the country sits in `userProfiles/{uid}`, so `app.json` and `store/app-privacy.json` now declare Coarse Location as linked (pinned by `__tests__/releaseConfig.test.ts`). Owner action: re-enter that row in App Store Connect > App Privacy as "linked to the user".
- F-042: transactions and breadcrumbs are scrubbed (`src/utils/sentryScrub.ts`). Owner action: decide whether the installation-scoped default user id the native Sentry SDK attaches before login counts as Device ID (both store files list it in `ownerChecklist`); declare it or record why it is out of scope.
- F-043: onboarding collects an age range and a first-pregnancy answer, and AuthContext stores both on `userProfiles/{uid}`. They are now named in the Health and Sensitive Info rows of `store/app-privacy.json` and in the Play "Other info" and Health notes of `store/data-safety.json` (both linked, pinned by `__tests__/releaseConfig.test.ts`); no new manifest type was added, so `app.json` is unchanged. Owner action: re-read those two answers in App Store Connect and Play Console. The city is never collected (`OnboardingScreen` passes `undefined`), so "ville / city" was dropped from `website/privacy.html` and `website/privacy-en.html` (goes live with the next `vercel deploy`, G4). The in-app copy `privacy.collection.profileDesc` in `src/i18n/locales/*/common.json` still lists the city and must lose it in the same release (4 locales).
