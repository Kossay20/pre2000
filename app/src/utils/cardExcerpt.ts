import i18n from '../i18n';
import { getLocalizedContent } from './i18nHelpers';

// A bundled summary is "# Title  First sentence..." (the heading's newline became a double
// space). A card already prints the title above the excerpt, so the heading repeated as the
// excerpt's opening words ("Les differentes methodes d'accouchement. L'accouchement est...").
const LEADING_HEADING = /^\s*#{1,6}[ \t]*[^\n]*?(?:[ \t]*\n+[ \t]*|[ \t]{2,})(?=\S)/;

/**
 * Text for a card preview of an article/supplement summary: no leading markdown heading
 * (it restates the title), no markdown marks, whitespace collapsed to single spaces
 * (no-break spaces kept: French typography).
 */
export const getCardExcerpt = <T>(
    data: T,
    fieldPrefix: string = 'summary',
    language: string = i18n.language,
): string => {
    const raw = getLocalizedContent(data, fieldPrefix, language);
    if (!raw) return '';
    return raw
        .replace(LEADING_HEADING, '')
        .replace(/^\s*#{1,6}[ \t]*/, '') // a heading with no body after it: keep its words
        .replace(/#{1,6}\s?/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[ \t\r\n]+/g, ' ')
        .trim();
};
