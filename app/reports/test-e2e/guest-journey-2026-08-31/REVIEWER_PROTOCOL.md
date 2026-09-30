# Reviewer Protocol — Mama & Bébé guest-web journey

Adversarial agents inspect the artifact quartet (PNG + DOM + console + network) per state.

## Severity (loop-blocking)

| Sev | Meaning | Blocks? |
|---|---|---|
| P0 | Crash/blank, dead-end, clinical safety mislabel, silent app-owned error | YES |
| P1 | Raw i18n leak, RTL not mirrored on ar/tn primary path, unusable primary control, overlapping primary CTA | YES |
| P2 | Truncation, contrast, weak empty-state, missing aria on non-primary | NO — disclose |
| P3 | Cosmetic / antialias | NO |

## Allowlist (NOT P0)

- Firestore `permission-denied` / `FirebaseError` (offline static-export, no anonymous auth)
- wasm MIME / `serve --single` returning index.html for `.wasm`
- RN-web deprecation (`shadow*`, `pointerEvents`, `findDOMNode`, `useNativeDriver`)
- `Failed to fetch` / `net::ERR` against Google APIs without live backend

## Guest week=13

Kick (≥16) and Contraction/HospitalBag (≥28) Home cards are hidden. Deep-linked screens must still render their idle/gated UI.

## Categories

i18n leak, text truncation, element overlap, color contrast, empty-state, silent error (app-owned), loading missing, aria/keyboard, console error (app-owned), unexpected 4xx (app-owned), numeric/clinical integrity, visual drift.
