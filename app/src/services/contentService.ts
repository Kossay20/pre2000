/**
 * Content Service — with in-memory caching
 *
 * NEW-06 FIX: Added module-level Maps to cache articles, supplements and
 * Antigravity articles. Firestore is only queried once per session per
 * unique ID set. Reduces reads and eliminates the spinner every time
 * the user navigates back to HomeScreen / ResourcesScreen.
 */
import { createLogger } from '../utils/logger';
const log = createLogger('contentService');

import { collection, documentId, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Article, Supplement, ArticleAntigravity } from '../types';
import { getLocalArticle, getLocalSupplement, getLocalAntigravityArticle } from './localContentFallback';
import { FIRESTORE_GUEST_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';

// ─── In-Memory Cache ──────────────────────────────────────────────────────────
const articleCache = new Map<string, Article>();
const supplementCache = new Map<string, Supplement>();
const antigravityCache = new Map<string, ArticleAntigravity>();

/** Call on logout/reset so the next user starts fresh */
export const clearContentCache = () => {
    articleCache.clear();
    supplementCache.clear();
    antigravityCache.clear();
    antigravityWeekCache.clear();
    log.info('[ContentService] 🧹 Cache cleared');
};

// ─── Articles ─────────────────────────────────────────────────────────────────

export const getArticlesByIds = async (ids: string[]): Promise<Article[]> => {
    if (!ids || ids.length === 0) return [];

    const uncached = ids.filter(id => !articleCache.has(id));

    if (uncached.length > 0) {
        log.info(`[ContentService] 📚 Fetching ${uncached.length}/${ids.length} articles (cache miss)`);
        try {
            // Firestore 'in' is limited to 10 — chunk if needed
            const chunks: string[][] = [];
            for (let i = 0; i < uncached.length; i += 10) chunks.push(uncached.slice(i, i + 10));

            for (const chunk of chunks) {
                const q = query(collection(db, 'articles'), where(documentId(), 'in', chunk));
                const snapshot = await getDocs(q);
                snapshot.docs.forEach(d => {
                    const article = d.data() as Article;
                    articleCache.set(d.id, article);
                });
            }
        } catch (error) {
            // CLUSTER-2: Firestore failed (permission-denied for guests / offline).
            // Don't bail with [] — fall through to the bundled-local backfill below.
            log.error('[ContentService] ❌ Error fetching articles:', error);
        }

        // CLUSTER-2: Backfill any id still missing (Firestore error OR doc absent)
        // from bundled local JSON so guests/offline see real content.
        for (const id of uncached) {
            if (!articleCache.has(id)) {
                const local = getLocalArticle(id);
                if (local) articleCache.set(id, local);
            }
        }
    } else {
        log.info(`[ContentService] ⚡ All ${ids.length} articles served from cache`);
    }

    return ids.map(id => articleCache.get(id)!).filter(Boolean);
};

// ─── Supplements ──────────────────────────────────────────────────────────────

export const getSupplementsByIds = async (ids: string[]): Promise<Supplement[]> => {
    if (!ids || ids.length === 0) return [];

    const uncached = ids.filter(id => !supplementCache.has(id));

    if (uncached.length > 0) {
        log.info(`[ContentService] 💊 Fetching ${uncached.length}/${ids.length} supplements (cache miss)`);
        try {
            const chunks: string[][] = [];
            for (let i = 0; i < uncached.length; i += 10) chunks.push(uncached.slice(i, i + 10));

            for (const chunk of chunks) {
                const q = query(collection(db, 'supplements'), where(documentId(), 'in', chunk));
                const snapshot = await getDocs(q);
                snapshot.docs.forEach(d => {
                    supplementCache.set(d.id, d.data() as Supplement);
                });
            }
        } catch (error) {
            // CLUSTER-2: see getArticlesByIds — fall through to bundled-local backfill.
            log.error('[ContentService] ❌ Error fetching supplements:', error);
        }

        // CLUSTER-2: Backfill any id still missing from bundled local JSON.
        for (const id of uncached) {
            if (!supplementCache.has(id)) {
                const local = getLocalSupplement(id);
                if (local) supplementCache.set(id, local);
            }
        }
    } else {
        log.info(`[ContentService] ⚡ All ${ids.length} supplements served from cache`);
    }

    return ids.map(id => supplementCache.get(id)!).filter(Boolean);
};

// ─── Antigravity Articles (Trilingual) ────────────────────────────────────────

export const getAntigravityArticle = async (articleId: string): Promise<ArticleAntigravity | null> => {
    if (antigravityCache.has(articleId)) {
        log.info(`[ContentService] ⚡ Antigravity article served from cache: ${articleId}`);
        return antigravityCache.get(articleId)!;
    }

    log.info(`[ContentService] 📰 Fetching Antigravity article: ${articleId}`);
    try {
        const articleDoc = await withTimeout(
            getDoc(doc(db, 'articlesAntigravity', articleId)),
            FIRESTORE_GUEST_TIMEOUT_MS,
        );
        if (articleDoc.exists()) {
            const data = articleDoc.data() as ArticleAntigravity;
            antigravityCache.set(articleId, data);
            log.info(`[ContentService] ✅ Found article: ${data.title_fr}`);
            return data;
        } else {
            log.warn(`[ContentService] ⚠️ Article not found: ${articleId}`);
            // CLUSTER-2: fall back to bundled local article (adapted shape).
            return localAntigravityFallback(articleId);
        }
    } catch (error) {
        log.error('[ContentService] ❌ Error fetching Antigravity article:', error);
        // CLUSTER-2: Firestore failed (permission-denied for guests / offline).
        return localAntigravityFallback(articleId);
    }
};

/** CLUSTER-2: shared local fallback for the single-article detail path. */
const localAntigravityFallback = (articleId: string): ArticleAntigravity | null => {
    const local = getLocalAntigravityArticle(articleId);
    if (local) {
        antigravityCache.set(articleId, local);
        log.info(`[ContentService] 📦 Served bundled article: ${articleId}`);
        return local;
    }
    return null;
};

export const getAntigravityArticlesByCategory = async (category: string): Promise<ArticleAntigravity[]> => {
    log.info(`[ContentService] 🏷️ Fetching Antigravity articles for category: ${category}`);
    try {
        const q = query(
            collection(db, 'articlesAntigravity'),
            where('category', '==', category)
        );
        const snapshot = await getDocs(q);
        const articles = snapshot.docs.map(d => {
            const data = d.data() as ArticleAntigravity;
            // Populate cache as a side-effect
            if (data.article_id) antigravityCache.set(data.article_id, data);
            return data;
        });
        log.info(`[ContentService] ✅ Found ${articles.length} Antigravity articles in ${category}`);
        return articles;
    } catch (error) {
        log.error('[ContentService] ❌ Error fetching articles by category:', error);
        return [];
    }
};

// Cache keyed by week number so the same week is never re-fetched
const antigravityWeekCache = new Map<number, ArticleAntigravity[]>();

export const getAntigravityArticlesForWeek = async (week: number): Promise<ArticleAntigravity[]> => {
    // Serve from week-level cache first
    if (antigravityWeekCache.has(week)) {
        const cached = antigravityWeekCache.get(week)!;
        log.info(`[ContentService] ⚡ Week ${week} served from cache (${cached.length} articles)`);
        return cached;
    }

    log.info(`[ContentService] 📅 Fetching Antigravity articles for week ${week} (server-side filter)`);
    try {
        // P1 FIX: Filter server-side on week_min to avoid full collection scan.
        // Firestore only allows one inequality filter per query, so week_max is checked client-side.
        const q = query(
            collection(db, 'articlesAntigravity'),
            where('week_min', '<=', week)
        );
        const snapshot = await getDocs(q);
        const articles = snapshot.docs
            .map(d => {
                const data = d.data() as ArticleAntigravity;
                // Populate per-article cache as a side-effect
                if (data.article_id) antigravityCache.set(data.article_id, data);
                return data;
            })
            .filter(article => article.week_max >= week); // client-side upper bound

        // Store in week cache
        antigravityWeekCache.set(week, articles);
        log.info(`[ContentService] ✅ Found ${articles.length} articles for week ${week}`);
        return articles;
    } catch (error) {
        log.error('[ContentService] ❌ Error fetching articles for week:', error);
        return [];
    }
};
