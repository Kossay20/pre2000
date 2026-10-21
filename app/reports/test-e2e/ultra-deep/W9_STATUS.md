# W9 — S9 Cross-cutting — wave status (2026-06-23)

Cross-cutting surface: AuthContext (739) + PregnancyContext (308) + ToastContext (182) + shared
components (ErrorBoundary, OfflineNotice, Toast, EmptyState, ErrorState, Skeleton, RtlAwareChevron,
Button/Card/Badge…). Done by **inline supervisor verification** (army still rate-limited).

## FIXED + verify-GREEN
| # | sev | item | commit |
|---|---|---|---|
| #1 | a11y | OfflineNotice banner appeared/disappeared silently → invisible to screen readers; added `accessibilityRole=alert` + `accessibilityLiveRegion=polite` | be337d0 |

## INLINE-VERIFIED SOLID (no defect)
- **ErrorBoundary**: `getDerivedStateFromError` + `componentDidCatch`, retry (re-mount subtree) + reset (discards a bad deep-link URL, no infinite loop), **correctly mounted at App root** (App.tsx:436). Crash recovery works.
- **Guest→auth migration**: `migrateAllGuestDataToAuth` is idempotent + best-effort (W4 #6 hoisted it to always-run on login; W1 #3 preserves an existing profile on re-onboard — both test-locked).
- **ToastContext a11y**: `accessibilityLiveRegion=polite` + role=alert + web role=status/aria-live (W1).
- **GDPR purge surface**: now guard-tested (W8 storageKeys.test.ts) — every service key purged.
- **offline i18n**: offline_title/offline_message present in all 4 langs (the inline FR string is a never-hit defaultValue).

## REMAINING (full-army depth, API-pending)
- Full 10-agent sweep of context re-render perf (provider value memoization), PregnancyContext week-calc edge cases, shared-component prop-contract + RTL/a11y completeness across Button/Card/Badge/Tag/SectionHeader/Skeleton. Inline pass covered the high-risk cross-cutting concerns (error recovery, data lifecycle, a11y live-regions, privacy purge); the breadth sweep is army-pending.

## Gate
**P0 = 0, P1 = 0** (cross-cutting high-risk surface inline-verified; 1 a11y fix). verify GREEN (tsc + jest 1905 / 72 suites + lint:colors). **S9 = inline-verified-clean.** → W10 convergence.
