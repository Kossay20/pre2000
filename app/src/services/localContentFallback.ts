/**
 * CLUSTER-2 — Bundled local-data fallback for guest/offline content.
 *
 * When Firestore content reads fail (permission-denied because Anonymous Auth is
 * off, OR offline, OR empty), the app falls back to BUNDLED local JSON so guests
 * see real content instead of the "Oups" ErrorState. Firestore stays the primary
 * source when it works — these helpers are only consulted on error / empty.
 *
 * The bundled JSON shapes match the app types exactly (verified):
 *   - weeks_db.json        → Week[]        keyed by week_number (number)
 *   - supplements_db.json  → Supplement[]  keyed by supplement_id (string)
 *   - articles_db.json     → Article[]     keyed by article_id (string)
 */
import { Article, Supplement, Week, ArticleAntigravity } from '../types';

import weeksData from '../data/weeks_db.json';
import supplementsData from '../data/supplements_db.json';
import articlesData from '../data/articles_db.json';
import { withoutUnreviewedContent } from '../config/unreviewedContent';

// Articles on a topic still waiting for its reviewer (art_003, Ramadan fasting) are
// dropped here, once, so no lookup, list or related-link below can hand one out.
const servableArticles: Article[] = withoutUnreviewedContent(articlesData as unknown as Article[]);

// Build lookup maps once at module load. The casts are safe: data shapes were
// verified against the types; JSON optional fields simply become undefined.
const weeksByNumber: Map<number, Week> = new Map(
    (weeksData as unknown as Week[]).map(w => [w.week_number, w]),
);

const supplementsById: Map<string, Supplement> = new Map(
    (supplementsData as unknown as Supplement[]).map(s => [s.supplement_id, s]),
);

const articlesById: Map<string, Article> = new Map(
    servableArticles.map(a => [a.article_id, a]),
);

/** Bundled Week for a given week_number, or null when out of the 1..40 range. */
export const getLocalWeek = (weekNumber: number): Week | null =>
    weeksByNumber.get(weekNumber) ?? null;

/** Bundled Supplement by supplement_id, or undefined when not bundled. */
export const getLocalSupplement = (id: string): Supplement | undefined =>
    supplementsById.get(id);

/** Bundled Article by article_id, or undefined when not bundled. */
export const getLocalArticle = (id: string): Article | undefined =>
    articlesById.get(id);

/** All bundled articles (old Article shape) — for offline list screens. */
export const getAllLocalArticles = (): Article[] => servableArticles;

/** All bundled supplements — for offline list screens. */
export const getAllLocalSupplements = (): Supplement[] =>
    supplementsData as unknown as Supplement[];

/**
 * Adapt a bundled (old-schema) Article into the ArticleAntigravity shape used by
 * the article-detail screen. Only consulted when the Antigravity Firestore read
 * yields nothing, so guests still get the full markdown body offline.
 */
export const getLocalAntigravityArticle = (id: string): ArticleAntigravity | null => {
    const a = articlesById.get(id);
    if (!a) return null;
    return {
        article_id: a.article_id,
        title_fr: a.title_fr,
        title_ar: a.title_ar ?? '',
        title_en: a.title_en ?? '',
        title_tn: a.title_tn,
        summary_fr: a.summary_fr,
        summary_ar: a.summary_ar ?? '',
        summary_en: a.summary_en ?? '',
        summary_tn: a.summary_tn,
        content_fr: a.content_markdown_fr,
        content_ar: a.content_markdown_ar ?? '',
        content_en: a.content_markdown_en ?? '',
        content_tn: a.content_markdown_tn,
        category: a.category,
        reading_time_min: 0,
        hero_image_prompt: '',
        related_tips_ids: [],
        week_min: 1,
        week_max: 40,
        tags: [],
        sources: a.sources ?? [],
    };
};
