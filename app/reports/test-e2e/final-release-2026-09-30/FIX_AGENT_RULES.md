# Rules for every fix agent — final-release-2026-09-30

- Working dir: /Users/1millnonstop/Downloads/pregnancy-app/pre2000/app ; Node: `source ~/.nvm/nvm.sh && nvm use` (20.20.2).
- Root-cause, not symptom. Read the implicated files before editing. Minimal correct change, no drive-by refactors.
- Match the surrounding code: comment density, naming, idiom. Comments explain WHY in plain prose (the repo style) — do NOT add `[test-e2e fix …]` tags.
- Test-driven: for every behavioural change add/adjust a Jest test that fails before and passes after (`npx jest <path>`). Copy/i18n changes: keep the 4 locales (fr/en/ar/tn) key-identical; ar and tn are RTL Arabic script.
- All four locales for any new user-visible string. Never hardcode UI text.
- Never fabricate medical facts, citations, URLs, phone numbers or legal claims. If something needs a clinician/lawyer/owner, say so in your report instead of inventing it. Verify any external URL you add actually resolves (WebFetch/curl).
- Other fix agents are editing other files concurrently. Only touch files in your cluster; if you must edit a shared file (i18n JSON, App.tsx), make small targeted Edits and re-read before editing.
- Do NOT run `git commit`, `git stash`, `git checkout -- …` or `git reset` — the orchestrator commits after verification. Do NOT run `bash e2e/emulator-stack.sh rebuild/down` (capture waves are running against the current export).
- Before reporting: `npx tsc --noEmit` and `npx jest` on the test files you touched must be green. Run `npm run lint:colors` if you touched styles.
- Report (≤300 words): per finding id → root cause, files changed, test added, verification output; anything you could not fix and why; exact list of files you changed.
