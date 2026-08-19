/**
 * Flags that gate surfaces which are code-complete but not yet cleared to ship.
 *
 * These are deliberately plain constants, not remote config: a store reviewer
 * must see the same app every time, and a surface that can be switched on after
 * review is exactly what both stores forbid.
 */

/**
 * Ramadan & pregnancy guidance.
 *
 * The screen renders a banner reading "Content pending clinical review. Validate
 * with your doctor and an imam." — translated into all four languages
 * (`cycle8.ramadan.draftBanner`). It ships as-is today and is reachable from the
 * Home tools grid, so an App Store reviewer sees content the app itself labels as
 * unvalidated. That is App Review guideline 2.1 (App Completeness) territory, and
 * the subject — fasting during pregnancy — is not one to be casual about.
 *
 * The screen is not deleted: the tracking logic, the fidya counter and the four
 * translations are finished work. It is switched off until a midwife/OB and a
 * qualified religious reviewer sign the content off. Flip this to `true` in the
 * same commit that records the sign-off, and drop the draft banner with it.
 *
 * Gating the flag alone is not enough — the screen also had a deep link at
 * `/ramadan`, so both the Home entry point AND the route registration are behind
 * this constant. Same lesson as DiagnosticScreen, which was menu-gated but stayed
 * URL-reachable in production builds.
 */
export const RAMADAN_GUIDANCE_CLINICALLY_REVIEWED = false;
