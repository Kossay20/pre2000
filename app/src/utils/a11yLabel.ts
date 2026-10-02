/**
 * Emoji in an accessible name are read out ("white heavy check mark, Take folic acid") and
 * duplicated by RN-web, which also mirrors the visible text. Titles that carry a decorative
 * emoji get this version as their accessibilityLabel; the visible text keeps the emoji.
 */
const DECORATIVE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export const plainLabel = (text: string | undefined | null): string =>
    (text ?? '').replace(DECORATIVE, '').replace(/\s{2,}/g, ' ').trim();
