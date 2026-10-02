/**
 * Sentry `beforeSend` scrubber. The logger forwards every logger.error(...) extra (the
 * `args` / `data` arrays) as event `extra`, and those can carry whatever the caller had in
 * hand: a profile, a Firestore document, an e-mail address. The privacy policy promises
 * crash reports, not health data, so extras, request bodies/cookies and the user's e-mail /
 * IP never leave the device. The error message, stack, tags (context) and the hashed user id
 * are what the report is for and are kept.
 */
export const scrubSentryEvent = <T>(input: T): T => {
    // Typed loosely on purpose: Sentry's event types differ between error, transaction and
    // feedback events, and only the fields below matter.
    const event = input as any;
    delete event.extra;
    if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
    }
    if (event.user) {
        event.user = event.user.id ? { id: event.user.id } : {};
    }
    if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((b: Record<string, unknown>) => {
            const { data: _data, ...rest } = b;
            return rest;
        });
    }
    return input;
};
