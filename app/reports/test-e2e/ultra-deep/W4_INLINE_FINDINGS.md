# W4 — S4 Reminders/Tasks — inline supervisor findings (2026-06-20)

The 10-agent W4 fan-out was **infra-blocked** (transient server-side rate-limit, 11/11 agents). These are
the results of an inline supervisor spot-check while the full analysis is re-queued (cron retry).

## Verified SOLID (highest-risk areas — no action)
- **Notification orphan-safety**: `remindersScheduler.ts:21-35` cancels only owned (`type` reminder|baby_message) notifications then reschedules all enabled — structurally prevents orphans (NOTIF-07); preserves RDV notifications. ✅
- **Web graceful no-op**: `remindersScheduler.ts:73` early-returns on `Platform.OS==='web'` (expo-notifications unavailable). ✅
- **Reminder toggle a11y**: `RemindersTab.tsx:213-223` — `accessibilityRole="switch"` + label + hint + `accessibilityState.checked`. Exemplary. ✅

## VERIFIED finding — P2 (queued for full-W4 healing)
**TasksTab guest-gate loses anonymous data + is inconsistent with NAV-01.**
- `src/screens/reminders/TasksTab.tsx:283` — a guest creating a task is routed to `navigation.navigate('AuthChoice')` (the logged-out AuthStack full re-register flow).
- The established NAV-01 pattern (`AddAppointmentScreen.tsx:345,355`) routes guests to the **in-place GuestUpgrade** (`getParent().navigate('Home',{screen:'GuestUpgrade'})` → `RegisterScreen upgradeMode` → `upgradeGuest`/`linkWithCredential`), which **preserves** the anonymous user's tasks/reminders. AuthChoice→Register is a fresh account → the guest's anonymous data is NOT linked (lost), and AuthChoice may not be cleanly reachable from inside MainTabs.
- **Fix recipe (needs runtime nav verification):** route to GuestUpgrade. TasksTab is nested deeper than AddAppointment (MaterialTopTab → RemindersStack → MainTabs), so `getParent()` depth differs — prefer the global `navigationRef.navigate('Home',{screen:'GuestUpgrade'})` (App.tsx:394, the proven deep-link pattern). To avoid a circular import (App.tsx transitively imports TasksTab), first extract `navigationRef` into `src/navigation/navigationRef.ts` and re-import in both App.tsx and TasksTab. Then Playwright-verify: guest taps "new task" → lands on the in-place create-account screen (header back returns to tasks), and on success the guest's tasks persist.
- Acceptance: guest → add task → GuestUpgrade (not AuthChoice); after upgrade, previously-created guest tasks still present.

## Status
S4 NOT marked VALIDATED (full loop didn't run). Re-queued. This P2 + the full enumerated backlog will be healed when the 10-agent W4 re-runs (infra recovery / cron).
