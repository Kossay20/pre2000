# W3 — S3 Calendar — wave status (2026-06-20)

Backlog: `W3_BACKLOG.json` (10-agent analysis: **100 raw → 25 ranked**, P0:0, P1:3, P2:11, P3:4, UX:7).

## FIXED + verify-GREEN (7 of 25) — P0+P1 = 0 ✅  (commit b891be6)
| # | sev | item |
|---|---|---|
| #2 | **P1** | **SHIP-surface crash**: partial/garbage typed date in the web add-appointment form → Invalid Date → `format()` at the controlled value prop threw RangeError → white-screened the form. Guarded `handleWebDate/TimeChange` with `isValid` + guarded both value props. |
| #1 | P2(high) | month-view chevrons were wired to the WEEK handlers; `handlePrev/NextMonth` defined but passed nowhere → month paging broken in all 4 langs. Routed handlers by `calendarView`. |
| #3 | **P1** | `calendarService.calculateWeekFromDate` raw-ms/86400000 (DST-drifts ±1wk) vs canonical UTC → `differenceInCalendarDays`. |
| #8 | **P1** | Title/Location/Notes `TextInput`s had no `accessibilityLabel` (SR: "edit text, blank"). |
| #11 | P2 | raw `'red'` literal on invalid-title border → `theme.colors.error`. |
| #6 | UX | dead `monthDayTextSelected` style now applied (selected day number emphasised). |
| #4 | UX | Calendar mount fade now respects OS reduce-motion (`getReducedMotionSync`, mirrors Toast). |

**Visual probe (ar, dist rebuilt @ /calendar):** Calendar loads dir=rtl, month-view toggle works (`شهر` aria-selected=true, 33-cell month grid), weekday strip correct Arabic (سبت/أحد/اثنين…), **no crash**. #1 month-paging **code-path-verified** (monthLabel←selectedDate←handleNextMonth=addMonths; chevron routed by calendarView; CalendarHeader.tsx:78 onPress=onNextWeek) — the blind-click probe hit the WeeklyStrip's week-nav (a 2nd prev/next set) so it paged a week within June as designed; CalendarHeader's chevron pages months. Manual QA tap of the header chevron recommended to visually close #1. Console errors = pre-existing Firebase guest-permission (owner gate G1), grow per nav-refetch; not regressions.

## REMAINING (18 — next loop passes; do NOT block P1 gate)
P2: #9 web allows saving PAST appointment (reminder to nothing), #10 web date/time are inputMode='none' TextInputs (no real picker), #5 CalendarMonthDay not memoized, #7 day-cell hint says "Suggestions" for user RDV + today not announced, #13 week chevrons no disabled visual/state at bounds, #15 no per-card deleting state (double-tap delete), #16 month grid hardcoded Monday-first for all locales, #17 minimumDate blocks editing a past appointment, #18 month-grid RTL = verify-task (relies on document.dir — correct pattern, probe not rewrite). P3: #14 dead eventCounts/handleToday/WeekHeader, #24 in-render require + ar weekday clip, #25 same-title dedup collapses distinct dates. UX: #12 tn add_appointment.json byte-identical to ar (locale regression), #19 empty-day no Add CTA, #20 non-pluralized counts ("1 Suggestions"), #21 reminders default-on for 'Other', #22 iOS picker not modal, #23 FAB ignores safe-area.

## Gate
**P0 = 0, P1 = 0 ✅** (all 3 P1 + the high-impact #1). verify GREEN (tsc strict + jest 1876 + lint:colors). Loaded + RTL-probed in ar. **W3 = P1-VALIDATED.** → W4 (S4 Reminders) next.
