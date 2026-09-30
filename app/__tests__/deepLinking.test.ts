/**
 * Every bottom tab must be reachable by URL.
 *
 * `linking.getStateFromPath` in App.tsx ends with a catch-all that resolves any
 * unknown path to Home. That is the right behaviour for a mistyped link, but it
 * also means a *missing* entry never fails — it silently lands on Home. The
 * Chatbot tab had no path at all for that reason: `/chatbot` looked like it
 * worked, it just showed the wrong screen. It surfaced only when a screenshot
 * run produced five identical captures.
 *
 * This reads App.tsx as source text — the same technique
 * `AuthContext.gdpr.test.ts` uses — because the linking config is a local inside
 * `AppContent` and is not exported. It is a coarse guard, not a navigation test:
 * it catches "a tab exists with no way to address it", which is the failure that
 * actually happened.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'App.tsx'), 'utf8');

/** Route names registered on the bottom tab navigator. */
const tabRouteNames = [...source.matchAll(/<Tab\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);

/** The `config.screens` object literal of the linking config. */
const linkingConfigBlock = (() => {
  const start = source.indexOf('const linking = {');
  if (start === -1) throw new Error('linking config not found in App.tsx');
  const end = source.indexOf('if (loading) return null;', start);
  return source.slice(start, end === -1 ? undefined : end);
})();

describe('deep linking', () => {
  it('finds the bottom tabs in App.tsx', () => {
    // Sanity check on the parsing itself — if this list ever comes back empty the
    // assertions below would pass vacuously.
    expect(tabRouteNames).toEqual(
      expect.arrayContaining(['Home', 'Calendrier', 'Rappels', 'Ressources', 'Chatbot']),
    );
  });

  it.each([['Home'], ['Calendrier'], ['Rappels'], ['Ressources'], ['Chatbot']])(
    'the %s tab has an entry in the linking config',
    (tab) => {
      expect(linkingConfigBlock).toMatch(new RegExp(`\\b${tab}\\s*:`));
    },
  );

  it('every registered tab is addressable — none may rely on the Home catch-all', () => {
    const unaddressable = tabRouteNames.filter(
      (tab) => !new RegExp(`\\b${tab}\\s*:`).test(linkingConfigBlock),
    );
    expect(unaddressable).toEqual([]);
  });

  it('keeps the Chatbot path, which a notification tap needs to reach', () => {
    expect(linkingConfigBlock).toMatch(/Chatbot:\s*'chatbot'/);
  });

  it('still resolves unknown paths to Home rather than rendering nothing', () => {
    // The catch-all is what makes the guard above necessary; it must stay, since
    // React Navigation renders an empty container on an unresolved path.
    expect(linkingConfigBlock).toContain('getStateFromPath');
    expect(linkingConfigBlock).toMatch(/name:\s*'Home'/);
  });

  describe('prefixes the native build actually registers', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'app.json'), 'utf8'),
    ).expo;
    const prefixes = [...(linkingConfigBlock.match(/prefixes:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (m) => m[1],
    );

    it('finds the prefixes', () => {
      expect(prefixes.length).toBeGreaterThan(0);
    });

    it('declares the custom scheme in app.json, or mama-bebe:// links open nothing', () => {
      // Without `scheme`, the store binary registered only the bundle id and the
      // dev-client scheme, so the first prefix was dead.
      const custom = prefixes
        .filter((p) => !/^https?:/.test(p) && !p.startsWith('exp+'))
        .map((p) => p.replace('://', ''));
      expect(custom).toEqual([appJson.scheme]);
    });

    it('lists an https prefix only when universal / app links are set up', () => {
      const https = prefixes.filter((p) => p.startsWith('https://'));
      const hasAssociatedDomains = (appJson.ios?.associatedDomains ?? []).length > 0;
      if (!hasAssociatedDomains) expect(https).toEqual([]);
    });
  });
});
