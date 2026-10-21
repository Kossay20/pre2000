/**
 * Fuzzy Matcher using Levenshtein Distance
 * Helps correct typos in user queries.
 */

export class FuzzyMatcher {
    /**
     * CB-R5-02 FIX (SAFETY — over-escalation): high-frequency everyday words that must NEVER be
     * "corrected" into a clinical token. The flat 1-edit budget let common words collapse onto
     * single-token red-flag keywords that share a first letter and differ by one edit — most
     * dangerously "week"/"weeks" → "weak" (fetal-distress URGENT), so "see you next week" /
     * "my appointment is next week" escalated. These are ordinary English words a pregnant user
     * types constantly; treating them as typos is never correct. (Defense-in-depth: the lone
     * 'weak' keyword is additionally gated in chatbotService so it needs a baby/movement concept.)
     * Kept tight to real, frequent collisions so genuine typo tolerance (e.g. "bleding"→
     * "bleeding") is untouched.
     */
    private static readonly NEVER_CORRECT = new Set([
        'week', 'weeks',          // → weak (fetal distress)
        'read', 'reed',           // → red  (hemorrhage)
        'lost', 'lots',           // → loss (hemorrhage) — also legit intensity words
        'fats', 'figs',           // → fits (eclampsia) — common food words
        'feed', 'feet', 'need', 'seed', // frequent benign words near food/symptom queries
    ]);

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

        // CB-R5-02 FIX (SAFETY): never treat a high-frequency safe word as a typo (week→weak …).
        if (this.NEVER_CORRECT.has(word.toLowerCase())) return null;

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

        const firstChar = word.charAt(0).toLowerCase();

        for (const candidate of candidates) {
            // CB-R3-01 FIX (SAFETY): never "correct" a word into a candidate that begins with a
            // DIFFERENT letter. A first-letter substitution changes the word's identity entirely
            // while keeping the edit distance minimal, so a perfectly ordinary word collides with
            // an unrelated clinical keyword — e.g. EN "painted" → "fainted" (p→f, distance 1) made
            // "I painted the nursery red" escalate to an eclampsia EMERGENCY. Genuine typos
            // (keyboard slips, doubled/dropped letters) overwhelmingly preserve the first letter
            // ("bleding"→"bleeding"), so this guard removes the cross-word false-corrections
            // without weakening real typo tolerance.
            if (candidate.charAt(0).toLowerCase() !== firstChar) continue;

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
