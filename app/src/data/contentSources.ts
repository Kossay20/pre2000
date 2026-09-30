/**
 * Health authorities that article and week content can cite.
 *
 * App Review guideline 1.4.1 asks health apps to cite the medical information
 * they present. Content records cite by id (`sources: ['has', 'who']` on an
 * article or a week), and this registry turns an id into a name and a link, so
 * a citation can only ever point at a page someone has checked by hand.
 *
 * Each URL was fetched on 2026-09-30 and returned the page named in `title`.
 * CDC is absent on purpose: cdc.gov refuses non-browser requests, so its page
 * could not be verified the same way.
 *
 * What this file does NOT do is say which content relies on which body. No
 * article or week in the bundled data carries a `sources` field yet, and none
 * should get one until a clinician has checked that text against the cited
 * page. The free-text labels on the Firestore articles ("ACOG Guidelines",
 * "Expérience mamans", …) were written by the content generator, never
 * reviewed, and are deliberately not matched here.
 */
import { isSafeUrl } from '../utils/safeOpenUrl';

export interface ContentSource {
    id: string;
    /** Issuing body, as it names itself. */
    organization: string;
    /** Title of the linked page, in the language it is published in. */
    title: string;
    url: string;
}

export const CONTENT_SOURCES: Readonly<Record<string, ContentSource>> = {
    who: {
        id: 'who',
        organization: 'WHO',
        title: 'WHO recommendations on antenatal care for a positive pregnancy experience',
        url: 'https://www.who.int/publications/i/item/9789241549912',
    },
    has: {
        id: 'has',
        organization: 'Haute Autorité de Santé',
        title: 'Suivi et orientation des femmes enceintes en fonction des situations à risque identifiées',
        url: 'https://www.has-sante.fr/jcms/c_547976/fr/suivi-et-orientation-des-femmes-enceintes-en-fonction-des-situations-a-risque-identifiees',
    },
    cngof: {
        id: 'cngof',
        organization: 'CNGOF',
        title: "Fiches d'information des patientes",
        url: 'https://cngof.fr/fiches-dinformation-des-patientes-2/',
    },
    nhs: {
        id: 'nhs',
        organization: 'NHS',
        title: 'Pregnancy',
        url: 'https://www.nhs.uk/pregnancy/',
    },
    acog: {
        id: 'acog',
        organization: 'ACOG',
        title: 'Pregnancy',
        url: 'https://www.acog.org/womens-health/pregnancy',
    },
};

/**
 * Resolve a record's `sources` field into displayable citations.
 *
 * Accepts whatever the record holds — Firestore articles carry an array of
 * free-text labels, the bundled data carries nothing — and keeps only ids this
 * registry knows, once each, in the order given. Anything else is dropped
 * rather than shown as an unlinked, unverified name. Matching is exact, so the
 * generator's "ACOG" or "CNGOF" labels do not pass for the reviewed ids.
 */
export const resolveContentSources = (raw: unknown): ContentSource[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: ContentSource[] = [];
    for (const id of raw) {
        if (typeof id !== 'string') continue;
        const source = Object.prototype.hasOwnProperty.call(CONTENT_SOURCES, id)
            ? CONTENT_SOURCES[id]
            : undefined;
        if (!source || seen.has(id) || !isSafeUrl(source.url)) continue;
        seen.add(id);
        out.push(source);
    }
    return out;
};
