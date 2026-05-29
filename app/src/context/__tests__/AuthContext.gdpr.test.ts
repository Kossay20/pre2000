/**
 * Wiring guard (P1.2 GDPR): the behavioral purge logic now lives in gdprPurge.ts and is
 * exercised by gdprPurge.test.ts. This guard ensures AuthContext.deleteAccount still
 * DELEGATES to that purge — so the extraction can't be silently disconnected, leaving a
 * deleteAccount that removes the Auth user but orphans Firestore data.
 */
import * as fs from 'fs';
import * as path from 'path';

const AUTH_CONTEXT_PATH = path.resolve(__dirname, '../AuthContext.tsx');

describe('AuthContext.deleteAccount — GDPR purge wiring', () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(AUTH_CONTEXT_PATH, 'utf8'); });

  it('imports purgeUserFirestoreData from gdprPurge', () => {
    expect(source).toMatch(/import\s*\{[^}]*purgeUserFirestoreData[^}]*\}\s*from\s*['"`]\.\/gdprPurge['"`]/);
  });

  it('calls purgeUserFirestoreData(db, uid) inside deleteAccount', () => {
    const block = source.slice(source.indexOf('const deleteAccount'));
    expect(block).toMatch(/await\s+purgeUserFirestoreData\s*\(\s*db\s*,\s*uid\s*\)/);
  });
});
