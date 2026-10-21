import type React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// One vector icon per category in articles_db.json (pinned by a test); a category the
// bundle does not know yet (a new Firestore one) gets the generic document icon.
export const CATEGORY_ICONS: Record<string, IoniconName> = {
    nutrition: 'nutrition-outline',
    examens: 'medkit-outline',
    sante: 'heart-outline',
    developpement: 'happy-outline',
    preparation: 'bag-handle-outline',
    lifestyle: 'flower-outline',
    administratif: 'document-text-outline',
    medical: 'medical-outline',
    symptomes: 'thermometer-outline',
    accouchement: 'body-outline',
    sport: 'barbell-outline',
    exercice: 'walk-outline',
    allaitement: 'cafe-outline',
    autres: 'ellipsis-horizontal-circle-outline',
    bien_etre: 'leaf-outline',
    droits: 'shield-checkmark-outline',
    emotions: 'sad-outline',
    famille: 'people-outline',
    mouvements_bebe: 'footsteps-outline',
    multiples: 'copy-outline',
    post_partum: 'home-outline',
    sexualite: 'heart-circle-outline',
    sommeil: 'moon-outline',
    travail: 'time-outline',
};
export const DEFAULT_CATEGORY_ICON: IoniconName = 'document-text-outline';

export const getCategoryIcon = (category?: string): IoniconName =>
    CATEGORY_ICONS[(category || '').toLowerCase()] || DEFAULT_CATEGORY_ICON;
