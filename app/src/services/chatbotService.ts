import { createLogger } from '../utils/logger';
import { ChatResponse, RedFlag, Article, ChatbotSuggestion } from '../types';
import { LocalChatbotRepository } from './chatbot/data/local_data';
import { KeywordEngine } from './chatbot/engines/KeywordEngine';
import { vectorEngine, VectorEngine } from './chatbot/engines/VectorEngine';
import i18n from '../i18n';
import { getLocalizedContent } from '../utils/i18nHelpers';

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
    const GENERIC_FLAG_TOKENS = new Set([
        // EN
        'red', 'blood', 'bright', 'bleeding', 'loss', 'pain',
        // CB-R5-01 FIX (SAFETY — over-escalation): 'liver' is overwhelmingly a FOOD word in
        // EN pregnancy questions ("is liver pate safe", "can I eat beef liver", "chicken liver
        // is rich in iron") yet it is a single-token keyword of the HELLP emergency flag, so a
        // lone occurrence fired a full EMERGENCY + call button. Gate the EN liver-flag tokens
        // (mirroring the FR 'foie'/'hépatique' already below) so a bare mention needs
        // corroboration (an intensity word or a 2nd generic concept). The multiword keyword
        // "liver pain" stays a STRONG single-hit trigger (substring path), and "severe … liver"
        // still escalates via the intensifier 'severe'.
        'liver', 'hepatic', 'ribs',
        // FR
        'rouge', 'sang', 'foie', 'douleur', 'hépatique', 'côtes',
    ]);
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
    // Which generic flag concepts actually appear in this message, and is there an intensifier?
    const presentGenericTokens = new Set(positive.filter(w => GENERIC_FLAG_TOKENS.has(w)));
    const hasIntensifier = positive.some(w => INTENSIFIER_TOKENS.has(w));
    // A generic single-token match counts only when corroborated: an intensity/quantity word
    // is present, OR at least two distinct generic flag concepts co-occur (e.g. douleur+foie).
    const genericTokensCorroborated = hasIntensifier || presentGenericTokens.size >= 2;

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
    // Fire when a reduction/negation cue accompanies EITHER an explicit baby+movement pairing OR a
    // (fetal) movement NOUN on its own. The cue is always required → benign "baby moves a lot" /
    // "bébé bouge beaucoup" / "I feel fewer movements" needs the cue but no false-positive cue.
    const reducedFetalMovement = hasReductionCue && ((hasBabyConcept && hasMovementConcept) || hasMovementNoun);

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

    // 2. Check Red Flags (Critical) — use cache
    const redFlags = await getRedFlagsCached();
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
                    const gatedAway =
                        (GENERIC_FLAG_TOKENS.has(keyword) && !genericTokensCorroborated)
                        || (keyword === 'weak' && !(hasBabyConcept || hasMovementConcept))
                        // CB-R5-03: bare fetal "movements"/"mouvements"/"faibles" only in a
                        // reduction context (cue or weakness) — positive phrasings don't escalate.
                        || (FETAL_GENERIC_TOKENS.has(keyword) && !fetalReductionContext);
                    if (!gatedAway) {
                        matchCount++;
                    }
                }
                // Path B (U-FIX-1): direct substring match on the raw normalized text.
                // Critical for Arabic/Tunisian script which doesn't go through the latin tokenizer.
                else if (textIsArabic && keyword.length >= 2 && normalizedText.includes(keyword)) {
                    matchCount++;
                    strongMatch = true;
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

    if (matchedFlags.length > 0) {
        // CB4-FIX (SAFETY): severity FIRST, match strength only as tiebreaker. The old additive
        // score (matchCount*10 + severity*5) made severity worth just half a keyword, so a
        // multi-symptom URGENT flag could outrank a higher-severity EMERGENCY — e.g.
        // "severe headache and I can't breathe" routed to the headache (urgent) instead of the
        // breathing EMERGENCY. A described emergency must always win over a non-emergency,
        // regardless of how many keywords the lesser flag matched.
        matchedFlags.sort((a, b) => (b.severityScore - a.severityScore) || (b.matchCount - a.matchCount));
        const topFlag = matchedFlags[0].flag;

        // Fetch linked articles — use cache
        const allArticles = await getArticlesCached();
        const linkedArticles = allArticles
            .filter(a => topFlag.linked_articles_ids.includes(a.article_id))
            .slice(0, 3);

        // Build a more helpful red flag response
        let redFlagMessage = getLocalizedContent(topFlag, 'standard_message', i18n.language) || i18n.t('common.chatResponse.redFlagDefault');

        // Add reassuring context based on severity
        if (topFlag.severity?.toLowerCase() === 'emergency' || topFlag.severity?.toLowerCase() === 'critique') {
            redFlagMessage = `🚨 ${redFlagMessage}\n\n${i18n.t('common.chatResponse.redFlagCritical')}`;
        } else if (topFlag.severity?.toLowerCase() === 'urgent_consult' || topFlag.severity?.toLowerCase() === 'élevé') {
            redFlagMessage = `⚠️ ${redFlagMessage}\n\n${i18n.t('common.chatResponse.redFlagHigh')}`;
        } else {
            redFlagMessage = `⚠️ ${redFlagMessage}\n\n${i18n.t('common.chatResponse.redFlagModerate')}`;
        }

        return {
            type: 'red_flag',
            message: redFlagMessage,
            redFlag: topFlag,
            articles: linkedArticles,
            matchScore: matchedFlags[0].matchCount,
        };
    }

    // 3. Check Suggestions (Topic-based)
    // BUG-03 FIX: removed !textIsArabic guard — Arabic users deserve suggestions too.
    // For Arabic-script input, we match directly on label_ar words instead of via positive[]
    const suggestions = await getSuggestionsCached();
    const matchedSuggestions: { suggestion: ChatbotSuggestion; score: number; exact: boolean }[] = [];

    // Extract raw Arabic tokens from input for direct AR label matching
    const arabicTokens = textIsArabic
        ? text.replace(/[^\u0600-\u06FF\s]/g, ' ').split(/\s+/).filter(w => w.length > 1)
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
                ? `⚠️ ${rfMessage}\n\n${i18n.t('common.chatResponse.redFlagHigh')}`
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
    if (vectorEngine.isReady()) {
        log.info('🔎 Trying semantic search...');
        const semanticResults = vectorEngine.search(text, 3);

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
