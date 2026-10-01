/**
 * The one predicate that keeps content on an unreviewed topic out of reach.
 *
 * featureFlags.ts switches off the Ramadan screen and the halal lens until their
 * reviewers sign. That stopped at the screens: article art_003, "Ramadan Fasting:
 * What you need to know", gives fasting and hydration advice and a religious ruling,
 * and it stayed in the article list, the search, the chatbot's article links and the
 * Firestore-backed lists — the same subject the hidden screen covers, reachable from
 * everywhere else. A gate that only one surface honours is not a gate.
 *
 * So every path that hands an article to the user — bundled fallback, Firestore list,
 * single-article fetch, week recommendations, chatbot — filters through this module.
 * The topic is read from what names it (titles in the four languages, slug, category,
 * tags), not from the body: an article on dates that mentions breaking the fast in
 * passing is about dates, and hiding it would gate reviewed content on a technicality.
 *
 * The flags are read at call time, not captured at import, so flipping one in the
 * sign-off commit is the whole change.
 */
import { HALAL_GUIDANCE_REVIEWED, RAMADAN_GUIDANCE_CLINICALLY_REVIEWED } from './featureFlags';

interface GatedTopic {
    name: 'ramadan' | 'halal';
    /** Latin and Arabic script, since the content ships in fr/en and ar/tn. */
    pattern: RegExp;
    cleared: () => boolean;
}

const GATED_TOPICS: readonly GatedTopic[] = [
    {
        name: 'ramadan',
        // "Ramadan", "Ramadhan", "Ramaḍān" (folded below), and the Arabic word.
        pattern: /ramadh?an|رمضان/i,
        cleared: () => RAMADAN_GUIDANCE_CLINICALLY_REVIEWED,
    },
    {
        name: 'halal',
        // No \b: slugs join words with "_", which \b treats as a word character.
        pattern: /halal|حلال/i,
        cleared: () => HALAL_GUIDANCE_REVIEWED,
    },
];

/** Accents off, so "Ramaḍān" reads as "Ramadan". Arabic letters are untouched. */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Topics named in `text` whose reviewers have not signed yet. */
export function unreviewedTopicsIn(text: string): Array<GatedTopic['name']> {
    const folded = fold(text);
    return GATED_TOPICS.filter((topic) => !topic.cleared() && topic.pattern.test(folded)).map(
        (topic) => topic.name,
    );
}

/** The fields that say what an article is about, across both article shapes. */
const TOPIC_FIELDS = [
    'title_fr',
    'title_en',
    'title_ar',
    'title_tn',
    'slug',
    'category',
] as const;

/**
 * True when the item's topic is one whose content has not been signed off.
 * Accepts either article shape (bundled/legacy `Article` or `ArticleAntigravity`).
 */
export function isUnreviewedContent(item: object | null | undefined): boolean {
    if (!item) return false;
    const record = item as Record<string, unknown>;
    const parts: string[] = [];
    for (const field of TOPIC_FIELDS) {
        if (typeof record[field] === 'string') parts.push(record[field] as string);
    }
    const tags = record.tags;
    if (Array.isArray(tags)) parts.push(...tags.filter((t): t is string => typeof t === 'string'));
    else if (typeof tags === 'string') parts.push(tags);
    return unreviewedTopicsIn(parts.join(' ')).length > 0;
}

/** The list without anything on an unreviewed topic. */
export function withoutUnreviewedContent<T extends object>(items: readonly T[]): T[] {
    return items.filter((item) => !isUnreviewedContent(item));
}
