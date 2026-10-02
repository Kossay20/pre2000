# `store/` — everything the two consoles ask for

Generated artefacts for App Store Connect and Google Play Console. The plan they
serve is [`docs/GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md`](../docs/GOAL_STORE_RELEASE_MAMABEBE_2026-08-19.md).

## What is here

| Path | Committed | What it is |
|---|---|---|
| `listing.json` | ✅ | Single source for both listings, 3 locales. Limits enforced by `__tests__/storeListing.test.ts`. |
| `app-privacy.json`, `data-safety.json` | ✅ | Drafts of the App Store Connect App Privacy and Play Data safety answers, derived from the code. The owner must confirm them in the consoles. `__tests__/releaseConfig.test.ts` checks them against the privacy manifest in `app.json`. |
| `icons/play-icon-512.png` | ✅ | Play listing icon, 512×512, 32-bit. |
| `brand/wordmark.png` | ✅ | Trimmed mark + wordmark on transparency, used by the feature graphic. |
| `feature-graphic/*.png` | ✅ | Play feature graphic, 1024×500, one per locale. **Mandatory** — Play will not publish without it. |
| `screenshots/` | ❌ gitignored | 54 PNGs (~100 MB). Reproducible in one command, so they are treated like `audit-screenshots/`. |

The app-side icons this pipeline also produces (`icon.png`, `adaptive-icon*.png`,
`notification-icon.png`, `splash-icon.png`) live in `../assets/`, because the
build reads them from there.

## Regenerating

```bash
nvm use                       # 20.20.2 — Node 18 breaks expo tooling silently

npm run store:icons           # app icons + adaptive layers + notification icon + splash + wordmark
npm run store:feature         # Play feature graphic, 3 locales

npm run store:build           # expo export --platform web  (needed by the screenshots)
npx serve dist -l 8099 --single &
npm run store:shots           # 3 device profiles × 3 locales × 6 screens = 54 PNGs
```

Narrow a re-shoot with the allow-list env vars:

```bash
ONLY_DEVICE=ios-6.9 ONLY_LOCALE=ar ONLY_SCREEN=5-chatbot npm run store:shots
```

## Sizes produced

| Profile | Output | Console slot |
|---|---|---|
| `ios-6.9` | 1290×2796 | iPhone 6.9" — **required** |
| `ipad-13` | 2064×2752 | iPad 13" — **required** while `ios.supportsTablet` is `true` |
| `android-phone` | 1080×1920 | Play phone — 2 to 8 required |

## Two things to know before uploading

**These are RN-Web captures, not native ones.** Same code, same UI, but the
status bar and safe-area chrome come from the framing pass, not from iOS or
Android. That is honest for a marketing frame and it is what the pipeline is
designed around — but once an EAS build exists, re-shoot on a simulator and
compare (task T7.6 in the goal document). Swap them in if the two sets diverge
visibly.

**The Calendar screen is deliberately not in the set.** Guests cannot hold
appointments — `calendarService.loadUserEvents` returns `[]` and `saveUserEvent`
throws for a guest uid, by design, with an in-app account-upgrade path. Every
offline capture of it therefore reads "No appointments this week". Shoot it in W7
against a seeded live backend and add it there rather than advertise an empty
state.
