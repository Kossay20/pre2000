# Mama & Bébé — Repo root

Pregnancy app monorepo. Code applicatif dans `app/`.

## Quick start

```bash
cd app
nvm use            # → 20.20.2 (cf. app/.nvmrc)
npm install
npx expo start --web --port 8081  # web preview
```

## Documentation

- **Dev guide** : [`app/README.md`](app/README.md) — install, scripts, tests, déploiement.
- **Run autonomes audit/fix** : [`app/docs/V1_AUTONOMOUS_RUN/`](app/docs/V1_AUTONOMOUS_RUN/)
  - `MANIFEST.md` Cycle 1 — pipeline E2E + 22 findings.
  - `VERDICT_v1.md` — sign-off code Cycle 1.
  - `CYCLE2_MANIFEST.md` + `VERDICT_v2.md` — 64 findings GSTACK 6-rôles.
  - `CYCLE3_PLAN.md` — fix loop discipline test-driven.
  - `findings.md` — registre F31-F609.
  - `ADVERSARY_BRIEF.md` — protocole sub-agent adversary.
- **R1-FIX final** : [`app/docs/R1_FIX_FINAL_DELIVERABLE.md`](app/docs/R1_FIX_FINAL_DELIVERABLE.md) — 13 cycles security.
- **Plans gates** : [`app/docs/gates/`](app/docs/gates/).

## Méthodologie

- **GSTACK YC** : Pipeline 7-step (Think → Plan → Build → Review → Test → Ship → Reflect) + 6 rôles virtuels (CEO/PM/Designer/Security/QA/Eng Manager).
- **Adversary** : sub-agent hostile invoqué après chaque step substantiel. File:line obligatoire.
- **Test-driven** : aucun commit avant `npm run verify` vert. Régression = rollback.

## Stack

- React Native 0.81 + Expo SDK 54
- Firebase Auth + Firestore + App Check
- TypeScript strict
- Jest (unit) + Playwright (E2E web)
- 4 langues : FR / EN / AR / TN

## Permissions Claude Code

Mode : `acceptEdits` (cf. `.claude/settings.local.json`). Permissions étendues sur ce repo path.

## Actions opérateur pendantes (Cycle 1 §6)

1. `firebase deploy --only firestore:rules`
2. Firebase Console → App Check (iOS App Attest + Android Play Integrity) + Anonymous Auth pour F100.
3. EAS Secrets migration (6 secrets).
4. GCP API Key restrictions.
5. V1-smoke test sur device physique fr/ar/tn.
6. Cycle 2 : Apple credentials dans `eas.json` (F102/F603).
