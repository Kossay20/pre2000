import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

// Brand contact email — same value across locales, kept in a single constant
// so the address shown in the UI and the mailto: target can never drift.
// The published policy (website/privacy.html) names this address; mamabebe.app
// has no mail server, so the previous value bounced every request.
const CONTACT_EMAIL = 'contact@mama-et-bebe.com';

/**
 * PrivacyPolicyScreen - Legal compliance for App Store
 * Required for: Apple App Store, Google Play Store, RGPD
 * Tabs: Privacy | Terms (CGU) | Cookies
 */
export const PrivacyPolicyScreen = () => {
    useScreenAnalytics('PrivacyPolicyScreen');
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'cookies'>('privacy');

    // The policy names in-app paths ("Settings → Data & Privacy → …"). They are built
    // from the very labels those screens render, so a renamed row cannot leave the
    // policy pointing at something that no longer exists.
    const paths = {
        profile: t('common.screen.myProfile'),
        dangerZone: t('common.dangerZone'),
        deleteFromProfile: t('profile.deleteAccount'),
        settings: t('common.screen.settings'),
        dataSection: t('common.privacyData.title'),
        deleteFromSettings: t('common.privacyData.deleteAccount'),
        eraseGuest: t('common.privacyData.eraseGuestData'),
        export: t('common.privacyData.export'),
        medical: t('common.medicalProfile.settingsTitle'),
    };

    const handleContactPress = () => {
        Linking.openURL(`mailto:${CONTACT_EMAIL}`);
    };

    return (
        <View style={styles.container}>
            {/* Header Title */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>{t('legalTerms.title')}</Text>
                <Text style={styles.headerSubtitle}>{t('privacy.lastUpdated')}</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {(['privacy', 'terms', 'cookies'] as const).map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                            {t(`legalTerms.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={styles.contentScroll}>
                <View style={styles.content}>
                    {activeTab === 'privacy' && (
                        <>
                            {/* Introduction */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.intro.title')}</Text>
                                <Text style={styles.paragraph}>{t('privacy.intro.text')}</Text>
                            </View>

                            {/* Data Collection */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.collection.title')}</Text>
                                <Text style={styles.paragraph}>{t('privacy.collection.text')}</Text>
                                <View style={styles.bulletList}>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.account')}</Text> {t('privacy.collection.accountDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.profile')}</Text> {t('privacy.collection.profileDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.health')}</Text> {t('privacy.collection.healthDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.medical')}</Text> {t('privacy.collection.medicalDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.emergency')}</Text> {t('privacy.collection.emergencyDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.device')}</Text> {t('privacy.collection.deviceDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.assistant')}</Text> {t('privacy.collection.assistantDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.collection.technical')}</Text> {t('privacy.collection.technicalDesc')}</Text>
                                </View>
                            </View>

                            {/* Data Usage */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.usage.title')}</Text>
                                <Text style={styles.paragraph}>{t('privacy.usage.text')}</Text>
                                <View style={styles.bulletList}>
                                    <Text style={styles.bulletItem}>• {t('privacy.usage.item1')}</Text>
                                    <Text style={styles.bulletItem}>• {t('privacy.usage.item2')}</Text>
                                    <Text style={styles.bulletItem}>• {t('privacy.usage.item3')}</Text>
                                </View>
                                {/* The consent asked on onboarding's last step (HealthDataConsentCheck). */}
                                <Text style={styles.paragraph}>{t('privacy.usage.consent')}</Text>
                                <Text style={[styles.paragraph, styles.highlightText]}>
                                    {t('privacy.usage.disclaimer')}
                                </Text>
                            </View>

                            {/* Processors */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.processors.title')}</Text>
                                <Text style={styles.paragraph}>{t('privacy.processors.text')}</Text>
                                <View style={styles.bulletList}>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.processors.firebase')}</Text> {t('privacy.processors.firebaseDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.processors.sentry')}</Text> {t('privacy.processors.sentryDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.processors.expo')}</Text> {t('privacy.processors.expoDesc')}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.processors.fonts')}</Text> {t('privacy.processors.fontsDesc')}</Text>
                                </View>
                            </View>

                            {/* Storage, security, transfers */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.storage.title')}</Text>
                                <Text style={styles.paragraph}>{t('privacy.storage.text')}</Text>
                            </View>

                            {/* Retention */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.retention.title')}</Text>
                                <Text style={styles.paragraph}>{t('privacy.retention.text')}</Text>
                            </View>

                            {/* User Rights */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.rights.title')}</Text>
                                <Text style={styles.paragraph}>{t('privacy.rights.text')}</Text>
                                <View style={styles.bulletList}>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.rights.access')}</Text> {t('privacy.rights.accessDesc', paths)}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.rights.rectification')}</Text> {t('privacy.rights.rectificationDesc', paths)}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.rights.deletion')}</Text> {t('privacy.rights.deletionDesc', paths)}</Text>
                                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>{t('privacy.rights.consent')}</Text> {t('privacy.rights.consentDesc', paths)}</Text>
                                </View>
                            </View>

                            {/* Contact */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.contact.title')}</Text>
                                <Text style={styles.paragraph}>
                                    {t('privacy.contact.text')}
                                </Text>
                                <TouchableOpacity style={styles.contactButton} onPress={handleContactPress}>
                                    <Text style={styles.contactButtonText}>📧 {CONTACT_EMAIL}</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Mode Invité */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('privacy.guestMode.title')}</Text>
                                <Text style={styles.paragraph}>
                                    {t('privacy.guestMode.text', paths)}
                                </Text>
                            </View>
                        </>
                    )}

                    {activeTab === 'terms' && (
                        <>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('legalTerms.terms.title')}</Text>
                                <Text style={styles.paragraph}>{t('legalTerms.terms.intro')}</Text>

                                <View style={[styles.alertBox, { borderColor: theme.colors.warning }]}>
                                    <Text style={[styles.alertText, { color: theme.colors.deepOrange900 }]}>
                                        {t('legalTerms.terms.medical')}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('legalTerms.terms.liabilityTitle')}</Text>
                                <Text style={styles.paragraph}>{t('legalTerms.terms.liability')}</Text>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('legalTerms.terms.ipTitle')}</Text>
                                <Text style={styles.paragraph}>{t('legalTerms.terms.content')}</Text>
                            </View>
                        </>
                    )}

                    {activeTab === 'cookies' && (
                        <>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t('legalTerms.cookies.title')}</Text>
                                <Text style={styles.paragraph}>{t('legalTerms.cookies.intro')}</Text>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>1. {t('legalTerms.cookies.techTitle')}</Text>
                                <Text style={styles.paragraph}>{t('legalTerms.cookies.tech')}</Text>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>2. {t('legalTerms.cookies.analytics_title')}</Text>
                                <Text style={styles.paragraph}>{t('legalTerms.cookies.analytics_desc')}</Text>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>3. {t('legalTerms.cookies.firebase_title')}</Text>
                                <Text style={styles.paragraph}>{t('legalTerms.cookies.firebase_desc')}</Text>
                            </View>
                        </>
                    )}
                </View>
                <View style={styles.footer}>
                    <Text style={styles.footerText}>{t('privacy.footer', { year: new Date().getFullYear() })}</Text>
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.neutral100,
    },
    header: {
        padding: 20,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.disabled,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.neutral900,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.white,
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.disabled,
        gap: 8,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: theme.colors.borderLight,
    },
    tabButtonActive: {
        backgroundColor: theme.colors.accent,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    tabTextActive: {
        color: theme.colors.white,
    },
    contentScroll: {
        flex: 1,
    },
    content: {
        padding: 16,
    },
    section: {
        backgroundColor: theme.colors.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.colors.accent,
        marginBottom: 12,
    },
    paragraph: {
        fontSize: 15,
        color: theme.colors.neutral800,
        lineHeight: 24,
        marginBottom: 8,
    },
    bulletList: {
        marginStart: 8,
        marginTop: 8,
    },
    bulletItem: {
        fontSize: 14,
        color: theme.colors.neutral800,
        lineHeight: 24,
        marginBottom: 4,
    },
    bold: {
        fontWeight: '600',
    },
    highlightText: {
        backgroundColor: theme.colors.surfaceOrangeTint,
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
        color: theme.colors.deepOrange900,
        fontWeight: '500',
    },
    alertBox: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
        backgroundColor: theme.colors.white,
    },
    alertText: {
        fontSize: 14,
        fontWeight: '600',
    },
    contactButton: {
        backgroundColor: theme.colors.accent,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 12,
    },
    contactButtonText: {
        color: theme.colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    footer: {
        alignItems: 'center',
        padding: 24,
    },
    footerText: {
        fontSize: 12,
        color: theme.colors.textMuted,
    },
});
