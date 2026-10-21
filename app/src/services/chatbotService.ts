import { createLogger } from '../utils/logger';
import { ChatResponse, RedFlag, Article, ChatbotSuggestion } from '../types';
import { LocalChatbotRepository } from './chatbot/data/local_data';
import { KeywordEngine, SYNONYMS } from './chatbot/engines/KeywordEngine';
import { vectorEngine, VectorEngine } from './chatbot/engines/VectorEngine';
import i18n from '../i18n';
import { getLocalizedContent } from '../utils/i18nHelpers';
import forbiddenFoods from '../data/forbidden_foods.json';

const log = createLogger('chatbotService');

// Initialize dependencies - Using Local repository for fresh data
const repository = new LocalChatbotRepository();
let keywordEngine: KeywordEngine | null = null;
let vectorEngineReady = false;

// ── PERF-FIX: in-memory cache so repository is only queried once per session
let cachedRedFlags: Awaited<ReturnType<typeof repository.getRedFlags>> | null = null;
let cachedSuggestions: Awaited<ReturnType<typeof repository.getSuggestions>> | null = null;
let cachedArticles: Awaited<ReturnType<typeof repository.getArticles>> | null = null;

const getRedFlagsCached = async () => { if (!cachedRedFlags) cachedRedFlags = await repository.getRedFlags(); return cachedRedFlags; };
const getSuggestionsCached = async () => { if (!cachedSuggestions) cachedSuggestions = await repository.getSuggestions(); return cachedSuggestions; };
const getArticlesCached = async () => { if (!cachedArticles) cachedArticles = await repository.getArticles(); return cachedArticles; };

const SEVERITY_PRIORITY: Record<string, number> = {
    'emergency': 3,
    'urgent_consult': 2,
    'critique': 3,
    'élevé': 2,
    'modéré': 1,
    'faible': 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// CB-R8-01 FIX (SAFETY — over-escalation, ungated generic SYNONYM single token).
// ROOT-CLASS FIX (same family as CB-R3-01 / CB-R5-01): a generic concept must be GATED
// (require corroboration) no matter WHICH lexical form of it reaches the matcher. The
// chatbot's generic-token gating below lists only the FR/EN base words (douleur/pain/sang/…),
// but KeywordEngine.SYNONYMS expands every base concept into dialectal/arabizi variants
// ('douleur' → 'mal','wji3a','wja3','wa3ra','وجيعة',…). Several red-flag keywords use those
// VARIANTS as single-word keywords (e.g. 'crampes sévères'.keywords_tn has 'wji3a'), so a lone
// pain SYNONYM was an UN-gated single hit → "j'ai mal au dos" / "j'ai mal aux seins" escalated
// to the 'crampes sévères' URGENT flag. EN "I have mild back pain" was already safe only because
// 'pain' happened to be in the base list.
//
// Fix: build, ONCE at module load, the *synonym-closure* of a base generic-token set. For each
// base token we add the token itself, every synonym of any SYNONYMS group it belongs to (whether
// it is the group KEY or one of the VALUES), so the gating set contains EVERY form reachable from
// a generic concept. Membership checks below use this expanded set, so 'wji3a'/'وجيعة' are gated
// exactly like 'douleur'. Specific MULTIWORD clinical keywords ('crampes sévères','wji3 qawi',
// 'karch youja3','douleur unilatérale violente') are unaffected — they match via the strong
// multiword path and only LONE single generic-synonym tokens get gated.
//
// IMPORTANT (SAFETY — under-escalation guard): a few SYNONYMS groups deliberately MIX a generic
// substance word with SPECIFIC clinical-emergency terms. The clearest case is 'saignement', which
// pairs the generic blood word 'sang'/'دم'/'dam' (gated by design) with the SPECIFIC hemorrhage
// lexemes 'nzif'/'نزيف'/'saigne'/'yanzef'… that the existing design (CB-R7-03 / the AR matcher)
// requires to fire on a SINGLE hit ("عندي نزيف" = "I have bleeding" → emergency, no intensifier).
// So the closure SUBTRACTS an explicit SPECIFIC-token allow-list: those tokens are never gated even
// when reached through a generic base concept's group. This keeps over-escalation closed (lone pain
// synonyms gated) WITHOUT re-opening under-escalation (lone hemorrhage terms still single-hit).
const expandGenericTokensWithSynonyms = (
    baseTokens: Iterable<string>,
    keepSpecific: Set<string>,
): Set<string> => {
    const expanded = new Set<string>(baseTokens);
    // Index every synonym group so a token (key OR value) resolves to its whole group.
    const groups: string[][] = Object.entries(SYNONYMS).map(([key, values]) => [key, ...values]);
    // Iterate to a fixed point so chained membership (a token that is in two groups) is fully
    // closed. In practice one pass suffices, but the loop guards against future overlapping maps.
    let grew = true;
    while (grew) {
        grew = false;
        for (const group of groups) {
            // If ANY member of this group is already considered generic, the WHOLE group is —
            // EXCEPT members that are explicitly SPECIFIC clinical triggers (never gated).
            if (group.some(member => expanded.has(member))) {
                for (const member of group) {
                    if (!expanded.has(member) && !keepSpecific.has(member)) {
                        expanded.add(member);
                        grew = true;
                    }
                }
            }
        }
    }
    // Defensive: ensure no specific token leaked into the generic set (e.g. if a base token were
    // ever mistakenly added to keepSpecific too — base wins is wrong for safety, so specific wins).
    for (const t of keepSpecific) expanded.delete(t);
    return expanded;
};

// SPECIFIC single-word clinical-emergency tokens that MUST always fire on a single hit and must
// NEVER be folded into the generic (gated) set, even though they share a SYNONYMS group with a
// generic base concept. These are the active-bleeding / hemorrhage lexemes from the 'saignement'
// group (the only generic-base group that mixes in specific terms). 'sang'/'دم'/'dam'/'spotting'
// stay GENERIC (a lone blood-substance mention needs corroboration); the terms below denote an
// active bleed and are clinical triggers (mirrors the AR matcher's specific-token design, CB-R7-03).
const SPECIFIC_CLINICAL_TOKENS = new Set<string>([
    'saignement', 'saigne', 'nzif', 'nazef', 'نزيف', 'yanzef', 'nzef', 'shwit dam',
]);

// Base generic flag tokens — colour/substance/sensation/food words that are benign on their own
// and only count toward a red flag when CORROBORATED (intensity/quantity word, or a 2nd distinct
// generic concept). See the long CB-R3-01/CB-R5-01 rationale at the matcher below.
const BASE_GENERIC_FLAG_TOKENS = [
    // EN
    'red', 'blood', 'bright', 'bleeding', 'loss', 'pain',
    // CB-R5-01 FIX (SAFETY — over-escalation): 'liver' is overwhelmingly a FOOD word in
    // EN pregnancy questions ("is liver pate safe", "can I eat beef liver", "chicken liver
    // is rich in iron") yet it is a single-token keyword of the HELLP emergency flag, so a
    // lone occurrence fired a full EMERGENCY + call button. Gate the EN liver-flag tokens
    // (mirroring the FR 'foie'/'hépatique' below) so a bare mention needs corroboration. The
    // multiword keyword "liver pain" stays a STRONG single-hit trigger (substring path).
    'liver', 'hepatic', 'ribs',
    // FR
    'rouge', 'sang', 'foie', 'douleur', 'hépatique', 'côtes',
];
// CB-R8-01: the gating set is the SYNONYM-CLOSURE of the base tokens, computed ONCE at module
// load. Any token reachable from a generic concept through KeywordEngine.SYNONYMS (e.g. 'douleur'
// → 'mal','wji3a','wja3','wa3ra','وجيعة'; 'sang' ← 'saignement'.synonyms; 'foie'… ) is therefore
// gated identically to the base word, closing the over-escalation class for ALL languages/variants.
const GENERIC_FLAG_TOKENS = expandGenericTokensWithSynonyms(BASE_GENERIC_FLAG_TOKENS, SPECIFIC_CLINICAL_TOKENS);

// CB-R8-01: map every (generic) token to a CANONICAL concept id so the "≥2 distinct generic
// CONCEPTS corroborate" rule counts CONCEPTS, not synonym variants of the same concept. Without
// this, the synonym closure would DEFEAT the gate: one 'douleur'/'mal' expands in the token stream
// to many generic tokens (douleur, mal, wji3a, wja3, وجيعة, …), all now in GENERIC_FLAG_TOKENS, so
// size≥2 would be trivially true. We collapse them to a single concept ('douleur'), so a lone pain
// word stays gated while a genuine 2-concept co-occurrence (e.g. douleur+foie) still corroborates.
const SYNONYM_GROUPS: string[][] = Object.entries(SYNONYMS).map(([key, values]) => [key, ...values]);
const tokenToCanonicalConcept = (token: string): string => {
    for (const group of SYNONYM_GROUPS) {
        if (group.includes(token)) return group[0]; // the SYNONYMS key is the canonical concept
    }
    return token; // a base generic token not present in any synonym group is its own concept
};

/**
 * Initialize the keyword engine and vector engine with data from the repository.
 * This ensures we can handle async data loading (e.g. from SQLite).
 */
/**
 * Helper to slugify text for anchors
 */
const slugify = (text: string): string => {
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};

/**
 * Split article content into semantic chunks based on headers
 */
// Detect if text is predominantly Arabic/RTL script
const isArabicScript = (text: string): boolean => {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    return arabicChars > 2;
};

const chunkArticle = (article: Article, lang?: string): { id: string; title: string; content: string; anchor: string }[] => {
    const chunks: { id: string; title: string; content: string; anchor: string }[] = [];

    let content = article.content_markdown_fr || article.summary_fr || "";
    let localTitle = article.title_fr;

    if (lang === 'en') {
        content = (article as any).content_markdown_en || content;
        localTitle = (article as any).title_en || localTitle;
    } else if (lang === 'ar') {
        content = article.content_markdown_ar || content;
        localTitle = article.title_ar || localTitle;
    } else if (lang === 'tn') {
        content = article.content_markdown_tn || article.content_markdown_ar || content;
        localTitle = article.title_tn || article.title_ar || localTitle;
    }

    // Split by headers (## or ###)
    // We capture the header text and the following content
    const regex = /^(#{2,3})\s+(.+)$/gm;

    let lastIndex = 0;
    let match;

    // Add initial chunk (Introduction before first header)
    const firstHeaderMatch = regex.exec(content);
    if (firstHeaderMatch && firstHeaderMatch.index > 0) {
        chunks.push({
            id: `${article.article_id}`, // No anchor for intro
            title: `${localTitle} - Introduction`,
            content: content.substring(0, firstHeaderMatch.index).trim(),
            anchor: ""
        });
        regex.lastIndex = firstHeaderMatch.index; // Reset to process first header
    } else if (!firstHeaderMatch) {
        // No headers, just one chunk
        chunks.push({
            id: article.article_id,
            title: localTitle,
            content: content,
            anchor: ""
        });
        return chunks;
    }

    while ((match = regex.exec(content)) !== null) {
        const headerLevel = match[1];
        const headerText = match[2];
        const anchor = slugify(headerText);

        // Find end of this section (start of next header or end of string)
        const startOfContent = match.index + match[0].length;
        const nextHeaderRegex = /^(#{2,3})\s+(.+)$/gm;
        nextHeaderRegex.lastIndex = startOfContent;
        const nextMatch = nextHeaderRegex.exec(content);

        const endOfContent = nextMatch ? nextMatch.index : content.length;
        const sectionContent = content.substring(startOfContent, endOfContent).trim();

        if (sectionContent.length > 20) { // Only index substantial chunks
            chunks.push({
                id: `${article.article_id}#${anchor}`,
                title: `${localTitle} - ${headerText}`,
                content: sectionContent,
                anchor: anchor
            });
        }
    }

    return chunks;
};

/**
 * Initialize the keyword engine and vector engine with data from the repository.
 * This ensures we can handle async data loading (e.g. from SQLite).
 */
const ensureEngineInitialized = async () => {
    if (keywordEngine && vectorEngineReady) return;

    log.info('Initializing engines...');
    const [redFlags, suggestions, articles] = await Promise.all([
        getRedFlagsCached(),
        getSuggestionsCached(),
        getArticlesCached(),
    ]);

    // Initialize KeywordEngine
    if (!keywordEngine) {
        const vocabulary = [
            // French
            ...redFlags.flatMap(rf => rf.keywords_fr ? rf.keywords_fr.split(',').map(k => k.trim()) : []),
            ...suggestions.flatMap(s => s.label_fr.split(' ')),
            ...articles.flatMap(a => a.title_fr.split(' ')),
            // Arabic / Tunisian Arabic
            ...articles.flatMap(a => [
                ...(a.title_ar ? a.title_ar.split(' ') : []),
                ...(a.title_tn ? a.title_tn.split(' ') : []),
            ]),
            ...suggestions.flatMap(s => [
                ...(s.label_ar ? (s.label_ar as string).split(' ') : []),
                ...(s.label_tn ? (s.label_tn as string).split(' ') : []),
            ]),
            // English — FIX-LANG-03
            ...articles.flatMap(a => [
                ...((a as any).title_en ? (a as any).title_en.split(' ') : []),
            ]),
            ...suggestions.flatMap(s => [
                ...((s as any).label_en ? ((s as any).label_en as string).split(' ') : []),
            ]),
            // CB1-FIX (SAFETY): include EN red-flag keywords in the engine vocabulary
            ...redFlags.flatMap(rf => (rf as any).keywords_en ? ((rf as any).keywords_en as string).split(',').map((k: string) => k.trim()) : []),
        ];
        keywordEngine = new KeywordEngine(vocabulary);
        log.success('KeywordEngine initialized');
    }

    // Initialize VectorEngine for semantic search with CHUNKING
    // Index French, Arabic AND Tunisian content so queries can match
    // FIX-A: Skip TN chunks if content is identical to AR (currently 80/80 articles)
    // When real Tunisian dialectal content is added, it will be auto-indexed
    if (!vectorEngineReady) {
        log.info('Chunking articles for precision multilingual search...');
        const frChunks = articles.flatMap(article => chunkArticle(article));
        const arChunks = articles.flatMap(article => chunkArticle(article, 'ar'));
        // Only index TN separately if it has genuinely distinct dialectal content
        const tnChunks = articles
            .filter(a => {
                const tn = a.content_markdown_tn || '';
                const ar = a.content_markdown_ar || '';
                return tn.length > 50 && tn !== ar; // Skip if TN is empty or copy of AR
            })
            .flatMap(article => chunkArticle(article, 'tn'));
        // FIX-LANG-02: Also index EN content for English users
        const enChunks = articles.flatMap(article => chunkArticle(article, 'en'));
        const documentsToIndex = [...frChunks, ...arChunks, ...tnChunks, ...enChunks];

        vectorEngine.indexDocuments(documentsToIndex);
        vectorEngineReady = true;
        log.success(`VectorEngine initialized with ${documentsToIndex.length} chunks (FR:${frChunks.length} AR:${arChunks.length} TN:${tnChunks.length} EN:${enChunks.length})`);
    }
};

// Suggestion chips whose label REPORTS the very symptom of their linked red flag (bleeding →
// antepartum haemorrhage, baby not moving, strong abdominal pain, violent headache, fever, vision
// problems, swollen face/hands/feet). Other chips keep a linked flag only as a related warning —
// "How to handle postpartum?" links to suicidal ideation — and must not raise an alert block on a
// tap. cs19 used to read "I feel bloated", which reports nothing; it now names the swelling of its
// pre-eclampsia flag in every language, so it escalates like the others. Which chip escalates is a
// clinical call: change it with review.
const CHIPS_REPORTING_LINKED_RED_FLAG = new Set(['cs06', 'cs07', 'cs08', 'cs09', 'cs13', 'cs14', 'cs19']);

/** The suggestion whose label (in any language) is exactly the message, i.e. a tapped chip. */
const findExactChip = (text: string, suggestions: ChatbotSuggestion[]): ChatbotSuggestion | undefined => {
    const typed = text.toLowerCase().trim();
    return suggestions.find(s =>
        [s.label_fr, s.label_ar, s.label_tn, s.label_en].some(l => !!l && l.toLowerCase() === typed));
};

// Words that carry no topic of their own. Once a negated symptom is removed from a message,
// a remainder made only of these ("I am…", "I have…") is not a question to retrieve on.
const SEMANTIC_FILLER_TOKENS = new Set([
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'having',
    'feel', 'feels', 'feeling', 'felt', 'get', 'got', 'do', 'does', 'did',
    'the', 'and', 'but', 'my', 'any', 'what', 'which', 'this', 'that', 'with', 'for', 'you', 'your',
    'ai', 'as', 'avons', 'avez', 'ont', 'eu', 'ressens', 'ressent', 'sens', 'sent', 'suis', 'est',
    'les', 'des', 'une', 'mon', 'mes', 'que', 'qui', 'pour', 'avec', 'mais',
    'لدي', 'عندي', 'أنا', 'انا', 'عندك',
]);

// "What foods to avoid?" — the chip, and the same question typed in fr / en / ar / tn.
const FOODS_TO_AVOID_CHIP = 'cs05';
const FOODS_TO_AVOID_LATIN = [
    // "manger" / "eat" alone are left out on purpose: "que manger pour éviter les crampes" or
    // "what can I eat to avoid nausea" ask for a remedy, not for the foods to avoid.
    /(^|[^a-z])(aliments?|nourriture|plats?)(?![a-z]).*(^|[^a-z])(eviter|interdits?|deconseilles?|proscrits?)(?![a-z])/,
    /(^|[^a-z])(eviter|interdits?|deconseilles?|proscrits?)(?![a-z]).*(^|[^a-z])(aliments?|nourriture|plats?)(?![a-z])/,
    /(^|[^a-z])(eviter|interdit) de manger|ne (dois|doit|peux|peut) pas manger/,
    /\bfoods?\b.*\b(avoid|forbidden|banned|unsafe|off-limits|not allowed)\b/,
    /\b(avoid|forbidden|banned|unsafe|off-limits)\b.*\bfoods?\b/,
    /\bavoid eating\b|\bshould(n't| not) eat\b/,
];
const FOODS_TO_AVOID_ARABIC = [
    /(أطعمة|اطعمة|طعام|الأكل|الاكل|ماكلة).*(تجنب|ممنوع|محظور)/,
    /(تجنب|ممنوع|محظور).*(أطعمة|اطعمة|طعام|الأكل|الاكل|ماكلة)/,
    // Tunisian "ما ناكولش" / "ما ناكولهاش" — "what I must not eat".
    /ما\s*ناكو?ل(ها)?ش/,
];
const isFoodsToAvoidQuestion = (text: string): boolean => {
    const lower = text.toLowerCase();
    // Accents are folded for the Latin patterns only: NFD would also split the hamza off
    // Arabic letters (أ → ا + ٔ) and break the Arabic ones.
    const latin = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return FOODS_TO_AVOID_LATIN.some(re => re.test(latin)) || FOODS_TO_AVOID_ARABIC.some(re => re.test(lower));
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1 };

/**
 * The foods the "Foods to avoid" screen marks as forbidden or to avoid, read from that
 * screen's own data so the two can never disagree, plus a link to the full list (which
 * also holds the foods to limit).
 */
const buildFoodsToAvoidResponse = async (suggestions: ChatbotSuggestion[]): Promise<ChatResponse> => {
    const foods = (forbiddenFoods as { severity: string }[])
        .filter(f => f.severity in SEVERITY_RANK)
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    const lines = foods.map(f => `• ${getLocalizedContent(f, 'name', i18n.language)}`);
    const chip = suggestions.find(s => s.suggestion_id === FOODS_TO_AVOID_CHIP);
    const articleIds = (chip?.linked_article_ids || '').split(',').map(id => id.trim()).filter(Boolean);
    const allArticles = await getArticlesCached();
    return {
        type: 'suggestion',
        message: `${i18n.t('common.chatResponse.foodsToAvoidIntro')}\n\n${lines.join('\n')}`,
        articles: allArticles.filter(a => articleIds.includes(a.article_id)),
        suggestions: chip ? [chip] : [],
        screenLink: 'ForbiddenFoods',
        matchScore: 100,
    };
};

// A question about one named food ("Puis-je manger du fromage ?") is answered from the same
// forbidden_foods data as the Foods-to-avoid screen, so the two can never disagree. It used to
// reach the semantic fallback, which offered an unrelated article as "the answer".
// Latin keywords are matched accent-folded on whole words (plural "s" allowed); Arabic ones
// as substrings.
const NAMED_FOOD_KEYWORDS: { ids: string[]; latin: string[]; arabic: string[] }[] = [
    { ids: ['raw_milk_cheese', 'feta_goat'], latin: ['fromage', 'cheese', 'camembert', 'brie', 'roquefort'], arabic: ['جبن', 'أجبان', 'اجبان', 'فرماج', 'فروماج'] },
    { ids: ['feta_goat'], latin: ['feta', 'chevre', 'goat cheese'], arabic: ['فيتا'] },
    { ids: ['alcohol'], latin: ['alcool', 'vin', 'biere', 'champagne', 'alcohol', 'wine', 'beer'], arabic: ['كحول', 'خمر', 'نبيذ', 'بيرة', 'بيرا'] },
    { ids: ['caffeine'], latin: ['cafe', 'cafeine', 'coffee', 'caffeine'], arabic: ['قهوة', 'كافيين'] },
    { ids: ['raw_fish'], latin: ['sushi', 'sashimi', 'poisson cru', 'raw fish'], arabic: ['سوشي', 'ساشيمي'] },
    { ids: ['smoked_fish'], latin: ['saumon fume', 'poisson fume', 'truite fumee', 'smoked salmon', 'smoked fish'], arabic: ['سلمون مدخن', 'سمك مدخن', 'حوت مدخن'] },
    { ids: ['high_mercury_fish'], latin: ['thon', 'espadon', 'requin', 'marlin', 'tuna', 'swordfish', 'shark'], arabic: ['تونة', 'تون', 'أبو سيف'] },
    { ids: ['raw_shellfish'], latin: ['huitre', 'moule', 'oyster', 'mussel', 'fruits de mer', 'shellfish'], arabic: ['محار', 'بلح البحر'] },
    { ids: ['raw_eggs'], latin: ['oeuf', 'egg'], arabic: ['بيض', 'بيضة'] },
    { ids: ['homemade_mayo'], latin: ['mayonnaise', 'mayo', 'tiramisu'], arabic: ['مايونيز'] },
    { ids: ['raw_meat'], latin: ['tartare', 'carpaccio', 'viande crue', 'viande saignante', 'raw meat', 'rare steak'], arabic: ['لحم نيئ', 'لحم ني'] },
    { ids: ['charcuterie'], latin: ['charcuterie', 'jambon', 'saucisson', 'salami', 'ham', 'deli meat'], arabic: ['مرتديلا', 'سلامي', 'جامبون'] },
    { ids: ['foie_gras'], latin: ['foie', 'liver'], arabic: ['كبد'] },
    { ids: ['herbal_teas'], latin: ['tisane', 'herbal tea'], arabic: ['شاي الأعشاب', 'تيزان'] },
    { ids: ['raw_sprouts'], latin: ['germee', 'sprout'], arabic: ['براعم'] },
];
const EAT_OR_DRINK_CUE = /(^|[^a-z])(mang\w*|boi\w*|consomm\w*|autoris\w*|risque\w*|dangereu\w*|combien|how much|how many|eat\w*|ate|drink\w*|safe|allowed|risk\w*|ok)(?![a-z])/;
const EAT_OR_DRINK_CUE_ARABIC = /(ناكل|نأكل|أكل|اكل|آكل|أكلت|شرب|نشرب|أشرب|اشرب|يجوز|ممكن|نجم|نقدر|مسموح|خطر|ضرر)/;
const findNamedFoods = (text: string): { id: string; severity: string }[] => {
    const lower = text.toLowerCase();
    const latin = lower.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');
    const cued = EAT_OR_DRINK_CUE.test(latin) || EAT_OR_DRINK_CUE_ARABIC.test(lower);
    if (!cued) return [];
    const ids: string[] = [];
    for (const entry of NAMED_FOOD_KEYWORDS) {
        const hit = entry.latin.some(kw => new RegExp(`(^|[^a-z])${kw}s?(?![a-z])`).test(latin))
            || entry.arabic.some(kw => lower.includes(kw));
        if (hit) for (const id of entry.ids) if (!ids.includes(id)) ids.push(id);
    }
    return (forbiddenFoods as { id: string; severity: string }[]).filter(f => ids.includes(f.id));
};

const buildNamedFoodResponse = (foods: { id: string; severity: string }[]): ChatResponse => {
    const blocks = foods.slice(0, 3).map(f => {
        const alt = getLocalizedContent(f, 'alternative', i18n.language);
        return [
            `${(f as any).icon ?? '•'} ${getLocalizedContent(f, 'name', i18n.language)}`,
            getLocalizedContent(f, 'details', i18n.language),
            alt ? `→ ${alt}` : '',
        ].filter(Boolean).join('\n');
    });
    return {
        type: 'suggestion',
        message: `${i18n.t('common.chatResponse.foodAnswerIntro')}\n\n${blocks.join('\n\n')}`,
        articles: [],
        suggestions: [],
        screenLink: 'ForbiddenFoods',
        matchScore: 100,
    };
};

const buildRedFlagResponse = async (topFlag: RedFlag, matchScore: number): Promise<ChatResponse> => {
    // Fetch linked articles — use cache
    const allArticles = await getArticlesCached();
    const linkedArticles = allArticles
        .filter(a => topFlag.linked_articles_ids.includes(a.article_id))
        .slice(0, 3);

    // Build a more helpful red flag response
    let redFlagMessage = getLocalizedContent(topFlag, 'standard_message', i18n.language) || i18n.t('common.chatResponse.redFlagDefault');

    // Add context based on severity. An emergency message already says to go or call now, and
    // the call button sits right under it: a closing "don't hesitate to contact your doctor…
    // if needed" only softened that, so emergencies end on their own instruction.
    if (topFlag.severity?.toLowerCase() === 'emergency' || topFlag.severity?.toLowerCase() === 'critique') {
        redFlagMessage = `🚨 ${redFlagMessage}`;
    } else if (topFlag.severity?.toLowerCase() === 'urgent_consult' || topFlag.severity?.toLowerCase() === 'élevé') {
        // The reviewed standard message already carries the urgency, and the call action under
        // it says "contact a professional now". A generic "discuss it with your midwife" tacked
        // on here softened it and, for swelling (a pre-eclampsia sign), read three ways at once.
        redFlagMessage = `⚠️ ${redFlagMessage}`;
    } else {
        redFlagMessage = `⚠️ ${redFlagMessage}\n\n${i18n.t('common.chatResponse.redFlagModerate')}`;
    }

    return {
        type: 'red_flag',
        message: redFlagMessage,
        redFlag: topFlag,
        articles: linkedArticles,
        matchScore,
    };
};

/**
 * Enhanced Chatbot Service (Phase 1)
 * Uses KeywordEngine for fuzzy matching and negation handling.
 */
export const _analyzeMessage = async (text: string): Promise<ChatResponse> => {
    await ensureEngineInitialized();
    if (!keywordEngine) throw new Error('Failed to initialize KeywordEngine');

    // U-FIX-2 (RGPD): never log message verbatim — could be PHI / health-sensitive.
    // Log length only so we still observe traffic shape without storing patient text.
    log.info(`📩 User message received (length=${text.length})`);

    // 1. Process Query (Fuzzy Match + Negation + Synonyms)
    const { positive, negative } = keywordEngine.processQuery(text);
    log.debug(`🔍 ${positive.length} positive / ${negative.length} negative tokens extracted`);

    const textIsArabic = isArabicScript(text);

    // U-FIX-1 (SAFETY): For Arabic / Tunisian scripts the latin KeywordEngine often
    // produces 0 positive tokens, which previously bypassed the red-flag matcher
    // entirely and silently dropped emergencies. We now match the raw text directly
    // against keywords_ar / keywords_tn (substring) for Arabic input, in parallel
    // with the standard token-based path for latin/Arabizi.
    const normalizedText = text.toLowerCase().trim();

    // CB-R3-01 FIX (SAFETY — generic-keyword over-escalation): a handful of red-flag
    // keywords are generic standalone words (color/substance/sensation) whose mere presence
    // in a benign sentence previously triggered a full EMERGENCY (red_flag + call button):
    //   "I painted the nursery red" / "is red wine ok"  → red    → hemorrhage emergency
    //   "the sky is so bright"                            → bright → hemorrhage emergency
    //   "I gave blood at the clinic"                      → blood  → hemorrhage emergency
    //   "I have mild back pain"                           → pain   → severe-cramps urgent
    //   "j'ai mangé du foie de veau"                      → foie   → HELLP emergency
    // ROOT: a single EXACT token match (matchCount>0) escalated with no co-occurrence/context.
    // FIX: a GENERIC single-token keyword only COUNTS toward a flag when it is corroborated —
    // i.e. the message ALSO contains an intensity/quantity word (heavy/a lot/beaucoup/abondant…
    // including blood-loss verbs perds/losing) OR a SECOND distinct generic flag concept
    // (e.g. "douleur"+"foie" → HELLP). A lone generic word no longer escalates by itself.
    // Strong multi-word literal phrases ("heavy bleeding"/"saignements"→"sang"+intensifier,
    // "can't breathe") and SPECIFIC clinical tokens (hémorragie, nzif, suicidal, fever,
    // tasdiya/ras youja3…) remain single-hit triggers and are UNAFFECTED. Real single-symptom
    // emergencies keep escalating because they carry a quantity/intensity word
    // ("je perds beaucoup de sang", "I am bleeding a lot") or a specific token.
    // CB-R8-01: gating now uses the module-level SYNONYM-CLOSED set (GENERIC_FLAG_TOKENS),
    // so a lone generic SYNONYM (e.g. the 'douleur' arabizi variant 'wji3a'/'وجيعة' used as a
    // single-word keyword of 'crampes sévères') is gated exactly like its base concept.
    // Intensity / quantity / blood-loss corroborators (whole tokens, post-normalization).
    const INTENSIFIER_TOKENS = new Set([
        // EN
        'heavy', 'heavily', 'severe', 'severely', 'lot', 'lots', 'much', 'sudden', 'suddenly',
        'profuse', 'gushing', 'soaking', 'constant', 'extreme', 'extremely', 'losing', 'lose', 'lost',
        // FR
        'beaucoup', 'abondant', 'abondants', 'abondante', 'abondantes', 'sévère', 'sévères',
        'violent', 'violents', 'violente', 'violentes', 'gros', 'grosse', 'important', 'importante',
        'soudain', 'soudaine', 'fort', 'forte', 'énorme', 'énormément', 'perds', 'perd', 'perdre', 'perdu',
    ]);
    // Which generic flag CONCEPTS actually appear in this message, and is there an intensifier?
    // CB-R8-01: collapse synonym variants to their canonical concept so e.g. {douleur, mal, wji3a}
    // (one pain concept, three synonym tokens) counts as ONE, not three — otherwise the synonym
    // closure would auto-satisfy the ≥2 rule and defeat the gate.
    const presentGenericConcepts = new Set(
        positive.filter(w => GENERIC_FLAG_TOKENS.has(w)).map(tokenToCanonicalConcept)
    );
    const hasIntensifier = positive.some(w => INTENSIFIER_TOKENS.has(w));
    // A generic single-token match counts only when corroborated: an intensity/quantity word
    // is present, OR at least two distinct generic flag CONCEPTS co-occur (e.g. douleur+foie).
    const genericTokensCorroborated = hasIntensifier || presentGenericConcepts.size >= 2;

    // CB-R5-03 FIX (SAFETY — UNDER-escalation, reduced fetal movement). Natural phrasings of
    // "my baby isn't moving anymore" carry a negation/reduction cue ("not"/"no longer"/"ne…plus"
    // /"ne…pas"/"stopped") that pushes the baby + movement tokens into the NEGATIVE bucket, so the
    // céphalée-style token path saw them as negated and the only escalators left were rigid exact
    // phrases ("my baby stopped moving") + the AR substring. Reduced fetal movement is a strong
    // clinical concept that MUST survive negation: detect a baby concept co-occurring with a
    // movement concept AND a reduction/negation cue, then FORCE the fetal-movements red flag
    // below. Concept tokens are read from BOTH positive and negative (negation moved them), plus
    // the raw normalized text. CRITICAL: a reduction/negation cue is REQUIRED, so benign
    // "baby moves a lot" / "bébé bouge beaucoup" (no cue) stay NON-escalating.
    const allConceptTokens = [...positive, ...negative];
    const BABY_TOKENS = new Set([
        'baby', 'bébé', 'bebe', 'foetus', 'fœtus', 'bibi', 'bebi', 'bb',
    ]);
    const MOVEMENT_TOKENS = new Set([
        // EN (not in the FR-centric SYNONYMS map, so they stay as raw tokens)
        'move', 'moves', 'moving', 'moved', 'movement', 'movements', 'kick', 'kicks', 'kicking', 'kicked',
        // FR + arabizi (also appear via synonym expansion of 'mouvement')
        'bouge', 'bouger', 'bouges', 'bougé', 'bougeait', 'mouvement', 'mouvements', 'coup', 'coups', 'haraka',
    ]);
    // Movement NOUNS (kick/movement/mouvement…) inherently denote FETAL movement in this app, so
    // "I no longer feel movements" / "je ne sens plus de mouvements" needs no explicit baby word.
    // Bare verbs (move/moving/bouge) still require an explicit baby concept, so a user statement
    // about themselves ("I don't want to move") cannot trip the fetal-movement flag.
    const MOVEMENT_NOUN_TOKENS = new Set([
        'movement', 'movements', 'kick', 'kicks', 'mouvement', 'mouvements',
    ]);
    // Reduction / negation cues that, next to a baby+movement concept, signal DECREASED movement.
    // Whole-word match on the raw normalized text (negation already consumed these in the tokenizer).
    const RFM_REDUCTION_CUES = [
        // EN
        'not', 'no', "n't", 'dont', "don't", 'never', 'anymore', 'stopped', 'stop', 'stops',
        'less', 'fewer', 'reduced', 'decreased', "hasn't", "haven't", "isn't", "doesn't",
        // FR
        'ne', 'pas', 'plus', 'moins', 'arrêté', 'arrete', 'arrêt', 'diminué', 'diminue', 'réduit',
    ];
    const hasBabyConcept = allConceptTokens.some(w => BABY_TOKENS.has(w))
        || /\b(baby|b[ée]b[ée]|bebe)\b/.test(normalizedText);
    const hasMovementConcept = allConceptTokens.some(w => MOVEMENT_TOKENS.has(w))
        || /\b(mov(e|es|ed|ing|ement|ements)|kick(s|ed|ing)?|boug(e|er|es|é)|mouvements?)\b/.test(normalizedText);
    const hasMovementNoun = allConceptTokens.some(w => MOVEMENT_NOUN_TOKENS.has(w))
        || /\b(mov(ement|ements)|kicks?|mouvements?)\b/.test(normalizedText);
    const hasReductionCue = RFM_REDUCTION_CUES.some(cue =>
        new RegExp(`(^|[^a-zà-ÿ])${cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zà-ÿ]|$)`, 'i').test(normalizedText));

    // CB-R7-01/02 FIX (SAFETY — over-escalation, negation/reassurance bypass). The two
    // forced-concept detectors below (reducedFetalMovement, ruptureOfMembranes) push their red flag
    // onto matchedFlags AFTER the per-flag negation guard runs, so a NEGATED or REASSURING statement
    // previously over-escalated:
    //   "baby is moving normally, no concerns" / "bébé bouge bien pas de souci" → fetal-movement URGENT
    //   "my water has not broken yet" / "je n'ai pas perdu les eaux"            → liquide-chaud URGENT
    // The bare-negation tokens here (no/not/pas/ne…) live in RFM_REDUCTION_CUES because a GENUINE
    // reduced-movement report uses them ("baby has not moved", "ne bouge pas"). The reliable signal
    // that a statement is NOT an emergency is a co-occurring REASSURANCE token (normally/fine/well/
    // no concerns/bien/pas de souci/ça va) — no genuine reduced-movement or waters-broken report
    // carries one. Reuse the KeywordEngine negation list (kept in sync) for the ROM guard below.
    const NEGATION_CUES = [
        // French
        'ne', 'pas', 'aucun', 'aucune', 'sans', 'ni', 'jamais', 'guère', 'plus',
        // English
        'not', 'no', 'without', 'never', 'dont', "don't", 'cannot', "can't", 'cant', 'neither',
        "n't", "hasn't", "haven't", "isn't", "doesn't", "didn't",
        // Arabic standard + Tunisian dialect
        'لا', 'ليس', 'ليست', 'لم', 'لن', 'غير', 'مش', 'msh', 'manish', 'manach', 'ma3andish',
    ];
    const REASSURANCE_TOKENS = [
        // EN
        'normally', 'normal', 'fine', 'well', 'good', 'okay', 'concern', 'concerns',
        // FR
        'normalement', 'bien', 'souci', 'soucis',
    ];
    const hasReassurance =
        REASSURANCE_TOKENS.some(t =>
            new RegExp(`(^|[^a-zà-ÿ])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zà-ÿ]|$)`, 'i').test(normalizedText))
        || /\b(no\s+concerns?|pas\s+de\s+souci|ça\s+va|ca\s+va|tout\s+va\s+bien|all\s+good)\b/i.test(normalizedText);

    // Fire when a reduction/negation cue accompanies EITHER an explicit baby+movement pairing OR a
    // (fetal) movement NOUN on its own. The cue is always required → benign "baby moves a lot" /
    // "bébé bouge beaucoup" / "I feel fewer movements" needs the cue but no false-positive cue.
    // CB-R7-01: ABORT when a reassurance token co-occurs — "baby is moving normally, no concerns" /
    // "bébé bouge bien pas de souci" use a bare negation but are explicitly reassuring, so they must
    // NOT escalate. Genuine reports ("baby not moving anymore", "ne bouge plus", "has not moved all
    // day") carry no reassurance token and still fire.
    const reducedFetalMovement = hasReductionCue && !hasReassurance
        && ((hasBabyConcept && hasMovementConcept) || hasMovementNoun);

    // CB-R5-03 FIX (SAFETY — over-escalation companion): the fetal-movement flag also has GENERIC
    // single-token keywords ("movements"/"mouvements"/"faibles") that, on their own, escalated
    // POSITIVE phrasings like "baby movements are strong" / "fetal movements are normal" to an
    // URGENT call button (cry-wolf). Gate those bare tokens like 'weak' below: they count only in a
    // reduction context — a reduction/negation cue OR a weakness descriptor ('weak'/'faible'). True
    // reduced-movement reports still escalate (forced path above for cue phrasings; the gated 'weak'
    // keyword for "fetal movements are weak"; multiword "(baby) stopped moving" strong-matches).
    const FETAL_GENERIC_TOKENS = new Set(['movements', 'mouvements', 'faibles', 'faible']);
    const hasWeaknessDescriptor = /\b(weak|faibles?)\b/.test(normalizedText);
    const fetalReductionContext = hasReductionCue || hasWeaknessDescriptor;

    // CB-R6-01 FIX (SAFETY — UNDER-escalation, rupture of membranes). The universal layperson
    // ways of reporting waters breaking ("my water broke", "I'm leaking fluid", "je perds les
    // eaux", "la poche des eaux a rompu") did NOT escalate: the 'liquide chaud' flag only carried
    // the clinical phrasing "liquide chaud,écoulement,vaginal", and the everyday terms tokenized
    // to harmless words (water/broke; perte/eau→hydratation synonyms) that matched NO flag — so the
    // bot returned a benign info card. Worse, two incidental MIS-routes appeared: "perte des eaux"
    // hit the hemorrhage EMERGENCY via the generic token "perte", and "j'ai un liquide chaud"
    // hit the fever flag via the "chaud"→fièvre synonym. Fix: (1) canonical multi-word ROM
    // keywords were added to the flag in all 4 langs (strong-match, negation-surviving); (2) a
    // negation-aware ROM CONCEPT detector below FORCES the 'liquide chaud' flag and (3) SUPPRESSES
    // the incidental hemorrhage/fever matches so the correct flag wins regardless of severity order.
    // The concept fires on a FLUID/water/membrane concept co-occurring with a BREAK/leak/loss cue,
    // or an explicit ROM phrase — so benign "écoulement nasal" (nasal, no break/water cue) and
    // "I drank a warm tea" (no break/leak cue) stay NON-escalating.
    const ROM_FLUID_RE = /\b(water|waters|amniotic\s+fluid|fluid|membranes?|eaux|poche\s+des\s+eaux|كيس\s*الماء|ماء\s*الولادة)\b/i;
    const ROM_BREAK_RE = /\b(broke|broken|break|breaking|burst|bursting|ruptured?|rupturing|leak|leaks|leaking|leaked|gush|gushing|perte\s+des\s+eaux|perds\s+les\s+eaux|perdu\s+les\s+eaux|perdre\s+les\s+eaux|rompu|rompue|rupture|انفجار|تمزق|نزول|نزل|تقصف|تقصفت)\b/i;
    // ROM_EXPLICIT also includes the flag's own canonical clinical sign — a warm fluid /
    // "liquide chaud" — so that phrasing routes to the ROM/discharge flag instead of the fever
    // flag it currently collides with via the "chaud"→fièvre synonym. These are specific phrases
    // (not lone generic words), so they cannot over-fire on benign input like "a warm tea".
    const ROM_EXPLICIT_RE = /\b(perte\s+des\s+eaux|poche\s+des\s+eaux|rupture\s+des\s+membranes|membranes?\s+ruptured|amniotic\s+fluid|liquide\s+chaud|warm\s+liquid|سائل\s*دافئ|انفجار\s*كيس\s*الماء|تمزق\s*كيس\s*الماء|نزول\s*ماء\s*الولادة|تقصف\s*كيس\s*الماء)\b/i;
    // CB-R7-02 FIX (SAFETY — over-escalation, negation bypass). A NEGATED waters-report —
    // "my water has not broken yet" / "je n'ai pas perdu les eaux" — escalated two ways: it FORCED
    // the ROM concept past the negation guard, AND the canonical multi-word ROM keywords
    // (perte/perdu les eaux, poche des eaux, water broke…) strong-matched, which by design survives
    // token negation. No GENUINE waters-broken report scopes a negation onto the ROM cue (it is an
    // affirmative event), so detect a negation that SCOPES a ROM cue — a negation token within a
    // short window BEFORE a break/fluid term ("not broken", "has not broken", "pas perdu",
    // "pas de perte"…) — and abort ROM in that case. Scoped (not message-wide) so a genuine
    // "my water broke, no pain" still escalates (the "no" doesn't scope the ROM verb).
    const ROM_CUE_FRAG = 'broke|broken|break|breaking|burst|ruptur\\w*|leak\\w*|gush\\w*|perdu|perdre|perds|perte|rompu\\w*|eaux|water\\w*|fluid|membran\\w*';
    const NEG_FRAG = "not|no|n'?t|pas|jamais|aucun\\w*|sans|never|don'?t|doesn'?t|didn'?t|hasn'?t|haven'?t|isn'?t|cannot|can'?t";
    // ReDoS FIX (SAFETY-CRITICAL). The separator class used to be `[^a-zà-ÿ]`, which
    // excludes only letters and therefore OVERLAPS `\w` on digits and `_`. Inside
    // `([^a-zà-ÿ]+\w+){0,3}` that ambiguity makes the number of ways to split the
    // input explode, so a non-matching message backtracks exponentially:
    // measured on this exact pattern, " not " + "_"*60 took 1.6 s, *80 took 12.5 s
    // and *100 took 63 s of fully blocked JS thread — an iOS watchdog kill, on the
    // obstetric red-flag path of all places. `MAX_INPUT_LENGTH = 500` is far above
    // the danger threshold. Excluding digits and `_` from the separator makes the
    // two classes disjoint, so each position has exactly one parse and the match is
    // linear. The set of accepted strings is unchanged: a separator is meant to be
    // whitespace/punctuation between words, never part of a word.
    const SEP = '[^a-zà-ÿ0-9_]';
    const romNegated = new RegExp(
        `(^|${SEP})(${NEG_FRAG})(${SEP}+\\w+){0,3}${SEP}+(${ROM_CUE_FRAG})\\b`, 'i'
    ).test(normalizedText);
    const ruptureOfMembranes =
        !romNegated
        && (ROM_EXPLICIT_RE.test(normalizedText)
            || (ROM_FLUID_RE.test(normalizedText) && ROM_BREAK_RE.test(normalizedText)));

    // CB-R7-04 FIX (SAFETY — over-escalation, FR chaud→fièvre on a warm drink/food). The FR
    // synonym map expands 'chaud(e)' → fièvre (and its arabizi température synonyms s5ana/skhana/…),
    // so "j'ai bu une tisane chaude" produced fever tokens that matched the 'température élevée'
    // flag → URGENT (the EN "warm tea" analogue was already safe because EN 'warm' is not a fever
    // synonym). Detect a warm drink/food context (a beverage/food word next to chaud/chaude) and,
    // when the ONLY fever signal is that warmth word — i.e. the user did NOT type an explicit fever
    // lexeme (fièvre/fever/température/حرارة/حمى/سخانة…) nor a febrile temperature in degrees —
    // suppress the fever flag below. Mirrors the FOOD_DRINK de-prioritisation already used for
    // symptom chips. Real fever ("j'ai de la fièvre", "forte fièvre", "40 de fièvre", "high fever")
    // carries an explicit lexeme/degree and still escalates.
    // Accent-aware whole-word test (JS \b breaks around à-ÿ — "café"/"thé" end in a non-\w char,
    // so \bcafé\b never matches). Mirror the boundary convention used by hasReductionCue above.
    const accentWord = (alts: string, text: string): boolean =>
        new RegExp(`(^|[^a-zà-ÿ])(${alts})([^a-zà-ÿ]|$)`, 'i').test(text);
    const hasWarmDrinkFood = accentWord('tisane|infusion|th[ée]|boisson|caf[ée]|soupe|lait|bouillon|gr?og|chocolat|cha[iy]|bu|boire|bois|boi[ts]|sirop', normalizedText);
    const hasWarmDescriptor = accentWord('chaud|chaude|chauds|chaudes|warm|hot|ti[èe]de', normalizedText);
    const hasExplicitFeverLexeme =
        accentWord('fi[èe]vre|fever|temp[ée]rature|temperature|febrile|f[ée]brile|s5ana|skhana|skhona|s7ana|s4ana|s5oun|te7rak|7ama', normalizedText)
        || /حمى|سخانة|حرارة/.test(normalizedText)
        // a febrile temperature in degrees ("39 °C", "39 degrés", "39 de fièvre")
        || /\b(3[7-9]|4[0-2])([.,]\d)?\s*(°|degr|de\s+fi[èe]vre|de\s+temp)/i.test(normalizedText);
    const warmDrinkNotFever = hasWarmDrinkFood && hasWarmDescriptor && !hasExplicitFeverLexeme;

    // CB-R7-03 FIX (SAFETY — over-escalation, Arabic substring + ungated generics). The Arabic
    // matcher (Path B below) did `normalizedText.includes(keyword)` and set matchCount++ AND
    // strongMatch=true UNCONDITIONALLY, bypassing the generic-token gating used for latin keywords.
    // Two problems followed:
    //   (1) The 2-char blood token "دم" is a SUBSTRING of the benign "القادم" (next), so
    //       "متى موعد السونار القادم" (when is my next ultrasound) fired a hemorrhage EMERGENCY.
    //   (2) A lone generic AR word (دم/أحمر/ألم…) escalated with no corroboration, mirroring the
    //       over-escalation the latin GENERIC_FLAG_TOKENS gating already prevents.
    // FIX (a): match single-word AR keywords on WORD BOUNDARIES — tokenize normalizedText on
    // whitespace/punctuation and match a keyword to a WHOLE token, allowing only leading Arabic
    // CLITICS (the definite article ال + the proclitics و/ف/ب/ك/ل) to be stripped. This is a PREFIX
    // operation, so "القادم" (= ال+قادم) never reduces to the blood token "دم", while "الانتحار"
    // (= ال+انتحار) correctly matches the keyword "انتحار". Substring-inside-a-word is eliminated.
    // FIX (b): gate generic AR tokens like the latin path — a lone generic counts only when
    // corroborated by an AR intensifier (كثير/بغزارة/قوي/فجأة/شديد…) or a 2nd distinct generic
    // concept, and a lone uncorroborated generic NEVER sets strongMatch. Specific AR tokens
    // (نزيف/انتحار/تشنجات/إغماء/صداع…) remain single-hit triggers, unaffected.
    const arabicWordTokens = textIsArabic
        ? normalizedText.split(/[\s.,;:!?()«»"'\-،؛؟·]+/).filter(Boolean)
        : [];
    // Strip leading Arabic clitics (longest first) to expose the lexical stem of each token.
    const AR_CLITICS = ['وبال', 'فبال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'فلل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];
    const stripArClitic = (tok: string): string => {
        for (const c of AR_CLITICS) {
            if (tok.length > c.length + 1 && tok.startsWith(c)) return tok.slice(c.length);
        }
        return tok;
    };
    // For each token keep BOTH its raw form and its clitic-stripped stem; a keyword matches if it
    // equals either. (We never strip down to a fragment of a longer root — stripping is prefix-only.)
    const arabicTokenForms = new Set<string>();
    for (const tok of arabicWordTokens) {
        arabicTokenForms.add(tok);
        arabicTokenForms.add(stripArClitic(tok));
    }
    const arTokenMatchesKeyword = (keyword: string): boolean => arabicTokenForms.has(keyword);
    // Generic AR tokens: colour / substance / sensation / food words that are benign on their own
    // (parallel to the latin GENERIC_FLAG_TOKENS). Specific clinical AR tokens are intentionally NOT
    // listed so they keep firing on a single hit.
    // CB-R8-01: also fold in any Arabic-script SYNONYM of a base generic concept (e.g. 'وجيعة',
    // a 'douleur' synonym) so the native-AR path gates them identically to the latin path. The
    // module-level GENERIC_FLAG_TOKENS already carries every synonym-reachable form; we union its
    // Arabic-script members here. Specific clinical AR tokens are NOT in that closure, so they keep
    // firing on a single hit.
    const GENERIC_AR_TOKENS = new Set([
        'دم',      // blood
        'أحمر',    // red
        'احمر',
        'فاتح',    // bright / light-coloured
        'ألم',     // pain
        'الم',
        'فقدان',   // loss
        'كبد',     // liver (food)
        'كبدي',    // hepatic
        'حركات',   // movements
        'حركة',    // movement
        'ضعيفة',   // weak
        // Arabic-script generic synonyms reached through KeywordEngine.SYNONYMS (douleur→وجيعة, …)
        ...[...GENERIC_FLAG_TOKENS].filter(t => /[؀-ۿ]/.test(t)),
    ]);
    // AR intensity / quantity corroborators (parallel to INTENSIFIER_TOKENS).
    const AR_INTENSIFIER_RE = /(كثير|بغزارة|غزير|غزيرة|قوي|قوية|شديد|شديدة|فجأة|مفاجئ|كتير|برشة|بزاف|كبير|كبيرة|نازف|ينزف)/;
    const hasArIntensifier = AR_INTENSIFIER_RE.test(normalizedText);
    // CB-R8-01: collapse AR generic synonym variants to their canonical concept too, so a single
    // concept appearing as several synonym forms doesn't auto-satisfy the ≥2-concepts rule.
    const presentGenericArConcepts = new Set(
        [...arabicTokenForms].filter(w => GENERIC_AR_TOKENS.has(w)).map(tokenToCanonicalConcept)
    );
    const arGenericCorroborated = hasArIntensifier || presentGenericArConcepts.size >= 2;

    // W6 #2 (SAFETY — scoped AR/TN over-escalation guard). Arabic Path B set strongMatch
    // UNCONDITIONALLY, so a NEGATED specific symptom ("ما عنديش نزيف" = I do NOT have bleeding)
    // still fired an EMERGENCY (decision below only applies negation when !strongMatch). Detect a
    // negation lexeme within the 3 tokens BEFORE the matched token (scoped, like romNegated) so the
    // negated specific token neither strong-matches nor counts, and feeds the negation guard.
    // SCOPED hard: callers gate it on `!GENERIC_AR_TOKENS.has(keyword)` so it NEVER touches a generic
    // like حركة 'movement', where ABSENCE is the emergency ("لا أشعر بحركة الجنين" must still escalate).
    const AR_NEG_WORDS = new Set([
        'لا', 'ما', 'ليس', 'ليست', 'لست', 'لسنا', 'لم', 'لن', 'مش', 'موش', 'مهوش',
        'بدون', 'دون', 'غير', 'معنديش', 'ماعنديش', 'منيش', 'مانيش', 'ماعندناش',
    ]);
    const isArNegWord = (w: string): boolean => {
        if (!w) return false;
        const s = stripArClitic(w);
        return AR_NEG_WORDS.has(w) || AR_NEG_WORDS.has(s) || /^ما.+ش$/.test(w) || /^ما.+ش$/.test(s);
    };
    const arTokenNegated = (keyword: string): boolean => {
        for (let i = 0; i < arabicWordTokens.length; i++) {
            const tk = arabicWordTokens[i];
            if (tk === keyword || stripArClitic(tk) === keyword) {
                for (let j = Math.max(0, i - 3); j < i; j++) {
                    if (isArNegWord(arabicWordTokens[j])) return true;
                }
            }
        }
        return false;
    };

    // 2. Check Red Flags (Critical) — use cache
    const redFlags = await getRedFlagsCached();
    const suggestions = await getSuggestionsCached();

    // A tapped chip (or its exact label typed) whose symptom IS its linked red flag gets that
    // flag's full triage response — the same alert block + call button a typed report gets — in
    // every language, because the chip's intent does not depend on the locale it is shown in.
    const exactChip = findExactChip(text, suggestions);
    if (exactChip && CHIPS_REPORTING_LINKED_RED_FLAG.has(exactChip.suggestion_id)) {
        const chipFlagId = (exactChip.linked_red_flag_ids || '').split(',')[0].trim();
        const chipFlag = redFlags.find(f => f.red_flag_id === chipFlagId);
        if (chipFlag) return buildRedFlagResponse(chipFlag, 100);
    }
    const matchedFlags: { flag: RedFlag; severityScore: number; matchCount: number }[] = [];

    for (const flag of redFlags) {
        const keywordsFr = flag.keywords_fr ? flag.keywords_fr.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [];
        const keywordsAr = flag.keywords_ar ? flag.keywords_ar.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [];
        const keywordsTn = flag.keywords_tn ? flag.keywords_tn.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [];
        // CB1-FIX (SAFETY): also include English keywords so EN-speaking users
        // trigger red flags. Previously omitted → emergencies silently dropped for EN.
        const keywordsEn = flag.keywords_en ? flag.keywords_en.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [];

        const allKeywords = [...keywordsFr, ...keywordsAr, ...keywordsTn, ...keywordsEn];

        let matchCount = 0;
        let negatedCount = 0;
        // CB3-FIX (SAFETY): a "strong" match = the literal danger phrase appears in the text
        // (multi-word keyword, or Arabic-script substring). Token-level negation must NOT cancel
        // a strong match — the Arabic flag keyword "لا أشعر بالطفل" ("I no longer feel the baby")
        // begins with the negation word "لا", which previously self-cancelled the emergency.
        let strongMatch = false;

        allKeywords.forEach(keyword => {
            // CB2-FIX (SAFETY): multi-word keywords ("kill myself", "loss of consciousness",
            // "heavy bleeding", "can't keep anything down") match ONLY as a full-phrase
            // substring of the raw text. The previous token path (`keyword.includes(word)`)
            // let a single generic token — "myself", "want", "loss", "down" — satisfy a
            // multi-word emergency keyword, escalating benign input (e.g. a nutrition
            // question matched "shortness of breath"/eclampsia). Single-word keywords keep
            // the fuzzy-friendly token path.
            const isMultiword = keyword.includes(' ');
            if (isMultiword) {
                if (normalizedText.includes(keyword)) {
                    matchCount++;
                    strongMatch = true;
                }
            } else {
                // Path A: token-based (latin/Arabizi/normalized).
                // CB-NEW-01-FIX (SAFETY): single-word keywords now require EXACT token equality
                // (or whole-word membership inside a multi-token synonym phrase), NOT substring.
                // The previous `keyword.includes(word)` substring path let a benign token be a
                // substring of a danger keyword — e.g. the synonym "hydratation" (expanded from
                // "boire"/"eau") is a substring of the red-flag keyword "déshydratation", so
                // "puis-je boire de l'eau ?" falsely escalated to the severe-vomiting flag.
                // Typo-tolerance is already handled upstream in KeywordEngine (Levenshtein
                // correction + synonym expansion produce canonical tokens), so exact equality
                // here is sufficient and removes the cross-word substring false positives.
                // (Multi-token synonym phrases like "بقع أمام العينين" / "shreb ma" still match a
                // single-word keyword that appears as one of their whole words.)
                if (positive.some(word =>
                        word === keyword
                        || (word.includes(' ') && word.split(/\s+/).includes(keyword)))) {
                    // CB-R3-01 FIX (SAFETY): a GENERIC keyword (red/blood/bright/sang/foie/pain/
                    // douleur/loss…) only counts when corroborated by an intensity/quantity word
                    // or a second distinct generic concept. This prevents benign sentences that
                    // merely contain the word ("I painted the nursery red", "j'ai mangé du foie de
                    // veau") from escalating, while keeping real reports ("beaucoup de sang",
                    // "bleeding a lot") and all specific clinical tokens as triggers.
                    // CB-R5-02 FIX (SAFETY — over-escalation): 'weak' is a single-token keyword of
                    // the fetal-distress flag, but the everyday word 'week' fuzzy-corrects to it
                    // ("see you next week" → fetal-distress URGENT). Beyond the FuzzyMatcher
                    // allow-list (which protects week/weeks from correction), gate a LONE 'weak' so
                    // it only counts with a corroborating baby/movement concept; real reports
                    // ("my baby is weak", "fetal movements are weak") keep escalating.
                    // CB-R8-01: a keyword is GENERIC if it is in the latin synonym-closed set OR the
                    // AR generic set — for Arabic-script input both Path A (raw AR token in positive[])
                    // and Path B can reach the same keyword, so Path A must apply the SAME gate to AR
                    // generics (e.g. a lone 'ألم'/pain) it applies to latin generics, using whichever
                    // corroboration (latin or AR intensifier / 2nd concept) is present. This closed a
                    // residual leak where "عندي ألم خفيف في الظهر" (mild back pain) escalated via Path A
                    // because 'ألم' was absent from the latin-only gate.
                    const keywordIsGenericGated =
                        (GENERIC_FLAG_TOKENS.has(keyword) || GENERIC_AR_TOKENS.has(keyword))
                        && !(genericTokensCorroborated || arGenericCorroborated);
                    const gatedAway =
                        keywordIsGenericGated
                        || (keyword === 'weak' && !(hasBabyConcept || hasMovementConcept))
                        // CB-R5-03: bare fetal "movements"/"mouvements"/"faibles" only in a
                        // reduction context (cue or weakness) — positive phrasings don't escalate.
                        || (FETAL_GENERIC_TOKENS.has(keyword) && !fetalReductionContext)
                        // CB-R6-01: a lone generic discharge word ("écoulement"/"discharge") is
                        // overwhelmingly benign out of context ("écoulement nasal" = a runny nose),
                        // yet it is a single-token keyword of the ROM/discharge flag. Gate it so it
                        // only counts with a vaginal/genital or rupture-of-membranes context. Real
                        // vaginal discharge ("vaginal discharge", "écoulement vaginal") still fires
                        // via the co-present "vaginal" keyword / ROM concept.
                        || ((keyword === 'écoulement' || keyword === 'discharge')
                            && !ruptureOfMembranes
                            && !/\b(vagin\w*|génital\w*|genital\w*|مهبل\w*)\b/i.test(normalizedText))
                        // CB-R7-06: the bare 'faint' token was added so presyncope escalates
                        // ("going to faint", "feel faint"), but 'faint' is ALSO a very common BENIGN
                        // pregnancy word describing an OBJECT — a "faint line"/"faint positive" on a
                        // test, a "faint heartbeat" on doppler (in EITHER order: "faint line" /
                        // "the line is faint"). Suppress the LONE 'faint' token in those contexts.
                        // Genuine presyncope uses the MULTIWORD keywords ("going to faint"/"feel
                        // faint"/"about to faint"), which match via the strong-phrase path and are
                        // unaffected by this single-token gate.
                        || (keyword === 'faint'
                            && (/\bfaint\s+(line|lines|positive|negative|second\s+line|heartbeat|heart\s*beat|spot|spots|mark|marks|pink|blue|dye|bfp)\b/i.test(normalizedText)
                                // reverse order, but only an OBJECT-describing copula context
                                // ("the line is faint", "heartbeat sounded faint", "is very faint"),
                                // never a self-symptom ("I might faint") which has no such noun+copula.
                                || /\b(line|lines|positive|test|heartbeat|heart\s*beat|spot|spots|mark|marks|pulse|dye|bfp)\b[^.?!]{0,20}\b(is|are|was|were|looks?|looked|sound(s|ed)?|seems?|appears?|stayed|remains?|gets?|got)\b[^.?!]{0,15}\bfaint\b/i.test(normalizedText)));
                    if (!gatedAway) {
                        matchCount++;
                    }
                    // W6 #2: a SPECIFIC AR symptom token reaching the flag via Path A (when
                    // processQuery didn't move it to negative[] — e.g. the TN circumfix ما...ش) but
                    // negated within its preceding window is a NEGATED report. Feed the negation
                    // guard so the flag is dropped below (Path A sets no strongMatch). Scoped to
                    // specific tokens — generics + the multiword fetal-movement keyword are untouched.
                    if (textIsArabic
                        && !GENERIC_AR_TOKENS.has(keyword)
                        && !GENERIC_FLAG_TOKENS.has(keyword)
                        && arTokenNegated(keyword)) {
                        negatedCount++;
                    }
                }
                // Path B (U-FIX-1 + CB-R7-03): WORD-BOUNDARY match for Arabic/Tunisian script, which
                // doesn't go through the latin tokenizer. We match a single-word AR keyword as a WHOLE
                // token (so the 2-char "دم" can't match inside "القادم"), and gate generic AR tokens
                // exactly like the latin path — a lone generic needs corroboration and never counts as
                // a strong match. Specific AR tokens stay single-hit, strong triggers.
                else if (textIsArabic && keyword.length >= 2 && arTokenMatchesKeyword(keyword)) {
                    const arGatedAway = GENERIC_AR_TOKENS.has(keyword) && !arGenericCorroborated;
                    // W6 #2: a SPECIFIC AR symptom token negated within the preceding window is a
                    // NEGATED report — don't strong-match, and feed the negation guard so the flag is
                    // dropped. Generic tokens are excluded (absence-is-emergency symptoms must survive).
                    const arNeg = !GENERIC_AR_TOKENS.has(keyword) && arTokenNegated(keyword);
                    if (!arGatedAway) {
                        matchCount++;
                        // Only a SPECIFIC (non-generic), NON-NEGATED AR token is a strong match.
                        if (!GENERIC_AR_TOKENS.has(keyword) && !arNeg) {
                            strongMatch = true;
                        }
                    }
                    if (arNeg) negatedCount++;
                }
            }
            // Negation guard (only via tokenized path — negation in arabic NLP is harder)
            if (negative.some(word => word.includes(keyword) || keyword.includes(word))) {
                negatedCount++;
            }
        });

        // CB3-FIX (SAFETY): label-based matching REMOVED. Localized labels are human-readable
        // phrases ("Unwell feeling", "Difficulty breathing") whose common words substring-matched
        // generic tokens (feel ⊂ feeling, eat ⊂ breathing) and mis-escalated benign input — e.g.
        // "I feel a bit nauseous" hit the suicidal-ideation flag via its "Unwell feeling" label.
        // Keywords (keywords_{fr,ar,tn,en}) are the designed, curated matching mechanism.

        // If explicitly negated, we ignore this flag or reduce score drastically.
        // CB3-FIX: but never let token-negation cancel a STRONG (literal-phrase) match.
        if (negatedCount > 0 && !strongMatch) {
            log.debug(`Ignoring flag ${flag.red_flag_id} due to negation.`);
            continue;
        }

        // CB-R7-04 FIX (SAFETY — over-escalation): a warm DRINK/FOOD with no explicit fever lexeme
        // must NOT escalate to the fever flag via the FR 'chaud'→fièvre synonym expansion. Skip the
        // 'température élevée' flag entirely in that context (real fever keeps escalating — it carries
        // an explicit fièvre/fever/degree token, so warmDrinkNotFever is false there).
        if (warmDrinkNotFever && flag.red_flag_id === 'température élevée') {
            log.debug('Suppressing fever flag — warm drink/food context, no explicit fever lexeme.');
            continue;
        }
        // CB-R7-02 FIX (SAFETY — over-escalation): a NEGATED waters-report ("water has not broken",
        // "je n'ai pas perdu les eaux") must not escalate via the canonical multi-word ROM keywords,
        // which strong-match and would otherwise survive token negation. romNegated is scoped to a
        // negation that governs the ROM cue, so a genuine waters-broken report still escalates.
        if (romNegated && flag.red_flag_id === 'liquide chaud') {
            log.debug('Suppressing ROM flag — negation scopes the rupture/fluid cue.');
            continue;
        }

        if (matchCount > 0) {
            const severityScore = SEVERITY_PRIORITY[flag.severity?.toLowerCase() || 'faible'] || 0;
            matchedFlags.push({ flag, severityScore, matchCount });
        }
    }

    // CB-R5-03 FIX (SAFETY — UNDER-escalation): FORCE the reduced-fetal-movement red flag when
    // the negation-aware concept detector above fired (baby + movement + reduction/negation cue).
    // This survives token-level negation (which otherwise suppressed the movement tokens) so that
    // natural phrasings — "my baby is not moving anymore", "I don't feel my baby move",
    // "mon bébé ne bouge plus", "je ne sens plus mon bébé bouger", "bébé ne bouge pas depuis hier"
    // — escalate to the fetal-movements flag instead of returning a benign info card. Severity
    // ordering is unchanged: a co-occurring EMERGENCY still outranks this urgent_consult flag.
    if (reducedFetalMovement) {
        const fetalFlag = redFlags.find(f =>
            f.red_flag_id === 'ne sens plus le bébé'
            || (f.keywords_en || '').toLowerCase().includes('baby not moving'));
        if (fetalFlag && !matchedFlags.some(m => m.flag.red_flag_id === fetalFlag.red_flag_id)) {
            const severityScore = SEVERITY_PRIORITY[fetalFlag.severity?.toLowerCase() || 'faible'] || 0;
            matchedFlags.push({ flag: fetalFlag, severityScore, matchCount: 1 });
        }
    }

    // CB-R6-01 FIX (SAFETY — rupture of membranes): when the ROM concept detector fired, FORCE the
    // ROM/discharge flag and SUPPRESS the two incidental flags the ROM phrasing collides with —
    // hemorrhage (generic token "perte" in "perte des eaux") and fever (the "chaud"→fièvre synonym
    // in "j'ai un liquide chaud"). Without the suppression the severity-first sort would pick the
    // hemorrhage EMERGENCY for "perte des eaux", and array order would pick fever for the warm-fluid
    // phrasing — both clinically WRONG for a waters-breaking report. The suppression is scoped to
    // those two specific mis-routes; any genuinely co-described hemorrhage/fever still escalates via
    // its own specific keywords ("hémorragie", "fever"…) on a different phrasing.
    if (ruptureOfMembranes) {
        const romFlag = redFlags.find(f =>
            f.red_flag_id === 'liquide chaud'
            || (f.keywords_en || '').toLowerCase().includes('amniotic fluid'));
        if (romFlag) {
            // Drop the incidental colliding matches so ROM wins regardless of severity ordering.
            for (let i = matchedFlags.length - 1; i >= 0; i--) {
                const id = matchedFlags[i].flag.red_flag_id;
                if (id === 'hemorragie_postpartum' || id === 'température élevée') {
                    matchedFlags.splice(i, 1);
                }
            }
            const existing = matchedFlags.find(m => m.flag.red_flag_id === romFlag.red_flag_id);
            if (existing) {
                // Boost so it stays the top match even if another flag tied on severity+count.
                existing.matchCount = Math.max(existing.matchCount, 2);
            } else {
                const severityScore = SEVERITY_PRIORITY[romFlag.severity?.toLowerCase() || 'faible'] || 0;
                matchedFlags.push({ flag: romFlag, severityScore, matchCount: 2 });
            }
        }
    }

    // A chip label is triaged by the chip itself (above), never by how its wording happens to
    // tokenize in the active language — otherwise the same tapped chip escalates in one locale and
    // not in another (EN "I'm bleeding a little" was gated as a lone generic "bleeding" while FR
    // "Je saigne un peu" fired on the specific "saigne"; AR "tired"/"leg cramps" chips escalated to
    // unrelated headache/eclampsia flags). Non-reporting chips fall through to their suggestion.
    if (matchedFlags.length > 0 && !exactChip) {
        // CB4-FIX (SAFETY): severity FIRST, match strength only as tiebreaker. The old additive
        // score (matchCount*10 + severity*5) made severity worth just half a keyword, so a
        // multi-symptom URGENT flag could outrank a higher-severity EMERGENCY — e.g.
        // "severe headache and I can't breathe" routed to the headache (urgent) instead of the
        // breathing EMERGENCY. A described emergency must always win over a non-emergency,
        // regardless of how many keywords the lesser flag matched.
        matchedFlags.sort((a, b) => (b.severityScore - a.severityScore) || (b.matchCount - a.matchCount));
        return buildRedFlagResponse(matchedFlags[0].flag, matchedFlags[0].matchCount);
    }

    // "What foods to avoid?" gets the foods themselves and a way to the full list. It used to
    // fall through to the nutrition topic, whose reply ends "Here's what I know:" and then
    // listed nothing. Asked only once no red flag fired, so a symptom in the same message
    // still escalates first.
    if (exactChip?.suggestion_id === FOODS_TO_AVOID_CHIP || isFoodsToAvoidQuestion(text)) {
        return buildFoodsToAvoidResponse(suggestions);
    }

    const namedFoods = exactChip ? [] : findNamedFoods(text);
    if (namedFoods.length > 0) {
        return buildNamedFoodResponse(namedFoods);
    }

    // 3. Check Suggestions (Topic-based)
    // BUG-03 FIX: removed !textIsArabic guard — Arabic users deserve suggestions too.
    // For Arabic-script input, we match directly on label_ar words instead of via positive[]
    const matchedSuggestions: { suggestion: ChatbotSuggestion; score: number; exact: boolean }[] = [];

    // Extract raw Arabic tokens from input for direct AR label matching. A word the sentence
    // negates is not something she asked about: "\u0644\u064A\u0633 \u0644\u062F\u064A \u0646\u0632\u064A\u0641" ("I have no bleeding") matched the
    // bleeding chip on \u0646\u0632\u064A\u0641 and answered with the symptoms article.
    const negatedWords = new Set(negative.map(w => w.toLowerCase()));
    const arabicTokens = textIsArabic
        ? text.replace(/[^\u0600-\u06FF\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !negatedWords.has(w))
        : [];

    for (const suggestion of suggestions) {
        // Include ALL localized labels for keyword searching
        const labelFr = suggestion.label_fr?.toLowerCase() || '';
        const labelAr = suggestion.label_ar?.toLowerCase() || '';
        const labelTn = suggestion.label_tn?.toLowerCase() || '';
        const labelEn = ((suggestion as any).label_en || '').toLowerCase(); // FIX-LANG-06

        // EXACT MATCH SHORTCIRCUIT (Clicked suggestion)
        const exactMatchStr = text.toLowerCase().trim();
        if (exactMatchStr === labelFr || exactMatchStr === labelAr || exactMatchStr === labelTn || exactMatchStr === labelEn) {
            log.info(`✅ EXACT match found for suggestion: ${suggestion.suggestion_id}`);
            matchedSuggestions.push({ suggestion, score: 100, exact: true });
            continue; // Skip further keyword matching
        }

        // CB-R2-02 FIX: tokenize labels into a clean WHOLE-WORD set. The previous loose
        // bidirectional substring test (`w.includes(u) || u.includes(w)`) let 1-letter label
        // tokens — the FR elision "à"/"a" and the EN article "a"/pronoun "i" — match almost any
        // user word that contains that letter ("fromage"⊃"a", "merci"⊃"i"), so benign nutrition
        // queries scored 80 on the bleeding/headache symptom chips. We now require token equality
        // and drop tokens shorter than 2 chars (elisions/articles) so they can't act as wildcards.
        const cleanTokens = (s: string): Set<string> =>
            new Set(
                s.split(/[\s'’]+/)            // also split FR elisions (j'ai → j + ai)
                 .map(w => w.replace(/[^\p{L}\p{N}]/gu, '').trim())
                 .filter(w => w.length >= 2)
            );
        const labelTokenSet = cleanTokens(`${labelFr} ${labelAr} ${labelTn} ${labelEn}`);
        const topicTokenSet = cleanTokens(suggestion.topic?.toLowerCase() || '');

        let score = 0;

        // Score by label match — WHOLE-WORD equality (CB-R2-02). A user token contributes only
        // when it IS one of the label tokens (or one whole word of a multi-token user phrase like
        // "shreb ma" / "ras youja3"), never as a cross-word substring.
        positive.forEach(userWord => {
            const parts = userWord.includes(' ') ? userWord.split(/\s+/).filter(p => p.length >= 2) : [userWord];
            if (parts.some(p => labelTokenSet.has(p))) score += 10;
        });

        // Score by topic match — WHOLE-WORD equality (CB-R2-02).
        positive.forEach(userWord => {
            const parts = userWord.includes(' ') ? userWord.split(/\s+/).filter(p => p.length >= 2) : [userWord];
            if (parts.some(p => topicTokenSet.has(p))) score += 5;
        });

        // BUG-03 FIX: Direct Arabic token scoring against label_ar — WHOLE-WORD equality (CB-R2-02)
        if (textIsArabic && arabicTokens.length > 0) {
            const arLabelTokens = cleanTokens(labelAr);
            arabicTokens.forEach(tok => {
                if (arLabelTokens.has(tok)) score += 10;
            });
        }

        // ARABIZI FIX: When input is Latin arabizi, positive[] holds FR concepts (douleur, nausée...).
        // Bridge: concept → label_tn keyword match (TN suggestions already have great dialectal labels)
        // e.g. douleur → "وجيعة" is in many label_tn; nausée → "دوخة,غثيان" etc.
        if (!textIsArabic && positive.length > 0) {
            const CONCEPT_TN_BRIDGE: Record<string, string[]> = {
                'douleur':       ['وجيعة', 'يوجع', 'وجع', 'طلق'],
                'ventre':        ['كرش', 'كرشي', 'بطن'],
                'tête':          ['راس', 'رأس', 'صداع'],
                'nausée':        ['غثيان', 'دوخة', 'ردان'],
                'fatigue':       ['تاعبة', 'تعب', 'فشل'],
                'saignement':    ['دم', 'نزيف', 'دم'],
                'mouvement':     ['يتحرك', 'حركة', 'بيبي'],
                'fièvre':        ['سخانة', 'حرارة'],
                'dormir':        ['نرقد', 'نوم', 'رقاد'],
                'manger':        ['ناكل', 'ماكلة', 'تغذية'],
                'grossesse':     ['حبالة', 'حمل'],
                'tension':       ['ضغط', 'تنسيون'],
                'diabète':       ['سكر', 'ديابيت'],
                'respiration':   ['نفس', 'تنفس'],
                'vision':        ['عيني', 'نظر'],
                'accouchement':  ['ولادة', 'وضع', 'طلق'],
                'allaitement':   ['رضاعة', 'ترضع', 'بزول'],
                'contractions':  ['طلق', 'انقباض', 'وجيعة'],
                'anxiété':       ['خايفة', 'أفكار', 'نفسية'],
            };

            const bridgeLabelTokens = cleanTokens(`${labelTn} ${labelAr}`);
            positive.forEach(concept => {
                const tnKeywords = CONCEPT_TN_BRIDGE[concept] || [];
                if (tnKeywords.length > 0) {
                    tnKeywords.forEach(kw => {
                        // CB-R2-02 FIX: whole-word equality (was loose substring includes).
                        if (bridgeLabelTokens.has(kw)) score += 8;
                    });
                }
            });
        }

        // CB-R2-02 FIX: prefer NUTRITION/topic matches for food & drink queries. A benign
        // "manger du fromage" / "puis-je boire du café" expands (via synonyms) to many tokens
        // that incidentally overlap symptom-chip labels. When the user clearly asked about food
        // or drink, boost nutrition/alimentation suggestions and de-prioritise symptom chips so
        // the dietary topic surfaces instead of a bleeding/headache symptom.
        const FOOD_DRINK_CONCEPTS = ['manger', 'alimentation', 'nourriture', 'eau', 'boire', 'fromage', 'café', 'cafe'];
        const isFoodDrinkQuery = !textIsArabic && positive.some(w => FOOD_DRINK_CONCEPTS.includes(w));
        if (isFoodDrinkQuery && score > 0) {
            const topicId = ((suggestion as any).topic_id || suggestion.topic || '').toLowerCase();
            if (topicId.includes('nutrition') || topicId.includes('alimentation')) {
                score += 30; // surface the dietary topic
            } else if (topicId.includes('symptom')) {
                score = 0;   // a food/drink question is not a symptom report
            }
        }

        if (score > 0) {
            matchedSuggestions.push({ suggestion, score, exact: false });
        }
    }



    // CB-R2-02 FIX: minimum-confidence floor. With whole-word scoring a genuine concept hit
    // scores >= 10 (label) and real symptom queries corroborate via topic (+5) or multiple
    // tokens. A lone incidental token (e.g. a greeting fuzzy-corrected to one symptom word)
    // must NOT surface a symptom chip — let those fall through to the semantic/fallback path.
    // Exact chip clicks score 100 and always pass.
    const MIN_SUGGESTION_SCORE = 15;
    const confidentSuggestions = matchedSuggestions.filter(
        m => m.exact || m.score >= MIN_SUGGESTION_SCORE
    );

    if (confidentSuggestions.length > 0) {
        confidentSuggestions.sort((a, b) => b.score - a.score);
        const topSuggestion = confidentSuggestions[0].suggestion;

        // Fetch linked articles
        const articleIds = topSuggestion.linked_article_ids ? topSuggestion.linked_article_ids.split(',').map(id => id.trim()) : [];
        const allArticles = await getArticlesCached();
        const linkedArticles = allArticles.filter(a => articleIds.includes(a.article_id));

        // Fetch linked tips (Simple ID parsing for now, assuming format tip_wXX_dYY)
        // In a real app, we would inject TipsService. Here we simulate or just pass the IDs if the UI can handle it.
        // But the UI expects objects. Let's try to fetch them if possible, or at least construct a basic object.
        const tipIds = topSuggestion.linked_tip_ids ? topSuggestion.linked_tip_ids.split(',').map(id => id.trim()) : [];
        const linkedTips: any[] = [];

        // We need to fetch the actual tip content. 
        // Since we don't have easy access to the full CSV data here without importing the service which might be heavy,
        // we will try to import the service dynamically or just use a placeholder if the service isn't easily available.
        // But wait, `tipsService.ts` is available.

        // Fetch linked tasks
        const taskIds = topSuggestion.linked_task_ids ? topSuggestion.linked_task_ids.split(',').map(id => id.trim()) : [];
        // We would need to fetch tasks from WEEKLY_TASKS.json. 
        // For now, we will return empty arrays if we can't easily fetch, but let's try to be helpful.

        // Fetch linked red flags
        const redFlagIds = topSuggestion.linked_red_flag_ids ? topSuggestion.linked_red_flag_ids.split(',').map(id => id.trim()) : [];
        const allRedFlags = await getRedFlagsCached();
        const linkedRedFlags = allRedFlags.filter(rf => redFlagIds.includes(rf.red_flag_id)).slice(0, 1);

        // Build a more helpful and warm response
        let message = "";
        const topic = topSuggestion.topic.toLowerCase();

        // CB-NEW-03-FIX (SAFETY): the linked red-flag standard_message (a ⚠️ severe-symptom
        // warning) must ONLY be surfaced when the user DELIBERATELY tapped this symptom chip
        // (exact label match). For typed free-text it produced cry-wolf warnings on benign
        // input (e.g. "je suis fatiguée" / "combien de café par jour ?" / "puis-je boire de
        // l'eau ?" surfaced a severe-vomiting / pre-eclampsia / headache warning). As the
        // SUG1-FIX note below documents, a NUMERIC score threshold is unreliable here —
        // cross-language label scoring inflates benign typed queries to 80-90 (e.g. synonym
        // expansion of "boire"/"eau" scored "J'ai de violents maux de tête" at 90). The only
        // trustworthy high-confidence signal is the exact chip click, so we gate on that.
        const isExactChipClick = confidentSuggestions[0].exact === true;

        if (linkedRedFlags.length > 0 && isExactChipClick) {
            const rfMessage = getLocalizedContent(linkedRedFlags[0], 'standard_message', i18n.language);
            message = rfMessage
                ? `⚠️ ${rfMessage}`
                : i18n.t('common.chatResponse.redFlagWithArticle');
        } else if (linkedArticles.length > 0) {
            // Topic-specific friendly messages via i18n keys
            // ── FIX: match by topic_id (locale-neutral) instead of hardcoded FR topic string
            const topicKeyMap: Record<string, string> = {
                'alimentation': 'topicAlimentation',
                'nutrition':    'topicNutrition',
                'symptoms':     'topicSymptomes',
                'symptomes':    'topicSymptomes',
                'sport':        'topicSport',
                'sommeil':      'topicSommeil',
                'sleep':        'topicSommeil',
                'examens':      'topicExamens',
                'medical':      'topicExamens',
                'accouchement': 'topicAccouchement',
                'labour':       'topicAccouchement',
                'allaitement':  'topicAllaitement',
                'breastfeeding':'topicAllaitement',
                'preparation':  'topicPreparation',
                'sexualite':    'topicSexualite',
            };
            // Match by topic_id first (locale-neutral), fallback to localized topic string
            const topicId = (topSuggestion as any).topic_id?.toLowerCase() || '';
            const topicKey = topicKeyMap[topicId] || topicKeyMap[topic];
            if (topicKey) {
                message = i18n.t(`common.chatResponse.${topicKey}`);
            } else {
                const label = getLocalizedContent(topSuggestion, 'label', i18n.language) || '';
                message = i18n.t('common.chatResponse.topicDefault', { topic: label.toLowerCase() });
            }
        } else {
            const label = getLocalizedContent(topSuggestion, 'label', i18n.language) || '';
            message = i18n.t('common.chatResponse.topicNoArticles', { label });
        }

        // SUG1-FIX (audit 2026-05-30 P1): never expose the linked redFlag in suggestion
        // responses. The redFlag object triggers the full URGENCE badge + call-button UI in
        // ChatbotScreen — that must ONLY come from the direct red_flag path (step 3 above),
        // which runs explicit keyword matching against emergency symptoms. The suggestion path
        // (step 3b below) fires only when the red_flag path found nothing, meaning the engine
        // already determined no emergency was explicitly reported. Any score-threshold approach
        // is defeated by multi-language label scoring (e.g. "j'ai peur de l'accouchement"
        // scored 90 on a hemorrhage-linked suggestion because "accouchement" appeared in FR +
        // EN + AR labels) — causing a false URGENCE banner on a normal childbirth-fear question.
        // The ⚠️ warning TEXT from standard_message is still in the message field (valuable
        // clinical disclosure); we just strip the redFlag from the response object so the
        // call-button UI doesn't activate on a suggestion match.
        return {
            type: 'suggestion',
            message,
            articles: linkedArticles,
            suggestions: [topSuggestion],
            matchScore: confidentSuggestions[0].score,
        };
    }

    // 4. Semantic Search Fallback (using VectorEngine with CHUNKS)
    // Retrieval never runs on a word the sentence negates: "I am not bleeding" came back with a
    // breastfeeding article. The negated words and the negation itself are dropped from the
    // query, and when nothing she actually asked about is left, there is nothing to retrieve.
    let semanticQuery = text;
    if (negative.length > 0) {
        const negationCues = new Set(NEGATION_CUES);
        semanticQuery = text
            .split(/\s+/)
            .filter(word => {
                const bare = word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
                return bare.length > 0 && !negatedWords.has(bare) && !negationCues.has(bare);
            })
            .join(' ');
        const askedAbout = positive.filter(w => w.length >= 3 && !SEMANTIC_FILLER_TOKENS.has(w));
        if (askedAbout.length === 0) semanticQuery = '';
    }
    if (semanticQuery && vectorEngine.isReady()) {
        log.info('🔎 Trying semantic search...');
        const semanticResults = vectorEngine.search(semanticQuery, 3);

        if (semanticResults.length > 0 && semanticResults[0].score > 0.1) {
            log.info('✅ Semantic match found:', semanticResults[0]);

            // Parse chunk ID: "articleId#anchor" or just "articleId"
            const [articleId, anchor] = semanticResults[0].id.split('#');

            const articles = await getArticlesCached();
            const matchedArticle = articles.find(a => a.article_id === articleId);

            if (matchedArticle) {
                const articleTitle = getLocalizedContent(matchedArticle, 'title', i18n.language);
                return {
                    type: 'info',
                    message: i18n.t('common.chatResponse.semanticMatch', { title: articleTitle }),
                    articles: [matchedArticle],
                    anchor: anchor, // Pass the anchor to the UI
                    matchScore: semanticResults[0].score * 10,
                };
            }
        }
    }

    // 5. Fallback with helpful guidance
    return {
        type: 'unknown',
        message: i18n.t('common.chatResponse.fallbackMessage'),
        matchScore: 0,
    };
};

export const analyzeMessage = async (text: string): Promise<ChatResponse> => {
    try {
        return await _analyzeMessage(text);
    } catch (err) {
        log.error('analyzeMessage fatal error:', err);
        return {
            type: 'error',
            message: i18n.t('common.chatError'),
            matchScore: 0,
        };
    }
};


export const fetchSuggestions = async (): Promise<ChatbotSuggestion[]> => {
    return getSuggestionsCached();
};
