/**
 * Home credit line ("Version 1 — ... par Sawssen Jemaiel"): sits right above the greeting, is
 * plain text (the greeting stays the only heading) and exists in the four shipped locales.
 * Source-level like finalReleaseR9Home.test.ts (no React renderer in the repo).
 */
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Home version note', () => {
  const home = read('src/screens/HomeScreen.tsx');
  const noteTag = home.slice(home.indexOf('styles.versionNote') - 30, home.indexOf("t('home.versionNote')") + 60);

  it('renders above the greeting', () => {
    expect(home.indexOf("t('home.versionNote')")).toBeGreaterThan(-1);
    expect(home.indexOf("t('home.versionNote')")).toBeLessThan(home.indexOf("t('home.greeting'"));
  });

  it('is plain text with a bounded height, not a second heading', () => {
    expect(noteTag).toMatch(/numberOfLines=\{3\}/);
    expect(noteTag).not.toMatch(/accessibilityRole/);
  });

  it('is at least 12pt white text on the header gradient, via theme tokens', () => {
    const styles = read('src/screens/HomeScreen.styles.ts');
    const block = styles.slice(styles.indexOf('versionNote: {'), styles.indexOf('greeting: {'));
    expect(block).toMatch(/fontSize: 12/);
    expect(block).toMatch(/color: theme\.colors\.white/);
  });

  it.each(['fr', 'en', 'ar', 'tn'])('has the %s translation naming the author', (lng) => {
    const json = JSON.parse(read(`src/i18n/locales/${lng}/home.json`));
    expect(json.versionNote).toContain('Sawssen Jemaiel');
    expect(json.versionNote).toMatch(/1/);
  });

  it('keeps the exact French wording requested by the owner', () => {
    const fr = JSON.parse(read('src/i18n/locales/fr/home.json'));
    expect(fr.versionNote).toBe('Version 1 — développée avec amour et patience par Sawssen Jemaiel');
  });
});
