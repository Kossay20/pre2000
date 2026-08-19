/**
 * Firestore composite indexes must cover every multi-filter query in the code.
 *
 * Firestore creates single-field indexes on its own, but a query with two
 * filters on different fields needs a composite index declared up front. Miss one
 * and the query throws `failed-precondition` — in production, on real data, on a
 * screen that worked fine in every offline test because it never reached the
 * backend at all.
 *
 * This repo shipped that exact trap two ways at once: `app/firestore.indexes.json`
 * — the file `firebase.json` actually deploys — held `{"indexes": []}`, while a
 * populated but orphaned copy sat at the repository root with no `firebase.json`
 * anywhere near it. Deploying from `app/` would have published an empty index set.
 *
 * So this test derives the requirement from the source instead of trusting the
 * file: it scans `src/` for `query(...)` calls, and every one with two or more
 * `where(...)` clauses must have a matching index entry.
 */
import fs from 'fs';
import path from 'path';

const APP_DIR = path.resolve(__dirname, '..');

interface IndexField {
  fieldPath: string;
  order: string;
}
interface CompositeIndex {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

const indexes: CompositeIndex[] = JSON.parse(
  fs.readFileSync(path.join(APP_DIR, 'firestore.indexes.json'), 'utf8'),
).indexes;

/** Recursively list .ts/.tsx under src/, skipping tests. */
const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

/** Extract the balanced body of every `query(...)` call in a source string. */
const queryBodies = (source: string): { line: number; body: string }[] => {
  const out: { line: number; body: string }[] = [];
  const marker = /\bquery\(/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    let i = marker.lastIndex;
    let depth = 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
      i += 1;
    }
    out.push({
      line: source.slice(0, match.index).split('\n').length,
      body: source.slice(marker.lastIndex, i - 1),
    });
  }
  return out;
};

const FIELD_IN_WHERE = /where\(\s*'([^']+)'/g;

interface MultiFilterQuery {
  file: string;
  line: number;
  collection: string;
  fields: string[];
}

const collectMultiFilterQueries = (): MultiFilterQuery[] => {
  const found: MultiFilterQuery[] = [];
  for (const file of sourceFiles(path.join(APP_DIR, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const { line, body } of queryBodies(source)) {
      const fields = [...body.matchAll(FIELD_IN_WHERE)].map((m) => m[1]);
      if (fields.length < 2) continue;
      const collection = body.match(/collection\(\s*db\s*,\s*'([^']+)'/)?.[1];
      found.push({
        file: path.relative(APP_DIR, file),
        line,
        // A few call sites pass a collection ref built a couple of lines earlier;
        // resolve those by looking backwards from the query.
        collection:
          collection ??
          source
            .slice(0, source.split('\n').slice(0, line).join('\n').length)
            .match(/collection\(\s*db\s*,\s*'([^']+)'\s*\)(?![\s\S]*collection\(\s*db\s*,)/)?.[1] ??
          '<unresolved>',
        fields,
      });
    }
  }
  return found;
};

/** An index serves a query when its leading fields are exactly that field set. */
const isCovered = (q: MultiFilterQuery): boolean =>
  indexes.some((index) => {
    if (index.collectionGroup !== q.collection) return false;
    const prefix = index.fields.slice(0, q.fields.length).map((f) => f.fieldPath);
    return (
      prefix.length === q.fields.length && q.fields.every((field) => prefix.includes(field))
    );
  });

describe('firestore composite indexes', () => {
  const multiFilter = collectMultiFilterQueries();

  it('finds the multi-filter queries it is supposed to guard', () => {
    // Guards the scanner itself: if the regex stops matching, every assertion
    // below would pass on an empty list.
    expect(multiFilter.length).toBeGreaterThanOrEqual(3);
  });

  it('has a declared index for every multi-filter query', () => {
    const uncovered = multiFilter
      .filter((q) => !isCovered(q))
      .map((q) => `${q.file}:${q.line} → ${q.collection}(${q.fields.join(', ')})`);

    expect(uncovered).toEqual([]);
  });

  it('is the file firebase.json actually deploys', () => {
    const firebaseJson = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'firebase.json'), 'utf8'));
    expect(firebaseJson.firestore.indexes).toBe('firestore.indexes.json');
    expect(firebaseJson.firestore.rules).toBe('firestore.rules');
  });

  it('declares no index for a collection nothing queries', () => {
    // A stale index is not harmful in production, but it is a sign the file has
    // drifted from the code — which is how the empty one went unnoticed.
    const queried = new Set(multiFilter.map((q) => q.collection));
    const orphans = indexes
      .map((i) => i.collectionGroup)
      .filter((collectionGroup) => !queried.has(collectionGroup));

    expect(orphans).toEqual([]);
  });
});
