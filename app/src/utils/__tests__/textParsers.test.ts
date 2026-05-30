import { parseBullets, cleanText } from '../textParsers';

describe('textParsers', () => {
    // =====================================================================
    // parseBullets
    // =====================================================================
    describe('parseBullets', () => {
        // -----------------------------------------------------------------
        // 1. Falsy / empty input guard
        // -----------------------------------------------------------------
        it('returns [] for undefined', () => {
            expect(parseBullets(undefined)).toEqual([]);
        });

        it('returns [] for an empty string', () => {
            expect(parseBullets('')).toEqual([]);
        });

        it('returns [] for a string of only whitespace', () => {
            expect(parseBullets('   \n  \t  \n   ')).toEqual([]);
        });

        it('returns [] for a string of only newlines', () => {
            expect(parseBullets('\n\n\n')).toEqual([]);
        });

        // -----------------------------------------------------------------
        // 2. Format 1 — single bullet char per line "• Bullet"
        // -----------------------------------------------------------------
        it('parses bullet lines separated by newlines', () => {
            const input = '• Bullet 1\n• Bullet 2\n• Bullet 3';
            expect(parseBullets(input)).toEqual(['Bullet 1', 'Bullet 2', 'Bullet 3']);
        });

        it('strips the leading bullet glyph and the following space', () => {
            expect(parseBullets('• Hello')).toEqual(['Hello']);
        });

        it('strips a leading asterisk bullet', () => {
            expect(parseBullets('* Item')).toEqual(['Item']);
        });

        it('strips a leading dash bullet', () => {
            expect(parseBullets('- Item')).toEqual(['Item']);
        });

        // -----------------------------------------------------------------
        // 3. Consecutive bullet chars (no separating space) — regex `+`
        // -----------------------------------------------------------------
        it('strips multiple consecutive bullet glyphs with no space', () => {
            expect(parseBullets('•••Tip')).toEqual(['Tip']);
        });

        it('strips a run of mixed consecutive bullet chars', () => {
            expect(parseBullets('*-•Mixed')).toEqual(['Mixed']);
        });

        // -----------------------------------------------------------------
        // 4. Format 2 — "* * Bullet" : only the FIRST run+space is removed
        //    because the regex `\s*` consumes the space after the first `*`,
        //    leaving the second `* ` in place.
        // -----------------------------------------------------------------
        it('only removes the first bullet run for "* * Bullet" format', () => {
            const input = '* * Bullet 1\n* * Bullet 2';
            expect(parseBullets(input)).toEqual(['* Bullet 1', '* Bullet 2']);
        });

        it('only removes first bullet run for "- - dash"', () => {
            expect(parseBullets('- - dash')).toEqual(['- dash']);
        });

        // -----------------------------------------------------------------
        // 5. Lines that become empty after stripping are filtered out
        // -----------------------------------------------------------------
        it('drops a line that is only a bullet glyph', () => {
            expect(parseBullets('•')).toEqual([]);
        });

        it('drops a line that is only bullet glyphs and spaces', () => {
            expect(parseBullets('•  \n** ')).toEqual([]);
        });

        it('keeps non-empty lines and drops bullet-only lines among them', () => {
            const input = '• Keep me\n•\n• And me';
            expect(parseBullets(input)).toEqual(['Keep me', 'And me']);
        });

        // -----------------------------------------------------------------
        // 6. Whitespace handling around lines
        // -----------------------------------------------------------------
        it('trims leading/trailing whitespace on each line before stripping', () => {
            expect(parseBullets('   • Padded   ')).toEqual(['Padded']);
        });

        it('handles a tab before the bullet glyph (line is trimmed first)', () => {
            expect(parseBullets('\t• tabbed bullet')).toEqual(['tabbed bullet']);
        });

        it('collapses extra spaces after the bullet via \\s* then trims', () => {
            expect(parseBullets('•   spaced')).toEqual(['spaced']);
        });

        it('filters out blank lines interleaved with content', () => {
            const input = '• A\n\n\n• B\n   \n• C';
            expect(parseBullets(input)).toEqual(['A', 'B', 'C']);
        });

        // -----------------------------------------------------------------
        // 7. Plain text (no bullets) passes through unchanged
        // -----------------------------------------------------------------
        it('returns a single plain line unchanged when there is no bullet', () => {
            expect(parseBullets('Just some text')).toEqual(['Just some text']);
        });

        it('returns multiple plain lines without modification', () => {
            expect(parseBullets('Line one\nLine two')).toEqual(['Line one', 'Line two']);
        });

        // -----------------------------------------------------------------
        // 8. Bullet/asterisk NOT at the start is preserved
        // -----------------------------------------------------------------
        it('does not strip a bullet that is not at the start of the line', () => {
            expect(parseBullets('text • with bullet inside')).toEqual([
                'text • with bullet inside',
            ]);
        });

        it('keeps trailing asterisks (markdown bold) — only leading run removed', () => {
            expect(parseBullets('**bold** text')).toEqual(['bold** text']);
        });

        it('does not strip a dash inside a word like "x-ray"', () => {
            expect(parseBullets('x-ray scan')).toEqual(['x-ray scan']);
        });

        // -----------------------------------------------------------------
        // 9. Locale / non-Latin content (AR / TN) preserved intact
        // -----------------------------------------------------------------
        it('preserves Arabic content and strips only the leading bullet', () => {
            expect(parseBullets('• نصيحة للحامل')).toEqual(['نصيحة للحامل']);
        });

        it('does not strip a bullet glyph embedded inside Arabic text', () => {
            expect(parseBullets('ال•عربية')).toEqual(['ال•عربية']);
        });

        it('handles a multi-line Arabic bullet list', () => {
            const input = '• الأولى\n• الثانية';
            expect(parseBullets(input)).toEqual(['الأولى', 'الثانية']);
        });

        // -----------------------------------------------------------------
        // 10. Return type / immutability sanity
        // -----------------------------------------------------------------
        it('always returns an array', () => {
            expect(Array.isArray(parseBullets('• x'))).toBe(true);
            expect(Array.isArray(parseBullets(undefined))).toBe(true);
        });

        it('returns a fresh array (no shared reference between calls)', () => {
            const a = parseBullets('• x');
            const b = parseBullets('• x');
            expect(a).not.toBe(b);
            expect(a).toEqual(b);
        });
    });

    // =====================================================================
    // cleanText
    // =====================================================================
    describe('cleanText', () => {
        // -----------------------------------------------------------------
        // 1. Falsy / empty input guard
        // -----------------------------------------------------------------
        it('returns "" for undefined', () => {
            expect(cleanText(undefined)).toBe('');
        });

        it('returns "" for an empty string', () => {
            expect(cleanText('')).toBe('');
        });

        it('returns "" for a whitespace-only string', () => {
            expect(cleanText('     ')).toBe('');
        });

        it('returns "" for tabs and newlines only', () => {
            expect(cleanText('\t\n\r\n ')).toBe('');
        });

        // -----------------------------------------------------------------
        // 2. Trim + collapse internal whitespace
        // -----------------------------------------------------------------
        it('trims leading and trailing whitespace', () => {
            expect(cleanText('   hello   ')).toBe('hello');
        });

        it('collapses multiple internal spaces into one', () => {
            expect(cleanText('a     b')).toBe('a b');
        });

        it('collapses mixed tabs/newlines/spaces into single spaces', () => {
            expect(cleanText('  a\t\nb   c ')).toBe('a b c');
        });

        it('replaces a newline between words with a single space', () => {
            expect(cleanText('first\nsecond')).toBe('first second');
        });

        it('replaces tabs between words with a single space', () => {
            expect(cleanText('left\tright')).toBe('left right');
        });

        // -----------------------------------------------------------------
        // 3. Already-clean text is returned unchanged
        // -----------------------------------------------------------------
        it('leaves an already-clean single-spaced string unchanged', () => {
            expect(cleanText('already clean text')).toBe('already clean text');
        });

        it('leaves a single word unchanged', () => {
            expect(cleanText('word')).toBe('word');
        });

        // -----------------------------------------------------------------
        // 4. Locale content (AR / TN) preserved, whitespace still collapsed
        // -----------------------------------------------------------------
        it('collapses whitespace in Arabic text while preserving characters', () => {
            expect(cleanText('  مرحبا   بك  ')).toBe('مرحبا بك');
        });

        it('preserves emoji while collapsing surrounding whitespace', () => {
            expect(cleanText('  baby  👶  ')).toBe('baby 👶');
        });

        // -----------------------------------------------------------------
        // 5. Punctuation is not treated as whitespace
        // -----------------------------------------------------------------
        it('does not alter punctuation, only whitespace', () => {
            expect(cleanText('Hello,  world!  ')).toBe('Hello, world!');
        });

        // -----------------------------------------------------------------
        // 6. Return type sanity
        // -----------------------------------------------------------------
        it('always returns a string', () => {
            expect(typeof cleanText('  x  ')).toBe('string');
            expect(typeof cleanText(undefined)).toBe('string');
        });
    });
});
