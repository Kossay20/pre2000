/**
 * Seed the local Firestore emulator with the same static collections
 * `npm run import-data` pushes to production (scripts/importData.ts).
 *
 * The real rules forbid client writes to static content, so this goes through
 * the emulator REST API with the `Bearer owner` token, which bypasses rules
 * on the emulator only. Never points at a real project.
 *
 *   node e2e/helpers/seed-emulator.mjs <projectId>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const projectId = process.argv[2];
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!projectId) {
  console.error('usage: seed-emulator.mjs <projectId>');
  process.exit(1);
}

// Same list, same source files as scripts/importData.ts — see that JSON for why.
const COLLECTIONS = JSON.parse(
  fs.readFileSync(path.join(appDir, 'scripts/seedCollections.json'), 'utf8'),
).collections.map(({ file, collection, idField }) => [file, collection, idField]);

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;

for (const [file, name, idField] of COLLECTIONS) {
  const items = JSON.parse(fs.readFileSync(path.join(appDir, file), 'utf8'));
  let n = 0;
  for (let i = 0; i < items.length; i += 400) {
    const writes = items
      .slice(i, i + 400)
      .filter((item) => item[idField])
      .map((item) => ({
        update: {
          name: `projects/${projectId}/databases/(default)/documents/${name}/${String(item[idField])}`,
          fields: toValue(item).mapValue.fields,
        },
      }));
    const res = await fetch(`${base}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ writes }),
    });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    n += writes.length;
  }
  console.log(`${name}: ${n}`);
}
