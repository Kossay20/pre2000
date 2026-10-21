# 🏪 Store Listings — DRAFT (owner finalizes) · Mama & Bébé

Draft copy for App Store + Play Store in the 4 supported locales. **Owner reviews/approves**; clinical claims must stay within the G2-reviewed scope (no medical guarantees — it's a companion, not a diagnostic).

## Positioning (all locales)
Companion app for pregnancy & TTC, in **FR / EN / AR / Tunisian**. Week-by-week baby growth, appointments + reminders, health tracking (weight/BP/glucose/symptoms with safety alerts), a multilingual assistant with red-flag triage, and curated articles + supplements. **BETA assistant + medical disclaimer prominent** — not a substitute for medical advice.

## Short description (≤80 chars)
- **EN**: Your pregnancy companion: week-by-week, reminders, health & multilingual support
- **FR**: Votre compagnon de grossesse : semaine par semaine, rappels, santé et soutien
- **AR**: رفيقتك في الحمل: أسبوعاً بأسبوع، تذكيرات، متابعة صحية ودعم بلغتك
- **TN**: رفيقتك في الحمل: أسبوع بأسبوع، تذكيرات، متابعة صحية ودعم بالدارجة

## Full description — feature bullets (translate the EN/FR per locale; AR/TN drafts to be confirmed by native reviewer)
- 👶 Week-by-week baby growth + size comparison
- 📅 Appointments + smart reminders (vitamins, hydration, walks, medical checks)
- ❤️ Health tracking: weight, blood pressure, glucose, symptoms — with safety alerts on dangerous values
- 💬 Multilingual assistant (BETA) with emergency red-flag guidance + local emergency numbers
- 📚 Pregnancy articles + supplement safety info
- 🌍 Full FR / EN / Arabic / Tunisian, right-to-left supported
- 🔒 Your data is yours: export anytime, delete your account anytime (GDPR)

## Screenshots (use captured audit assets, per locale)
Source: `audit-screenshots/full-audit/*` (LTR) + `audit-screenshots/multilang/ar-*,tn-*` (RTL). Suggested set: Home/week · Calendar · Reminders · Chatbot (emergency demo) · Resources. Provide AR/TN (RTL) screenshots for the Arabic listing.

## ⚠️ Privacy / Data-safety declaration (MANDATORY — health app)
Declare accurately on both stores (App Privacy / Play Data Safety):
- **Health & fitness** (pregnancy, weight, BP, glucose, symptoms) — collected, stored.
- **Personal info** (name, email, age range, country, due date / cycle data) — collected.
- **Reproductive-health data** is sensitive — state purpose (app functionality, personalized content), storage, and that the user can **export + delete** (GDPR Art. 15/17, implemented).
- Anonymous-guest mode → minimal data; account mode → Firestore-stored per-user.
- Link the **privacy policy** (PrivacyPolicyScreen + `privacy-policy/` site).
- Disclose third parties: Firebase (auth/Firestore), Sentry (crash), Analytics — list data shared.

## Submission metadata checklist (T10/T12)
- [ ] `app.json` version + iOS `buildNumber` (currently 4) + Android `versionCode` (currently 8) bumped at build time
- [ ] Age rating (medical/health content) · category Health & Fitness / Medical
- [ ] Support URL + privacy URL
- [ ] EAS prod build (needs **G4** secrets + store credentials) → TestFlight + Play internal track

*Draft only. Owner approves copy + finalizes AR/TN (native review) + completes the privacy forms with legal accuracy.*
