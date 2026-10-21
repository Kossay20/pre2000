# AUDIT PLAN — final-release-2026-09-30

**Mission:** a final pre-store audit of "Mama & Bébé". Run the E2E suite, find everything left, fix it, and verify the whole app, including indirect effects, ahead of App Store and Google Play submission.
**Branch** `feat/interaction-ux-2026-06-18` @ `c5281e3` · **Harness** emulator stack on `:9099` (Auth), `:8080` (Firestore, real `firestore.rules`) and `:8090` (web export, SPA fallback).
**Contract** `REVIEWER_PROTOCOL.md` (12 categories, P0/P1 loop-blocking) + `FINDINGS_SCHEMA.md` (one `round-<N>/wave-<X>-findings.json` per wave per round).

This plan was built from a full read of the source, done by five parallel read-only explorations on 2026-09-30. Every selector below comes from the code (file:line). Items marked **HYP-** are *hypotheses from static reading*: capture agents must confirm or refute each one with a quartet before it becomes a finding.

---

## 0. Harness prerequisites (W0 — orchestrator-owned, before any wave)

These are not a wave. Without them, every signed-in wave produces false greens.

### 0.1 Why the existing helpers are not enough for signed-in waves

| Problem | Source | Consequence if ignored |
|---|---|---|
| `IGNORE_CONSOLE` swallows `/FirebaseError/`, `/permission-denied/`, `/Missing or insufficient permissions/` | `e2e/helpers/audit-guards.ts:12-33` | Every rules denial (a real P0 now that real rules run) is silently dropped. |
| Firestore web uses `persistentLocalCache()` (IndexedDB) | `src/config/firebase.ts:25-27` | "reload → still there" can be served from the local cache and **does not prove a server write**. |
| `updateProfile` writes `user_profile` to localStorage *before* Firestore and still sets `user` on failure | `src/context/AuthContext.tsx:604-635` | Same-context reload shows the edited profile even when the Firestore write threw. |
| Firestore traffic goes over WebChannel (HTTP 200 streams) | firebase JS SDK | A rules denial **never appears as a 4xx** in `network.json`. Category 10 cannot catch it. |
| The global `storageState` seeds a guest `user_profile` (uid `guest_e2e_fixture`, no Firebase session) | `e2e/global-setup.ts:34-35` | A cached `user_profile` alone mounts MainTabs (`AuthContext.tsx:122-137`). Signed-in waves inheriting it test a fake guest. Static reads then fail the rules (`isAuthenticatedReader`) and fall back to bundled JSON. |

### 0.2 Helpers to add (one PR, before round 1)

1. **`e2e/helpers/audit-guards.ts` → add `attachConsoleStrict(page)`.** This is the same as `attachConsole`, but it does **not** ignore `FirebaseError | permission-denied | Missing or insufficient permissions | Unsupported field value`. Waves A-E use the strict variant in every signed-in context. The lenient variant is only for guest-with-no-session states.
2. **`e2e/helpers/emulator-account.ts`** (new). It is pure REST, and `PID = pregnancy-app-1f939` (from `.env`).
   - `createAccount(email, pw)`: `POST http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake` `{email,password,returnSecureToken:true}` → `{uid: localId, idToken}`.
   - `seedProfile(uid, idToken, fields)`: `PATCH http://127.0.0.1:8080/v1/projects/PID/databases/(default)/documents/userProfiles/{uid}` with **`Authorization: Bearer <idToken>`**, not `Bearer owner`, so the seed itself must pass `validProfileNames/validMedicalFlags/profileFieldCountSane` (`firestore.rules:186-207`).
     - Mirror exactly the keys Onboarding writes (`OnboardingScreen.tsx` ~:230-260 → `setDoc merge` ~:530): `firstName, lastName, lmp, pregnancyStartDate, country, ageRange, isFirstPregnancy, pregnancyStatus:'pregnant', dpa, createdAt, updatedAt`.
     - LMP for week W = `lmpIsoForWeek(W)` from `e2e/helpers/guest-profile.ts`. **Week 32 ⇒ today − 31×7 days (UTC midnight).**
   - `serverDoc(path)` / `serverQuery(collection, 'user_id', uid)`: read the **server truth** with `Authorization: Bearer owner` (`documents:runQuery` for queries). This is the ONLY valid persistence oracle.
   - `authAccountExists(uid)`: `GET http://127.0.0.1:9099/emulator/v1/projects/PID/accounts` (Bearer owner) → find `localId`.
   - `uiLogin(page, email, pw, locale)`:
     1. `addInitScript` sets `app_locale` and `@home_welcome_seen_v1=1` (the Home first-run welcome card, `HomeScreen.tsx:65,150`).
     2. Go to `/login` and fill `login_email_input` / `login_password_input`.
     3. Click `login_submit_button`, then expect `role=tablist`.
   - **FORBIDDEN:** any emulator "clear all" endpoint (`DELETE /emulator/v1/projects/PID/databases/(default)/documents`, `DELETE .../accounts`). It would wipe concurrent waves.
3. **Account convention:** `fr0930-<wave>-<scenario>-<Date.now()>@e2e.test`, password `E2e-Passw0rd9` (≥10 chars, digit, uppercase: `validation.ts:17-93`). No account is ever shared across waves or across tests that mutate it.
4. **Fresh-context oracle:** a persistence claim is PASS only if **both** hold:
   - (a) `serverDoc/serverQuery` shows the value, **and**
   - (b) a **new browser context** (empty IndexedDB and localStorage), after `uiLogin`, renders it.
   A same-context reload is recorded as a state but never counts as proof.
5. **Dialogs:** `confirmAction` → `window.confirm` (`src/utils/uiUtils.ts:18-24`), and `showAlert` → `window.alert` (`src/utils/alert.ts:32-54`).
   - Playwright **dismisses by default**, so confirm returns false.
   - Every spec registers a dialog handler that **records the message into the quartet** (append `{type,message}` to the next `console.json`) and then accepts. A test that expects "cancel" dismisses explicitly.
   - `Alert.alert` calls that are *not* routed through these helpers are **true no-ops on RN-web**. A user action that ends silently is a *silent_error* candidate.
6. **Timezone pin:** `test.use({ timezoneId: 'Europe/Paris', locale: <bcp47> })` in every wave.
   - Week math is UTC (`utils/pregnancyCalculator.ts:7`); calendar ranges are local (`calendarService.ts:187`); My-Day matching is `startsWith(localDate)` against a UTC ISO string (`dailyChecklistService.ts:53`).
   - Wave B also runs SYNC-4 under `Africa/Tunis` and `America/New_York` to flush off-by-one days.
7. **Quartet location:**
   - `E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-<X>`
   - `E2E_QUARTET_DIR2={SCRATCH}/round-<N>/wave-<X>`
   - State names are `NN-slug` (`01-…`).
8. **Rebuild lock:** `bash e2e/emulator-stack.sh rebuild` rewrites `dist-e2e/` under a live `serve`, which breaks any concurrently running wave. **Only the orchestrator rebuilds, only between rounds, and after `npm run verify` is green.** Waves never rebuild.

### 0.3 Severity rule for web-vs-native divergence (read before scoring)

The shipped product is the **native** iOS/Android binary; the web export is the audit proxy.

- A defect whose root cause is **shared code** (context, service, rules, i18n, layout) is scored normally.
- A defect whose root cause is a **web-only path that native does not take** is scored **P2 `web-harness`** and noted, unless it blocks the audit path itself. Examples:
  - `@react-native-community/datetimepicker` returns `null` on web (Profile LMP)
  - `expo-file-system` `cacheDirectory` is null on web (JSON export)
  - `window.print()` (PDF export)
  - `Linking.openSettings`
- Always cite **both** the web symptom and the native code path in the fix hint, so the fixer knows whether native is also affected.

---

## 1. Waves overview

| Wave | Concern (one) | Spec | Viewport | Locales | Accounts | ~States |
|---|---|---|---|---|---|---|
| **A** | Cold funnel + auth (new-user acquisition) | `e2e/final-release-wave-A.spec.ts` | 390×844 | fr, ar (+ en selector smoke) | 1 fresh signup per locale + 1 pre-created for login tests | 30 |
| **B** | Signed-in daily loop: planning + trackers + persistence (week 32) | `e2e/final-release-wave-B.spec.ts` | 390×844 | fr (en for selectors) | B-plan and B-track accounts, each REST-created, week 32 | 44 |
| **C** | Content & assistant, 4 locales, RTL | `e2e/final-release-wave-C.spec.ts` | 390×844 | fr, en, ar, tn | 1 signed-in reader per locale + 1 real anonymous guest (fr) | 40 |
| **D** | Account lifecycle & settings (profile, language, export, upgrade, logout, delete) | `e2e/final-release-wave-D.spec.ts` | 390×844 | fr, ar | 1 account per destructive scenario | 34 |
| **E** | Form factors & accessibility | `e2e/final-release-wave-E.spec.ts` | 375×667, 390×844, 820×1180, 1180×820, 280×603 (text-scale proxy) | fr, ar | 1 read-only week-32 account | 36 |
| **F** | Static store compliance (no Playwright) | `reports/.../round-<N>/wave-F-checklist.md` + `wave-F-findings.json` | n/a | fr, en, ar listing | n/a | 30 checks |

Waves A-E can run **concurrently** against `:8090`. They share only read-only static content and never share an account. Wave F runs in parallel with no browser.

Carried-over residuals from `guest-journey-2026-08-31/CONVERGENCE_FINAL.md` (**must be fixed this cycle**):
- **GJ-006** → Wave A (A-state 02) + Wave E (375×667).
- **GJ-008** → Wave A (A-state 05, Register) + Wave A (Login, same pattern `LoginScreen.tsx:149-156`) + Wave C (ArticleDetail / SupplementDetail duplicate back inside `ResourcesStack`).
- **GJ-007** → Wave C (C-state chatbot chips).
- **GJ-011** → Wave C (BabyEvolution footer).

---

## 2. Wave A — Cold funnel + auth

**Spec** `e2e/final-release-wave-A.spec.ts` · `test.use({ storageState: { cookies: [], origins: [] }, viewport: {width:390,height:844}, timezoneId:'Europe/Paris' })` · console **strict** after any sign-in.
**Locales:** full run in **fr**, full run in **ar**; en is used only where selectors are EN-anchored.

### Selectors (from source)

- **Language** (`/welcome`)
  - Cards: `[data-testid=lang_card_{fr,ar,tn,en}]` (no role, `LanguageSelectScreen.tsx:118`).
  - Continue has no testID or role (`:172-182`): use `getByText('Continuer'|'Continue'|'متابعة')`. Selection is confirmed by the `✓` glyph.
- **AuthChoice** (`/auth`)
  - Buttons: `auth_signup_button` ("Créer un compte" / "إنشاء حساب"), `auth_login_button` ("Se connecter" / "تسجيل الدخول"), `auth_guest_button` ("Continuer en invité →").
  - Privacy link: `role=link` "Politique de Confidentialité" / "سياسة الخصوصية".
- **Register** (`/register`)
  - Inputs: `register_email_input`, `register_password_input`, `register_confirm_input`.
  - Submit: `register_submit_button` ("Créer mon compte" / "إنشاء حسابي").
  - Eye toggles "Afficher" / "Masquer".
  - Errors are inline `role=alert` with a "⚠️ " prefix.
  - Terms line (no role, `RegisterScreen.tsx:325-332`).
- **Login** (`/login`)
  - Inputs: `login_email_input`, `login_password_input`.
  - Submit: `login_submit_button`.
  - Forgot: `forgot_password_button` ("Mot de passe oublié ?"). Success is a `SuccessMessage role=alert` reading "✓ Email de réinitialisation envoyé…".
- **Onboarding** (`/onboarding`)
  - **Step 1:** role=button "Je suis enceinte" / "أنا حامل". It auto-advances after 220 ms (`OnboardingScreen.tsx:200-204`).
  - **Step 2:**
    - Method buttons: "📆 Dernières règles" or "💫 Conception".
    - Date: `input[type="date"]` (no label, `:427-444`). Fill `YYYY-MM-DD`; the max is today, and Continue is disabled above 40 weeks (`:503`).
    - Back: "Étape précédente".
  - **Step 3:** first-name input labelled "Your First Name (Optional)", age buttons `18-24…40+`, country buttons "France" / "Tunisie" / "تونس", first-pregnancy answer, medical checkboxes.
  - **Step 4:**
    - Inputs: `onboarding_step4_email`, `onboarding_step4_password`.
    - Buttons: `onboarding_step4_submit` ("Créer mon compte & Démarrer", disabled until the password is valid), `onboarding_step4_skip` ("Continuer sans compte"; use exact match, since it collides with AuthChoice's "Continuer en invité →"), `onboarding_step4_back` ("← Edit my info").
- **PrivacyPolicy** (`/privacy`): tabs Privacy / Terms / Cookies (no role). The medical disclaimer is **only on the Terms tab** (`PrivacyPolicyScreen.tsx:132-136`).

### States

| # | State | Must show / assert |
|---|---|---|
| 01 | `01-language-fr` (fresh) | 4 cards, `html[dir=ltr]`, no raw key. |
| 02 | `02-language-continue-fold` | Continue's `boundingBox().y + height ≤ 844`, i.e. visible without scroll (**GJ-006**; today it is estimated at ~950-1000 px). FAIL = P2, and P1 if not visible after an Arabic-font re-layout either. |
| 03 | `03-authchoice-fr` | 3 CTAs + privacy link; the toast does not overlap the guest CTA (guest-journey regression). |
| 04 | `04-privacy-from-authchoice` | Privacy tab content; switch to Terms → the "AVERTISSEMENT MÉDICAL" text is visible; back returns to AuthChoice. |
| 05 | `05-register-display` | Exactly **one** back affordance. Today there is a stack header plus an unlabeled absolute in-body button that goes to AuthChoice instead of popping (`RegisterScreen.tsx:175-184`) = **GJ-008**. Count `role=button` elements in the top 100 px. |
| 06 | `06-register-empty-submit` | `role=alert` reads "L'email est requis". |
| 07 | `07-register-invalid-email` | "Email invalide". |
| 08 | `08-register-weak-password` | "Au moins 10 caractères", then with `abcdefghij1` → "Au moins 1 majuscule". |
| 09 | `09-register-mismatch` | "Les mots de passe ne correspondent pas". |
| 10 | `10-register-email-in-use` | Pre-create the email via REST, submit → "Cet email est déjà utilisé" (no raw `auth/…` code). |
| 11 | `11-register-success-landing` | **Critical: HYP-A1.** After `register()`, `onAuthStateChanged` finds no `userProfiles/{uid}`, builds a minimal profile (`loginHelpers.ts:74-81`), and `setUser` unmounts AuthStack **before** `navigate('Onboarding')` (`RegisterScreen.tsx:136-148`). Expected: the user reaches Onboarding step 1. Record where they actually land. If Home shows "Complete profile" / no week, it is **P0** (a new registered user never gives an LMP, so every pregnancy surface is empty). |
| 12 | `12-onboarding-step1…4` (4 snaps) | Via AuthChoice → guest path *and* via Register (if 11 reaches it). Step counter "Étape X sur 4" hidden on the last step; date input accepts today−31w; Continue is disabled for a date > 40 w (try today−41w). |
| 13 | `13-onboarding-step4-create-account` | Fill email/password, submit → MainTabs. Server truth: `userProfiles/{uid}` has `lmp`, `firstName`, `country`. Fresh-context login → Home "Semaine 32". |
| 14 | `14-onboarding-step4-skip-guest` | `onboarding_step4_skip` → MainTabs as guest. Assert that a Firebase anonymous user exists: `authAccountExists`, and that `localStorage.user_profile.uid` ≠ `guest_<ts>`. |
| 15 | `15-login-display` | One back affordance (same GJ-008 pattern, `LoginScreen.tsx:149-156`). |
| 16 | `16-login-wrong-password` | "Email ou mot de passe incorrect"; the password field is not cleared of focus-trap; no console error. |
| 17 | `17-login-unknown-user` | Same message (no user enumeration). |
| 18 | `18-login-rate-limit` | 6th attempt in a row → "Trop de tentatives…"; message interpolated, no `{{minutes}}` leak (`rateLimiter.ts:132-135`). |
| 19 | `19-forgot-password-empty` | "Veuillez saisir votre email…". |
| 20 | `20-forgot-password-sent` | Success message. Button text while sending must not be "…" (**HYP-A2**: the `sending` key is missing in every locale). |
| 21 | `21-login-success` | Pre-created week-32 account → Home "Semaine 32", "3e trimestre". Server truth unchanged (login must not overwrite `lmp`). |
| 22 | `22-document-title` | `document.title` is localized per route ("Se connecter · Mama & Bébé"), never "HomeMain" / "AuthChoice". |
| 23-30 | `23-ar-…` | Repeat 01, 03, 05, 06, 11, 12 (steps 1 and 4), 16 and 21 in **ar**. Assert `html[dir=rtl][lang=ar]`, error text in Arabic, the header back chevron points right (`App.tsx:399`), and no Latin fallback strings. |

**Acceptance (Wave A green):**
- The registration path lands on Onboarding (or collects LMP) 3/3 runs.
- All 9 validation/error states show a localized `role=alert` in fr **and** ar.
- There is exactly one back affordance on Register and Login.
- Continue is within the fold at 390×844.
- Zero strict-console errors.
- Every created account has a `userProfiles` doc with `lmp` on the server.

---

## 3. Wave B — Signed-in daily loop (week 32)

**Spec** `e2e/final-release-wave-B.spec.ts`. It has two independent `describe` blocks with separate accounts so they can run in parallel:
- **B-plan:** Home, Calendar, appointments, Reminders, Tasks, Statistics.
- **B-track:** Health, Weight, Kick, Contraction, Hospital bag.

Both use viewport 390×844, **fr**, strict console, `timezoneId: 'Europe/Paris'`. Accounts: `createAccount` + `seedProfile(week 32, country 'France', lastName 'Testeur')` + `uiLogin`.

### Selectors (from source)

- **Home**
  - Week display: "Semaine 32" and "3e trimestre" (`HomeScreen.tsx:509-510`).
  - Chevrons: "Semaine précédente" / "Semaine suivante". `home_return_to_today` appears after navigating weeks (`:537`).
  - Quick actions: `home_quick_appointments`, `home_quick_add_task`, `home_quick_add_appointment`, `home_quick_search`.
  - Tool cards: "Compteur de coups…" (week ≥16, `:900`); "Minuteur de contractions" and "Sac de maternité" (week ≥28, `:921,:940`); "Rappels", "Calendrier", "Mon poids".
  - Upcoming list "📅 Vos prochains rendez-vous" (`:985-1012`): max 3 future items, each a button named `"{title}, dd MMMM, HH:mm"`.
  - Pill text "Aujourd'hui : N rendez-vous" / "MA JOURNÉE x/y" (`DailyRoutinesTracker.tsx`, no role).
- **Calendar** (`/calendar`)
  - Buttons: "Semaine", "Mois", "Suggestions", "Aujourd'hui", "Semaine précédente" / "suivante".
  - FAB: "Ajouter un rendez-vous" (`CalendarScreen.tsx:600`).
  - Per event: "Modifier le rendez-vous" and "Supprimer le rendez-vous" (`EventCard.tsx:112,124`). Delete goes through `window.confirm`.
- **AddAppointment** (`/appointment/add`)
  - Title: placeholder "Ex: Échographie, Consultation…". Save is disabled while it is empty.
  - Type: "Médical 🩺" / "Personnel 📅" (`aria-selected`).
  - Date and time: placeholders `YYYY-MM-DD` / `HH:MM` (`:583,:624`); use `fill()`.
  - Location and Notes fields.
  - Reminder switches: "Veille (8h)", "Jour J (8h)", "2h avant" (`aria-checked`).
  - **Save:** accessible name **"Enregistrer les modifications"** (`:780`), visible text "Enregistrer".
  - Leaving dirty → `window.confirm` "Abandonner les modifications ?" (`:258`).
- **Reminders** (`/reminders`)
  - Top tabs: `getByRole('tab',{name:'Rappels'})` / `{name:'Tâches'}`. The bottom tab has the same name, so scope to the second tablist.
  - Reminder switches are named after the reminder title; gear "Modifier".
  - The `PermissionBanner` requests notification permission **on mount** (`RemindersTab.tsx:66-74`).
- **Tasks**
  - "➕ Nouvelle tâche" → modal: placeholder "Ex: Acheter des vitamines"; "Créer ✓" stays disabled below 3 characters.
  - Complete: `role=checkbox` named after the task title (`MyDaySection.tsx:385`).
  - ✏️ / 🗑️ buttons are **unlabeled** (a11y finding candidate); "Voir les statistiques".
- **Statistics** (`/statistics`): `statistics_screen_root`; either "Pas encore de données" + "Aller aux tâches", or charts.
- **Health** (`/health`)
  - Add buttons: "Ajouter une pesée", "💓 Tension, Ajouter", "Glycémie, Ajouter".
  - Modal placeholders: "Poids (kg)", "Systolique (ex. 120)" / "Diastolique (ex. 80)", glucose "Cible : 3,5 – 5,5 mmol/L".
  - Symptom chips are buttons.
- **Weight** (`/weight`)
  - Setup card: "Poids avant grossesse (kg)" / "Taille (cm)" → "Enregistrer".
  - Adding an entry: "Ajouter une pesée" → input "➕ Ajouter mon poids" (placeholder "Ex: 65.5").
  - Confirms: 120-200 → kg/lb `window.confirm`; same day → "remplacer" confirm.
- **Kick** (`/kick-counter`): "Démarrer une séance" (**records 1 kick immediately**, `KickCounterScreen.tsx:72-73`) → "Appuyer pour compter" → "Terminer la séance"; the "≥10 in 2h" rule shows at week ≥28.
- **Contraction** (`/contraction-timer`): "Début de contraction" / "Fin de contraction"; stats "Nombre" / averages; "Tout effacer" (confirm).
- **Hospital bag** (`/hospital-bag`): items are `role=checkbox` + `aria-checked` (`:137-140`); "{done} / {total} prêts"; "Ajouter un élément" → "Ajouter"; custom item "Retirer".

### States — B-plan

| # | State | Must show / assert |
|---|---|---|
| 01 | `01-home-week32` | "Semaine 32", "3e trimestre", kick + contraction + bag cards **visible**, no welcome overlay. |
| 02 | `02-home-week-nav` | "Semaine précédente" ×5 → week 27 → contraction/bag cards hidden (the gate uses the *displayed* week, `:921`; verify this is intended) → `home_return_to_today` back to 32. |
| 03 | `03-calendar-week` | Current week = 32 (Calendar computes its own week from `user.pregnancyStartDate`, `CalendarScreen.tsx:90`; its "Today" uses the stored `user.currentWeek`, `:364,:439`). |
| 04 | `04-calendar-suggestions` | "Suggestions" tab. **HYP-B1:** `calendarTemplates` is neither seeded nor in `npm run import-data` (only `scripts/sync-firestore-templates.ts`). Record whether the tab is empty, whether it has an empty-state with copy + CTA, and whether a fallback exists. An empty screen = P1 release-ops (prod will be the same). |
| 05 | `05-appt-form-empty` | Save disabled; type default; 3 reminder switches. |
| 06 | `06-appt-form-invalid-date` | `2026-02-31` → must be rejected. **HYP-B2:** it rolls over to 3 March. |
| 07 | `07-appt-saved` | Title "Échographie T3 E2E", date today+2, 10:30, Médical, location "Clinique", notes. Save → back on Calendar, the event card is visible in week and month views. Server: `serverQuery('userEvents','user_id',uid)` has 1 doc with the same title, date and type. |
| 08 | `08-home-upcoming` | SYNC-1: Home upcoming list shows `"Échographie T3 E2E, <dd MMMM>, 10:30"`; pill "cette semaine". |
| 09 | `09-appt-today` | Second appointment for today at now+2h → Tasks tab "MA JOURNÉE" lists it; Home pill "Aujourd'hui : 1". |
| 10 | `10-appt-edit` | Edit from **Month** view (**HYP-B3**: the Month-view edit drops `location`, `CalendarScreen.tsx:212`). Change the time to 11:00 and clear notes → server doc time = 11:00. Notes must be cleared (**HYP-B4**: an empty field is dropped by the merge, so the old notes survive, `calendarService.ts:352`). |
| 11 | `11-appt-edit-reload` | Reload `/appointment/add` while editing → must not silently turn into "create" (**HYP-B5**: the object param is lost). |
| 12 | `12-appt-delete` | Delete → accept confirm → card gone; Home upcoming gone; server doc gone. |
| 13 | `13-appt-delete-cancel` | Dismiss the confirm → card still present. |
| 14 | `14-appt-4-items` | 4 future appointments → Home lists 3; the pill's "this week" count is correct (**HYP-B6**: capped by the 3-item slice). |
| 15 | `15-reminders-tab` | "Semaine 32", "Trimestre 3" (no "Trimestre 2"); the permission banner on web shows no console error. |
| 16 | `16-reminder-toggle` | Toggle a reminder off → server `reminder_settings_v2/{uid}_{id}` reflects it; fresh context shows it off (**HYP-B7**: `saveSettingAuth` swallows errors, `remindersV2Service.ts:206`). |
| 17 | `17-task-create` | "Nouvelle tâche" "Vitamines E2E" → server `userTasks` has 1 doc. |
| 18 | `18-task-complete` | Check it → `aria-checked=true`; Home "MA JOURNÉE x/y" increments on focus; server status. |
| 19 | `19-home-quick-add-task` | `home_quick_add_task` → the add-task modal must open (**HYP-B8**: `action:'add'` is ignored by TasksTab). |
| 20 | `20-statistics` | After 18: record what Statistics shows. Custom tasks are excluded from `saveDailyProgress`. If the user completed a task and Statistics says "Pas encore de données", that is P1 (a user-visible contradiction). |
| 21 | `21-fresh-context` | New context + `uiLogin` → appointments, task + status, reminder toggle all present (server-backed). |

### States — B-track

| # | State | Must show / assert |
|---|---|---|
| 22 | `22-weight-setup` | Setup: 60 kg / 165 cm → "Enregistrer". **HYP-B9 (P0 candidate):** for a signed-in user, `setProfile` only forwards `emergencyContacts` (`PregnancyContext.tsx:285-297`), so height and pre-pregnancy weight **never reach Firestore**. Check: server `userProfiles/{uid}.height` exists, and in a fresh context the setup card does not re-appear. |
| 23 | `23-weight-entry` | 68.4 kg → the list shows it; server `weight_entries` doc; the gain vs pre-pregnancy is computed from the same pre-weight shown in Profile. |
| 24 | `24-weight-lb-confirm` | 150 → the kg/lb confirm text is captured; accept → saved. |
| 25 | `25-weight-same-day` | A second entry today → "replace" confirm → exactly 1 server doc for today. |
| 26 | `26-health-dashboard` | SYNC-6: WeightTracker entry 68.4 visible; "Upcoming / Past" appointment counts consistent with B-plan (only if the same account; otherwise assert 0/0). |
| 27 | `27-health-weight-entry` | Add 69.0 in Health → server `healthMetrics` type weight; **then open WeightTracker**: is 69.0 there? (**HYP-B10:** no — WeightTracker reads only `weight_entries`. Two weight histories that disagree = P1 numeric_integrity.) |
| 28 | `28-health-bp-boundary` | Systolic 300 / diastolic 200 → UI accepts (`validation.ts:156-159`), rules require `<300 / <200` → **HYP-B11:** generic "Erreur" after a rules denial. Expect a specific validation message instead. Also 140/90 → clinical warning confirm text captured. |
| 29 | `29-health-glucose` | 5.2 fasting → saved; server `glucoseMetrics`. |
| 30 | `30-health-symptom` | Toggle 2 symptoms → server `symptomsLog/{uid}_{YYYY-MM-DD}`; the date is the **local** day (check in the Tunis/NY runs). |
| 31 | `31-kick-start` | "Démarrer une séance" → count **1** (by design, `:72-73`). Tap ×9 → "10"; ≥28-week guidance ("10 mouvements en 2h") visible; "Terminer" → history row. |
| 32 | `32-kick-cancel` | Start → "Annuler" → confirm → no history row added. |
| 33 | `33-contraction` | Start / end ×2 → "Nombre 2", average duration not NaN / "0:00"; history ordered newest first. |
| 34 | `34-contraction-clear` | "Tout effacer" → confirm → empty state with copy. |
| 35 | `35-bag` | Toggle 3 items → "3 / N prêts"; add custom "Chargeur E2E" → N+1; "Retirer" → N. |
| 36 | `36-track-reload` | Same-context reload → kick, contraction and bag persist (local). |
| 37 | `37-track-fresh-context` | New context + `uiLogin`: **kick, contraction and bag are EMPTY** (local-only, `storageKeys.ts:12-46`), while weight and health come back. Record it; the adversary decides whether an undisclosed loss of tracker history on logout/new device is P1 (see risk R6). |

### States — timezone flush (B-plan re-run, subset)

| 38-44 | `38-tz-tunis-…` / `41-tz-ny-…` | States 01, 03, 09 and 30 under `Africa/Tunis` and `America/New_York`. Week number identical across Home, Calendar and Reminders. The today-appointment appears in MA JOURNÉE. The symptom doc id date equals the displayed local date. |

**Acceptance (Wave B green):**
- Every create, edit or delete is proven by the server oracle **and** a fresh-context render.
- The same week, trimester and appointment appear on every surface in 3 timezones.
- No write path reports success on a rules denial or a thrown write.
- Zero strict-console errors.

---

## 4. Wave C — Content & assistant (4 locales, RTL)

**Spec** `e2e/final-release-wave-C.spec.ts`.
- **Main run:** 1 signed-in reader per locale (REST-created, week 32, country France for fr/en and Tunisia for ar/tn). Static reads need `isAuthenticatedReader` (`firestore.rules:302-312`), so an un-sessioned guest would only exercise the bundled fallback.
- **Guest pass:** one extra **real anonymous guest** pass (AuthChoice → `auth_guest_button` → onboarding skip), in fr, proving guests read Firestore content too.
- The locale is set via `addInitScript(localStorage.app_locale = 'fr'|'en'|'ar'|'tn')` (`i18n/index.ts:18`).

### Selectors (from source)

- **Resources** (`/resources`)
  - Segmented tabs `role=tablist/tab` + `aria-selected` (`ResourcesScreen.tsx:58-69`): Articles / Compléments / Supplements / مقالات / مكملات.
- **Articles**
  - Search placeholder: "Rechercher un article…" / "Search for an article…" / "البحث عن مقال…" (`ArticlesListScreen.tsx:259`).
  - Chips are `role=button`: "Favoris" (visible "★ Favoris"; the aria-label has no star), "Tout", then up to 10 categories.
  - Cards: `role=button` with aria-label = title. Empty state: `Aucun résultat pour "…"`.
- **ArticleDetail** (`/article/:id`): bookmark button, aria-label "Ajouter aux favoris" ↔ "Enregistré" with `accessibilityState.selected`; related chips under "Articles liés". No share button.
- **Supplements**
  - Search: "Rechercher un complément…".
  - Chips: Favoris, Tout, "Sans risque", "Avec modération", … (`SupplementsListScreen.tsx:240-301`).
  - Empty state: "Aucun complément trouvé".
  - Detail `/supplement/:id` has the same bookmark control.
- **ForbiddenFoods** (`/forbidden-foods`): search `aria-label` = placeholder "Rechercher un aliment…"; chips and cards have **no role** (select by text); count line "N Aliments"; empty "Aucun résultat trouvé." / tn "ما لقينا والو.".
- **WeekRecommendations** (`/recommendations`): "Articles recommandés" / "Compléments recommandés"; the empty state has a button to Ressources.
- **BabyEvolution** (`/baby-evolution`): 9 dots `aria-label` "Mois N" (`BabyEvolutionScreen.tsx:164-180`), caption "Mois N / 9", back `a11y.back`, footer `home.swipeToSee` (`:197`).
- **Chatbot** (`/chatbot`)
  - Input: placeholder = aria-label "Posez votre question…" (maxLength 500).
  - Send button "Envoyer le message" (disabled when empty).
  - 25 chips (aria-label = label), from the bundled `src/data/chatbot_data.ts`, **not** Firestore.
  - Disclaimer "⚠️ …" + BETA badge (`ChatbotScreen.tsx:264-272`).
  - Triage block `role=alert` title "URGENCE"; call button `a11y.emergencyCall` "📞 … (15|190)".

Query strings that must return results:

| Locale | Articles | Supplements | Foods |
|---|---|---|---|
| fr | `Nausées` | `fer` | `fromage`, `alcool` |
| en | `morning` | `iron` | `cheese`, `sushi` |
| ar | `غثيان` | `الحديد` | `الكحول`, `سوشي` |
| tn | `غثيان` | `الحديد` | `الحوت`, `الكحول` |

No-match: `zzqx`.

Triage triggers:

| Locale | Must trigger | Must NOT trigger |
|---|---|---|
| fr | "j'ai des saignements abondants" | "je ne saigne pas" |
| en | "I have heavy bleeding" | "I am not bleeding" |
| ar | "عندي نزيف" | |
| tn | "3andi nzif" | |

### States (per locale L ∈ fr, en, ar, tn — prefix `L-`; ~10 per locale)

| # | State | Must show / assert |
|---|---|---|
| 01 | `L-01-resources-articles` | `html[dir]` = rtl for ar/tn and ltr for fr/en; `html[lang]` = L. Article titles in L (all 80 articles have 4 locales; tn is a byte copy of ar, which is P3 content-quality, noted once). |
| 02 | `L-02-articles-search` | Query from the table → ≥1 result. Then an unaccented `nausees` (fr) → **HYP-C1:** 0 results (no accent folding, `:149-171`), whereas ForbiddenFoods *does* fold. Inconsistent search = P2. |
| 03 | `L-03-articles-nomatch` | `zzqx` → localized empty state (copy ≥20 chars). |
| 04 | `L-04-article-detail-bookmark` | Open the first result; exactly **one** back button (**HYP-C2**: the stack header plus an in-body `a11y.back` inside `ResourcesStack` duplicates it, the GJ-008 family). Bookmark → aria-label flips to "Enregistré"; back → "★ Favoris" chip → the article is listed. |
| 05 | `L-05-supplements-list` | **HYP-C3 (P1):** the seed and **production** `import-data` both load `supplements_pregnancy.json` (`scripts/importData.ts:38`, `seed-emulator.mjs:29`). There, `short_description_{en,ar}` is empty in 15/15 records, there is no `_tn`, and notes/precautions/dose are French only. Expect French descriptions inside en/ar/tn UIs. Assert every visible description line matches the locale script (Arabic range for ar/tn; no French stop-words for en). |
| 06 | `L-06-supplements-caution-filter` | "Avec modération" chip → **HYP-C4:** 0 results, because the seed status is `'à_surveiller'` and the filter compares the raw value (`:116`), while the card badge normalizes. |
| 07 | `L-07-supplement-detail` | For s09/s10/s11/s15, status is not "Inconnu"/"Unknown" (**HYP-C4b**); one back button; bookmark works. |
| 08 | `L-08-forbidden-search` | Food query → results; `zzqx` → empty; chips selectable by text. |
| 09 | `L-09-week-recs` | Week 32 → article and supplement sections are non-empty and in locale L (same supplement-language check as 05). |
| 10 | `L-10-baby-evolution` | Lands on month 8 for week 32 ("Mois 8 / 9", "Vous êtes ici"). Footer must **not** say "Balayez / Swipe / اسحب" (**GJ-011**, `:197`). Dots "Mois 1..9" navigate. |
| 11 | `L-11-chatbot-empty` | Disclaimer + BETA visible; welcome in L; chips row: the **last chip's right edge ≤ viewport width − 8 px after scrolling to the end**, and in RTL the first chip is flush right (**GJ-007**: no `contentContainerStyle` padding / `useRtlScrollFix`, `:290-306,:400-412`). |
| 12 | `L-12-chatbot-normal` | Type "Quels aliments éviter ?" (L-equivalent) → bot answer in L; send disabled while loading. |
| 13 | `L-13-chatbot-redflag` | Trigger phrase → `role=alert` "URGENCE" block. The call button number follows the **profile country** (France 15, Tunisia 190). For the **en** reader (country France) the button must exist. **HYP-C5:** an en guest with no country gets no call button; that is a P1 safety gap. The `tel:` failure fallback is `window.alert` (record it). |
| 14 | `L-14-chatbot-negation` | The negated phrase → normal answer, no alert. |
| 15 | `L-15-chatbot-chip` | Tap the chip "Je saigne un peu" (cs06) → it is sent as a message → triage outcome recorded (a bleeding chip must at least produce `urgent_consult`). |

Plus:
- **C-G1 guest pass** (fr): `C-G-01..03` — Resources, supplement detail and chatbot as a real anonymous guest. With a strict console, there must be no `permission-denied` (anonymous is an `isAuthenticatedReader`).
- **C-X1:** set fr, open the Chatbot, switch language to ar via Profile, return to the Chatbot → **HYP-C6:** the welcome message stays French (set once at mount, `ChatbotScreen.tsx:36`).

**Acceptance (Wave C green):**
- In 4 locales, every visible content string is in the right language and script.
- `dir` and `lang` are correct.
- Search, filters, bookmarks, triage and negation behave as specified.
- GJ-007 and GJ-011 are closed; one back button on detail screens.
- Zero strict-console errors.

---

## 5. Wave D — Account lifecycle & settings

**Spec** `e2e/final-release-wave-D.spec.ts` · 390×844 · fr (+ ar for the language scenarios) · strict console · **one fresh account per destructive scenario** (D-profile, D-lang, D-export, D-upgrade, D-logout, D-delete-A, D-delete-B, D-reauth).

### Selectors (from source)

- **Profile** (`/profile`)
  - Text fields: "Prénom" (max 50), "Nom", "Taille (cm)" 100-250, "Poids avant grossesse (kg)" 30-200.
  - Country buttons "Tunisie / Maroc / Algérie / France / Belgique / Autre" (`aria-selected`).
  - LMP button "Début de grossesse (DDR) : …": the picker is **dead on web** (web-harness P2).
  - DPA display only (LMP + 280, `ProfileScreen.tsx:86-90`).
  - Save: aria-label "Enregistrer les modifications" → `window.alert` "Succès".
  - Emergency contacts (`EmergencyContactsSection.tsx`):
    - "Ajouter un contact"; type chips; name aria-label "Nom".
    - Phone has **no label**; placeholder "Téléphone" (`:226-232`).
    - "Enregistrer" / "Annuler"; per contact "Supprimer le contact {name}" and "Appeler {name}".
  - Other Profile entries: "Choisir la langue" (modal: English / Français / العربية / العربية + الدارجة), logout, delete account (row aria-label "Supprimer le compte"), support, health dashboard (`:475`).
- **Settings** (`/settings`)
  - Switch "Message quotidien" + hour buttons 8-12 (local only).
  - Switches "Diabète gestationnel", "Hypertension de grossesse", "Grossesse gémellaire" (Firestore `userProfiles` + `medicalProfileAnsweredAt`).
  - Buttons: "Demander les autorisations", "Tester les notifications" (**not** dev-gated), "Exporter PDF", "Exporter", "Politique de confidentialité".
  - Dev-only items that **must be ABSENT** in the export: "Outils développeur", "Lancer le diagnostic", route `/diagnostic`.
- **GuestUpgrade** (`/create-account`): `register_*` testIDs, toast "Compte créé ✅".
- **Delete:** row → `window.confirm` → `deleteAccount` → on `auth/requires-recent-login` → re-auth **Modal** (password field aria-label = re-auth message; "Annuler" / "Confirmer", `AuthContext.tsx:656-716`).

### States

| # | State | Must show / assert |
|---|---|---|
| 01 | `01-profile-loaded` | Fields prefilled from the server seed; DPA = LMP + 280 in fr format. |
| 02 | `02-profile-save-with-lastname` | Change the first name to "Amira" → save → "Succès". Server `userProfiles.firstName == 'Amira'`; fresh context shows Amira. |
| 03 | `03-profile-save-empty-lastname` | **HYP-D1 (P0 candidate):** clear "Nom" → save. `lastName: '' ⇒ undefined` (`ProfileScreen.tsx:160`) reaches `setDoc` without `ignoreUndefinedProperties` (`firebase.ts:25-27`) → throws. `updateProfile` returns `{ok:false}`, which is **ignored**, so "Succès" still shows while localStorage has the edit. Oracle: the server doc still has the old values; the fresh context shows the old name; strict console shows `Unsupported field value: undefined`. |
| 04 | `04-profile-unsaved-edits-wiped` | Type a name (unsaved) → add an emergency contact → **HYP-D2:** the typed name is wiped by the `profile` change effect (`:71-83`). |
| 05 | `05-emergency-contact-add` | Add "Sage-femme" / "0612345678" → server `userProfiles.emergencyContacts[0]`; fresh context shows it; "Appeler …" is present; max 10 is enforced at 11. |
| 06 | `06-emergency-contact-delete` | Delete → server array empty. |
| 07 | `07-settings-loaded` | No "Outils développeur" / "Lancer le diagnostic"; `/diagnostic` deep link → falls to Home (not a blank screen). Record "Tester les notifications" presence (F cross-ref, P2). |
| 08 | `08-settings-medical-flag` | Toggle "Diabète gestationnel" on → server `userProfiles.gestationalDiabetes == true` (key per `medicalFlags.ts`) + `medicalProfileAnsweredAt`; fresh context: still on. SYNC-15 indirect effect: Reminders/Tasks shows glycemia-related items (`contextMatcher.ts`) and the Health glucose card is emphasized (record). Toggle off → items gone. |
| 09 | `09-settings-daily-message` | Toggle + hour 10 → local key `@baby_message_hour_v1` = 10; no console error on web. |
| 10 | `10-settings-request-permission` | Tap → record the outcome. A failure dialog is expected on web (web-harness); an uncaught `Linking.openSettings` exception is P1 (it would crash the ErrorBoundary). |
| 11 | `11-export-json` | "Exporter" → confirm "Données sensibles" → **HYP-D3:** silent no-op on web (`Alert.alert` in the catch, `dataExportService.ts:225-255`). Classify web-harness, **but** also verify the native path in code: the export includes all 9 collections + local tools (schema v5, `:81-208`), else P1 (GDPR portability claim in PrivacyPolicy). |
| 12 | `12-export-pdf` | "Exporter PDF" → **HYP-D4:** the whole screen turns into a skeleton (shared `loading` flag, `:382`), then an error alert (`window.print` returns undefined, `pdfExportService.ts:333`). The skeleton flash is shared code = P2; the error is web-harness. |
| 13 | `13-privacy-reachable` | Settings → "Politique de confidentialité" renders inside HomeStack (not a no-op); the Terms tab has the medical disclaimer; back works. Same from Profile and from the GuestUpgrade terms line. |
| 14 | `14-language-live-ar` | SYNC-10: Profile → "Choisir la langue" → "العربية" **without reload**. Assert `html[dir=rtl][lang=ar]`; tab labels "الرئيسية…"; header titles; `document.title`; Home week text in Arabic; header back chevron mirrored; toast in ar. Then back to Français → ltr. |
| 15 | `15-language-tn` | "العربية + الدارجة" → `lang=tn`, rtl; Tunisian strings where they exist (e.g. empty-state "ما لقينا والو."). |
| 16 | `16-language-deeplink-continue` | `/language` → pick a card → "Continuer" → **HYP-D5:** nothing happens (resets to `AuthChoice`, which is not in HomeStack, `LanguageSelectScreen.tsx:174-176`). Reachable only by URL, so P2 unless something in-app links to it. |
| 17 | `17-language-persist` | After 14, fresh context + login → locale persists (`app_locale` local). It is **not** synced to Firestore (`setLocale` never called), so on another device the language resets: record and score P2. |
| 18 | `18-guest-start` | Fresh context → AuthChoice → guest → onboarding week 32 → skip. Guest actions: toggle a reminder, complete a weekly task, add a weight entry, bookmark an article, add 1 emergency contact, pack 2 bag items. |
| 19 | `19-guest-reload` | Same-context reload: **HYP-D6:** the guest's emergency contact disappears (only height/weight are merged back, `PregnancyContext.tsx:106-121`). |
| 20 | `20-guest-upgrade` | Profile/Home CTA → `/create-account` → email/password → "Compte créé ✅". **Same uid** (`linkWithCredential`), checked via `authAccountExists` + the email now attached. |
| 21 | `21-upgrade-server-truth` | Server: weight entry and reminder/task statuses under the same uid. **HYP-D7 (P1):** `userProfiles/{uid}` does NOT exist after upgrade (nothing writes it, `AuthContext.tsx:240-276`). |
| 22 | `22-upgrade-fresh-login` | New context + `uiLogin` → Home must show "Semaine 32" and the name. If HYP-D7 holds, the minimal profile has no LMP → **P0** (an upgraded user logs in on a new phone and loses her pregnancy dating). |
| 23 | `23-logout` | Logout → lands on `/welcome` (Language), not a blank screen. localStorage has no `PRIVATE_STORAGE_KEYS`. Strict console: **HYP-D8** `cancelAllNotifications` logs an error on web (`notificationService.ts:284-289`). |
| 24 | `24-logout-draft-leak` | User X starts an appointment draft (title "Privé X") → logout → user Y logs in → open `/appointment/add`. **HYP-D9 (P1 privacy):** `@pending_appointment_draft` survives logout, so Y sees X's draft. |
| 25 | `25-relogin` | X logs back in → Firestore data (appointments, weight, profile) back; local tools are gone (see R6). |
| 26 | `26-delete-confirm-cancel` | Delete row → dismiss the confirm → nothing deleted (server intact). |
| 27 | `27-delete-full` | D-delete-A has data seeded in **every** collection: `userEvents`, `userTasks`, `healthMetrics`, `weight_entries`, `glucoseMetrics`, `symptomsLog`, `userReminderSettings`, `userTaskStatuses`, `reminder_settings_v2`, plus a legacy `userProfiles/{uid}/weights/x` and `users/{uid}/journal/x` via Bearer owner. Accept → server: **0 docs** with `user_id==uid` in all 9, no `userProfiles/{uid}` (+ subcollections), no `users/{uid}`, `authAccountExists == false`; the UI lands on Language; localStorage private keys gone. |
| 28 | `28-delete-relogin` | Log in with the deleted creds → "Email ou mot de passe incorrect". |
| 29 | `29-delete-reauth-required` | D-reauth: force `requires-recent-login`. On the emulator, sign in and then wait >5 min, or revoke via `accounts:update` `validSince` (Bearer owner). Then the re-auth modal appears with a labelled password field; a wrong password gives a localized error; the right one completes the deletion. |
| 30 | `30-delete-reauth-cancel` | **HYP-D10 (P0 candidate):** cancel the re-auth modal *after* the purge ran (purge → `user.delete()` order, `gdprPurge.ts:58-97`). The data is gone but the auth user is alive and signed in (a zombie account), and a cold start re-adopts the cached profile. Assert the state is coherent, or the order is fixed (re-auth *before* purge). |
| 31 | `31-reset-profile` | If "Réinitialiser le profil" exists (`ProfileScreen.tsx:197-232`): only the profile doc is deleted and the others are orphaned → P1 (a GDPR-shaped operation that leaves data). |
| 32-34 | `32-ar-profile` / `33-ar-settings` / `34-ar-delete-dialog` | Profile, Settings and the delete confirm text in ar; RTL alignment of the form labels; the confirm dialog message is Arabic. |

**Acceptance (Wave D green):**
- Profile, contacts, medical flags and language are all proven by the server + fresh-context oracle.
- Upgrade keeps the uid **and** a complete server profile.
- Logout leaks nothing to the next user.
- Delete leaves **zero** server documents and no auth user, including after a re-auth cancel.
- No dev-only surface in the export.
- Zero strict-console errors.

---

## 6. Wave E — Form factors & accessibility

**Spec** `e2e/final-release-wave-E.spec.ts` · one read-only week-32 account (REST) + one un-sessioned cold-funnel context · fr and ar.
- **Viewports:** `375×667` (iPhone SE), `390×844`, `820×1180` (iPad portrait; `TabletFrame` ≥700 → 520pt centered column, `TabletFrame.tsx:26-43`), `1180×820` (iPad landscape: `supportsTablet:true`, and on iPad multitasking the orientation lock does not hold, see F-09).
- **Text-scale proxy:** `280×603` at `deviceScaleFactor 1.4`, approximating the capped `maxFontSizeMultiplier = 1.4` (`App.tsx:12-16`). True Dynamic Type is out of scope (device).
- **Dark mode:** out of scope. `userInterfaceStyle: "light"` (`app.json:8`), single palette, no `useColorScheme`. Assert only that `prefers-color-scheme: dark` emulation leaves the page identical (no half-dark rendering).
- **Tooling:** add `@axe-core/playwright` as a devDependency (orchestrator decision), or reuse the contrast walker in `e2e/r5_contrast.mjs`. axe rules used: `color-contrast`, `button-name`, `link-name`, `label`, `image-alt`, `aria-*`, `target-size` (WCAG 2.5.8; also measure ≥44×44 CSS px per Apple HIG).

### Surface set (15 screens × viewports)

`/welcome`, `/auth`, `/register`, `/login`, `/onboarding` (step 2 + 4), HomeMain, `/calendar` (+ month), `/appointment/add`, `/reminders` (+ Tasks), `/statistics`, `/health`, `/weight`, `/resources`, `/article/:id`, `/chatbot`, `/profile`, `/settings`, `/kick-counter`, `/hospital-bag`, `/baby-evolution`.

### States

| # | State | Must show / assert |
|---|---|---|
| 01-15 | `01-se-<screen>` at 375×667 fr | No horizontal scroll (`scrollWidth ≤ clientWidth`). Primary CTA reachable (visible or after a vertical scroll only). No clipped button label (`scrollWidth > clientWidth+2` on `role=button` text = P1 for primary CTAs). Tab bar labels not truncated. Language Continue (GJ-006). Home tool-card grid not overlapping. |
| 16-20 | `16-ipad-<screen>` at 820×1180 | TabletFrame column centered; gutters painted in the background colour; modals (AddTask, Health modals, re-auth) centered inside the column, not full-width; toasts inside the column. |
| 21-23 | `21-ipad-land-<screen>` at 1180×820 | Home, Calendar and Chatbot usable; keyboard-up chat input not hidden (approximate by focusing the input). |
| 24-27 | `24-scale-<screen>` 280×603 @1.4 | Home, AddAppointment, Profile, Onboarding step 3: no overlapping controls, no text cut mid-word in buttons. |
| 28 | `28-axe-fr` | axe on 10 key screens: 0 `critical`/`serious` on `button-name`, `label`, `link-name`. Known candidates: TasksTab ✏️ / 🗑️ unlabeled; emergency phone input unlabeled; Register/Login in-body back unlabeled; ForbiddenFoods chips/cards role-less; Onboarding step-3 back unlabeled (`OnboardingScreen.tsx:667`); Language cards role-less (`LanguageSelectScreen.tsx:118`). Static count: 257 `TouchableOpacity` vs 210 `accessibilityLabel`. |
| 29 | `29-contrast` | All text ≥4.5:1 (≥3:1 for large). Check especially `textLight` inactive tab labels, placeholder colour `neutral400`, the BETA badge, disabled Save buttons (disabled is exempt but must still be perceivable). |
| 30 | `30-target-size` | Every `role=button|checkbox|switch|tab|link` ≥44×44 CSS px, or has hitSlop-equivalent spacing. Report the offenders list: calendar day cells, chatbot chips, dots in BabyEvolution, eye toggles, hour buttons. |
| 31 | `31-focus-order` | Keyboard Tab through Login and AddAppointment: order follows visual order (RTL reversed in ar); every focus shows a visible indicator; no focus trap in modals; Escape closes modals (web). |
| 32 | `32-live-regions` | Error `role=alert` (Register/Login), toasts `role=status`, OfflineNotice `role=alert` polite, triage `role=alert` assertive; the kick count label updates in an `aria-live` region (or record the gap). |
| 33 | `33-offline` | `context.setOffline(true)` on HomeMain → the OfflineNotice banner appears (NetInfo reachability) in fr/ar; navigate to Resources → bundled fallback content within 4 s (`withTimeout`, `utils/withTimeout.ts:21`), no infinite spinner. Add an appointment offline → record behaviour: queued by the Firestore cache vs error. A silent "success" that never syncs is P0; `setOffline(false)` → sync → server oracle. |
| 34 | `34-reconnect` | After back-online, `useRefetchOnReconnect` refreshes and the banner disappears. |
| 35-36 | `35-ar-se-home`, `36-ar-ipad-calendar` | RTL at the smallest and largest widths: mirrored chevrons, right-aligned text, no LTR-stuck rows. |

**Acceptance (Wave E green):**
- No horizontal overflow and no clipped primary CTA at 375×667 or at the scale proxy.
- iPad column correct in both orientations.
- axe: 0 critical/serious on name/label rules.
- Contrast AA on text.
- Targets ≥44 on primary controls (P2 list for the rest).
- Offline never produces a silent false success.

---

## 7. Wave F — Static store compliance (no browser)

**Deliverable:** `round-<N>/wave-F-checklist.md` (check → evidence → verdict) plus `wave-F-findings.json` (same schema, category `audit_integrity` or the closest).
**Tools:**
- `npm run verify`, which already runs the invariant suites `__tests__/releaseConfig.test.ts`, `storeListing.test.ts`, `storeAssets.test.ts`, `appConfig.test.ts`, `babelConfig.test.ts`, `unreviewedContent.test.ts`, `deepLinking.test.ts`, `firestoreIndexes.test.ts`.
- `npm run test:rules` (emulator; use a separate project id, it already does: `mama-bebe-rules-test`).
- `npx expo-doctor`.
- `npx expo config --type introspect --json` (the resolved Info.plist and manifest). **Do not audit the stale local `ios/`** (March 2026, `CFBundleVersion` 3, a leftover `NSMotionUsageDescription`).
- `npx expo export --platform android` + grep of the bundle.

| # | Check | Evidence / expected |
|---|---|---|
| F-01 | Invariant suites green | `npm run verify`, all green (2101+). |
| F-02 | Rules suite green | `npm run test:rules`, 44+ assertions. |
| F-03 | `expo-doctor` | 18/18 (per RELEASE_READINESS §2). |
| F-04 | Bundle ids / versions | `com.mamabebe.app` both platforms; `appVersionSource: remote` + `autoIncrement` (`eas.json`); `runtimeVersion` policy `appVersion`. |
| F-05 | Android permissions | Introspected manifest: only INTERNET, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, VIBRATE; the 10 blocked ones are `tools:node="remove"`; `allowBackup false`. |
| F-06 | targetSdk | RN 0.81 default **36** ≥ Play's 35 requirement (`node_modules/react-native/gradle/libs.versions.toml:3-5`). Add a pinned invariant test (currently none). |
| F-07 | iOS usage strings | Only `NSUserNotificationsUsageDescription` (`app.json:25`): French-only and not a key Apple reads. Remove it or localize it via `locales`. No camera/photo/motion strings in the introspected plist. |
| F-08 | Privacy manifest vs code | `NSPrivacyCollectedDataTypes` (`app.json:110`) vs actual collection. **Sentry `setUser(hashed uid)`** (`src/utils/logger.ts:247`) makes crash data *linked*, but the manifest says "not linked" → P1. There is no `beforeSend` scrubbing, and `logger.ts:111-118` forwards args as `extra` (health values may leak) → P1. Analytics is declared but is a no-op on native (`firebase.ts:96-102`) → over-declaration, P3. |
| F-09 | iPad orientation | `orientation: portrait` + `supportsTablet: true`. Introspected plist: does it contain `UISupportedInterfaceOrientations~ipad` for all 4, or `UIRequiresFullScreen`? Without either, App Store validation rejects the build (multitasking). Cross-check with E states 21-23. |
| F-10 | Export compliance | `ITSAppUsesNonExemptEncryption: false`. |
| F-11 | In-app account deletion (Apple 5.1.1(v)) | Profile → Delete exists and is proven in D-27..30. Any D P0 here = store blocker. |
| F-12 | Web deletion URL (Play) | `accountDeletionUrl = https://www.mama-et-bebe.com/delete-account.html` (`app.json:189`); pages exist in `../website/`. Deployment is unverifiable → operator action. **Domain drift:** linking prefix `https://mama-bebe.com` (`App.tsx:278`), deletion page `mama-et-bebe.com`, contact `contact@mamabebe.app`. Three brands of domain → P2; unify or justify. |
| F-13 | Privacy policy vs reality | `PrivacyPolicyScreen.tsx:59-121` + locales. Health data lists only weight and BP; it omits **glucose, symptoms, declared medical conditions, emergency contacts (third-party data), country**. "Guest mode: data stored only on device" is **false** under Anonymous Auth (guests write weight/reminders to Firestore under the anon uid). Sentry is only mentioned under Cookies. → **P1** (Apple 5.1.1(i) + Play User Data policy require an accurate policy). Must be fixed in 4 locales + the website policy. |
| F-14 | Data safety / App Privacy answers | There is no file in `store/`; the answers are prose in `docs/GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md` §6.5-6.6 (:240-261). Produce `store/data-safety.json` + `store/app-privacy.json` and an invariant test that aligns them with the privacy manifest **and** the corrected policy → P1. |
| F-15 | Medical disclaimer (Apple 1.4.1, Play Health) | Present in the listing (all locales) and in the app: AuthChoice :94, Register :330, Chatbot :264-270, Kick :193, Contraction :215, Forbidden :268, Weight :756, Health :735, SupplementDetail :302, Privacy Terms :134. There is **no onboarding disclaimer**: recommend a one-line disclaimer on the onboarding final step (P2). Confirm the triage copy never presents a diagnosis. |
| F-16 | Health-feature claims | The listing does not claim diagnosis, monitoring or treatment (`storeListing.test.ts`). Kick/contraction timers have "consult your midwife" guidance. |
| F-17 | Age rating | Apple 12+ ("Infrequent/Mild Medical"), Play IARC. This is a note only (`store/listing.json shared.contentRating`); write down the actual questionnaire answers (operator). |
| F-18 | Localized listing | fr, en, ar in `store/listing.json`; tn folds into ar. Character limits enforced by the test. The screenshots are RN-web framed (RELEASE_READINESS §3): they must be re-captured on a simulator (out of scope here). |
| F-19 | Icons / splash | `storeAssets.test.ts` green; adaptive icon layers; notification icon (white-alpha). |
| F-20 | Notification permission timing | Not at launch (`configureNotifications` empty). **But `RemindersTab` PermissionBanner requests on mount without a tap** (`RemindersTab.tsx:66-74`), so the first visit to the Reminders tab fires the OS prompt with no priming. Move it behind a "Enable reminders" tap → P2 (store-reviewer UX, iOS one-shot prompt). |
| F-21 | Dev/test surfaces in production | "Tester les notifications" and "Demander les autorisations" in Settings are not `__DEV__`-gated (`SettingsScreen.tsx:289,329`) → P2 (reviewer-visible test tool). Diagnostic is gated (`App.tsx:132`), and Ramadan is unreachable (`unreviewedContent.test.ts`). |
| F-22 | Crash reporting | `Sentry.init` only if `!__DEV__`, with `dsn: EXPO_PUBLIC_SENTRY_DSN \|\| ''` (`App.tsx:19-25`). `scripts/migrate-secrets-to-eas.sh` pushes only the 6 Firebase keys, and only to **preview**, never the DSN or anything to production → Sentry is silently OFF at launch → **P1**. Add an `appConfig` invariant: production profile + missing DSN = fail. |
| F-23 | Console noise in prod | `transform-remove-console` keeps `console.error`. Grep the android bundle for `console.log` survivors. `utils/validationSystem.ts:131` logs onboarding data ("📊 Analytics") → verify it is stripped; if not, P1 (PII in logs). 5 TODO/FIXME (`ForbiddenFoodsScreen.tsx:136` is halal content awaiting review → clinical-review item). |
| F-24 | Content parity prod vs code | `npm run import-data` imports articles, redFlags, chatbotSuggestionsAG, babyMessages, supplements only. The code reads `calendarTemplates` (`calendarService.ts:172`), `weeks` (`useCurrentWeek.ts:41-52`), `tips` (`tipsService.ts:48`) and `articlesAntigravity` (`contentService.ts:160`), which are populated only by `sync-firestore-templates.ts` / `sync-firestore-weeks.ts` or not at all. Document the full operator seeding sequence or fold it into `import-data` → P1 release-ops. `redFlags` / `chatbotSuggestionsAG` are imported but **unused** by the chatbot (bundled data): harmless, but the triage thresholds that clinical review signs off must be the **bundled** ones. |
| F-25 | Supplements import source | `importData.ts:38` imports `supplements_pregnancy.json` (French-only descriptions, `à_surveiller` status) rather than the 4-locale `src/data/supplements_db.json` → P1 (production content in the wrong language, cross-ref C-05/06). |
| F-26 | EAS submit config | `$APPLE_ID` / `$ASC_APP_ID` / `$APPLE_TEAM_ID` are env placeholders; Android `google-service-account.json` on the internal track → operator (RELEASE_READINESS §4). |
| F-27 | Emulator switch cannot ship | `firebaseEmulator.test.ts` pins that no EAS profile or env template sets `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`. Also grep `dist-e2e` vs a production export to confirm it is absent from the prod bundle. |
| F-28 | Offline behaviour spec | Documented behaviour from E-33/34 matches the store description (no "works offline" claim unless true). |
| F-29 | Review notes / demo account | `store/listing.json` review notes reference a demo account → operator must create it after backend activation (§4.6). The plan provides the REST recipe (§0.2) to pre-seed a realistic week-24 demo profile with appointments and weights. |
| F-30 | Permissions × features | No declared capability without a feature (no location, camera or contacts permission), while the emergency-contacts "Appeler" uses `tel:` → no permission needed. |

**Acceptance (Wave F green):** F-01..F-05, F-10, F-11, F-19 and F-27 are proven by command, and every P1 above is fixed or has an owner-signed operator action.

---

## 8. Cross-surface scenarios (SYNC-1 … SYNC-16)

Each runs inside the owning wave's spec. Assertions use the §0.2 server oracle + fresh context.

| ID | Owner | Scenario | Assertions |
|---|---|---|---|
| **SYNC-1** | B | Appointment add | Calendar week and month show the card. Home "Vos prochains rendez-vous" shows `"{title}, {dd MMMM}, {HH:mm}"` with identical date/time text. If today, Tasks "MA JOURNÉE" lists it and the Home pill reads "Aujourd'hui : 1". Health dashboard "À venir" +1. Server `userEvents` 1 doc. |
| **SYNC-2** | B | Appointment edit (time + notes clear + from Month view) | All SYNC-1 surfaces show 11:00; location preserved; notes cleared on the server. |
| **SYNC-3** | B | Appointment delete | Gone from Calendar, Home, MA JOURNÉE and Health count; server doc absent; no orphan notification record in `@rdv_reminders`. |
| **SYNC-4** | B | Week / trimester / DPA consistency (3 timezones) | Home "Semaine 32" = Calendar current week = Reminders header = WeekRecommendations week = BabyEvolution "Mois 8" = Kick guidance (≥28 rule) = Profile DPA (LMP+280). Trimester "3" on Home **and** Reminders (`trimesterFromWeek`). No surface uses `user.currentWeek` stale while another uses the LMP. |
| **SYNC-5** | D | LMP change → week everywhere | The web picker is dead, so change `lmp` / `pregnancyStartDate` on the server to week 20 (with the user token), then run a fresh-context login. Home "Semaine 20", "2e trimestre"; kick card visible, contraction/bag hidden; Calendar week 20; Reminders "Trimestre 2"; BabyEvolution "Mois 5"; DPA shifted. Then the same via **same-context** reload: the cached `user_profile` must not win over the server (records staleness). |
| **SYNC-6** | B | Weight across trackers | A WeightTracker entry appears in Health. A Health entry appears in WeightTracker (**HYP-B10** fails today). Pre-pregnancy weight identical in Profile, WeightTracker gain calc and Health BMI. |
| **SYNC-7** | B | WeightTracker setup persistence | Height and pre-weight on the server `userProfiles`; Profile fields prefilled with the same values; the setup card does not re-appear in a fresh context (**HYP-B9**). |
| **SYNC-8** | D | Profile save truth | "Succès" is shown **iff** the server doc changed (**HYP-D1**). |
| **SYNC-9** | B | Task completion | Checkbox → Home MA JOURNÉE x/y; Statistics reflects the day (or explicitly excludes custom tasks with copy); server status doc; the fresh context keeps it checked. |
| **SYNC-10** | D | Live language switch | Without reload, every mounted surface flips: tab bar, stack headers, `document.title`, `html[dir/lang]`, Home, toasts, Chatbot welcome (**HYP-C6**), date formats (dd MMMM in ar), number formatting. Back to fr restores ltr. |
| **SYNC-11** | D | Guest → account upgrade | Same uid; the server has weight/reminder/task statuses; **server `userProfiles` exists with the LMP** (**HYP-D7**); a fresh-context login shows week 32 + name; local tools/bookmarks survive on the same device; emergency contact (**HYP-D6**). |
| **SYNC-12** | D | Logout / login round trip | Firestore data restored. Local-only data (kick, contraction, bag, hydration, streaks, bookmarks) is gone; record it and check that the UI or policy discloses this. No cross-user leak (`@pending_appointment_draft`, **HYP-D9**). |
| **SYNC-13** | D | Delete account | Zero server docs across the 9 collections + profile + legacy subcollections; auth user gone; local private keys gone; re-login fails; re-auth cancel does not leave a zombie (**HYP-D10**). |
| **SYNC-14** | C | Bookmark round trip | Article detail bookmark → Articles "Favoris" chip lists it → supplement bookmark → Supplements "Favoris" → unbookmark removes it from both → logout wipes it (local) consistently. |
| **SYNC-15** | D | Medical flag → content | "Diabète gestationnel" on → server flag → Reminders/Tasks gain glycemia items and the Health glucose card is emphasized; off → removed. Same for "Hypertension" → BP reminders. |
| **SYNC-16** | C+D | Country → emergency number | Profile country France → chatbot triage "15"; change to Tunisie (D) → triage "190" (C re-check in the same account). A missing country in `en` → still some emergency affordance (**HYP-C5**). |

---

## 9. Indirect-effects checklist (per feature)

For each item, the capture agent records evidence. On web, notification effects are verified by **code path + storage record** (`@rdv_reminders`, `@rdv_preferences`), because native delivery is out of scope.

| Feature | Indirect effects to verify |
|---|---|
| **Register / Onboarding** | Creates `userProfiles/{uid}` with the LMP (HYP-A1). `app_locale` persisted. Anonymous user created for guests. The welcome card is shown once (`@home_welcome_seen_v1`). Reminders sync kicks in for week>0 (`App.tsx:262-267`, native only). |
| **Login** | Must not overwrite server `lmp`. `migrateAllGuestDataToAuth` runs (a previous guest on this device → its data is attached to the *logged-in* account: verify that is intended, a privacy risk on a shared device). The analytics `setUserId(raw uid)` (`LoginScreen.tsx:88`) is web-only; note it for F-08. |
| **Appointment add / edit / delete** | `scheduleRDVReminders` / `cancelRDVReminders` storage records; Home upcoming + pill; MA JOURNÉE; Health counts; the draft key cleared after save (`@pending_appointment_draft`); `appointment_created{type}` analytics (web). |
| **Task create / complete / delete** | `scheduleOneTimeNotification` / `cancelReminderNotifications`; Home MA JOURNÉE; Statistics; the MyDaySection optimistic state rolls back on failure (**HYP-B12**: it doesn't, `MyDaySection` keeps its own state). |
| **Reminder toggles** | `reminder_settings_v2` server write surfaced on failure (HYP-B7); `syncRemindersToNotifications` (native). |
| **Weight / health entries** | Both histories consistent (HYP-B10); BMI/gain uses the server pre-weight (HYP-B9); clinical warning thresholds; rules-bound errors surfaced (HYP-B11); included in the data export. |
| **Kick / contraction / bag** | Local-only: included in the export (schema v5 says yes); wiped on logout/delete; *not* restored on a new device (disclose). |
| **Profile save** | Server truth (HYP-D1); week recompute everywhere (SYNC-5); `syncRemindersToNotifications` re-run on a week change; the form doesn't wipe unsaved input (HYP-D2). |
| **Medical flags** | Server flag + `medicalProfileAnsweredAt`; content matching (SYNC-15); chatbot triage context (if used). |
| **Language switch** | Every surface live (SYNC-10); `app_locale` persisted; notification copy re-generated on the next sync (native: `App.tsx:267` depends on `i18n.language`); not synced to the server (P2). |
| **Guest upgrade** | Same uid; profile doc written (HYP-D7); guest-local data retained; the delete-account row now visible (`ProfileScreen.tsx:572` hides it for guests). |
| **Logout** | `signOut`, `cancelAllNotifications` (web console error, HYP-D8), `PRIVATE_STORAGE_KEYS` wiped, `clearContentCache`; the draft key leak (HYP-D9); the IndexedDB Firestore cache keeps the previous user's docs (can the next user read them offline? Check with `setOffline(true)` after logout + login as Y: a P0 if X's data renders). |
| **Delete account** | Server purge across all collections; auth delete; notifications cancelled; local wipe; the IndexedDB cache purged? (same check as logout); the order vs re-auth (HYP-D10). |
| **Bookmarks** | Local only; the Favoris filter in both lists; wiped on logout; included in the export. |
| **Chatbot** | Triage number from the profile country (SYNC-16); rate limit 20/60 s → a localized bubble; no network (verify that `network.json` shows no chatbot calls). |
| **Offline** | Banner; bundled fallback; writes queued vs failed (E-33); reconnect refetch. |

---

## 10. Out of scope (needs a physical device, store accounts or humans)

Reference: `docs/RELEASE_READINESS_2026-08-19.md` §3 (done but not provable here) and §4 (impossible without the owner).

- **Native binary boot, App Check init, native Firebase files** (§3 rows 1-2, §4.3). Needs an EAS build (`eas build --profile preview --platform android` needs only a free Expo account, §3b).
- **Notification delivery**, reschedule after reboot, DST, and the iOS one-shot permission prompt UX (§3 row 3).
- **Native RTL** (`I18nManager.isRTL`, `Updates.reloadAsync` on a language switch) in ar/tn (§3 row 4).
- **Native date/time pickers** (Profile LMP, AddAppointment): only the web text-input fallback is tested.
- **Real `console.*` stripping in the release bundle** (§3 row 5). F-23 greps the android export, which is the closest proxy.
- **Account deletion on the live backend** (§3 row 6). The emulator proves logic and rules, not production data.
- **Store screenshots on a simulator** (§3 row 7, §5.3-5.4).
- **iOS build** (Xcode not installed, §3b). **Store accounts**: Play (Organisation, 12 testers × 14 days for a personal account), Apple Developer (§4.1-4.2). **Backend activation**: Anonymous Auth, rules + indexes deploy, `import-data` + template/week sync (§4.4, F-24). **Clinical review** of articles, supplement doses, triage thresholds, Ramadan, halal foods (§4.5, F-23). **Demo reviewer account** (§4.6, F-29).
- **Dynamic Type / TalkBack / VoiceOver** real screen-reader runs. Wave E is a web proxy.
- **Dark mode** (the app is light-only by config).
- **Deployment of `mama-et-bebe.com/delete-account.html`** (F-12).

---

## 11. Biggest risks (ranked)

1. **R1: New registered users may never be dated (HYP-A1, P0).** The Register → Onboarding navigation races `onAuthStateChanged`. The user lands on a Home with no LMP, and every pregnancy surface is empty or wrong. This is the first thing a store reviewer does.
2. **R2: Writes that report success but never reach the server.** Examples: Profile with an empty last name (`undefined` → `setDoc` throws, the result is ignored → "Succès"), WeightTracker setup (never forwarded), reminder toggles (errors swallowed), guest upgrade (no profile doc). Each is masked on the same device by localStorage + the IndexedDB cache, so only the §0.2 server oracle + fresh context catches them. The old `IGNORE_CONSOLE` would have hidden them too.
3. **R3: Account deletion integrity (Apple 5.1.1(v), GDPR art. 17).** The purge runs before re-auth, so a cancel leaves a zombie. "Reset profile" orphans data. The IndexedDB cache and the draft key survive. Any P0 here is a store blocker.
4. **R4: The privacy disclosures don't match the code.** The policy omits glucose, symptoms, conditions and contacts. The "guest data never leaves the device" claim is false under Anonymous Auth. Sentry is linked but declared not linked. There is no Data safety file. Apple and Play both reject on inaccurate disclosures.
5. **R5: Production content parity.** `import-data` ships French-only supplements with an unnormalized status (en/ar/tn users see French; the "with caution" filter is empty). `calendarTemplates`, `weeks`, `tips` and `articlesAntigravity` are not in the documented operator sequence.
6. **R6: Silent data loss for local-only trackers.** Kick, contraction, bag, hydration, streaks, Statistics and bookmarks are wiped on logout and absent on a new device, and nothing tells the user. Two weight histories disagree (Health vs WeightTracker).
7. **R7: Crash reporting is off at launch.** The Sentry DSN is never provisioned to the EAS production environment, and `init` falls back to `''`.
8. **R8: Harness pitfalls.**
   - Concurrent waves on one `:8090` export plus a rebuild mid-run causes false reds (§0.2 rebuild lock).
   - The global guest `storageState` leaks into signed-in waves.
   - Playwright auto-dismisses `window.confirm`, which turns every delete into "cancel".
   - Rules denials are invisible in `network.json` (WebChannel 200).
   - Midnight and timezone off-by-one bugs (UTC week math vs local calendar vs `startsWith` matching) flake unless `timezoneId` is pinned and the multi-timezone re-run is done.
9. **R9: Web ≠ native mis-scoring.** Date pickers, export and `Linking.openSettings` fail on web only. Apply §0.3 so fixers don't spend the cycle on web-only paths, and so real shared-code bugs aren't dismissed as "web".
10. **R10: iPad orientation.** `supportsTablet: true` + portrait-only without `UIRequiresFullScreen` can fail App Store validation (F-09), and nothing tests it today.

---

## 12. Loop discipline (per `REVIEWER_PROTOCOL.md`)

- A round is: waves A-E capture (concurrently), then an adversary per wave, then `wave-X-findings.json`. Wave F runs in parallel.
- The orchestrator batches fixes (test-first: a Jest regression per shared-code finding), runs `npm run verify` green, then a single `emulator-stack.sh rebuild`, then the next round.
- **Converged** = two consecutive rounds with open P0 + P1 = 0 and the same residual P2 id set. The mission says "fix everything", so P2s are fixed too unless they are web-harness-only or out of scope (§10), and each such exemption is listed with a reason.
- Every HYP- must end the audit as a **confirmed finding (with an id)** or **refuted (with a quartet)**. None may be left unaddressed.
