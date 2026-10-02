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

// A URL keeps its origin and path (which endpoint was slow); the query string and fragment
// can carry ids, tokens or an e-mail, so they go.
const stripUrlQuery = (value: unknown): unknown =>
    typeof value === 'string' ? value.replace(/[?#].*$/s, '') : value;

/**
 * Sentry `beforeSendTransaction` scrubber. Transactions are sampled (tracesSampleRate) and
 * carry what beforeSend never sees: span `data` (http.client URLs, query strings, request
 * attributes), span descriptions that are URLs, and the trace context's own data. Timings,
 * ops and statuses are what a performance trace is for and are kept.
 */
export const scrubSentryTransaction = <T>(input: T): T => {
    const event = scrubSentryEvent(input) as any;
    if (typeof event.transaction === 'string') event.transaction = stripUrlQuery(event.transaction);
    if (event.contexts?.trace) {
        delete event.contexts.trace.data;
        event.contexts.trace.description = stripUrlQuery(event.contexts.trace.description);
    }
    if (Array.isArray(event.spans)) {
        event.spans = event.spans.map((span: Record<string, unknown>) => {
            const { data: _data, ...rest } = span;
            return { ...rest, description: stripUrlQuery(rest.description) };
        });
    }
    return input;
};

/**
 * Sentry `beforeBreadcrumb` scrubber, for breadcrumbs as they are recorded (they ride on
 * every later error event and transaction). Console breadcrumbs are dropped: logger output
 * can hold whatever the caller had in hand. The others keep their type, category, message and
 * time but lose `data` (request URLs, bodies, touch targets' props).
 */
export const scrubSentryBreadcrumb = <T>(input: T): T | null => {
    const crumb = input as any;
    if (crumb?.category === 'console') return null;
    if (crumb && 'data' in crumb) delete crumb.data;
    return input;
};
