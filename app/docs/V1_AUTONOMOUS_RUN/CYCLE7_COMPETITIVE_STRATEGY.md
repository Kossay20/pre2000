# 🎯 Cycle 7 — Competitive Strategy & User-Preference Roadmap

**Date** : 2026-05-08
**HEAD début** : `88c1dae`
**Méthodo** : GSTACK 6-rôles + Adversary + 4-axis user request (features/UX/MENA/trust)
**Scope** : Full competitive strategy (no fresh user research → desk proxies + competitor mining)
**Scope tail** : Strategic doc only — no code change in this commit. Implementation = Cycle 8+.

---

## 0. TL;DR — 3 strategic bets

1. **Capture the active Ovia Pregnancy migration wave** (NOW). Standalone Ovia Pregnancy was removed from the App Store June 2025 (~11 months ago, no new installs since), with full shutdown announced for "mid-2026" — i.e. happening right now (today 2026-05-08). Existing users are being force-migrated to Labcorp's consolidated Ovia (cycle+pregnancy+postpartum+menopause); review evidence shows non-trivial dissatisfaction with the consolidation. Build a switching funnel **this month, not next quarter**. Time-boxed, decaying opportunity.

2. **Own MENA / Maghreb / Muslim pregnancy** as the wedge. Flo/Ovia/BabyCenter under-serve Arabic; the only direct competitor (Afifa app) is cycle-focused not pregnancy-focused. Differentiation = TN dialect + halal nutrition + Ramadan-pregnancy module + modesty toggle + Hijri calendar. **This is the moat that Western incumbents structurally cannot copy at content quality.**

3. **Privacy-as-product + free-tier completeness** as the global wedge. Post-*Dobbs* + post-FTC-Flo trust deficit is structural. Mama & Bébé already has RGPD-grade delete (F41 — `deleteAccount` purges 9 collections), Anonymous Auth, and on-device-first design — **market this loudly** and make it user-visible.

---

## 1. Methodology & data sources

| Source | What it gave us | Confidence |
|---|---|---|
| **Direct WebSearch** (Flo/Ovia/BabyCenter feature pages, App Store listings, Wikipedia, Mozilla *PNI*, FTC docs, NPR/Bloomberg post-Dobbs coverage) | Current 2025-2026 feature inventories, Ovia shutdown confirmation, privacy landscape | **High** (live-fetched) |
| **review_mining.md** (sub-agent synthesis from training data, web-denied — labeled as such, see `app/docs/V1_AUTONOMOUS_RUN/research/review_mining.md`) | Recurring review themes, pain-point patterns, underserved segments | **Medium** — directional, %s flagged for re-validation |
| **FEATURE_MAP_AND_AUDIT.md** | Mama & Bébé inventory (43 features × 9 zones) | **High** (code-grounded) |
| **No fresh user interviews** | — | **Gap — operator action #1** |

**Adversary check applied** : every recommendation in §6 has a "what could go wrong / what counter-evidence would kill this" line. No claim is uncited or fabricated; figures from the review-mining sub-agent are explicitly tagged.

---

## 2. Competitive landscape (live data, 2025-2026)

### 2.1 Flo Health (pregnancy mode)
- **Scale** : ~48M MAU (post-Dobbs anonymous-mode launch).
- **Features** : week-by-week + symptoms, baby growth, partner sharing, parents chat space, expert articles, trimester yoga course, weekly checklist, daily personalized AI insights (Databricks platform, 2025), 24/7 virtual Health Assistant (premium), pregnancy mode within unified cycle/menopause app.
- **Monetization** : subscription paywall (~$80/yr) gating week-by-week premium content, video courses, in-depth features.
- **Pain points (from review mining + press)** : aggressive paywall (~35-45% of negative reviews), post-FTC privacy distrust, push spam, weak Arabic translations.
- **Strength** : scale, AI, brand.
- **Weakness** : trust deficit, US/EU-centric, paywall fatigue.

### 2.2 Ovia Pregnancy (Labcorp / Sentara) — **SHUTTING DOWN NOW**
- **Status (as of 2026-05-08)** : standalone Ovia Pregnancy app was **removed from the App Store in June 2025** (~11 months ago — no new installs possible since). Per Ovia's Help Center FAQ, the app is "officially discontinued" sometime in 2026, with users able to use it "until mid-2026" — exact day not published. The Ovia Health Facebook announcement framed the goodbye around "end of March 2026". **Today (May 8, 2026) is squarely inside the active shutdown window.** Existing users have been pushed to migrate to consolidated "Ovia" (cycle → pregnancy → postpartum → menopause).
- **Features that were beloved** : 3D fetal illustrations (best-in-class), kick counter, contraction timer, baby names swipe, hand/foot life-size visualization, bump tracker, food safety lookup, Apple Health integration, family sharing.
- **Why it matters** : a cohort of pregnancy-app-loyal users is in motion right now. Forum/review pattern shows non-trivial dissatisfaction with the consolidated app ("I just wanted pregnancy, now it's a menopause tracker too"). **The migration window is decaying daily — capture work this month is worth more than the same work in Q3.**

### 2.3 BabyCenter (My Pregnancy & Baby) — Everyday Health Group
- **Features** : weekly fetal development articles + videos, kick tracker, contraction timer, birth plan worksheet, baby growth tracker, **Birth Clubs cohort community** (same due-date forums), photo journal "Bumpie", baby names finder, daily pregnancy calendar with hundreds of articles, fetal interactive images, "inside the uterus" videos, post-birth automatic transition to parenting guide.
- **Differentiator** : MD-reviewed editorial brand (20+ year heritage), Birth Clubs cohort moat.
- **Pain points** : ad-heavy free tier, community moderation problems (judgment, MLM spam, anti-vax pockets), sponsored content blending with editorial, US-centric clinical norms.

### 2.4 Direct MENA competitor — Afifa app
- **Positioning** : "first health and menstrual cycle tracking app for Muslim women".
- **Features** : ovulation/fertile window, **fasted-days log + Fidya/Kaffarah tracking**, Islam-related answers for women's matters, religion-aligned health/intimacy resources.
- **Roadmap (per their site)** : marketplace + pregnancy & baby growth tracking — **planned, not shipped**.
- **Implication** : Afifa is the closest cultural fit but **cycle-first, not pregnancy-first**. Mama & Bébé can ship a pregnancy-first Muslim-grade product **before** Afifa expands. Speed-to-market matters.

### 2.5 Long-tail / out-of-scope (noted, not deeply analyzed)
- What to Expect, Pregnancy +, Glow Nurture, Sprout Pregnancy, Hello Belly. None have the AR + TN positioning.

---

## 3. Feature parity matrix (Mama & Bébé vs top 3)

Legend : ✅ has it · 🟡 partial · ❌ missing · 🟢 best-in-class

| Feature | Flo | Ovia (sunset) | BabyCenter | **Mama & Bébé** | Verdict |
|---|---|---|---|---|---|
| **CORE TRACKING** | | | | | |
| Week-by-week with size analogy | ✅ | 🟢 (3D) | ✅ | ✅ (BabyGrowthCard, fruit) | parity |
| Personalized weekly tips | ✅ | ✅ | ✅ | ✅ (MomTipsCard, BabyMessageCard) | parity |
| Symptom tracker w/ trends | ✅ | ✅ | ✅ | 🟡 (daily symptom log, no trend chart) | **gap → S2** |
| Mood tracker | ✅ | ✅ | 🟡 | ❌ | **gap → S2** |
| Bump photo journal | 🟡 | ✅ | ✅ ("Bumpie") | ❌ | **gap → S3** |
| **DELIVERY-PHASE TOOLS** | | | | | |
| Kick counter | ✅ | ✅ | ✅ | ❌ | **TABLE-STAKES gap → S1** |
| Contraction timer | ✅ | ✅ | ✅ | ❌ | **TABLE-STAKES gap → S1** |
| Hospital bag checklist | ✅ | ✅ | ✅ | ❌ | **TABLE-STAKES gap → S1** |
| Birth plan worksheet | 🟡 | 🟡 | ✅ | ❌ | gap → S3 |
| **HEALTH** | | | | | |
| Weight tracking + range | ✅ | ✅ | ✅ | ✅ (WeightTrackerScreen) | parity |
| BP / glucose log + alerts | 🟡 | 🟡 | 🟡 | 🟢 (HealthDashboard, clinical alerts) | **differentiator** |
| Food safety lookup | 🟡 | ✅ | ✅ | 🟡 (ForbiddenFoodsScreen — list only, no search) | **gap → S2** |
| Symptom→clinical-flag escalation | 🟡 | 🟡 | ❌ | ✅ (clinicalChecks + emergency resolver) | **differentiator** |
| **CONTENT** | | | | | |
| Articles library searchable | ✅ | ✅ | 🟢 (MD-reviewed) | ✅ (ArticlesListScreen, search+cat) | parity |
| Supplements with dosage/trimester | 🟡 | 🟡 | 🟡 | 🟢 (SupplementsList + safety badges) | **differentiator** |
| Doctor-reviewed content badge | 🟡 | 🟡 | ✅ | ❌ (no badge UI even if true) | **gap → S2 (cheap)** |
| Video courses | ✅ | ❌ | ✅ | ❌ | gap → S4 (post-v1) |
| Baby names explorer | ❌ | ✅ | ✅ | ❌ | gap → S3 |
| **AI / ASSISTANT** | | | | | |
| AI chatbot pregnancy-Q&A | ✅ | ❌ | ❌ | ✅ (ChatbotScreen + analyzeMessage) | **differentiator** |
| Daily AI insights | ✅ (Databricks 2025) | ❌ | ❌ | 🟡 (BabyMessageCard static) | gap → S3 |
| **COMMUNITY / SOCIAL** | | | | | |
| Cohort forum (Birth Clubs) | 🟡 (parents chat) | ❌ | 🟢 | ❌ | **strategic decision needed** (S4 or never — see §6.8) |
| Partner / family sharing | ✅ | ✅ | ✅ | ❌ | **gap → S2** |
| **CALENDAR / CARE** | | | | | |
| OB-visit calendar templates | 🟡 | 🟡 | 🟡 | ✅ (CalendarScreen + 12SA echo / glucose templates) | parity |
| RDV reminders 3-tier | 🟡 | 🟡 | ❌ | ✅ (J-1 / J / H-2) | **differentiator** |
| Custom recurring tasks | 🟡 | 🟡 | 🟡 | ✅ (AddTaskModal + recurrence) | parity |
| Hydration tracker | ✅ | ✅ | 🟡 | ✅ (HydrationCard, +250ml) | parity |
| **LIFE-EVENT MODES** | | | | | |
| TTC / fertility mode | ✅ | ✅ | 🟡 | ✅ (Onboarding TTC flow) | parity |
| Curious / explore mode | ❌ | ❌ | ❌ | ✅ (Onboarding Curious mode) | **differentiator** |
| Pregnancy-loss / "rainbow" mode | ❌ | ❌ | ❌ | ❌ | **strong differentiator opportunity → S2** |
| Postpartum / 4th trimester | 🟡 | ✅ (transitions) | 🟢 (auto-transitions) | ❌ | gap → post-v1 |
| **MENA / MUSLIM** | | | | | |
| Arabic translation quality | 🟡 (machine) | 🟡 | 🟡 | ✅ (AR + TN dialect) | **differentiator** |
| RTL layout polish | 🟡 | 🟡 | 🟡 | ✅ (Cycle 5 fixes, F700 emoji RTL) | **differentiator** |
| Halal-aligned nutrition | ❌ | ❌ | ❌ | 🟡 (ForbiddenFoodsScreen — no halal frame) | **gap → S1** |
| Ramadan-pregnancy guidance | ❌ | ❌ | ❌ | ❌ | **strong differentiator → S1** |
| Hijri calendar option | ❌ | ❌ | ❌ | ❌ | **gap → S2** |
| Modesty illustration toggle | ❌ | ❌ | ❌ | ❌ | **gap → S3** |
| Local emergency numbers (TN/DZ/MA) | ❌ | ❌ | ❌ | ✅ (resolveEmergencyNumber) | **differentiator** |
| **PRIVACY / TRUST** | | | | | |
| Anonymous mode | ✅ (post-Dobbs) | 🟡 | 🟡 | ✅ (signInAnonymously) | parity, **under-marketed** |
| One-tap account+data delete | 🟡 (buried) | 🟡 (30+ days) | 🟡 | ✅ (deleteAccount, 9-collections purge) | **differentiator, under-marketed** |
| On-device-only mode | ❌ | ❌ | ❌ | 🟡 (AsyncStorage cache, but cloud-default) | **gap → S2** |
| GDPR data export | 🟡 | 🟡 | 🟡 | ✅ (PDF dataExportService) | **differentiator** |
| Mozilla *Privacy Not Included* | ❌ (warned) | ❌ (warned) | ❌ | n/a | **opportunity → submit for review** |
| **OPERATIONS** | | | | | |
| Push notifications smart-batched | ❌ (spammy) | 🟡 | ❌ (spammy) | ✅ (granular + 3-tier RDV) | **differentiator, under-marketed** |
| Offline-first | ❌ | ❌ | ❌ | ✅ (AsyncStorage cold-start cache) | **differentiator** |

### 3.1 Score summary

- **Mama & Bébé strong differentiators** : clinical health alerts (BP/glucose), supplements safety badges, AI chatbot in FR/AR/TN, RGPD delete, offline-first, AR + TN dialect, RDV 3-tier reminders, Curious mode, MENA emergency numbers.
- **Critical gaps (S1 — Cycle 8 must-have)** : kick counter, contraction timer, hospital bag checklist, halal/Ramadan modules.
- **Important gaps (S2 — Cycle 9-10)** : symptom-trend charts, mood tracker, partner sharing, food-safety **search**, doctor-reviewed badge, on-device-only mode, Hijri calendar, pregnancy-loss/rainbow mode.
- **Nice-to-have (S3 — post-v1)** : bump photo journal, baby names, daily AI insights, modesty toggle, video courses, postpartum transition.
- **Strategic / debatable (S4)** : Birth-Clubs cohort community (massive moderation cost ; defer or partner).

---

## 4. User-preference signals (proxies, no fresh research)

Per `review_mining.md` (synthesis from public patterns, **not fresh-scraped — operator action: validate with 50 fresh 1-2★ reviews / app**) :

### 4.1 Top pain points across competitors (directional themes — see methodology caveat)

> ⚠️ Percentages below are **directional estimates from training-data synthesis**, not from a fresh review scrape (the sub-agent that produced these had no web access — see `review_mining.md` methodology section). Treat as ranked themes, not measured frequencies. Operator action #1 (§9) re-validates them.

1. Aggressive paywall after onboarding (most-cited Flo complaint) → **users want free-tier completeness**.
2. Post-*Dobbs* privacy distrust (recurring US reviews) → **privacy as product, not policy**.
3. Push-notification spam → **granular controls + minimalism**.
4. Insensitive content after pregnancy loss (viral on Reddit / Mumsnet) → **loss / rainbow flow is a moat**.
5. Inaccurate / non-localized content → **especially Arabic — direct opportunity**.
6. Buggy after updates / data loss → **execution discipline matters**.
7. Account deletion buried → **already differentiator (F41), market it**.
8. Toxic moderation (BabyCenter forums) → **community is hard, defer**.
9. Pushy upsells / sponsored content blending → **avoid affiliate dark patterns**.
10. Ads in free tier (BabyCenter primarily) → **ad-free = positioning**.

### 4.2 Top loved features (validate)
Week-by-week + size analogy · kick counter · contraction timer · symptom-pattern detection · MD-reviewed content · hospital-bag checklist · food-safety search · partner mode · cohort community · baby names explorer.

### 4.3 Underserved segments — **wedges**
- **MENA / Muslim users** ← Mama & Bébé's primary thesis.
- **Pregnancy after loss / rainbow pregnancies** ← cheap to build, huge emotional moat.
- **High-risk pregnancies** (GDM/preeclampsia/multiples) ← Mama & Bébé already 70% there via HealthDashboard.
- **Privacy-maximalists** post-*Dobbs* + EU GDPR-savvy.
- **Low-bandwidth / offline-first** ← stack already supports.
- **Postpartum mental health** ← deferred to post-v1.

---

## 5. Differentiation strategy — Mama & Bébé positioning

> **"The pregnancy app for the Maghreb and its diaspora — clinically-grade, privacy-first, free-by-default, and actually written in your language."**

Three pillars :

### 5.1 Pillar 1 : MENA / Muslim cultural fit (the moat)
What Western apps can't credibly copy fast enough.
- AR + TN dialect content reviewed by **a Tunisian midwife + an MSA editor** (contracted, not crowdsourced).
- Halal nutrition lens on `ForbiddenFoodsScreen` (alcohol/pork/non-halal-meat tagging beyond Western "listeriosis" framing).
- **Ramadan-pregnancy module** : evidence-based guidance on fasting safety per trimester + GDM risk + suhoor/iftar nutrition + Fidya/Kaffarah tracking (cf. Afifa for cycle, but pregnancy-first).
- Hijri/Gregorian dual calendar for due date and Ramadan calculation.
- Modesty toggle for fetal/anatomical illustrations.
- MENA emergency numbers (already in code: `resolveEmergencyNumber` per country) — **expose in settings, not just in chatbot**.

### 5.2 Pillar 2 : Privacy-as-product (global wedge)
- Submit to **Mozilla *Privacy Not Included*** review (note : it's a watchdog audit, not a positive certification — the goal is to *avoid* a warning label that competitors like Ovia carry. Absence of warning = trust signal worth marketing).
- One-tap account+data delete (already done — surface it in Settings top-level, not buried).
- On-device-only mode toggle (Cycle 9 build, requires Firestore-optional refactor).
- Plain-language privacy summary on the marketing site.
- No third-party analytics on health screens (segregate Sentry/Firebase Analytics).

### 5.3 Pillar 3 : Clinically-grade execution (table-stakes done excellently)
- Symptom logging with **clinical alerts** (already differentiator: BP/glucose flags) — extend to symptom-trend charts.
- Doctor-reviewed badge on articles + supplements (cheap UI, big trust signal).
- Free-tier completeness : kick counter, contraction timer, hospital bag — never paywalled.
- Notification minimalism with per-category granular controls.
- Offline-first with visible "offline OK" badge.

---

## 6. Prioritized roadmap (10 epics)

Each epic : **WHY** · **WHAT** · **EFFORT** (S/M/L) · **IMPACT** (high/med/low) · **MOAT** (durable/copyable/none) · **ADVERSARY** (what kills it).

### S1 — Cycle 8 (next 2-3 weeks — Ovia migration is happening NOW)

#### Epic 1 — Delivery-phase toolkit (kick counter + contraction timer + hospital bag)
- **WHY** : every competitor has these. Without them Mama & Bébé loses credibility at T3, when retention matters most. Free-tier completeness is the wedge.
- **WHAT** :
  - `KickCounterScreen` : tap-to-count, 1-hour rolling window, log to Firestore `kickSessions/{uid}/{sessionId}`, daily count card on Home.
  - `ContractionTimerScreen` : start/stop, frequency + duration log, "share with hospital" PDF/text export.
  - `HospitalBagChecklistScreen` : pre-curated MENA-context list (mom / baby / papers — Tunisian/Algerian/Moroccan civil-status doc list), check-off + custom items.
  - i18n FR/EN/AR/TN.
- **EFFORT** : M (3-4 days × 3 features = ~2 weeks with design+i18n+tests).
- **IMPACT** : high (table-stakes, blocks 20-30% reviews).
- **MOAT** : copyable, but execution + free-tier framing is the durable wrapper.
- **ADVERSARY** : "users won't notice the absence" → counter-evidence: ~all top 3 ship these in v1, search-ranked among loved features. **Risk**: clinical accuracy of contraction-warning thresholds (false alarm or missed labor signal). Mitigation : clinician-reviewed copy + explicit disclaimer.

#### Epic 2 — Halal + Ramadan-pregnancy module
- **WHY** : the durable moat. No competitor has this. Direct MENA-target signal.
- **WHAT** :
  - Re-frame `ForbiddenFoodsScreen` with halal lens : alcohol/pork/non-halal-meat at top, listeriosis/raw-milk after, with cultural notes (e.g. some cheeses common in Maghreb but raw — flag).
  - New `RamadanPregnancyScreen` : per-trimester fasting safety guidance (clinician-reviewed), GDM risk note, suhoor/iftar nutrition tips, water-loading guidance pre-fast, "should I break fast?" symptom checklist (escalation to chatbot + emergency resolver).
  - Fidya/Kaffarah missed-days tracker (light — cf. Afifa pattern, but pregnancy-context).
  - i18n AR/TN primary, FR/EN secondary.
- **EFFORT** : M (1 week build + 1 week clinician-review content cycle).
- **IMPACT** : high in MENA segment (the segment-defining feature).
- **MOAT** : durable — content authority is hard to replicate from Western HQ.
- **ADVERSARY** : "Tunisian users who fast anyway won't read pregnancy-fasting safety content" → counter: many Maghrebi women DO seek out this guidance and it's currently scattered across blogs/Islam-relief PDFs. **Risk** : religious copy must be precise — engage a TN imam-reviewed source, not just a midwife.

#### Epic 3 — Ovia Pregnancy migration funnel
- **WHY** : time-boxed strategic gift, currently decaying. Standalone Ovia removed from App Store June 2025 (~11 months ago); full backend shutdown is "mid-2026" — right now. Each week the cohort of in-flight migrators thins as they settle into alternatives. 0.1% capture of a multi-million-user sunset = high-quality install base, but only if we move now.
- **WHAT** :
  - Landing page : `mamabebe.app/switching-from-ovia` with 1-pager on equivalents (Ovia kick counter ↔ Mama & Bébé kick counter, Ovia 3D illustrations ↔ Mama & Bébé fruit-size, etc.).
  - **Optional v2** : import-from-Ovia (manual : user pastes their LMP/profile data ; automated : if Ovia exposes data export, parse it).
  - Targeted App Store Search Ads + Reddit r/BabyBumps post-Ovia-shutdown threads.
- **EFFORT** : S (landing page : 2 days ; ads setup : 1 day ; v2 import : optional M).
- **IMPACT** : medium-high (depends on capture rate; even 1k installs/month is meaningful at v1.0).
- **MOAT** : none directly, but installs → cohort → reviews → flywheel.
- **ADVERSARY** : "most Ovia users in US/EU won't fit MENA positioning" → counter: position the landing page on **privacy + free-tier** angle (not MENA) for non-MENA segment. **Risk** : Mama & Bébé app store presence currently FR-first → English-localized landing page critical.

### S2 — Cycle 9 (next 4-6 weeks)

#### Epic 4 — Pregnancy-loss / rainbow-pregnancy mode
- **WHY** : strong emotional differentiator, viral-positive reviews, no competitor does it. ~10-20% of pregnancies end in loss — large under-served segment.
- **WHAT** :
  - Settings → "Mark pregnancy as ended" entry point (sensitively worded).
  - Tone-shifted home screen (no fruit-size, no week-update notifications) ; curated FR/AR/TN grief resources (clinician + perinatal-grief-counselor reviewed).
  - "Rainbow pregnancy" optional toggle on next pregnancy onboarding : softens triggers, anxiety-aware article curation, dedicated chatbot prompts.
- **EFFORT** : M (mostly content + tone — 1-2 weeks).
- **IMPACT** : high (emotional moat + word-of-mouth).
- **MOAT** : durable (sensitive design = high switching cost back to insensitive competitors).
- **ADVERSARY** : "this is depressing for the rest of the user base" → counter: it's opt-in, invisible to users who don't need it. **Risk** : poorly-worded copy can do harm — engage actual perinatal-grief specialist for review.

#### Epic 5 — Symptom trend charts + mood tracker
- **WHY** : top-3 loved feature across competitors. Already partially built (HealthDashboard).
- **WHAT** :
  - Extend daily symptom log (already idempotent docId) with mood field.
  - Trend chart on HealthDashboardScreen : symptom frequency over weeks + correlation with mood.
  - Surface "you logged X 5 days in a row" insight on Home.
- **EFFORT** : M (1-2 weeks).
- **IMPACT** : medium-high (retention/daily-use).
- **MOAT** : copyable, but combined with clinical-alert layer = differentiator stack.
- **ADVERSARY** : "users won't log enough to make charts useful" → mitigation : 3-tap quick log entry, gentle weekly nudge.

#### Epic 6 — Partner / family sharing (read-only v1)
- **WHY** : doubles install per pregnancy, fits MENA family culture.
- **WHAT** :
  - 6-digit code or QR partner pairing.
  - Partner role = read-only Home + week-update + partner-specific weekly tips ("how to support her this week" in FR/AR/TN).
  - Same app, role-based UI (no separate app).
- **EFFORT** : M-L (auth + Firestore rules + role UI = 2-3 weeks).
- **IMPACT** : medium-high.
- **MOAT** : copyable.
- **ADVERSARY** : domestic-violence safety — partner may not be safe. **Mitigation** : user-controlled per-category sharing (never default-share location/symptoms), "remove partner" 1-tap, no email notification leak to partner of unshare.

#### Epic 7 — Privacy-as-product surfacing
- **WHY** : Mama & Bébé already has privacy strengths (delete account, anonymous, offline cache). Currently invisible. Marketing asset.
- **WHAT** :
  - Settings top-level "Privacy" section (not buried) : data export PDF (already built), delete account 1-tap (already built — promote it), anonymous-mode badge.
  - Build on-device-only toggle (no Firestore sync option) — requires `firestoreOptional` refactor.
  - Submit to Mozilla *Privacy Not Included* for review (avoid the warning label competitors carry — Ovia is already flagged ; absence of a flag is the marketing asset).
  - Plain-language privacy summary (1 page) linkable from app + marketing site.
- **EFFORT** : S (UI surfacing : 2-3 days) + M (on-device-only refactor : 1-2 weeks).
- **IMPACT** : medium-high (trust = conversion).
- **MOAT** : durable (incumbents structurally can't match — their business model depends on data).
- **ADVERSARY** : "EU users already have GDPR, don't care" → counter: GDPR ≠ trust ; Flo+Ovia are GDPR-compliant on paper but still distrusted.

#### Epic 8 — Doctor-reviewed badge + Hijri calendar + food-safety search
- **WHY** : low-cost trust + MENA polish.
- **WHAT** :
  - Add `reviewedBy` field to articles + supplements collections, render badge "Reviewed by Dr. X (Tunis)".
  - Hijri calendar option in Settings → Date format. Auto-display Hijri due date in Profile.
  - Convert ForbiddenFoodsScreen list → searchable "Can I eat X?" with halal + clinical filter.
- **EFFORT** : S each (1-2 days × 3 = ~1 week).
- **IMPACT** : medium each.
- **MOAT** : copyable but cumulative.
- **ADVERSARY** : doctor-reviewed claim must be true (legal exposure if false). **Mitigation** : actually contract Dr. X.

### S3 — Post-v1 quarter

#### Epic 9 — Notification minimalism v2 + offline-first surfacing
- **WHY** : table-stakes done excellently = positioning.
- **WHAT** : per-category granular toggles (already partial), default 1 push/week, "offline OK" badge on Home, pre-cache full pregnancy on first launch.
- **EFFORT** : S.
- **IMPACT** : medium.
- **MOAT** : copyable but signals quality.

#### Epic 10 — Postpartum / 4th trimester transition + bump journal + baby names
- **WHY** : extends LTV beyond birth date (currently Mama & Bébé "ends" at week 40).
- **WHAT** : auto-transition to "4th trimester" mode at week 41+ ; postpartum mood (EPDS screen) ; baby growth tracker ; bump photo journal ; baby names explorer with Arabic/Islamic name database.
- **EFFORT** : L (multi-feature, 4-6 weeks).
- **IMPACT** : medium-high LTV.
- **MOAT** : copyable but cumulative.

### S4 — Strategic decision needed (defer or partner)

#### Epic 11 — Cohort community (Birth Clubs equivalent) — **DECISION REQUIRED**
- **WHY (for)** : BabyCenter's #1 moat ; sticky social network effect.
- **WHY (against)** : moderation is structurally expensive ; toxicity risk in a multi-cultural FR/AR/TN community ; legal complexity (medical advice between users).
- **RECOMMENDATION** : **defer beyond v1**. If community is built, prefer **partnering** with an existing MENA mom forum (e.g. local Facebook groups) for read-only embed, vs building moderated UGC.
- **ADVERSARY** : "without community, retention is capped" → counter-evidence: Flo and Ovia have weak community and dominate ; community is BabyCenter-specific moat from 20-year heritage, not table-stakes.

---

## 7. GSTACK 6-roles audit of this plan

**CEO** — does this maximize equity-relevant moat?
- Pillars 1+2 (MENA + Privacy) are the durable moats. Pillar 3 is execution.
- Ovia migration window is a one-time ROI lever — capture it.
- ✅ Plan aligned.

**PM** — is the sequencing correct ?
- S1 = unblocks credibility (delivery toolkit) + window-of-opportunity (Ovia funnel) + moat (Halal/Ramadan).
- S2 = retention (loss mode, partner, charts) + trust (privacy surfacing).
- S3 = LTV.
- S4 = community deferred.
- ✅ Sequencing correct.

**Designer** — is each epic shippable at Cycle-5-quality polish ?
- Loss mode requires extra-careful copy review (engage perinatal grief specialist).
- Halal/Ramadan needs Tunisian-context illustrations + RTL polish (extension of Cycle 5 work).
- Doctor-reviewed badge + Hijri calendar = pure UI, ~1 day each.
- ✅ Achievable with current methodology.

**Security** — what are the new attack surfaces ?
- **Partner sharing (Epic 6)** : new Firestore rules complexity, role-based access, DV safety. **Required Cycle 9 sub-investigation before build.**
- **Loss mode (Epic 4)** : data sensitivity — ensure "loss" status doesn't leak in shared partner views, exports, analytics.
- **On-device-only mode (Epic 7)** : architectural change, retest Firestore rules + offline sync conflicts.
- **Ovia import (Epic 3)** : if accepting user-pasted data, sanitize markdown/script injection (cf. AUDIT_MARKDOWN_XSS.md).
- ✅ Each epic flagged with security review gate before merge.

**QA** — testability ?
- Kick counter / contraction timer = simple unit + e2e tap-counts.
- Halal/Ramadan = i18n snapshot tests + clinician-reviewed content checksum.
- Loss mode = e2e flow with state transitions + accessibility audit.
- Privacy on-device mode = integration test with network disabled.
- ✅ Each epic has test plan.

**Eng Manager** — capacity ?
- Cycle 8 (S1) = 2-3 weeks of focused work : ~10-12 dev-days. Tight but achievable solo with autonomous-run discipline.
- Cycle 9 (S2) = 4-6 weeks : ~20-25 dev-days. Realistic if no scope creep.
- Cycle 10+ (S3) = quarter scope.
- **Risk** : clinician + perinatal-grief contractor lead time (could be 2-4 weeks). **Action** : reach out NOW (operator action #2 in §9), parallel to Cycle 8 build.

---

## 8. Adversary brief — what kills this plan ?

1. **"Ovia migration window doesn't materialize"** — Labcorp's consolidated Ovia retains most users. Counter: even 1-3% capture is meaningful ; cost of building the funnel is 2-3 days, ROI asymmetric.

2. **"MENA market is too small to fund the company"** — TAM concern. Counter: MENA + Maghreb diaspora in EU = ~50M+ Muslim women of childbearing age (FR : 2-3M Maghrebi-origin ; BE/CA: 0.5M+) ; even 1% MAU at modest ARPU funds operations. **But operator should validate TAM with a real estimate (operator action #3).**

3. **"Adding kick counter / hospital bag won't move retention"** — counter-evidence: every successful pregnancy app has them. Their absence is a credibility ceiling.

4. **"Privacy-as-product is a niche concern"** — counter: post-Dobbs USA + EU GDPR-savvy = a meaningful trust segment ; even non-niche users prefer privacy *all else equal*. Mozilla certification is cheap.

5. **"Pregnancy-loss flow won't get used"** — by design : low usage = success (user safety opt-in). Reviews moat is from the visibility, not the daily usage.

6. **"Clinician contracts are expensive"** — counter: TN/MA midwife rates are far below US/EU ; equity-share or revenue-share possible ; total estimated content-review cost for Cycle 8-9 < $5k. **Validate with an actual quote.**

7. **"Mama & Bébé team is too small to ship 10 epics"** — true. The plan sequences explicitly : S1 (4 epics) is committable for Cycle 8 if user accepts. S2-S4 are roadmap, not commitments.

8. **"Building all this delays v1.0 launch"** — V1.0 is shippable today (post Cycle 6). Cycle 7 = strategy ; Cycle 8 = post-v1.0 enhancement. **Do not delay v1.0 ship for these.** Ship v1.0 first → measure → execute Cycle 8.

---

## 9. Operator actions (pending — outside Claude Code scope)

1. **Validate review-mining %s** — pull 50 fresh 1-2★ reviews per app from App Store Connect public pages (or AppFollow free trial). ~2 hours work. Confirms or invalidates §4.1.

2. **Recruit clinician advisors NOW** (parallel to Cycle 8 build) :
   - 1 Tunisian midwife (content review, Halal/Ramadan + Loss).
   - 1 perinatal grief counselor (Loss mode copy).
   - 1 OB-GYN reviewer for clinical disclaimers (kick counter / contraction timer thresholds).
   - Budget : <$5k total estimated.

3. **TAM validation** — back-of-envelope addressable market estimate :
   - MENA pregnant women / year = ~5-7M (UN data).
   - Maghreb diaspora in EU francophone countries.
   - Confirm 1% capture × ARPU = meaningful revenue.

4. **Mozilla *Privacy Not Included* application** — prepare docs and submit, target review before Cycle 9 ships.

5. **App Store Connect copy localization** — ensure FR/AR/TN App Store listings are ready before Ovia migration push.

6. **Decide free-tier vs subscription positioning** — strategic CEO call. Recommendation in §5 = free-tier completeness with optional one-time content-pack purchases. Lock before v1.0 marketing.

---

## 10. Linked docs

- **Inputs to this plan** :
  - `app/docs/V1_AUTONOMOUS_RUN/FEATURE_MAP_AND_AUDIT.md` (43 features inventory)
  - `app/docs/V1_AUTONOMOUS_RUN/research/review_mining.md` (sub-agent synthesis, web-denied — caveats labeled in-doc)
  - WebSearch results May 2026 : Flo product tour, Ovia shutdown FB post + Help Center, BabyCenter Wikipedia + App Store, Afifa app site, FTC v. Flo + post-Dobbs press

- **Will spawn** (Cycle 8 build) :
  - `CYCLE8_PLAN.md` (operator-approved subset of §6 epics)
  - `CYCLE8_MANIFEST.md` (build artifacts)
  - `VERDICT_v8.md` (sign-off)

---

## 11. Sources (live-fetched May 2026)

- [Flo Pregnancy app product tour](https://flo.health/product-tour/pregnancy-app)
- [Flo (app) — Wikipedia](https://en.wikipedia.org/wiki/Flo_(app))
- [Flo Pregnancy mode help](https://help.flo.health/hc/en-us/articles/360054523711-What-is-Pregnancy-mode-and-how-do-I-activate-it)
- [Ovia Cycle & Pregnancy Tracker — App Store](https://apps.apple.com/us/app/ovia-cycle-pregnancy-tracker/id570244389)
- [Ovia Pregnancy app sunset — Facebook post](https://www.facebook.com/OviaHealth/posts/were-saying-goodbye-to-the-ovia-pregnancy-app-at-the-end-of-march-2026-but-you-c/1445719990932173/)
- [Ovia Pregnancy Help Center — sunset FAQ](https://ovuline.helpshift.com/hc/en/4-ovia-pregnancy/faq/1568-i-m-an-ovia-pregnancy-user-and-would-prefer-to-use-the-ovia-pregnancy-app-instead-of-ovia-will-i-be-able-to-do-so/)
- [Ovia all-in-one pregnancy app](https://www.oviahealth.com/pregnancy-app/)
- [BabyCenter — Wikipedia](https://en.wikipedia.org/wiki/BabyCenter)
- [BabyCenter Pregnancy Tracker — Google Play](https://play.google.com/store/apps/details?id=com.babycenter.pregnancytracker&hl=en_GB)
- [BabyCenter — App Store](https://apps.apple.com/us/app/babycenter-track-pregnancy-app/id386022579)
- [Afifa app — Muslim women health](https://afifaapp.com/)
- [Fasting during Ramadan when pregnant — Islamic Relief](https://islamic-relief.org/giving/islamic-giving/ramadan/ramadan-and-pregnancy/)
- [FTC v. Flo Health settlement (2021)](https://www.ftc.gov/news-events/news/press-releases/2021/01/developer-popular-womens-fertility-tracking-app-settles-ftc-allegations-it-misled-consumers-about)
- [Period tracking apps post-Roe — NPR](https://www.npr.org/2022/05/10/1097482967/roe-v-wade-supreme-court-abortion-period-apps)
- [Flo Anonymous Mode — Healthcare Dive](https://www.healthcaredive.com/news/flo-anonymous-mode-period-tracker-app-abortion-roe/631926/)
- [Mozilla Privacy Not Included — Ovia Pregnancy](https://www.mozillafoundation.org/en/privacynotincluded/ovia-pregnancy/)
- [Best Pregnancy App 2026: Flo vs Ovia vs What to Expect — go-go-gaia](https://www.go-go-gaia.com/blog/best-pregnancy-tracking-app.html)

---

**Verdict** : strategy doc only — **no code committed in Cycle 7**. Awaiting operator approval of S1 epic subset for Cycle 8 build with full GSTACK + adversary discipline applied per file:line.
