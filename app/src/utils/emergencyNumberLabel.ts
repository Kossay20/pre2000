import type { TFunction } from 'i18next';
import type { EmergencyNumberSource } from './clinicalChecks';

/**
 * The number as a call button shows it. A 112 we fell back to is labelled as the
 * international number, so a button reading "(112)" is never mistaken for the
 * national service the user expects (190 in Tunisia, 15 in France).
 */
export const emergencyNumberLabel = (
    t: TFunction,
    contact: { number: string; source: EmergencyNumberSource },
): string =>
    contact.source === 'fallback'
        ? t('common.emergencyNumber.international', { number: contact.number })
        : contact.number;
