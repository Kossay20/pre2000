/**
 * Wiring guard (P1.2 GDPR): the purge lives in gdprPurge.ts and the purge-then-delete
 * ordering in accountDeletion.ts, both behaviourally tested (gdprPurge.test.ts,
 * accountDeletion.test.ts). This guard ensures AuthContext still DELEGATES to them — so the
 * extraction can't be silently disconnected, leaving a deleteAccount that removes the Auth
 * user but orphans Firestore data.
 */
import * as fs from 'fs';
import * as path from 'path';

const AUTH_CONTEXT_PATH = path.resolve(__dirname, '../AuthContext.tsx');
const ACCOUNT_DELETION_PATH = path.resolve(__dirname, '../accountDeletion.ts');

describe('AuthContext.deleteAccount — GDPR purge wiring', () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(AUTH_CONTEXT_PATH, 'utf8'); });

  it('imports the deletion orchestration from accountDeletion', () => {
    expect(source).toMatch(/import\s*\{[^}]*deleteUserAccount[^}]*finishDeletionAfterReauth[^}]*\}\s*from\s*['"`]\.\/accountDeletion['"`]/);
  });

  it('calls deleteUserAccount(db, firebaseUser) inside deleteAccount', () => {
    const block = source.slice(source.indexOf('const deleteAccount'), source.indexOf('const reauthenticateAndDelete'));
    expect(block).toMatch(/await\s+deleteUserAccount\s*\(\s*db\s*,\s*firebaseUser\s*\)/);
  });

  it('routes reauthenticateAndDelete through finishDeletionAfterReauth (reauth before purge)', () => {
    const block = source.slice(source.indexOf('const reauthenticateAndDelete'));
    expect(block).toMatch(/await\s+finishDeletionAfterReauth\s*\(\s*db\s*,\s*firebaseUser\s*,/);
    // No direct Auth delete that could bypass the purge.
    expect(block.slice(0, block.indexOf('return ('))).not.toMatch(/firebaseUser\.delete\s*\(/);
  });

  it('accountDeletion purges through purgeUserFirestoreData', () => {
    const src = fs.readFileSync(ACCOUNT_DELETION_PATH, 'utf8');
    expect(src).toMatch(/await\s+purgeUserFirestoreData\s*\(\s*db\s*,\s*user\.uid\s*\)/);
  });
});
