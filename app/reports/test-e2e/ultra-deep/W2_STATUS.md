# W2 — S2 Home (HomeScreen) — wave status (2026-06-20)

GOAL: `docs/GOAL_ULTRA_DEEP_TEST_ANALYSIS_MAMABEBE_2026-06-20.md` · Backlog: `W2_BACKLOG.json`.
10-agent adversarial analysis: **109 raw → 30 ranked/deduped/disputed** (P0:0, P1:5, P2:7, UX:18).

## FIXED + verify-GREEN (6 of 30) — P0+P1 = 0 ✅
| # | sev | item | commit |
|---|---|---|---|
| #1 | P1 | `home.updateStatus` missing in ALL 4 langs (grep=0) → FR a11y label leaked to en/ar/tn; added key 4 langs + dropped inline default | 77bdc49 |
| #2 | P1 | `formatMeasure` rendered `null cm`/`NaN kg` on a missing Firestore field → null/undefined/non-finite/empty guard → `—` (KEPT intentional dot separator — adversarially rejected synth's comma sub-claim; +2 tests) | 77bdc49 |
| #3 | P1 | recommendations carousel missing `dir=ltr` DOM fix → negative scrollLeft in ar/tn; applied proven BabyEvolution `getScrollableNode().setAttribute('dir','ltr')` | 77bdc49 |
| #4 | P1 | curious + postpartum banners hardcoded `flexDirection:'row'` (unlike pills) → no RTL mirror; gated on `isRTL ? 'row-reverse' : 'row'` | 77bdc49 |
| #5 | P1 | week change silent to SR + disabled chevrons lacked `accessibilityState`; added `AccessibilityInfo.announceForAccessibility(week N)` + a11y state | 77bdc49 |
| #7 | P1 | TTC cycleDay raw-ms math (DST-buggy) + fabricated Day 1 on missing LMP → `differenceInCalendarDays` + omit day line when no LMP | 7128036 |

**Visual proof (ar, dist rebuilt + Playwright probe @ /HomeMain):** Home renders RTL-correct (dir=rtl, greeting مرحباً سارة, week badge الأسبوع 21); **formatMeasure now shows "26.7 سم" + "360 غ"** (Arabic units, no "null cm" — guard didn't break the normal path); **0 NEW console errors** (the 2 present are pre-existing Firebase guest-permission errors → owner gate G1, not app regressions).

## REMAINING (24 — next loop passes; do NOT block P1 gate)
- **P2 correctness/contrast:** #6 isInvalid (>40wk) still renders week-40 fetal stats under postpartum banner (M); #8 babySize `.split('{{')[0]` dead no-op leaves dangling "d'un(e)" — needs an i18n grammar key in 4 langs (copy decision); #9 white-on-#FF6B9D band (brand — design call), #10 heroStatValue coral 2.5:1, #11 toolSubtitle #999 2.85:1, #12 tipCategoryText 2.70:1 → focused a11y-contrast pass (verify ratios + token choice; brand-sensitive).
- **UX-tier (18):** TTC bare dead-end (#13), guest = identical pregnant Home / no conversion nudge (#14), silent empty appointments/recs (#15), no rec loading skeleton (#16/#17), baby-focus duplication pushes "what to do" down (#18), orphan recs strip (#19), empty tip card (#20), missing activeOpacity (#21), reduce-motion only gates pulse (#22), curious→Profile dead path (#23), RefreshControl imported-never-wired (#24), dead showFullWarnings + ':' over-match (#25), duplicate ➕ pills (#26), add-task param never consumed (#27), badge asserts 'Semaine 40' post-term (#28), whitespace name → blank avatar (#29), raw FR dailyTip.category (#30).

## Gate
**P0 = 0, P1 = 0 ✅** (all 5 P1 + the #7 data bug). verify GREEN (tsc strict + jest 1876 + lint:colors) every commit; Home visually verified in ar. **W2 = P1-VALIDATED.** Remaining 24 (P2/UX) for subsequent hourly-loop passes; then W3 (S3 Calendar).
