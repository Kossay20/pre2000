import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Linking, Keyboard } from 'react-native';
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
import { getLocalizedContent } from '../utils/i18nHelpers';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { useAuth } from '../context/AuthContext';
import { resolveEmergencyNumber } from '../utils/clinicalChecks';

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
    // CB4-FIX (SAFETY): pick emergency number from country first, then locale.
    // null → no confident match; the call button is hidden rather than dial wrong.
    const emergencyNumber = resolveEmergencyNumber(user?.country, i18n.language);
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

    const handleSend = async (text: string = inputText, isRetry = false) => {
        const messageText = text.trim();
        if (!messageText) return;
        if (messageText.length > MAX_INPUT_LENGTH) return; // silently ignore oversized input
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

    const getSuggestionLabel = (item: ChatbotSuggestion): string => {
        return getLocalizedContent(item, 'label', i18n.language) || item.label_fr || '';
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isUser = item.sender === 'user';
        // FIX-C: RTL bubble alignment
        const bubbleAlign = isRTL
            ? (isUser ? { alignSelf: 'flex-start' as const } : { alignSelf: 'flex-end' as const })
            : {};
        return (
            <View style={[styles.messageContainer, isUser ? styles.userMessage : styles.botMessage, bubbleAlign]}>
                <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.botMessageText, { textAlign: 'auto' as const }]}>
                    {item.text}
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
                    <View style={[
                        styles.alertContainer,
                        item.data?.redFlag?.severity === 'emergency' && styles.alertContainerCritical,
                    ]}>
                        <Text style={styles.alertTitle}>
                            {item.data?.redFlag?.severity === 'emergency'
                                ? t('common.chatEmergency')
                                : `⚠️ ${t('common.chatResponse.redFlagHigh')}`}
                        </Text>
                        {/*
                            CB4-FIX (SAFETY):
                            - emergency AND urgent_consult both expose a call action.
                            - Number resolved by country → locale fallback. If null
                              (unknown country / non-mapped locale), we do NOT render
                              a tel: button — never dial a wrong country's number.
                        */}
                        {emergencyNumber ? (
                            <TouchableOpacity
                                style={styles.callButton}
                                onPress={() => {
                                    Linking.openURL(`tel:${emergencyNumber}`).catch(() =>
                                        showAlert(t('common.chatEmergency'), t('common.chatEmergencyAction'))
                                    );
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.emergencyCall')}
                                accessibilityHint={t('a11y.emergencyCallHint')}
                            >
                                <Text style={styles.callButtonText}>📞 {t('common.chatEmergencyAction')} ({emergencyNumber})</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={styles.alertText}>
                                {t('common.chatEmergencyAction')}
                            </Text>
                        )}
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
                <View style={styles.botBetaBadge}>
                    <Text style={styles.botBetaBadgeText}>BETA</Text>
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
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            {loading && (
                <View style={[styles.messageContainer, styles.botMessage, { paddingHorizontal: 16, paddingVertical: 12 }]}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
            )}

            <View style={styles.suggestionsContainer}>
                <FlatList
                    horizontal
                    data={suggestions}
                    keyExtractor={item => item.suggestion_id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.suggestionButton}
                            onPress={() => handleSend(getSuggestionLabel(item))}
                            accessibilityRole="button"
                            accessibilityLabel={getSuggestionLabel(item)}
                            accessibilityHint={t('a11y.suggestionChip')}
                        >
                            <Text style={styles.suggestionText}>{getSuggestionLabel(item)}</Text>
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
        backgroundColor: theme.colors.primary,
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
    suggestionButton: {
        backgroundColor: theme.colors.white,
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
        color: theme.colors.error,
        fontSize: 13,
        marginBottom: 6,
    },
    alertText: {
        color: theme.colors.error,
        fontSize: 12,
    },
    callButton: {
        marginTop: 8,
        backgroundColor: theme.colors.error,
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 44,
        borderRadius: theme.borderRadius.m,
        alignSelf: 'flex-start',
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
    },
    articleLinkText: {
        color: theme.colors.primary,
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
        color: theme.colors.primary,
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
    // Cycle 5 F704D — Bot header avec avatar + identité + BETA badge.
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
    botBetaBadge: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    botBetaBadgeText: {
        color: theme.colors.white,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
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
        backgroundColor: theme.colors.primary,
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
