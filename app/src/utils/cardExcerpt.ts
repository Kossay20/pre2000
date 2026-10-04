import i18n from '../i18n';
import { getLocalizedContent } from './i18nHelpers';

// A bundled summary is "# Title  First sentence..." (the heading's newline became a double
// space). A card already prints the title above the excerpt, so the heading repeated as the
// excerpt's opening words ("Les differentes methodes d'accouchement. L'accouchement est...").
const LEADING_HEADING = /^\s*#{1,6}[ \t]*[^\n]*?(?:[ \t]*\n+[ \t]*|[ \t]{2,})(?=\S)/;

/**
 * Cut `text` to at most `maxChars` characters at a WORD boundary and close it with an ellipsis.
 * A CSS/`numberOfLines` clamp ends mid-word ('...l'aboutissement de neuf moi...'); pre-truncating
 * with a budget the clamp will not reach keeps the cut between words. Only a normal space breaks:
 * a no-break space (French typography: 'mois :') stays glued to its word.
 */
export const truncateAtWord = (text: string, maxChars: number): string => {
    if (!text || maxChars <= 0 || text.length <= maxChars) return text;
    const head = text.slice(0, maxChars + 1);
    const lastSpace = head.lastIndexOf(' ');
    // A single very long word (no usable break in the first half): hard cut rather than nothing.
    const cutAt = lastSpace >= maxChars * 0.5 ? lastSpace : maxChars;
    const cut = text
        .slice(0, cutAt)
        .replace(/[\s\u00a0,;:\u2013\u2014\-\u060c\u061b]+$/u, ''); // no dangling punctuation before the ellipsis
    return `${cut}\u2026`;
};

/**
 * How many characters of an excerpt fit in `lines` lines of a card text block `contentWidth`
 * wide: a conservative average glyph width (0.55em, covers Latin and Arabic) and a word of slack
 * per line for wrapping, so the pre-truncation always bites before the line clamp does.
 */
export const cardExcerptBudget = (
    contentWidth: number,
    options: { fontSize?: number; lines?: number; fontScale?: number } = {},
): number => {
    const { fontSize = 16, lines = 2, fontScale = 1 } = options;
    const perLine = Math.floor(contentWidth / (fontSize * fontScale * 0.55));
    return Math.max(24, lines * perLine - 12);
};

/**
 * Text for a card preview of an article/supplement summary: no leading markdown heading
 * (it restates the title), no markdown marks, whitespace collapsed to single spaces
 * (no-break spaces kept: French typography).
 */
export const getCardExcerpt = <T>(
    data: T,
    fieldPrefix: string = 'summary',
    language: string = i18n.language,
    maxChars?: number,
): string => {
    const raw = getLocalizedContent(data, fieldPrefix, language);
    if (!raw) return '';
    const plain = raw
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
    return maxChars ? truncateAtWord(plain, maxChars) : plain;
};
