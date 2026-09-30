# Capture-agent brief (GStack main team) — final-release-2026-09-30

Working dir: /Users/1millnonstop/Downloads/pregnancy-app/pre2000/app · Node: `source ~/.nvm/nvm.sh && nvm use`.

Read first: `AUDIT_PLAN.md` §0 (harness) + your wave's section + §8 SYNC scenarios assigned to your wave + §9 indirect effects + the HYP- items in your wave. Reference spec pattern: `e2e/guest-journey-audit.spec.ts`; harness proof: `e2e/final-release-w0-harness.spec.ts`.

Harness (committed, use it — do not re-implement):
- `e2e/helpers/emulator-account.ts`: createAccount, seedProfile(uid, idToken, {week}), serverDoc, serverQuery, authAccountExists, uiLogin(page,email,pw,locale), freshContextLogin(browser,…), waveUse(locale), newAccountEmail(wave,scenario), E2E_PASSWORD, PROJECT_ID, EMPTY_STORAGE_STATE.
- `e2e/helpers/audit-guards.ts`: attachConsoleStrict (signed-in), attachConsole (guest-no-session), assertNonBlankNoRawKey, gotoHydrated.
- `e2e/helpers/dialog-recorder.ts`: attachDialogRecorder(page, recorder) — accept by default, messages land in the quartet.
- `e2e/helpers/mega-audit-snap.ts`: attachMegaAuditRecorder(page, dirs) → snap('NN-slug') writes PNG+DOM+console+network.
- Plan corrections already known: authAccountExists uses accounts:lookup; onboarding does NOT write pregnancyStatus; French trimester label is "3ème Trimestre".

Rules:
- Persistence = PASS only if server truth (serverDoc/serverQuery) AND a fresh context render agree. Same-context reload is a state, never proof.
- Assertions on APP behaviour use `expect.soft` so one real bug doesn't hide the rest of the wave; harness/navigation steps use hard `expect`. Never `.catch(() => {})` a check. Never weaken an assertion to make it pass — a real app bug is the point; record it.
- Do NOT edit app source (src/, App.tsx, app.json…). Other agents are fixing code concurrently. You own only your spec file (and new wave-specific helpers under e2e/helpers/wave-<X>-*.ts if truly needed).
- Never call emulator clear-all endpoints. Unique accounts per destructive scenario. Never `bash e2e/emulator-stack.sh rebuild|down`.
- Use `timeout 900 npx playwright test <spec> --reporter=list` to avoid hangs. Quartets: `E2E_QUARTET_DIR=reports/test-e2e/final-release-2026-09-30/round-<N>/wave-<X>`.
- No git commit/stash/reset.

Phase 1 (now): write the spec, run it against `E2E_BASE_URL=http://localhost:8090` (pre-fix build) until it runs end-to-end (soft failures allowed, they are findings). Quartet dir for phase 1: `…/round-0-dryrun/wave-<X>`.
Report (≤350 words): spec path, number of states, run result, list of soft-assertion failures = suspected app defects (each with state name, expected vs actual, file:line of the likely cause), each HYP- in your wave marked CONFIRMED / REFUTED / NOT-REACHED with evidence.

Phase 2 (when the orchestrator messages you a URL): re-run against that URL with `round-1` quartet dir, report deltas.
