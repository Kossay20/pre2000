# PAGE-BY-PAGE VALIDATION DOSSIER — Mama & Bébé (2026-06-02)

**For human sign-off before store submission.** Every reachable page captured fresh in all 4
languages (FR / EN / AR / TN), independently reviewed by a per-page validation agent + supervisor
cross-check. Screenshots in `app/audit-screenshots/` (gitignored). Pregnancy app — invariants:
clinical-safety + GDPR + i18n-parity.

## Verdict: 14/14 reachable page-states READY (offline web audit). Store ship gated on owner items below.

*(11 page-types; onboarding expanded to its 4 steps = 14 distinct screen-states, each × 4 languages.)*

The audit's single NEEDS_FIX finding (Login RTL back-arrow on ar/tn) was **fixed** (commit `b76ab63`)
and re-verified visually. No raw key leaks, no FR/EN leaking into AR/TN, no wrong text direction,
no layout breaks, no crashes across any page in any language.

---

## Part A — Pages validated offline (screenshot evidence, all 4 langs)

| # | Page | FR | EN | AR (RTL) | TN (RTL) | Screenshot |
|---|------|----|----|----------|----------|-----------|
| 1 | Language picker | ✅ | ✅ | ✅ | ✅ | `auth-lang-audit/{L}-01-language.png` |
| 2 | AuthChoice (start journey) | ✅ | ✅ | ✅ | ✅ | `auth-lang-audit/{L}-02-auth-choice.png` |
| 3 | Register / inscription form | ✅ | ✅ | ✅ | ✅ | `auth-lang-audit/{L}-03-register.png` |
| 4 | Login form | ✅ | ✅ | ✅ *(fixed)* | ✅ *(fixed)* | `auth-lang-audit/{L}-04-login.png` |
| 5 | Onboarding **step 1** (mode select) | ✅ | ✅ | ✅ | ✅ | `auth-lang-audit/{L}-05-onboarding-step1.png` |
| 5b | Onboarding **step 2** (date / week calc) | ✅ | ✅ | ✅ | ✅ | `auth-lang-audit/{L}-06-onboarding-step2-date.png` |
| 5c | Onboarding **step 3** (age / country / profile) | ✅ | ✅ | ✅ | ✅ | `auth-lang-audit/{L}-07-onboarding-step3-profile.png` |
| 5d | Onboarding **step 4** (account form — render only, no submit) | ✅ | ✅ | ✅ | ✅ | `auth-lang-audit/{L}-08-onboarding-step4-account.png` |
| 6 | Home tab *(offline error-card by design)* | ✅ | ✅ | ✅ | ✅ | `multilang/{L}-tab0.png` |
| 7 | Calendar tab | ✅ | ✅ | ✅ | ✅ | `multilang/{L}-tab1.png` |
| 8 | Reminders tab (incl. water-tracker) | ✅ | ✅ | ✅ | ✅ | `multilang/{L}-tab2.png` |
| 9 | Resources tab (Articles/Supplements) | ✅ | ✅ | ✅ | ✅ | `multilang/{L}-tab3.png` |
| 10 | Chatbot welcome | ✅ | ✅ | ✅ | ✅ | `multilang/{L}-tab4.png` |
| 11 | Chatbot EMERGENCY triage (heavy bleeding → escalation) | ✅ | ✅ | ✅ | ✅ | `chatbot-abuse/{L}-emergency.png` |

`{L}` = fr / en / ar / tn. RTL pages verified: text right-aligned, layout mirrored, chevrons/arrows
correct direction, no FR/EN leak. **56 screenshots total** (14 screen-states × 4 langs). Onboarding
steps 1–3 are pure client state (fully exercised offline); step 4 is the account form (rendered &
i18n-verified — submission is backend-gated, not driven here).

**What "READY" means here:** the page renders correctly with correct i18n, direction, and layout in
all 4 languages in the offline web build. It does NOT prove backend behavior — see Part B.

**Expected-by-design (not defects):** Home + Resources>Articles show a graceful error card ("Oops!/
عذراً … your data is safe" + Retry) because there is no Firestore in the offline build. This is the
T7 backend gap, not a UI defect — the error state itself is clean in all 4 langs.

---

## Part B — Human validation checklist (what the offline web audit CANNOT prove)

These require a **real device + live backend + clinician** and are the human's responsibility before
ship. Derived from the validation agents' findings:

### B1 — Device / native (the offline web export cannot exercise)
- [ ] **RTL on a physical iOS/Android device** (ar/tn): confirm every absolute-positioned affordance
  (back arrows, icons) mirrors to the correct edge. The RTL fixes here are **web-verified only**. The
  `isRTL` flag was made language-derived (correct on both platforms), BUT the back-arrow positioning
  uses physical `left`/`right` set inline — on native, `I18nManager.isRTL` + `doLeftAndRightSwapInRTL`
  can auto-swap physical sides, so the arrow *could* land on the wrong edge on a real device. If a
  device check shows native breakage, the robust fix is logical `start`/`end` props (noted, not chased
  now). Eyeball each RTL screen on device.
- [ ] **Push notifications actually fire**: reminders/water/vitamin notifications schedule and deliver
  with OS permission granted (the "Enable notifications" banner path).
- [ ] **Real `tel:` dialing**: tapping the emergency CTA opens the dialer with the correct number.

### B2 — Backend-gated (needs G1 Anonymous Auth + Firestore live)
- [ ] **Account creation** (Register) end-to-end: validation, weak/duplicate-email errors, success nav.
- [ ] **Login** with a real credential: authenticates, retrieves saved data, wrong-password/forgot flows.
- [ ] **Onboarding completion + persistence**: all 4 steps now visually verified offline (steps 1–3
  client-state + step-4 form render). Remaining for device: actually SUBMIT step 4 and confirm the
  selected mode + entered data persist to Firestore and survive app restart/re-login.
- [ ] **Deep screens with live data** in all 4 langs (NOT audited — behind the backend gate, showed
  only the offline error card): **Profile, Settings, Health, Weight, Foods, KickCounter, ContractionTimer**.
- [ ] **Home + Resources>Articles with populated lists**: confirm correct render (no key leak, correct
  RTL, no clipping) once a backend feeds them.

### B3 — Clinical / content (needs qualified sign-off — must NOT be auto-generated)
- [ ] **Emergency number per user country**: the chatbot CTA resolves the number from the user's
  country (`resolveEmergencyNumber`). The "(15)" seen in screenshots is the France test-fixture
  (`country:'France'`); confirm on device that a Tunisia/Algeria/Morocco user gets the correct local
  number (190 / 14 / 141 etc.), or that the generic "call your local emergency number" wording suffices.
- [ ] **Supplement list + any dosage/medical guidance** reviewed by a clinician for correctness across
  all 4 langs (offline audit only saw the empty/error state).
- [ ] **Chatbot triage logic** clinically signed off (the keyword/red-flag matcher behavior).
- [ ] **TN (Darija) register** on dynamic backend content: spot-check user-facing dynamic strings keep
  the intended Tunisian register where expected (some short system strings intentionally share MSA with AR).

---

## Part C — Owner gates (block store ship; human-only; I cannot do these)

| Gate | Action | Where |
|------|--------|-------|
| **G1** | Enable **Firebase Anonymous Auth** | Firebase Console → Authentication → Sign-in methods. *Single biggest unblock — also makes the Part-B2 deep screens auditable (lifts T7).* |
| G2 | Clinical sign-off (triage + supplement content) | A clinician |
| G3 | EAS secrets migration (6 secrets) | EAS dashboard |
| G4 | GCP API key restrictions | GCP Console |
| G5 | Device smoke test fr/ar/tn | Physical device (covers Part B1) |

**Coupled to G1:** the guest privacy line ("data stays on your device") is TRUE today (pre-G1, no
Firestore writes). When G1 is flipped, guest data goes to Firestore → the line must be reworded in all
4 locales AT THAT TIME. Do not edit it before flipping G1.

---

## Code-side state at this dossier
- 62 suites / **1631 tests** green, tsc clean.
- 6 E2E specs (auth-onboarding-lang, chatbot-abuse, multilang, full-audit, cycle9, + boundary).
- abuse-e2e converged (2 consecutive clean cycles). P0+P1 actionable = 0.
- All on `release/v1.0-ship`. **Nothing pushed — merge gate held for owner go.**
