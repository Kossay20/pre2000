import { Supplement } from '../types';

export type SupplementSafety = Supplement['pregnancy_safety'];

/**
 * One reading of a supplement's `pregnancy_safety`, shared by the list, the detail screen
 * and the week recommendations.
 *
 * The token is data (bundled JSON or Firestore) and has shipped in more than one spelling —
 * the accented 'à_surveiller' / 'déconseillé', mixed case, spaces instead of underscores.
 * Each screen used to compare the raw string against its own switch, so the same record read
 * "caution" in the list but "unknown" on its detail page and dropped out of the caution filter.
 *
 * Anything unrecognised (or missing) reads as caution, never as safe: over-caution is the
 * acceptable failure, labelling a teratogen "✓ Safe" is not.
 */
export const normalizeSupplementSafety = (raw: string | null | undefined): SupplementSafety => {
    const token = (raw || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[\s-]+/g, '_');
    if (token === 'ok') return 'ok';
    if (token === 'deconseille') return 'deconseille';
    return 'a_surveiller';
};
