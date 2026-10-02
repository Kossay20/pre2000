import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Linking, Keyboard, AccessibilityInfo } from 'react-native';
import { showAlert } from '../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzeMessage, fetchSuggestions } from '../services/chatbotService';
import { ChatbotSuggestion, Article, ChatResponse } from '../types';
import { theme } from '../theme';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { useNavigation } from '@react-navigation/native';
import { chatbotLimiter } from '../utils/rateLimiter';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent, frenchSpacing } from '../utils/i18nHelpers';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { useAuth } from '../context/AuthContext';
import { resolveEmergencyContact } from '../utils/clinicalChecks';
import { emergencyNumberLabel } from '../utils/emergencyNumberLabel';
import { EmergencyNumberNote } from '../components/common/EmergencyNumberNote';
import { getDeviceRegionCode } from '../utils/deviceRegion';
import { shouldPinEmergencyCall, chatScrollTarget } from '../utils/chatEmergency';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    data?: ChatResponse;
}

export const ChatbotScreen = () => {
    useScreenAnalytics('ChatbotScreen');
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    // BUG-05+06 FIX: RTL detection for Arabic and Tunisian
    const isRTL = ['ar', 'tn'].includes(i18n.language);
    // CB4-FIX (SAFETY): the emergency number comes from the profile country, then the
    // device region, then 112 — never from the UI language (Arabic is not Tunisia).
    const emergencyContact = resolveEmergencyContact(user?.country, getDeviceRegionCode());
    const emergencyNumber = emergencyContact.number;
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', text: t('common.chatWelcome'), sender: 'bot' }
    ]);
    const [inputText, setInputText] = useState('');
    const [suggestions, setSuggestions] = useState<ChatbotSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const flatListRef = useRef<FlatList>(null);
    const navigation = useNavigation();
    // const [showDisclaimer, setShowDisclaimer] = useState(true); // Removed as disclaimer is now permanent and minimal

    useEffect(() => {
        const loadSuggestions = async () => {
            const data = await fetchSuggestions();
            setSuggestions(data);
        };
        loadSuggestions();
    }, []);

    const MAX_INPUT_LENGTH = 500; // ── FIX: prevent arbitrarily long messages

    // Scroll to the end once the frame has laid out. Called on content size change, on
    // the list's own resize (the loading row and the pinned call bar change its height)
    // and when the last message lays out: the content size alone fired before a red-flag
    // reply had its final height, so the list stopped short and the call button stayed
    // under the chips and the input.
    //
    // A long bot answer is the exception (D-051): the list rests on the user's question with
    // the start of the reply under it instead of on the reply's last lines.
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const listHeightRef = useRef(0);
    const lastMessageRef = useRef<{ id: string; height: number }>({ id: '', height: 0 });

    const scrollToEnd = useCallback(() => {
        requestAnimationFrame(() => {
            const all = messagesRef.current;
            const last = all[all.length - 1];
            const lastHeight = last && lastMessageRef.current.id === last.id ? lastMessageRef.current.height : 0;
            const target = chatScrollTarget(all, lastHeight, listHeightRef.current);
            if (target === 'end') {
                flatListRef.current?.scrollToEnd({ animated: true });
            } else {
                flatListRef.current?.scrollToIndex({ index: target.index, viewPosition: 0, animated: true });
            }
        });
    }, []);

    // The row is not measured yet when it lies past the rendered window: jump near it, retry.
    const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
        flatListRef.current?.scrollToOffset({ offset: info.index * info.averageItemLength, animated: false });
        setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, viewPosition: 0, animated: true });
        }, 100);
    }, []);

    const callEmergency = () => {
        Linking.openURL(`tel:${emergencyNumber}`).catch(() =>
            showAlert(t('common.chatEmergency'), t('common.chatEmergencyAction'))
        );
    };
    const pinCall = !!emergencyNumber && shouldPinEmergencyCall(messages);
    // Only the newest alert carries an inline call button. An older alert still on screen kept
    // its own, so a long conversation showed two identical "call" buttons at once (read out
    // twice, and a stale one to tap). The older one keeps its instruction as text.
    const latestAlertId = [...messages].reverse().find(m => {
        const sev = m.data?.redFlag?.severity;
        return m.sender === 'bot' && m.data?.type === 'red_flag' && (sev === 'emergency' || sev === 'urgent_consult');
    })?.id;

    const handleSend = async (text: string = inputText, isRetry = false) => {
        let messageText = text.trim();
        if (!messageText) return;
        // W6 #5 (SAFETY): CLAMP an over-long message instead of silently dropping it. A panicked
        // user pasting a long description with "I'm bleeding heavily" buried in it must still be
        // triaged (the engine handles long input). The TextInput maxLength caps typed text; this
        // guards the paste/programmatic/retry paths that previously returned with no triage at all.
        if (messageText.length > MAX_INPUT_LENGTH) messageText = messageText.slice(0, MAX_INPUT_LENGTH);
        Keyboard.dismiss(); // ── FIX: close keyboard on send

        // Rate limit check
        if (!chatbotLimiter.tryRequest()) {
            const waitMsg: Message = {
                id: Date.now().toString(),
                text: t('common.chatRateLimit'),
                sender: 'bot'
            };
            setMessages(prev => [...prev, waitMsg]);
            return;
        }

        if (!isRetry) {
            const userMsg: Message = { id: Date.now().toString(), text: messageText, sender: 'user' };
            setMessages(prev => [...prev, userMsg]);
            setInputText('');
        }

        setLoading(true);

        try {
            const response = await analyzeMessage(messageText);
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: response.message,
                sender: 'bot',
                data: response
            };
            // Remove error message if retrying
            if (isRetry) {
                setMessages(prev => prev.filter(m => m.text !== t('common.chatError')));
            }
            setMessages(prev => [...prev, botMsg]);
            // W6 #4 (a11y): announce the reply so screen-reader users know one arrived (covers
            // native/iOS where the alert live-region isn't enough). Emergencies lead with the
            // localized severity word (emoji stripped so the SR doesn't read "🚨").
            const isEmergency = (response as any)?.redFlag?.severity === 'emergency';
            const announcement = (isEmergency ? `${t('common.chatEmergency').replace(/[^\p{L}\p{N}\s]/gu, '')}. ` : '') + response.message;
            AccessibilityInfo.announceForAccessibility(announcement);
        } catch (error) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: t('common.chatError'),
                sender: 'bot',
                data: {
                    message: t('common.chatError'),
                    type: 'error',
                    // Store original text to allow retry
                    originalText: messageText
                } as any
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    // The chip's label is also the message a tap sends, and the engine recognises a
    // tapped chip by comparing it with the stored label: keep it byte-identical.
    const getSuggestionLabel = (item: ChatbotSuggestion): string => {
        return getLocalizedContent(item, 'label', i18n.language, { plainSpaces: true }) || item.label_fr || '';
    };
    // What the chip shows: the same label with French no-break spaces before ? ! : ;
    // ("Quels aliments éviter ?" must not wrap the "?" onto its own line).
    const getSuggestionDisplayLabel = (item: ChatbotSuggestion): string => {
        return getLocalizedContent(item, 'label', i18n.language) || item.label_fr || '';
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const isUser = item.sender === 'user';
        const isLast = index === messages.length - 1;
        // No per-language override: alignSelf flex-start/flex-end are logical and already mirror
        // under I18nManager RTL (native) and the LocaleProvider/dir=rtl (web), so the user bubble
        // sits on the end side (left in ar/tn). Swapping them for RTL flipped it back to the right.
        return (
            <View
                style={[styles.messageContainer, isUser ? styles.userMessage : styles.botMessage]}
                onLayout={isLast ? (e) => {
                    lastMessageRef.current = { id: item.id, height: e.nativeEvent.layout.height };
                    scrollToEnd();
                } : undefined}
            >
                <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.botMessageText, { textAlign: 'auto' as const }]}>
                    {!isUser && i18n.language.split('-')[0] === 'fr' ? frenchSpacing(item.text) : item.text}
                </Text>

                {item.data?.type === 'error' && (
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => handleSend((item.data as any).originalText, true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.retry')}
                    >
                        <Text style={styles.retryText}>{t('common.retry')}</Text>
                    </TouchableOpacity>
                )}

                {item.data?.type === 'red_flag' &&
                    (item.data?.redFlag?.severity === 'emergency' ||
                     item.data?.redFlag?.severity === 'urgent_consult') && (
                    <View
                        style={[
                            styles.alertContainer,
                            item.data?.redFlag?.severity === 'emergency' && styles.alertContainerCritical,
                        ]}
                        // W6 #4 (a11y): the emergency block is the most urgent content — announce it
                        // assertively so a screen-reader user hears it immediately (RN-Web → role=alert + aria-live).
                        accessibilityRole="alert"
                        accessibilityLiveRegion="assertive"
                    >
                        {/* Only an emergency gets a heading: for urgent_consult the bubble above
                            already says what to do, and repeating it here (it used to be the same
                            "discuss with your midwife" sentence) only stacked a second, softer
                            urgency on the call action below. */}
                        {item.data?.redFlag?.severity === 'emergency' && (
                            <Text style={styles.alertTitle}>{t('common.chatEmergency')}</Text>
                        )}
                        {/*
                            CB4-FIX (SAFETY):
                            - emergency AND urgent_consult both expose a call action.
                            - Number resolved by country → device region → 112, so a
                              user outside the listed countries gets 112 rather than
                              another country's national number.
                        */}
                        {/* While the call action is pinned above the input, the bubble does not
                            repeat it: two identical buttons on screen were read out twice. */}
                        {emergencyNumber && !pinCall && item.id === latestAlertId ? (
                            <TouchableOpacity
                                style={styles.callButton}
                                onPress={callEmergency}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.emergencyCall')}
                                accessibilityHint={t('a11y.emergencyCallHint')}
                            >
                                <Text style={styles.callButtonText}>📞 {t('common.chatEmergencyAction')} ({emergencyNumberLabel(t, emergencyContact)})</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={styles.alertText}>
                                {t('common.chatEmergencyAction')}
                            </Text>
                        )}
                        <EmergencyNumberNote source={emergencyContact.source} />
                    </View>
                )}

                {item.data?.articles && item.data.articles.length > 0 && (
                    <View style={styles.articlesContainer}>
                        <Text style={styles.sectionTitle}>{t('common.chatRecommendedArticles')}</Text>
                        {item.data.articles.map((article: Article) => (
                            <TouchableOpacity
                                key={article.article_id}
                                style={styles.articleLink}
                                onPress={() => navigation.navigate('Ressources', {
                                    screen: 'ArticleDetail',
                                    params: {
                                        articleId: article.article_id,
                                        anchor: item.data?.anchor
                                    }
                                })}
                                accessibilityRole="button"
                                accessibilityLabel={getLocalizedContent(article, 'title', i18n.language) || article.title_fr || ''}
                                accessibilityHint={t('a11y.readArticle')}
                            >
                                <Text style={styles.articleLinkText}>📄 {getLocalizedContent(article, 'title', i18n.language) || article.title_fr || ''}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {item.data?.screenLink === 'ForbiddenFoods' && (
                    <TouchableOpacity
                        style={styles.articleLink}
                        onPress={() => navigation.navigate('Home', { screen: 'ForbiddenFoods' })}
                        accessibilityRole="link"
                        accessibilityLabel={t('common.chatSeeForbiddenFoods')}
                    >
                        <Text style={styles.articleLinkText}>🍽️ {t('common.chatSeeForbiddenFoods')}</Text>
                    </TouchableOpacity>
                )}

                {/* Render Tips */}
                {item.data?.suggestions?.[0]?.linked_tip_ids && (
                    <View style={styles.articlesContainer}>
                        <Text style={styles.sectionTitle}>{t('common.chatDailyTip')}</Text>
                        <TouchableOpacity
                            style={styles.articleLink}
                            onPress={() => navigation.navigate('Home', {
                                screen: 'HomeMain',
                            })}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.chatSeeTipHome')}
                        >
                            <Text style={styles.articleLinkText}>{t('common.chatSeeTipHome')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Render Tasks */}
                {item.data?.suggestions?.[0]?.linked_task_ids && (
                    <View style={styles.articlesContainer}>
                        <Text style={styles.sectionTitle}>{t('common.chatSuggestedTask')}</Text>
                        <TouchableOpacity
                            style={styles.articleLink}
                            onPress={() => navigation.navigate('Rappels')}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.chatSeeReminders')}
                        >
                            <Text style={styles.articleLinkText}>{t('common.chatSeeReminders')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Cycle 5 F704D — Header avatar bot + identité (avant: pas de header,
                disclaimer flottait seul, écran orphelin). Pattern Ovia/Flo/BabyCenter. */}
            <View style={styles.botHeader}>
                <Text style={styles.botAvatar}>🤖</Text>
                <View style={styles.botHeaderTextContainer}>
                    <Text style={styles.botHeaderTitle}>{t('common.chatbotTitle')}</Text>
                    <Text style={styles.botHeaderSubtitle}>{t('common.chatbotSubtitle')}</Text>
                </View>
            </View>
            <View style={styles.headerContainer}>
                <Text style={styles.disclaimerText}>
                    ⚠️ {t('common.chatDisclaimer')}
                </Text>
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                onContentSizeChange={scrollToEnd}
                onLayout={(e) => {
                    listHeightRef.current = e.nativeEvent.layout.height;
                    scrollToEnd();
                }}
                onScrollToIndexFailed={onScrollToIndexFailed}
            />

            {loading && (
                <View style={[styles.messageContainer, styles.botMessage, { paddingHorizontal: 16, paddingVertical: 12 }]}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
            )}

            {/* While the conversation is on an emergency, the call action is pinned above the
                chips and the input as well, so no scroll position can hide it. */}
            {pinCall && (
                <View style={styles.pinnedCallBar} testID="chat_pinned_emergency_call">
                    <TouchableOpacity
                        style={styles.pinnedCallButton}
                        onPress={callEmergency}
                        accessibilityRole="button"
                        accessibilityLabel={t('a11y.emergencyCall')}
                        accessibilityHint={t('a11y.emergencyCallHint')}
                    >
                        <Text style={styles.callButtonText}>📞 {t('common.chatEmergencyAction')} ({emergencyNumberLabel(t, emergencyContact)})</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.suggestionsContainer}>
                <FlatList
                    horizontal
                    data={suggestions}
                    keyExtractor={item => item.suggestion_id}
                    contentContainerStyle={styles.suggestionsContent}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.suggestionButton}
                            onPress={() => handleSend(getSuggestionLabel(item))}
                            accessibilityRole="button"
                            accessibilityLabel={getSuggestionDisplayLabel(item)}
                            accessibilityHint={t('a11y.suggestionChip')}
                        >
                            <Text style={styles.suggestionText}>{getSuggestionDisplayLabel(item)}</Text>
                        </TouchableOpacity>
                    )}
                    showsHorizontalScrollIndicator={false}
                />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
                style={styles.inputContainer}
            >
                <TextInput
                    style={[styles.input, { textAlign: 'auto' as const }]}
                    value={inputText}
                    onChangeText={setInputText}
                    maxLength={MAX_INPUT_LENGTH}
                    placeholder={t('common.chatAskQuestion')}
                    placeholderTextColor={theme.colors.textLight}
                    textAlign={isRTL ? 'right' : 'left'}
                    accessibilityLabel={t('common.chatAskQuestion')}
                    returnKeyType="send"
                    onSubmitEditing={() => handleSend()}
                />
                <TouchableOpacity
                    onPress={() => handleSend()}
                    disabled={!inputText.trim() || loading}
                    style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.sendMessage')}
                    accessibilityState={{ disabled: !inputText.trim() || loading, busy: loading }}
                >
                    {loading ? (
                        <Text style={[styles.sendButtonText, styles.sendButtonTextDisabled]}>⏳</Text>
                    ) : (
                        <RtlAwareChevron
                            direction="forward"
                            variant="bold"
                            size={18}
                            color={inputText.trim() ? theme.colors.white : theme.colors.materialGray400}
                        />
                    )}
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },

    listContent: {
        padding: theme.spacing.m,
    },
    messageContainer: {
        maxWidth: '80%',
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.m,
    },
    userMessage: {
        alignSelf: 'flex-end',
        backgroundColor: theme.colors.accent,
    },
    botMessage: {
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    messageText: {
        ...theme.typography.body,
    },
    userMessageText: {
        color: theme.colors.white,
    },
    botMessageText: {
        color: theme.colors.text,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: theme.spacing.m,
        backgroundColor: theme.colors.white,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    input: {
        flex: 1,
        backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.round,
        paddingHorizontal: theme.spacing.m,
        marginEnd: theme.spacing.s,
        height: 48,
    },
    // sendButton — see smart button styles below
    suggestionsContainer: {
        paddingVertical: theme.spacing.s,
        backgroundColor: theme.colors.background,
    },
    // Chips carry a 4px margin each side; without this the first/last chip sat 4px from the
    // screen edge. Symmetric padding keeps the 8px+ inset on both ends in LTR and RTL.
    suggestionsContent: {
        paddingHorizontal: theme.spacing.s,
    },
    suggestionButton: {
        backgroundColor: theme.colors.white,
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
        borderRadius: theme.borderRadius.round,
        marginHorizontal: theme.spacing.xs,
        borderWidth: 1,
        borderColor: theme.colors.secondary,
    },
    sectionTitle: {
        ...theme.typography.h3,
        marginBottom: theme.spacing.s,
        marginTop: theme.spacing.s,
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: 'bold',
    },
    suggestionText: {
        ...theme.typography.caption,
        color: theme.colors.text,
    },
    alertContainer: {
        marginTop: theme.spacing.s,
        padding: theme.spacing.s,
        backgroundColor: theme.colors.surfaceOrangeTint,
        borderRadius: theme.borderRadius.s,
        borderWidth: 1,
        borderColor: theme.colors.warning,
    },
    alertContainerCritical: {
        backgroundColor: theme.colors.surfaceRose,
        borderColor: theme.colors.error,
    },
    alertTitle: {
        fontWeight: 'bold',
        // W6 #3 (a11y): the most safety-critical text must be legible. error #E57373 on the alert
        // tint was 2.6:1 (WCAG fail); red800 is ≥4.9:1 on both surfaceRose and surfaceOrangeTint.
        color: theme.colors.red800,
        fontSize: 13,
        marginBottom: 6,
    },
    alertText: {
        color: theme.colors.red800,
        fontSize: 12,
    },
    callButton: {
        marginTop: 8,
        // W6 #3: white-on-error was sub-AA; white-on-red800 = 5.6:1.
        backgroundColor: theme.colors.red800,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 44,
        borderRadius: theme.borderRadius.m,
        alignSelf: 'flex-start',
        justifyContent: 'center',
    },
    pinnedCallBar: {
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
        backgroundColor: theme.colors.surfaceRose,
        borderTopWidth: 1,
        borderTopColor: theme.colors.error,
    },
    pinnedCallButton: {
        // Same red800 as the in-message call button (white on it is 5.6:1).
        backgroundColor: theme.colors.red800,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 44,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        justifyContent: 'center',
    },
    callButtonText: {
        color: theme.colors.white,
        fontWeight: 'bold',
        fontSize: 14,
    },
    articlesContainer: {
        marginTop: theme.spacing.s,
    },
    articleLink: {
        marginTop: 4,
        minHeight: 44,
        justifyContent: 'center',
    },
    articleLinkText: {
        color: theme.colors.accent,
        textDecorationLine: 'underline' as const,
    },
    loadingContainer: {
        padding: theme.spacing.s,
    },
    retryButton: {
        marginTop: 8,
        backgroundColor: theme.colors.background,
        padding: 8,
        borderRadius: 8,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    retryText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontWeight: 'bold',
    },
    headerContainer: {
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    // Cycle 5 F704D — Bot header avec avatar + identité. No "beta" badge: a beta has no
    // place on the App Store (2.2); the disclaimer below frames what the assistant is.
    botHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    botAvatar: {
        fontSize: 32,
        marginEnd: 12,
    },
    botHeaderTextContainer: {
        flex: 1,
    },
    botHeaderTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.text,
    },
    botHeaderSubtitle: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    // Cycle 2 F302 : medical disclaimer doit être lisible (sujet sanitaire critique +
    // risque légal). gray500 = ratio ~2.85:1 (FAIL WCAG AA). textSecondary ≈ 5.4:1.
    // Italic conservé pour la nuance "advisory", mais fontSize bumpé à 12 + non-italic.
    disclaimerText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    // ── Smart send button styles
    sendButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginStart: 8,
    },
    sendButtonDisabled: {
        backgroundColor: theme.colors.disabled,
    },
    sendButtonText: {
        fontSize: 18,
        color: theme.colors.white,
    },
    sendButtonTextDisabled: {
        color: theme.colors.materialGray400,
    },
});
