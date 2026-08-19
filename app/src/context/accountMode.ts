/**
 * What "guest" means, in one place.
 *
 * `isGuest` used to be derived as `!isAuthenticated`, i.e. "no Firebase user".
 * That held only because Anonymous Auth was switched off: `signInAnonymously`
 * failed, `loginAsGuest` fell back to a local `guest_<timestamp>` uid, and the
 * two ideas — "has no Firebase session" and "has no account" — coincided.
 *
 * The moment Anonymous Auth is enabled in the Firebase console (an operator
 * setting, not a release), they stop coinciding. `signInAnonymously` succeeds, so
 * a woman who tapped "Continue as guest" is recorded with `isGuest: false` and is
 * indistinguishable from someone who registered. Every "create an account" prompt
 * is behind `user.isGuest` — Profile, Calendar, Add appointment, Tasks — so they
 * all disappear at exactly the moment they become useful, and the branch of
 * `upgradeGuest` written to link an anonymous credential in place
 * (`AuthContext.upgradeGuest`, `current.isAnonymous`) becomes unreachable code.
 *
 * So guest is defined by what the user has, not by what the network returned:
 * a guest is anyone without a *permanent* account. An anonymous Firebase session
 * is not one.
 *
 * Note this is deliberately not the same question as "can this uid read and write
 * Firestore" — the services answer that separately via the `guest_` uid prefix.
 * Whether an anonymous guest should get cloud persistence for every feature is a
 * product decision for a later version; conflating the two is what caused this.
 */

/** The shape we need from a Firebase user, so this module stays dependency-free. */
export interface AccountIdentity {
  uid: string;
  isAnonymous?: boolean;
}

/**
 * True only for a real, recoverable account — one with credentials behind it.
 * An anonymous session is not permanent: losing the device loses the data, and
 * there is no email to recover from.
 */
export const hasPermanentAccount = (identity?: AccountIdentity | null): boolean =>
  !!identity && identity.isAnonymous !== true;

/**
 * The value to store as `UserProfile.isGuest`.
 *
 * Guest when there is no Firebase user at all (Anonymous Auth off — the local
 * `guest_` fallback) and equally when the session is anonymous (Anonymous Auth
 * on). Both mean: no account yet, keep offering to create one.
 */
export const deriveIsGuest = (identity?: AccountIdentity | null): boolean =>
  !hasPermanentAccount(identity);
