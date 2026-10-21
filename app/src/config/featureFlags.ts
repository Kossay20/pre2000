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

/**
 * Halal lens on the "foods to avoid" screen (shown for ar / tn only).
 *
 * Same exposure as the Ramadan screen, and it was easy to miss because it is a
 * card inside an otherwise-reviewed screen rather than a screen of its own: it
 * renders `cycle8.forbiddenFoodsHalal.draftNote` — "Content pending review by an
 * imam and a registered dietitian" — in all four languages, to exactly the
 * audience most likely to act on it.
 *
 * Gating one self-declared-unreviewed surface and shipping another would make the
 * decision arbitrary rather than principled, so this follows
 * [[RAMADAN_GUIDANCE_CLINICALLY_REVIEWED]]. Flip it in the commit that records the
 * imam + dietitian sign-off, and drop the draft note with it.
 *
 * Kept separate from the Ramadan flag on purpose: the reviewers are not the same
 * people, so the two approvals will not necessarily arrive together.
 */
export const HALAL_GUIDANCE_REVIEWED = false;
