import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('analytics stays off', () => {
  it('nothing in src starts the Firebase Analytics SDK', () => {
    // The privacy policy and the privacy manifest promise no analytics; on web,
    // getAnalytics() alone sends page views to Google.
    const offenders = sourceFiles(SRC).filter((file) =>
      /\bgetAnalytics\s*\(|\binitializeAnalytics\s*\(/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
