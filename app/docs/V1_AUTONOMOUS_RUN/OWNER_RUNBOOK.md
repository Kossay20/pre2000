# 👤 Owner Runbook — unblock the v1.0 store ship

These are the **human-only** steps Claude cannot perform. Do them in this order; **G1 and G2 are the critical path**. After each, tell Claude (or paste the artifact) so the gated tasks (T7-T13) can run.

---

## ★ G1 — Firebase backend (THE #1 blocker: without it, guest first-run = empty app)
The default "Continue as Guest" path needs a real anonymous Firebase session + content in Firestore.

1. **Anonymous Auth** → [Firebase Console](https://console.firebase.google.com) → your project → **Authentication → Sign-in method → Anonymous → Enable**.
2. **Deploy rules** (from `app/`):
   ```bash
   firebase deploy --only firestore:rules
   ```
3. **Seed collections** (articles, supplements [now included], redFlags, chatbot suggestions, baby messages):
   ```bash
   cd app && npm run import-data
   ```
   Then Firestore Console → confirm `articles`, `supplements` (15), `redFlags`, `weeks`, `tips`, `babyMessages` are populated.
4. **Verify**: open the web/dev build as a fresh guest → Home shows week content + tips; Resources shows articles + supplements. ✅ → tell Claude → unblocks **T7 (live E2E)**.
> ⚠️ Do NOT enable App Check **Enforce** before a monitoring window — it can instantly DoS real users. Enroll in monitor mode first.

## ★ G2 — Clinical sign-off (legal/safety: unreviewed medical advice must not ship)
1. A **midwife/OB** reviews: the 80 articles, the 15 supplement dosing/precautions strings, and the chatbot red-flag→article mapping (`CHATBOT_ARTICLE_MAP` proposal Claude will produce).
2. Capture the sign-off; add a `reviewedBy` field to reviewed content. ✅ → unblocks **T8 (article map)** + **T9 (dosing translation)**.

## G3 — Device notification smoke (only proof notifications fire)
1. Build a dev/preview client on **one iOS + one Android** physical device.
2. Set a daily reminder ("take a pill") + an appointment J-1 → confirm the notification **arrives** and tapping it opens the right tab. Repeat in **fr and ar** (verify RTL on-device).
3. Record photo/log → `NOTIF_DEVICE_SMOKE.md`.

## G4 — EAS Secrets (prod build)
```bash
cd app && eas secret:create   # ×6 — migrate the 6 .env values; then eas secret:list to confirm
```
Remove the secrets from `.env`/`eas.json`.

## G5 — GCP API key restrictions
[GCP Console](https://console.cloud.google.com) → APIs & Services → Credentials → restrict the key by **HTTP referrer / iOS bundle (com.mamabebe.app) / Android package+SHA-1 / API allowlist**.

---

## Product decisions Claude needs from you (then Claude implements + tests)
- **D1 (guest empty-state)**: when content can't load, show a dedicated "connect / retry / offline" state, or keep the generic error card?
- **D2 (TTC mode)**: build a dedicated TTC home, or beta-flag/hide the pregnancy widgets (which currently show "week 0" — a ghost-pregnancy)?

---

## After gates: Claude runs (no further owner action except creds for the build)
T7 live-backend E2E (post-G1) · T8 chatbot article map (post-G2) · T9 content translation (post-G2 + native translator) · T10-T13 store submission (version bump, listings, **EAS prod build needs G4 + your store credentials**, TestFlight + Play internal) · final convergence + tag + **merge `release/v1.0-ship`→`main`** (your go).
