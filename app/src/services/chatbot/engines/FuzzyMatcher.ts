/**
 * Fuzzy Matcher using Levenshtein Distance
 * Helps correct typos in user queries.
 */

export class FuzzyMatcher {
    /**
     * Calculate Levenshtein distance between two strings
     */
    private static levenshtein(a: string, b: string): number {
        const matrix = [];

        // Increment along the first column of each row
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        // Increment each column in the first row
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        // Fill in the rest of the matrix
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) == a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1 // deletion
                        )
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Find the closest match for a word in a list of candidates
     * @param word The word to correct
     * @param candidates List of valid words (keywords)
     * @param threshold Max distance allowed (default 2)
     */
    static findClosestMatch(word: string, candidates: string[], threshold: number = 2): string | null {
        if (word.length < 4) return null; // Don't correct short words

        // CB2-FIX (SAFETY): make the edit budget proportional to word length.
        // A flat threshold of 2 let medium words be "corrected" across languages into
        // unrelated red-flag keywords — e.g. EN "should"/"pendant"/"aliments"/"mild" were
        // pulled onto emergency-flag synonyms, escalating benign nutrition questions to
        // "shortness of breath"/"eclampsia", and EN words were mangled away from their real
        // matches. Allow only a single edit for words ≤7 chars; the looser budget (2) is
        // reserved for longer words where 2 edits is still a small fraction of the token.
        const effThreshold = word.length <= 7 ? Math.min(threshold, 1) : threshold;

        let bestMatch = null;
        let minDistance = Infinity;

        for (const candidate of candidates) {
            const distance = this.levenshtein(word, candidate);
            if (distance <= effThreshold && distance < minDistance) {
                minDistance = distance;
                bestMatch = candidate;
            }
        }

        return bestMatch;
    }

    /**
     * Correct a sentence by replacing misspelled words with their closest matches
     */
    static correctSentence(sentence: string, vocabulary: Set<string>): string {
        const words = sentence.toLowerCase().split(/[\s,.;?!]+/);
        const correctedWords = words.map(word => {
            if (vocabulary.has(word)) return word;
            const match = this.findClosestMatch(word, Array.from(vocabulary));
            return match || word;
        });
        return correctedWords.join(' ');
    }
}
