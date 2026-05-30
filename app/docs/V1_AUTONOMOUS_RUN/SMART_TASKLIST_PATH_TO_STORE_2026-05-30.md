# 🧭 Supervisor Audit + Smart Long-Run Task List — Mama & Bébé v1.0

**Date** : 2026-05-30 · **Branch** : `release/v1.0-ship` @ `f30e6c3` (17 commits, clean, **not pushed**) · Supervisor: Claude.

---

## PART A — Supervisor audit (where we actually are)

| Dimension | Verdict | Evidence |
|---|---|---|
| **Code quality** | 🟢 strong | 1,397 unit/int (62 suites) + 34 E2E green; `tsc`+lint clean; **ultrareview = 0 findings** |
| **Safety (chatbot triage)** | 🟢 fixed + locked | EN/FR/AR/TN emergency escalation live-tested; negation + matching precision fixed; `chatbotTriage` 27 |
| **Safety (clinical alerts)** | 🟢 logic correct, 🟡 content unreviewed | thresholds + emergency numbers web-verified + tested; **article/supplement content NOT clinician-reviewed (G2)** |
| **i18n / multilang** | 🟢 parity-guarded + RTL + plurals | parity test, RTL verified live in AR/TN, CLDR plurals (EN/FR/AR correct; TN dialect flagged) |
| **GDPR** | 🟢 behaviorally proven | `gdprPurge` executes 9-collection purge + batching |
| **First-run / guest** | 🔴 **#1 SHIP RISK** | guest content load depends on **Anonymous Auth (G1)**; without it → empty app. Unprovable offline. |
| **E2E depth** | 🟡 surfaces covered, deep screens gated | tabs + chatbot + resources + addAppointment audited; Profile/Health/Weight/etc. need live backend (G1) |
| **Store readiness** | 🔴 not started | needs version bump, listings, privacy labels, prod build |

**Bottom line:** *code-complete and review-clean; NOT shippable until the owner clears G1 (Anonymous Auth) + G2 (clinical sign-off).* Two human gates, not code, stand between here and the store.

**Honest residual gaps** (documented, not silent): TN dialect plurals (native review), supplement dosing/Darija translation (clinical+native), P2 error-card heading inconsistency, legacy E2E specs stale, G-A/G-C are product decisions.

---

## PART B — Smart long-run task list (prioritized, ownership-tagged, dependency-ordered)

**Legend** — Owner: 🤖 Claude · 👤 Owner · 🤝 both. Gate: what must be true first. Tags: **[NR]** no-regret · **[OD]** owner-decision · **[OG]** owner-gate · **[ST]** store.

### 🟦 Track 1 — Claude can do NOW (no gate) — run while owner handles gates
| ID | Task | Owner | Effort | Acceptance |
|---|---|---|---|---|
| T1 [NR] | **Error-card consistency**: unify content data-error rendering to include the "Oops!" heading (align inline screen errors + `ErrorState` with `ErrorBoundary`) | 🤖 | M | `ErrorState.test.tsx` + full-audit screenshots show consistent cards |
| T2 [NR] | **Legacy E2E disposition**: delete or convert the 5 stale/never-green specs (web-smoke, audit-screens, feature-tests, deep-interactive, cycle8-screens); keep cycle9+full-audit+multilang+chatbot-abuse | 🤖 | S | `npm run e2e:web` runs only maintained green specs |
| T3 [NR] | **F55 date localization**: AddAppointment ISO date → locale format (4 langs) | 🤖 | S | date test + visual check 4 langs |
| T4 [NR] | **Owner-handoff doc**: step-by-step for G1-G5 (exact Firebase Console clicks, deploy cmd, seed cmd, EAS/GCP) | 🤖 | S | `OWNER_RUNBOOK.md` written |

### 🟨 Track 2 — Code, but OWNER must decide behavior first
| ID | Task | Owner | Gate | Acceptance |
|---|---|---|---|---|
| T5 [OD] | **Guest empty-state (G-A)**: dedicated "connect/retry/offline" state vs current generic error | 🤝 | owner picks copy+behavior (D1) | implement + `ErrorState` variant test |
| T6 [OD] | **TTC mode UI (G-C)**: dedicated TTC home **OR** beta-flag/hide pregnancy widgets for `mode==='ttc'` (fixes week-0 ghost-pregnancy) | 🤝 | owner picks approach (D2) | guarded by fertility/calc tests + a TTC E2E |

### 🟥 Track 3 — OWNER GATES (human-only — the real ship blockers)
| ID | Task | Owner | WHAT (unblock artifact) |
|---|---|---|---|
| **G1** [OG] | Firebase: enable **Anonymous Auth** + `firebase deploy --only firestore:rules` + seed (`npm run import-data`) | 👤 | Console screenshots + deploy log + a live guest reading content |
| **G2** [OG] | **Clinical sign-off** of articles + supplement dosing/precautions + chatbot red-flag→article map by midwife/OB | 👤 | signed review; add `reviewedBy` |
| **G3** [OG] | Device notification smoke fr/ar/tn (iOS+Android) — only proof notifs fire | 👤 | photo/log of received notif + RTL on-device |
| **G4** [OG] | EAS Secrets migration (6) | 👤 | `eas secret:list` |
| **G5** [OG] | GCP API key restrictions | 👤 | Console screenshot |

### 🟩 Track 4 — Claude, AFTER gates unlock
| ID | Task | Owner | Gate | Acceptance |
|---|---|---|---|---|
| T7 | **Live-backend E2E**: real guest journey (onboarding→Home content) + deep screens (Profile/Health/Weight/ForbiddenFoods/KickCounter/ContractionTimer) | 🤖 | G1 | `live-journey.spec.ts` green vs seeded backend |
| T8 | **Chatbot red-flag→article map (C4)**: implement clinician-approved relevant mappings | 🤖 | G2 | `chatbotArticleRelevance.test.ts` |
| T9 | **Supplement dosing/precautions + Darija + TN plurals** translation | 👤→🤖 | G2 + native translator | content matrix 0-missing + parity |

### 🟪 Track 5 — Store submission
| ID | Task | Owner | Gate | Acceptance |
|---|---|---|---|---|
| T10 [ST] | Bump `app.json` version + iOS buildNumber/Android versionCode | 🤖 | pre-build | version set |
| T11 [ST] | 4-lang store listings + screenshots (use audit captures) + privacy data-safety/nutrition labels | 🤝 | — | listings drafted |
| T12 [ST] | EAS **prod build** + upload TestFlight + Play internal track | 👤 (creds) +🤖 | G1,G2,G4 | binary in both internal tracks |
| T13 [ST] | **Final convergence** (1,397 unit + all E2E on live backend) + tag `v1.0.0-store-ready` + **merge `release/v1.0-ship`→`main`** (human gate) | 🤝 | all above | 2 clean cycles; tagged; merged |

---

## PART C — Recommended execution order (the "smart" path)
1. **NOW (parallel):** Claude runs **T1→T4** (no-regret code + owner runbook) ⟷ Owner starts **G1, G2** (the two real blockers).
2. **When owner answers D1/D2:** Claude does **T5, T6**.
3. **After G1:** Claude does **T7** (live E2E). **After G2:** **T8, T9**.
4. **Store:** **T10→T13**; merge to `main` last, behind the human gate.

**Critical path to store = G1 + G2** (everything else is parallelizable or downstream). If only two things happen next, make them **Anonymous Auth** and **clinical sign-off**.

*Persisted to the harness task board for cross-session continuity. Branch held at the human gate — no push/merge without owner go.*
