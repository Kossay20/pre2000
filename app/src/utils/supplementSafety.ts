import { Supplement } from '../types';
import { theme } from '../theme';

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

/**
 * The one label each rating carries, wherever it is shown — the list card, the filter
 * chip, the detail tag and the week recommendations. The list card used to read the older
 * `safetyOk` / `safetyMonitor` strings, so the "With caution" chip filtered to cards
 * labelled "Monitor".
 */
export const SUPPLEMENT_SAFETY_LABEL_KEYS: Readonly<Record<SupplementSafety, string>> = {
    ok: 'common.supplementSafety.safe',
    a_surveiller: 'common.supplementSafety.caution',
    deconseille: 'common.supplementSafety.avoid',
};

/**
 * Text and fill of a rating badge. Dark text on a light tint of the same hue, each pair
 * at least 4.5:1 (pinned in the theme contrast test). The detail tag used to put the
 * theme's brown body text on the saturated success/warning/error fills — 2.2:1 on green.
 */
export const SUPPLEMENT_SAFETY_TAG_COLORS: Readonly<Record<SupplementSafety, { text: string; background: string }>> = {
    ok: { text: theme.colors.green800, background: theme.colors.surfaceGreenTint },
    a_surveiller: { text: theme.colors.deepOrange900, background: theme.colors.surfaceOrangeTint },
    deconseille: { text: theme.colors.red800, background: theme.colors.surfaceRose },
};
