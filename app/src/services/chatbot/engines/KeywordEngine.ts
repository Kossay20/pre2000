import { createLogger } from '../../../utils/logger';
import { FuzzyMatcher } from './FuzzyMatcher';

const log = createLogger('KeywordEngine');

// Simple synonym map for better matching (FR + AR standard + TN arabizi)
// FIX-B: Enriched with 30+ arabizi medical pregnancy terms
const SYNONYMS: Record<string, string[]> = {
    'douleur':        ['mal', 'bobo', 'wa3ra', 'wji3a', 'وجيعة', 'sater', 'yt3b', 'wja3', 'koll yoja3ni', '3andi wji3a'],
    'tête':           ['crâne', 'migraine', 'ras', 'rassi', 'رأس', 'tesifi', 'tasdiya', 'sda3', 'ras youja3'],
    'ventre':         ['estomac', 'bidou', 'abdomen', 'karch', 'kerch', 'كرش', 'botni', 'karch youja3', 'tahta kari'],
    'saignement':     ['sang', 'saigne', 'spotting', 'nzif', 'nazef', 'دم', 'نزيف', 'dam', 'shwit dam', 'yanzef', 'nzef'],
    'fatigue':        ['épuisée', 't3ab', 'fachel', 'تعب', 'mfachla', 'taaban', 'maynash ta9a', 'wa9fa'],
    'nausée':         ['vomir', 'vomi', 'radan', 'rdan', 'غثيان', 'twahham', 'nettaqayeh', 'nitgharret'],
    'fièvre':         ['chaud', 'température', 's5ana', 'skhana', 'سخانة', 'حمى', 'skhouna', 's7ana', '7ama', 'te7rak'],
    'bébé':           ['foetus', 'bibi', 'sghir', 'صغير', 'بيبي', 'weld', 'bebi', 'wald', 'baby'],
    'manger':         ['alimentation', 'nourriture', 'mekla', 'makla', 'ماكلة', 'kol', 'akl', 'ma nakolsh'],
    'dormir':         ['sommeil', 'insomnie', 'rgad', 'rgoud', 'نوم', 'nom', 'nayem', 'ma nrqodch'],
    'grossesse':      ['enceinte', 'hbala', 'hbéla', 'حبالة', 'حمل', 'haml', 'habla'],
    'symptomes':      ['signes', 'a3radh', '3alamat', 'أعراض', 'علامات', 'waji3', 'hala'],
    'hopital':        ['clinique', 'sbitar', 'سبيطار', 'مستشفى', 'mustashfa', 'maternite', 'clinik', 'dawaya'],
    'medecin':        ['docteur', 'tbib', 'طبيب', 'toubib', 'hakeem', 'tabib'],
    'mouvement':      ['bouge', 'coup', 'tfir', 'haraka', 'حركة', 'ybou3', 'ybou3sh', 'ytharrak', 'ma yahraksh', 'ma nhiss bih'],
    'contractions':   ['crampes', 'tasyib', 'wji3at', 'wji3 kerch', 'tachi3at', 'mja3ni'],
    'tension':        ['pression', 'hypertension', 'dhght', 'tansyon', 'ضغط', 'daght', 'daght 3ali'],
    'diabète':        ['sucre', 'sokkar', 'sucar', 'diabet', 'السكر', 'sukkar', 'sokkar fel dm'],
    'vitamines':      ['pilules', 'hdaber', 'حبوب', 'hboub', 'complement', 'hwayej', 'hboub el 7aml'],
    'eau':            ['hydratation', 'boire', 'ماء', 'shreb', 'ishrab', '3atshan', 'shreb ma'],
    // Clinical arabizi — FIX-B new entries
    'respiration':    ['souffle', 'nafes', 'nafes ma yaji', 'ma nelqash nafes', 'yzoqni', 'ضيق تنفس'],
    'oedème':          ['gonflement', 'enflure', 'netefkhet', 'nafkha', 'wajhha yentefkh', 'yentafkh', 'تورم'],
    'infection':      ['bactérie', 'hargan', 'bourni 3and twalit', 'hargan bawla', 'التهاب', 'iltiheb'],
    'vision':         ['yeux', 'vue', '3eyni', 'mzghlala', 'mzaghzgha', 'choosha', 'بقع أمام العينين'],
    'évanouissement':  ['tomber', 'ghimet', 'deyakha', 'dayekha', '3aqlet 3liya', 'إغماء'],
    'sage-femme':     ['obstétricien', 'qabla', 'qablet', 'lqabla', 'قابلة', 'sage femme'],
    'urgence':        ['vite', 'srea3a', 'beser3a', 'tou3', 'توة', 'azrak', 'ambulance', 'isaf'],
    'allaitement':    ['sein', 'rda3a', 'rdhaa', 'رضاعة', 'tredha3', 'lben'],
    'accouchement':   ['naissance', 'wlada', 'wilda', 'ولادة', 'ytwalled'],
    'anxiété':        ['stress', 'peur', 'khayef', 'khayfa', 'ghalba', 'qla9', 'mkhawfa'],
};

// Negation words: French + Arabic standard + Tunisian dialect
// BUG-02 FIX: Was missing all Arabic/TN negations
const NEGATIONS = [
    // French ('ne' added — RED-team P1-2: "je ne saigne pas" leaked the verb as positive)
    'ne', 'pas', 'aucun', 'aucune', 'sans', 'ni', 'jamais', 'guère', 'plus',
    // English (RED-team P1-1: EN negations were entirely missing → "I am not bleeding" /
    // "I have no headache" falsely escalated). Strong (literal-phrase) matches are still
    // protected from negation in chatbotService, so "I can't breathe" still escalates.
    'not', 'no', 'without', 'never', 'dont', "don't", 'cannot', "can't", 'cant', 'neither',
    // Arabic standard
    'لا', 'ليس', 'ليست', 'لم', 'لن', 'غير', 'لو', 'مش',
    // Tunisian dialectal: "ma" alone + "mash" / "ما...ش" pattern handled below
    'مش', 'والو', 'msh', 'ma3andish', 'manish', 'manach',
];

// Regex for Tunisian "ma...sh" negation pattern (ما + word + ش)
// e.g. "ما عنديش", "ما فماش", "maandish", "ma3andish"
const TN_NEGATION_RE = /^(?:ما|ma).*(?:ش|sh|c)$/i;

// Stopwords to ignore during negation scope
const STOPWORDS = ['le', 'la', 'les', 'un', 'une', 'de', 'du', 'des', 'ce', 'cette', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'y', 'en'];

// CB4-FIX: auxiliary/filler verbs that sit between a negation and the real symptom
// ("I do not HAVE bleeding"). They must NOT consume the negation — it has to reach the
// content word ("bleeding"), otherwise a negated symptom leaks as a false positive.
const AUX_FILLERS = [
    'have', 'has', 'had', 'having', 'feel', 'feels', 'feeling', 'felt',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'get', 'got',
    'ai', 'as', 'avons', 'avez', 'ont', 'eu', 'ressens', 'ressent', 'sens', 'sent',
];

export class KeywordEngine {
    private vocabulary: Set<string>;

    constructor(vocabulary: string[] = []) {
        this.vocabulary = new Set(vocabulary);
        // Add synonyms to vocabulary
        Object.values(SYNONYMS).flat().forEach(w => this.vocabulary.add(w));
        Object.keys(SYNONYMS).forEach(w => this.vocabulary.add(w));
    }

    /**
     * Process user input:
     * 1. Tokenize
     * 2. Detect negations
     * 3. Fuzzy correct
     * 4. Expand synonyms
     */
    processQuery(text: string): { positive: string[]; negative: string[] } {
        const lowerText = text.toLowerCase().trim();

        // Split by punctuation to handle sentences
        const tokens = lowerText.split(/[\s,.;?!]+/);

        const positiveWords: Set<string> = new Set();
        const negativeWords: Set<string> = new Set();

        let isNegationActive = false;

        for (let i = 0; i < tokens.length; i++) {
            let word = tokens[i];

            if (word.length < 2) continue;

            // Check for negation markers (FR + AR + TN)
            // BUG-02 FIX: includes Arabic and Tunisian negations
            if (NEGATIONS.includes(word) || TN_NEGATION_RE.test(word)) {
                isNegationActive = true;
                continue; // Skip the negation word itself
            }

            // Reset negation after punctuation or specific connectors (simplified)
            if (['mais', 'et', 'car', 'donc', 'or', 'but'].includes(word)) {
                isNegationActive = false;
                continue;
            }

            // CB4-FIX: auxiliary/filler verbs do NOT consume an active negation — keep it on the
            // next CONTENT word, so "I do not HAVE bleeding" negates "bleeding", not "have".
            if (isNegationActive && AUX_FILLERS.includes(word)) {
                continue;
            }

            // BUG-04 FIX: Skip fuzzy correction for Arabic-script words — 
            // Levenshtein on Arabic can match unrelated French words by char distance
            const isArabicWord = /[\u0600-\u06FF]/.test(word);

            // Fuzzy correction (Latin only)
            if (!isArabicWord && !this.vocabulary.has(word) && !STOPWORDS.includes(word)) {
                const corrected = FuzzyMatcher.findClosestMatch(word, Array.from(this.vocabulary));
                if (corrected) {
                    log.debug(`Corrected typo: ${word} -> ${corrected}`);
                    word = corrected;
                }
            }

            // Synonym expansion
            const expanded = this.expandWord(word);

            if (isNegationActive) {
                // If it's a stopword, we don't add it to negative words (useless) 
                // AND we don't reset negation (it continues to the next word)
                if (STOPWORDS.includes(word)) {
                    continue;
                }

                expanded.forEach(w => negativeWords.add(w));
                // Reset negation after one significant word (heuristic)
                // "Je n'ai pas de fièvre" -> "fièvre" is negated. 
                // "Je n'ai pas de fièvre et mal à la tête" -> "fièvre" negated, "mal" positive.
                isNegationActive = false;
            } else {
                // Only add if it's not a stopword or if it's in our vocabulary
                if (!STOPWORDS.includes(word) || this.vocabulary.has(word)) {
                    expanded.forEach(w => positiveWords.add(w));
                }
            }
        }

        return {
            positive: Array.from(positiveWords),
            negative: Array.from(negativeWords)
        };
    }

    private expandWord(word: string): string[] {
        const expanded = new Set([word]);

        // Check if word is a key in synonyms
        if (SYNONYMS[word]) {
            SYNONYMS[word].forEach(s => expanded.add(s));
        }

        // Check if word is a value in synonyms
        for (const [key, values] of Object.entries(SYNONYMS)) {
            if (values.includes(word)) {
                expanded.add(key);
                values.forEach(v => expanded.add(v));
            }
        }

        return Array.from(expanded);
    }
}
