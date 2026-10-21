/**
 * The bundled markdown opens with its own "# Title : subtitle" line, right under the screen's
 * H1 title: the page then reads the same heading twice. Drop that first line when it repeats
 * the title (accent/case-insensitive, either one containing the other); any other opening
 * heading is real content and stays.
 */
const foldForCompare = (text: string): string =>
    text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const stripLeadingTitleHeading = (markdown: string, title: string): string => {
    const match = markdown.match(/^\s*#{1,2}[ \t]+([^\n]+)\n*/);
    if (!match) return markdown;
    const heading = foldForCompare(match[1]);
    const folded = foldForCompare(title);
    if (!heading || !folded) return markdown;
    if (!heading.includes(folded) && !folded.includes(heading)) return markdown;
    return markdown.slice(match[0].length);
};
