/**
 * Whether the toast on screen goes away when she moves to another screen.
 *
 * The toast is one overlay above the whole navigator, so a confirmation shown on one
 * screen used to stay for its full 3 s on whatever came next: "Langue mise à jour" from
 * the language screen sat over the sign-up and onboarding headers. A toast now belongs
 * to the screen it was shown on, and leaving that screen hides it.
 *
 * Some confirmations are shown right before the app itself navigates and are about the
 * screen she lands on ("Rendez-vous enregistré" then back to the calendar, "Compte créé"
 * then back to her form). Those are shown as persistent and survive the navigation; they
 * still hide on their own timer.
 *
 * The focused route KEY is compared, not the name: a param update on the same screen
 * (setParams) is not leaving it, and pushing a second copy of a screen is.
 */
export interface ToastNavigationGate {
    /** A toast was shown. */
    shown(persistent: boolean): void;
    /** The toast was hidden (timer, tap, or this gate). */
    hidden(): void;
    /** The focused route is now `routeKey`. True when the toast on screen must hide. */
    routeFocused(routeKey: string | undefined): boolean;
}

export const createToastNavigationGate = (): ToastNavigationGate => {
    let focusedKey: string | undefined;
    let toast: { persistent: boolean } | null = null;
    return {
        shown: (persistent) => {
            toast = { persistent };
        },
        hidden: () => {
            toast = null;
        },
        routeFocused: (routeKey) => {
            if (routeKey === undefined) return false;
            const left = focusedKey !== undefined && routeKey !== focusedKey;
            focusedKey = routeKey;
            return left && toast !== null && !toast.persistent;
        },
    };
};
