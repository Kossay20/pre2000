/**
 * Text she typed (name, appointment title, notes) goes into HTML the app builds itself — the
 * journal PDF. Written raw, markup in it runs (on web, in a frame that shares the app origin)
 * or silently vanishes ("<sage-femme>" is read as a tag).
 */
const ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

export const escapeHtml = (value: unknown): string =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
