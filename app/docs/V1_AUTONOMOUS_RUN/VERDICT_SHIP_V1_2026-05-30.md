# ✅ Verdict — SHIP_V1_MAMABEBE remediation run

**Date** : 2026-05-30 · **Branch** : `release/v1.0-ship` (from `main` @ `6b4d06c`) · **Backup tag** : `backup/pre-ship-2026-05-30`
**Mandate** : supervisor fixes everything to the end — TDD + adversary + E2E, heal until green.
**Method** : GStack 7-step LOOP + Superpowers (brainstorming/TDD/verification) + RED adversary, per `SUPERVISOR_ASSESSMENT_2026-05-30.md`.

---

## 0 · Headline

Baseline at run start: **368 tests**. Now: **415 tests green** (37 suites), `tsc` clean, `lint:colors` clean — **0 regression**, +47 tests, all backing the verified P0/P1 safety findings. Canonical E2E net **cycle9-fixes 15/15** passes against the standardized static-export harness. Every claim below is backed by a command that was actually run.

Each fix was **proven by a test that failed before and passes after** (TDD), and the two highest-stakes changes (chatbot triage, GDPR purge) survived a RED adversary pass.

---

## 1 · Waves delivered (all committed, each `npm run verify` green)

| Wave | Commit | What | Evidence |
|---|---|---|---|
| **W1** Foundation | `17b2131` | R5 delete dead/invalid `app/articles_db.json`; N2 fix order-dependent notif test (was silently null in isolation); **I1 build the 4-lang key-parity guard** wired into verify | `i18nParity.test.ts` 7✓ (FR/EN/AR/TN parity holds & is now locked) |
| **W2** E2E harness | `(W1+config)` | E1 standardize Playwright on the **static-export** harness (dev server 404s on `/HomeMain`); fix stale emoji tab-labels in 3 specs | **cycle9-fixes 15/15** vs static export; harness proven |
| **W3** Chatbot ⭐P0 | `66642b1` | C2 EN emergencies escalate (`heavy bleeding`/`kill myself` → were NO alert); fix FuzzyMatcher cross-lang corruption; multi-word full-phrase matching (kills `eat`⊂`breathing` / `la`⊂`éclampsie` false-escalations); C3 strong-match defeats Arabic self-negation `لا أشعر بالطفل`; EN+`ne` negations (`I am not bleeding` no longer escalates); C5 drop "AI" subtitle | **`chatbotTriage.test.ts` 21✓** (real `analyzeMessage`) + RED adversary pass |
| **W4** Notifications ⭐P0 | `d3ae7be` | N3 `syncRemindersToNotifications` (the real toggle path, 0 coverage, web early-return); N4 `babyMessageService` daily message + locale fallback | `remindersScheduler.test.ts` 5✓ + `babyMessageService.test.ts` 5✓ |
| **W5** Resources ⭐P0 | `f91a81a` | R2 **seed `supplements`** (was never imported → empty tab); R1 supplement names EN/AR/TN (15/15, names only); R6 contentService cache/chunk/order | `contentService.test.ts` 7✓ |
| **W7** Health | `b43d80b` | H1 glucose target `3.5–7.8`→`3.5–5.5 (fasting)` (matched alert thresholds, 4 locales); H2 `resolveEmergencyNumber(country, locale)` so empty-country AR/TN users keep the call button | resolver covered `clinicalChecks.test.ts:246-260` |
| **W8a** GDPR | `078de5b` | G-B extract purge → `gdprPurge.ts`, **behaviorally tested** (was a static regex that never executed) | `gdprPurge.test.ts` 6✓ + wiring 2✓ |
| **W6** RTL | `b8c889a` | I2 fix web infinite-reload-loop for Arabic users (web RTL via `document.dir`, never reload) | `rtl.test.ts` 4✓ |

---

## 2 · RED adversary — what it caught (and we then fixed)

The chatbot RED pass found issues the first 12-phrase corpus missed; all folded into the fix + corpus:
- **AR self-negation** `لا أشعر بالطفل` self-cancelled (its keyword starts with negation `لا`) → fixed with strong-match guard. ✅
- **EN negation absent** → `I am not bleeding` falsely escalated → EN+`ne` negations added. ✅
- **Paraphrase gaps** (can't breathe / passed out / baby stopped moving / suicidal variants) → added + locked in corpus. ✅
- Residual (BETA, documented): exhaustive AR/TN colloquial paraphrase coverage. A keyword matcher is not free-text AI triage → **BETA badge + medical disclaimer remain mandatory**.

---

## 3 · Honest scope — NOT done, with reason

### Documented follow-ups (code, deferred with rationale)
| ID | Item | Why deferred | Approach |
|---|---|---|---|
| I3 | Arabic plurals (`_plural` deprecated → singular fallback, 2 keys) | Correct CLDR forms (Arabic 6 vs FR 2) **conflict with the strict 4-lang key-parity test**; needs app-run validation of Arabic rendering | rename `_plural`→`_other` + add Arabic `_zero/_two/_few/_many`; teach `i18nParity.test.ts` to treat CLDR plural suffixes as allowed asymmetry |
| C4 | Chatbot red-flag→article relevance | Content-relevance/clinical, not escalation-safety (escalation + emergency number are fixed) | curate `linked_articles_ids`; needs clinician input |
| — | Legacy E2E specs (`web-smoke`, `audit-screens`, `feature-tests`, `deep-interactive`) full revival | They "never ran live"; failures are storageState/hydration/deep-flow staleness, not just tab labels (which I fixed). cycle9-fixes is the project's canonical net and is green | dedicated spec-revival pass: rebuild flows on the static-export harness, align selectors |
| G-A | Guest empty-state in-app message | Primary fix is the **owner gate** (Anonymous Auth); the empty shell is its consequence | add a "content unavailable — retry/online" state when authed-content reads return empty |
| G-C | TTC/Curious "ghost pregnancy" (week-0 pregnancy UI) | Product/UX decision (dedicated TTC home vs honest beta flag) — owner call | beta-flag the non-pregnant modes OR build a TTC-specific home |

### Owner actions — human-only, CANNOT be automated (true ship blockers ★)
| # | Action | Blocks |
|---|---|---|
| ★1 | Firebase Console: enable **Anonymous Auth** + deploy `firestore.rules` + seed collections (now incl. supplements via `npm run import-data`) | The default "Continue as Guest" first-run — without it, content reads are denied → empty app |
| ★2 | **Clinical sign-off** (midwife/OB) of articles + supplement dosing/precautions; add visible "reviewed by" | Shipping medical advice |
| 3 | Translate supplement **dosing/precautions/notes** AR/EN/TN (names done; clinical strings intentionally NOT fabricated) | Full 4-lang content |
| 4 | Real Tunisian **Darija** article content (currently AR copy) | Marketed differentiator |
| 5 | **Device notification smoke** fr/ar/tn iOS+Android (only way to prove notifications fire) | "Do notifications fire" |
| 6 | EAS Secrets migration + GCP API key restrictions | Hardened prod build |

---

## 4 · Invariants attested (this run)
- **Clinical-safety**: `clinicalChecks.test.ts` green; NO threshold logic changed (only the glucose *display label* aligned to the existing bands). Emergency numbers FR15/TN190/MA141/DZ16 intact + now reachable for empty-country AR/TN users (H2).
- **GDPR**: purge now *behaviorally* proven (9 collections by user_id + batching).
- **i18n-parity**: locked by `i18nParity.test.ts` in `npm run verify`; held green across all locale edits this run.
- **Link-safety**: `safeOpenUrl.test.ts` untouched/green.

---

## 5 · Reproduce
```bash
cd app && git checkout release/v1.0-ship
npm run verify                       # 37 suites / 415 tests, tsc, lint:colors
npx expo export --platform web --output-dir dist
npx serve dist -l 8092 --single &
E2E_BASE_URL=http://localhost:8092 npx playwright test e2e/cycle9-fixes.spec.ts --workers=1   # 15/15
```

---

## 6 · Merge recommendation
🟢 **Merge `release/v1.0-ship` → `main`** (human gate — not auto-pushed). Code-side P0/P1 from the supervisor assessment are fixed + tested. 🔴 **NO store ship** until owner actions ★1 (Anonymous Auth + rules deploy + seed) and ★2 (clinical sign-off) are done, and the device notification smoke (★5) is run.

*Supervisor: Claude. 8 waves, +47 tests, 8 checkpoint commits, RED adversary on the 2 highest-stakes changes. Pregnancy app — Mama & Bébé only.*
