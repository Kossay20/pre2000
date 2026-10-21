/**
 * R6 — contentService had NO test. It owns the article/supplement load path: in-memory
 * cache, Firestore 'in' ≤10 chunking, input-order preservation, cache-clear on logout, and
 * the client-side week_max filter for Antigravity articles. A regression (duplicate fetches,
 * lost order, stale cache after logout) would ship silently.
 */
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('../../config/firebase', () => ({ db: {} }));

// Faithful firestore mock: `where(documentId(),'in',chunk)` captures the chunk; getDocs
// returns the fixture docs for the requested ids (or week docs for the week query).
const ARTICLE_FIXTURE: Record<string, any> = {
  a1: { article_id: 'a1', title_fr: 'A1' }, a2: { article_id: 'a2', title_fr: 'A2' }, a3: { article_id: 'a3', title_fr: 'A3' },
  // Firestore is seeded from articles_db.json, so it carries art_003 (Ramadan fasting).
  art_003: { article_id: 'art_003', title_fr: 'Le jeûne du Ramadan : Ce qu\'il faut savoir' },
};
const SUPP_FIXTURE: Record<string, any> = {
  s1: { supplement_id: 's1', name_fr: 'Fer' }, s2: { supplement_id: 's2', name_fr: 'Iode' },
};
// The mock getDocs ignores the server-side week_min filter, so week_max must be the
// discriminator: w2's week_max (8) is below week 10 → excluded by the CLIENT-side filter.
const WEEK_DOCS = [
  { article_id: 'w1', week_min: 5, week_max: 12 }, // week_max 12 >= 10 → kept
  { article_id: 'w2', week_min: 2, week_max: 8 },  // week_max 8 < 10 → dropped client-side
];
let collectionName = '';
jest.mock('firebase/firestore', () => ({
  documentId: jest.fn(() => '__id__'),
  collection: jest.fn((_db: any, name: string) => { collectionName = name; return name; }),
  where: jest.fn((_f: any, _op: any, val: any) => ({ val })),
  query: jest.fn((_coll: any, clause: any) => ({ clause })),
  doc: jest.fn(), getDoc: jest.fn(),
  getDocs: jest.fn(async (q: any) => {
    const val = q?.clause?.val;
    if (Array.isArray(val)) {
      const fx = collectionName === 'supplements' ? SUPP_FIXTURE : ARTICLE_FIXTURE;
      return { docs: val.filter((id: string) => fx[id]).map((id: string) => ({ id, data: () => fx[id] })) };
    }
    // week query (where week_min <= week)
    return { docs: WEEK_DOCS.map(d => ({ id: d.article_id, data: () => d })) };
  }),
}));

import { getArticlesByIds, getSupplementsByIds, getAntigravityArticlesForWeek, clearContentCache } from '../contentService';
import { getDocs } from 'firebase/firestore';

beforeEach(() => { jest.clearAllMocks(); clearContentCache(); });

describe('contentService.getArticlesByIds', () => {
  it('returns [] for empty input without querying', async () => {
    expect(await getArticlesByIds([])).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('fetches, preserves input order, and de-duplicates via cache on repeat calls', async () => {
    const first = await getArticlesByIds(['a2', 'a1']);
    expect(first.map(a => a.article_id)).toEqual(['a2', 'a1']); // input order, not fixture order
    expect(getDocs).toHaveBeenCalledTimes(1);
    // Second call for an already-cached id must NOT hit Firestore again
    const second = await getArticlesByIds(['a1']);
    expect(second.map(a => a.article_id)).toEqual(['a1']);
    expect(getDocs).toHaveBeenCalledTimes(1); // still 1 — served from cache
  });

  it("chunks ids into groups of 10 for Firestore 'in' limit", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `x${i}`); // 12 → 2 chunks
    await getArticlesByIds(ids);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it('returns [] and does not throw when Firestore errors AND the id is not bundled', async () => {
    (getDocs as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    expect(await getArticlesByIds(['a1'])).toEqual([]);
  });

  // CLUSTER-2: bundled local fallback when Firestore fails (guest permission-denied / offline)
  it('falls back to bundled local article when Firestore rejects (real bundled id)', async () => {
    (getDocs as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
    const r = await getArticlesByIds(['a01_symptômes_de_grossesse']);
    expect(r).toHaveLength(1);
    expect(r[0].article_id).toBe('a01_symptômes_de_grossesse');
    expect(typeof r[0].title_fr).toBe('string');
  });

  it('never returns an article on a topic still waiting for its reviewer, from Firestore or the bundle', async () => {
    expect((await getArticlesByIds(['art_003', 'a1'])).map(a => a.article_id)).toEqual(['a1']);
    clearContentCache();
    (getDocs as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
    expect(await getArticlesByIds(['art_003'])).toEqual([]);
  });

  it('backfills only the missing ids from bundled data when Firestore returns a partial/empty result', async () => {
    // Mock returns no docs (empty collection) → both ids must come from bundled JSON.
    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });
    const r = await getArticlesByIds(['a01_symptômes_de_grossesse', 'a02_alimentation_pendant_la']);
    expect(r.map(a => a.article_id)).toEqual(['a01_symptômes_de_grossesse', 'a02_alimentation_pendant_la']);
  });
});

describe('contentService.getSupplementsByIds', () => {
  it('fetches supplements and caches them', async () => {
    const r = await getSupplementsByIds(['s1', 's2']);
    expect(r.map(s => s.supplement_id)).toEqual(['s1', 's2']);
    expect(getDocs).toHaveBeenCalledTimes(1);
    await getSupplementsByIds(['s1']);
    expect(getDocs).toHaveBeenCalledTimes(1); // cache hit
  });

  // CLUSTER-2: bundled local fallback for supplements
  it('falls back to bundled local supplement when Firestore rejects (real bundled id)', async () => {
    (getDocs as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
    const r = await getSupplementsByIds(['s01_acide_folique']);
    expect(r).toHaveLength(1);
    expect(r[0].supplement_id).toBe('s01_acide_folique');
    expect(typeof r[0].name_fr).toBe('string');
  });
});

describe('contentService cache + week filter', () => {
  it('clearContentCache forces a re-fetch', async () => {
    await getArticlesByIds(['a1']);
    expect(getDocs).toHaveBeenCalledTimes(1);
    clearContentCache();
    await getArticlesByIds(['a1']);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it('getAntigravityArticlesForWeek applies the client-side week_max upper bound', async () => {
    const r = await getAntigravityArticlesForWeek(10);
    expect(r.map(a => a.article_id)).toEqual(['w1']); // w2 (20-30) excluded for week 10
  });
});
