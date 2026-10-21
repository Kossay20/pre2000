/**
 * Every pregnancy week must recommend something, and every recommendation must
 * resolve.
 *
 * The Recommendations screen is reachable from Home and reads
 * `weekData.recommended_articles_ids` / `recommended_supplements_ids`. Only weeks
 * 1–5 carried them: for weeks 6 through 40 — 87% of a pregnancy, and all of the
 * part women actually spend using the app — the screen showed "No recommendation
 * for this week."
 *
 * The enriched dataset had existed all along in `weeks_db_final.json` at the
 * repository root; it had simply never been propagated into the bundle or into
 * the seed source, so the gap affected offline and live users alike.
 *
 * Two failure modes are guarded, because fixing the first one invites the second:
 * a week with no recommendations, and a recommendation pointing at content that
 * does not exist — which renders as a silently missing card, not an error.
 */
import weeks from '../weeks_db.json';
import articles from '../articles_db.json';
import supplements from '../supplements_db.json';

interface WeekRow {
  week_number: number;
  recommended_articles_ids?: string | null;
  recommended_supplements_ids?: string | null;
}

const rows = weeks as unknown as WeekRow[];

/** The screen splits on comma and drops empties — mirror that exactly. */
const ids = (value?: string | null): string[] =>
  (value || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

const ARTICLE_IDS = new Set(
  (articles as unknown as { article_id: string }[]).map((a) => a.article_id),
);
const SUPPLEMENT_IDS = new Set(
  (supplements as unknown as { supplement_id: string }[]).map((s) => s.supplement_id),
);

describe('weekly recommendations', () => {
  it('covers weeks 1 to 40 with no gaps', () => {
    const numbers = rows.map((w) => w.week_number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('leaves no week without a single recommendation', () => {
    const empty = rows
      .filter((w) => ids(w.recommended_articles_ids).length === 0 && ids(w.recommended_supplements_ids).length === 0)
      .map((w) => w.week_number);

    expect(empty).toEqual([]);
  });

  it('points every article recommendation at an article that exists', () => {
    const dangling = rows.flatMap((w) =>
      ids(w.recommended_articles_ids)
        .filter((id) => !ARTICLE_IDS.has(id))
        .map((id) => `week ${w.week_number} → ${id}`),
    );

    expect(dangling).toEqual([]);
  });

  it('points every supplement recommendation at a supplement that exists', () => {
    const dangling = rows.flatMap((w) =>
      ids(w.recommended_supplements_ids)
        .filter((id) => !SUPPLEMENT_IDS.has(id))
        .map((id) => `week ${w.week_number} → ${id}`),
    );

    expect(dangling).toEqual([]);
  });

  it('never recommends the same item twice within one week', () => {
    const duplicated = rows
      .flatMap((w) => [
        { week: w.week_number, kind: 'article', list: ids(w.recommended_articles_ids) },
        { week: w.week_number, kind: 'supplement', list: ids(w.recommended_supplements_ids) },
      ])
      .filter(({ list }) => new Set(list).size !== list.length)
      .map(({ week, kind }) => `week ${week} (${kind})`);

    expect(duplicated).toEqual([]);
  });
});
