# W8 — S8 Profile/Settings — wave status (2026-06-23)

The 10-agent W8 army hit a script parse-error then the persistent rate-limit; W8 was done by **inline
supervisor verification** (the binding fallback under API throttling). One real privacy P2 found + fixed.

## FIXED + verify-GREEN
| # | sev | item | commit |
|---|---|---|---|
| **#1** | **P2 PRIVACY (GDPR Art.17)** | bookmarks (`@bookmarks_v1`, saved articles/supplements = health-interest signal) was a GLOBAL key absent from PRIVATE_STORAGE_KEYS + the dynamic prefixes → survived logout AND account-delete, and **leaked across users on a shared device**. Added to purge list; extracted lists to a pure `storageKeys` module + guard test pinning every service key | c502b38 |

## INLINE-VERIFIED SOLID (no defect)
- **GDPR account-delete**: confirm-before-purge (ProfileScreen:526) + requires-recent-login reauth-then-delete + a11y-labeled; Settings uses confirmAction for destructive ops.
- **GDPR data-export**: comprehensive — profile + appointments + tasks + weight + blood-pressure + reminders v1/v2 + task-statuses, via `Promise.allSettled` (resilient to a partial failure). (Note: export does NOT include kick/contraction/hospitalbag/bookmark histories — a completeness improvement, P2, logged below.)
- **Settings Switch a11y**: `accessibilityRole="switch"` + `accessibilityState.checked` + label (SettingsScreen:172-179); buttons role+label+busy.
- **purge breadth**: kick/contraction/hospitalbag/ramadan(Art.9)/hydration/ttc all in the list; per-uid weight/checklist/completions via dynamic prefixes.

## REMAINING (P2/UX — next pass / full-army)
- **export completeness P2**: `dataExportService` omits kick_counter / contraction_timer / hospital_bag / bookmarks histories from the GDPR export bundle (they ARE purged on delete, but not exported) — add them to `generateExportData` for full Art.20 portability.
- Full-army P2/UX tier (profile-edit validation/feedback, settings grouping, language-change reload UX, contrast audit, RTL row sweep) — army-pending API recovery.

## Gate
**P0 = 0; the privacy P2 (#1) FIXED + guard-tested.** GDPR delete + export + Switch a11y inline-verified solid. verify GREEN (tsc + jest 1905 / 72 suites + lint:colors). **S8 = inline-verified, privacy-P2 healed**; export-completeness P2 + full-army P2/UX pending. → W9 (cross-cutting).
