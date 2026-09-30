import { Linking } from 'react-native';
import { isSafeUrl } from '../../utils/safeOpenUrl';
import { createLogger } from '../../utils/logger';

const log = createLogger('SourcesFooter');

/**
 * Open a cited authority's page. The registry only holds https links, but the
 * scheme check is what keeps it that way if someone adds an entry by hand.
 * Returns whether the link was handed to the OS.
 */
export const openContentSource = (url: string): boolean => {
    if (!isSafeUrl(url)) return false;
    Linking.openURL(url).catch((err: unknown) => log.error('Failed to open source:', err));
    return true;
};
