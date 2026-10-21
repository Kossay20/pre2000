# W4 — S4 Reminders/Tasks — wave status (2026-06-20)

Backlog: `W4_BACKLOG.json` (10-agent analysis: **115 raw → 25 ranked**, P0:0, P1:7, P2:9, UX:9).
NB: the first W4 fan-out was infra-blocked (transient rate-limit); the retry succeeded (see `W4_INLINE_FINDINGS.md` for the inline spot-check done during the block).

## FIXED + verify-GREEN (8 items: 6 P1 + 1 inline-P2 + 1 a11y)
| # | sev | item | commit |
|---|---|---|---|
| #P2 | P2 | TasksTab guest-gate → `AuthChoice` (orphaned anonymous data) → in-place GuestUpgrade via extracted `navigationRef` (preserves data) | 6285f06 |
| #1 | P1 | `t('common.tomorrow')` (undefined → raw key 4 langs) → `tasks.modal.tomorrow` | dff27d2 |
| #2 | P1 | `calendar.weekDays` is an OBJECT but indexed as a numeric array → wrong/empty day names + latent `.map`-on-object crash on per_week panel; ordered-key resolver, days 1=Mon → `(d-1+7)%7` | dff27d2 |
| #3 | P1 | Save button showed the LOADING string at rest (en/ar/tn): `common.save` was 'Saving…' not the action verb. Corrected `save`→Save/حفظ; button uses save(idle)/saving(loading). Also fixes EmergencyContacts | dff27d2 |
| #4 | P1 | completing a one-off task didn't cancel its notification → orphaned reminder; `updateTaskStatus` now cancels on one-off completion | dff27d2 |
| #6 | P1 | guest-data migration ran only `if(!isMinimal)` → returning user with missing/unreadable profile (orphan/offline) lost guest tasks; hoisted to always-run | dff27d2 |
| #7 | P1 | checklist rows (MyDaySection + TaskCard) had no `checkbox` role/`checked` state → SR "edit text, blank"; added | b02055c |

## DEFERRED — P1 #5 (honest: native-only, needs device verification)
- **#5 recurring task uses a one-time DATE notification trigger** (`taskService.ts:47,207`) → a daily/weekly task notifies only ONCE. Real, but native-only — **web (the primary export surface) no-ops all scheduling**, so this does not affect the shipped web app. Fixing it needs a `scheduleRecurringTaskNotification` (the building block exists: `notificationService` already uses `CALENDAR` + `repeats:true` for reminders) wired per recurrence type (daily=CALENDAR repeats; specific_days=one weekly trigger per weekday; interval=re-arm) + **device verification** (notifications can't be tested on web/CI). Not shipping untested notification infra. Spec'd for a focused native cycle.

## REMAINING (P2 ×9, UX ×9 — next passes)
P2: #8 emoji-button/selector a11y, #9 PermissionBanner permanent on web dead-end, #10 all-done blocking window.alert, #11 count plurals, #12 streak DST, #13 interval-recurrence DST, #14 scheduleOneTimeNotification no web guard, #15 intensity change no re-sync, #16 modal dialog role/focus-trap. UX: #17 modal close RTL side, #18 overdue visual, #19 contrast neutral350, #20 statistics grid/safe-area/tabs, #21 RemindersTab perf+resync, #22 add-FAB/guest/empty, #23 undo/revert/loading, #24 dead code, #25 hydration.

## Gate
**Web target: P0 = 0, P1 = 0** (the only open P1, #5, is native-notification-only — no-ops on web). Native full P1-closure pending #5 + device test. 6/7 backlog P1 + the inline guest-data P2 healed; verify GREEN (tsc strict + jest 1876 + lint:colors) every commit. **W4 = P1-VALIDATED (web) / #5-pending (native).** → W5 (S5 Content) next.
