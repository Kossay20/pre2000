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
                // Path A: token-based (latin/Arabizi/normalized) — Levenshtein-friendly.
                // CB2-FIX (SAFETY): require a meaningful overlap. The old `keyword.includes(word)`
                // let a short common token substring-match a long keyword — "eat" ⊂ "breathing",
                // "la" ⊂ "éclampsie" — escalating benign input to emergency flags. Now the shorter
                // side of any substring match must be ≥4 chars; otherwise an exact token is required.
                if (positive.some(word =>
                        word === keyword
                        || (keyword.length >= 4 && word.includes(keyword))
                        || (word.length >= 4 && keyword.includes(word)))) {
                    matchCount++;
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
    const matchedSuggestions: { suggestion: ChatbotSuggestion; score: number }[] = [];

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
            matchedSuggestions.push({ suggestion, score: 100 });
            continue; // Skip further keyword matching
        }

        const labelWords = `${labelFr} ${labelAr} ${labelTn} ${labelEn}`.split(/\s+/).filter(Boolean);
        const topicWords = suggestion.topic?.toLowerCase().split(/\s+/) || [];

        let score = 0;

        // Score by label match (French/Arabizi keywords via KeywordEngine positive[])
        positive.forEach(userWord => {
            if (labelWords.some(w => w.includes(userWord) || userWord.includes(w))) score += 10;
        });

        // Score by topic match
        positive.forEach(userWord => {
            if (topicWords.some(w => w.includes(userWord) || userWord.includes(w))) score += 5;
        });

        // BUG-03 FIX: Direct Arabic token scoring against label_ar
        if (textIsArabic && arabicTokens.length > 0) {
            const arLabelWords = labelAr.split(/\s+/).filter(Boolean);
            arabicTokens.forEach(tok => {
                if (arLabelWords.some(w => w.includes(tok) || tok.includes(w))) score += 10;
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

            positive.forEach(concept => {
                const tnKeywords = CONCEPT_TN_BRIDGE[concept] || [];
                if (tnKeywords.length > 0) {
                    const tnLabelWords = labelTn.split(/\s+/);
                    const arLabelWords = labelAr.split(/\s+/);
                    const allLabelWords = [...tnLabelWords, ...arLabelWords];
                    tnKeywords.forEach(kw => {
                        if (allLabelWords.some(w => w.includes(kw) || kw.includes(w))) score += 8;
                    });
                }
            });
        }


        if (score > 0) {
            matchedSuggestions.push({ suggestion, score });
        }
    }



    if (matchedSuggestions.length > 0) {
        matchedSuggestions.sort((a, b) => b.score - a.score);
        const topSuggestion = matchedSuggestions[0].suggestion;

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

        if (linkedRedFlags.length > 0) {
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

        return {
            type: 'suggestion',
            message,
            articles: linkedArticles,
            suggestions: [topSuggestion],
            redFlag: linkedRedFlags[0],
            matchScore: matchedSuggestions[0].score,
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
