/**
 * Content citations (App Review 1.4.1).
 *
 * The footer under articles and weeks may only show an authority whose page was
 * checked by hand, and only when the record cites it by registry id. These tests
 * pin both halves: the registry resolves ids and nothing else (the footer
 * renders nothing when it resolves nothing), and a tapped citation opens only
 * a web page. The component itself is not rendered: this Jest setup has no
 * React renderer, so its logic lives in these two tested helpers.
 */
const openURL = jest.fn((_url: string) => Promise.resolve());

jest.mock('react-native', () => ({
    Linking: { openURL: (url: string) => openURL(url) },
}));
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ error: jest.fn(), debug: jest.fn(), warn: jest.fn(), info: jest.fn() }),
}));

import { CONTENT_SOURCES, resolveContentSources } from '../contentSources';
import { openContentSource } from '../../components/common/SourcesFooter.helpers';
import articles from '../articles_db.json';
import weeks from '../weeks_db.json';

describe('resolveContentSources', () => {
    it('returns nothing for a record with no citations', () => {
        expect(resolveContentSources(undefined)).toEqual([]);
        expect(resolveContentSources([])).toEqual([]);
        expect(resolveContentSources('has')).toEqual([]);
    });

    it('resolves registry ids in the order given, once each', () => {
        expect(resolveContentSources(['nhs', 'has', 'nhs']).map(s => s.id)).toEqual(['nhs', 'has']);
    });

    it('ignores the unreviewed free-text labels the Firestore articles carry', () => {
        // Straight from articles_antigravity.json: the generator's own attributions.
        const labels = ['ACOG Guidelines', 'CNGOF Recommandations', 'ACOG', 'CNGOF', 'OMS/WHO', 'PubMed', 'Expérience mamans'];
        expect(resolveContentSources(labels)).toEqual([]);
    });

    it('holds only https links, keyed by their own id', () => {
        for (const [key, source] of Object.entries(CONTENT_SOURCES)) {
            expect(source.id).toBe(key);
            expect(source.url).toMatch(/^https:\/\//);
            expect(source.organization.trim()).not.toBe('');
            expect(source.title.trim()).not.toBe('');
        }
    });

    it('bundled articles and weeks cite only registry ids', () => {
        // A label pasted into the data would silently vanish from the footer;
        // fail here instead so whoever fills `sources` sees it.
        const records = [...(articles as any[]), ...(weeks as any[])];
        const unknown = records.flatMap(r =>
            ((r.sources as unknown[]) ?? []).filter(id => typeof id !== 'string' || !CONTENT_SOURCES[id]),
        );
        expect(unknown).toEqual([]);
    });
});

describe('openContentSource', () => {
    beforeEach(() => openURL.mockClear());

    it('opens a registry page', () => {
        expect(openContentSource(CONTENT_SOURCES.has.url)).toBe(true);
        expect(openURL).toHaveBeenCalledWith(CONTENT_SOURCES.has.url);
    });

    it('refuses a non-web scheme', () => {
        expect(openContentSource('javascript:alert(1)')).toBe(false);
        expect(openURL).not.toHaveBeenCalled();
    });
});
