# Convergence — guest web parcours (2026-08-31)

Two consecutive clean rounds (**round 6 + round 7**) with **open P0+P1 = 0** and the **same residual finding-id set** `{GJ-006, GJ-007, GJ-008, GJ-011}`.

## Evidence

| Gate | Result |
|---|---|
| `npm run verify` | green (2091 Jest tests) — `{SCRATCH}/verify.log` |
| `guest-journey-audit.spec.ts` round 6 | 31/31 (settled recs/supplements/details/calendars) |
| `guest-journey-audit.spec.ts` round 7 | 31/31 |
| `npx playwright test` run 1 | **82/82** (`e2e-web-1.log`) |
| `npx playwright test` run 2 | **82/82** (`e2e-web-2.log`) |
| `npm run verify` | 2096 Jest tests |
| Quartets | `{SCRATCH}/round-{1,2,3}/` + `app/reports/test-e2e/guest-journey-2026-08-31/round-{n}/` |

## P1s fixed in shipped code

1. **Toast covering AuthChoice guest CTA** — `toastFixedPosition()` pins toasts at `top: 56` (`src/utils/toastLayout.ts`, `ToastContext.tsx`).
2. **Settings toggle console.error on web** — `nativeNotificationsSupported()` no-ops `cancelBabyMessage` / `scheduleBabyMessage` on web (`notificationService.ts`).
3. **E2E week-13 fixture** — LMP is `(week-1)*7` days before today (`e2e/helpers/guest-profile.ts`, `global-setup.ts`). Home now shows Week 13 and hides Kick/Contraction/HospitalBag cards.
4. **Trimester SSOT** — `trimesterFromWeek` (T1 ≤13) used by Home and `buildContextProfile` so Reminders no longer says Trimester 2 at week 13.
5. **Baby Evolution current month** — single-card view (no web `scrollTo` clamp) so week 13 shows Month 3 / plum, not Month 1 / poppy seed.
6. **Kick guidance** — before week 28, `guidanceEarly` is shown instead of the 10-movements-in-2h maternity rule.

## Residual P2 (disclosed, not loop-blocking)

- **GJ-006** Language Continue below the 390×844 fold (scroll).
- **GJ-007** Chatbot suggestion chips clip on the right.
- **GJ-008** Register shows a duplicate in-body back chevron under the stack header.
- **GJ-011** Baby Evolution footer still says “swipe” after the single-card nav.

Open finding-id set round 4 = round 5: `{GJ-006, GJ-007, GJ-008, GJ-011}`.
