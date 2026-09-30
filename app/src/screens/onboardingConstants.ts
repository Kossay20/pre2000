/** Types et données statiques partagés par `OnboardingScreen` (UI-1 split). */

import { getFetalGrowth } from '../utils/fetalGrowth';

export type PregnancyStatus = 'pregnant' | 'trying' | 'curious' | null;
export type DateMethod = 'ddr' | 'conception';

export const getStepCount = (status: PregnancyStatus): number => {
    switch (status) {
        case 'pregnant':
            return 4;
        case 'trying':
            return 3;
        case 'curious':
            return 3;
        default:
            return 4;
    }
};

/**
 * Comparaisons semaine / fruit. Only the i18n key of the fruit name lives here; the emoji
 * (like the size) is read from the weekly table in utils/fetalGrowth, so onboarding shows
 * the same fruit as Home and the evolution screen for the same week.
 */
const WEEK_COMPARISON_LABELS: { [key: number]: string } = {
    1: 'microscopique',
    2: 'microscopique',
    3: 'microscopique',
    4: 'graine_de_pavot',
    5: 'graine_de_sesame',
    6: 'lentille',
    7: 'myrtille',
    8: 'framboise',
    9: 'olive',
    10: 'cerise',
    11: 'figue',
    12: 'citron_vert',
    13: 'peche',
    14: 'citron',
    15: 'pomme',
    16: 'avocat',
    17: 'avocat',
    18: 'mangue',
    19: 'mangue',
    20: 'banane',
    21: 'carotte',
    22: 'papaye',
    23: 'aubergine',
    24: 'epi_de_mais',
    25: 'brocoli',
    26: 'chou',
    27: 'chou_rave',
    28: 'ananas',
    29: 'courge',
    30: 'chou_chinois',
    31: 'noix_de_coco',
    32: 'concombre',
    33: 'ananas',
    34: 'melon',
    35: 'melon',
    36: 'laitue_romaine',
    37: 'bette_a_carde',
    38: 'pasteque',
    39: 'pasteque',
    40: 'pasteque',
};

export const WEEK_COMPARISONS: { [key: number]: { emoji: string; label: string } } = Object.fromEntries(
    Object.entries(WEEK_COMPARISON_LABELS).map(([week, label]) => [
        Number(week),
        { emoji: getFetalGrowth(Number(week)).emoji, label },
    ]),
);
