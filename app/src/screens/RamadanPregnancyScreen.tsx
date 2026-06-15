import React, { useCallback, useState } from 'react';
import {
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { sanitizeTelNumber } from '../components/profile/EmergencyContactsSection.helpers';
import { usePregnancy } from '../context/PregnancyContext';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import {
    DayStatus,
    RamadanState,
    computeFidyaRemaining,
    computeMissedCount,
    decrementFidyaPaid,
    incrementFidyaPaid,
    loadState,
    logDay,
    removeDay,
    setConsultedDoctor,
} from '../services/ramadanService';
import guidance from '../data/ramadan_pregnancy_guidance.json';

interface TrimesterEntry {
    id: string;
    weeks: string;
    label_fr: string;
    label_en: string;
    label_ar: string;
    label_tn: string;
    key_risks: string[];
    key_risks_en: string[];
    key_risks_ar: string[];
    key_risks_tn: string[];
    recommendation_fr: string;
    recommendation_en: string;
    recommendation_ar: string;
    recommendation_tn: string;
}

interface MultilingualItem {
    fr: string;
    en: string;
    ar: string;
    tn: string;
}

interface SectionItems {
    label_fr: string;
    label_en: string;
    label_ar: string;
    label_tn: string;
    items: MultilingualItem[];
}

const G = guidance as {
    _meta: { disclaimer_principle: string };
    trimesters: TrimesterEntry[];
    break_fast_warning_signs: SectionItems;
    suhoor_tips: SectionItems;
    iftar_tips: SectionItems;
};

const pickLabel = (entry: TrimesterEntry, lang: string): string => {
    if (lang === 'ar') return entry.label_ar;
    if (lang === 'tn') return entry.label_tn || entry.label_ar;
    if (lang === 'en') return entry.label_en;
    return entry.label_fr;
};

const pickRecommendation = (entry: TrimesterEntry, lang: string): string => {
    if (lang === 'ar') return entry.recommendation_ar;
    if (lang === 'tn') return entry.recommendation_tn || entry.recommendation_ar;
    if (lang === 'en') return entry.recommendation_en;
    return entry.recommendation_fr;
};

const pickRisks = (entry: TrimesterEntry, lang: string): string[] => {
    if (lang === 'ar') return entry.key_risks_ar;
    if (lang === 'tn') return entry.key_risks_tn || entry.key_risks_ar;
    if (lang === 'en') return entry.key_risks_en;
    return entry.key_risks;
};

const pickItem = (item: MultilingualItem, lang: string): string => {
    if (lang === 'ar') return item.ar;
    if (lang === 'tn') return item.tn || item.ar;
    if (lang === 'en') return item.en;
    return item.fr;
};

const pickSectionLabel = (sec: SectionItems, lang: string): string => {
    if (lang === 'ar') return sec.label_ar;
    if (lang === 'tn') return sec.label_tn || sec.label_ar;
    if (lang === 'en') return sec.label_en;
    return sec.label_fr;
};

export const RamadanPregnancyScreen: React.FC = () => {
    useScreenAnalytics('RamadanPregnancyScreen');
    const { t, i18n } = useTranslation();
    const navigation = useNavigation();
    const { profile } = usePregnancy();
    const lang = i18n.language;
    const [state, setState] = useState<RamadanState>({
        daysToMakeUp: [],
        fidyaPaidCount: 0,
        consultedDoctor: false,
    });

    useFocusEffect(
        useCallback(() => {
            let alive = true;
            loadState().then((s) => {
                if (alive) setState(s);
            });
            return () => {
                alive = false;
            };
        }, []),
    );

    const onLog = useCallback(async (status: DayStatus) => {
        const today = new Date().toISOString().slice(0, 10);
        const next = await logDay(status, today);
        setState(next);
    }, []);

    const onRemove = useCallback(async (id: string) => {
        const next = await removeDay(id);
        setState(next);
    }, []);

    const onConsulted = useCallback(async () => {
        const next = await setConsultedDoctor(!state.consultedDoctor);
        setState(next);
    }, [state.consultedDoctor]);

    const onFidyaPlus = useCallback(async () => {
        const next = await incrementFidyaPaid();
        setState(next);
    }, []);

    const onFidyaMinus = useCallback(async () => {
        const next = await decrementFidyaPaid();
        setState(next);
    }, []);

    // R3-RAMADAN-01: the button previously called Linking.openURL('tel:') with no
    // number — a dead dial. Now we look up the user's saved doctor emergency
    // contact (profile.emergencyContacts where type === 'doctor') and dial it,
    // reusing the sanitize + canOpenURL guard from EmergencyContactsSection. If no
    // doctor number is on file we navigate to Profile (which hosts the emergency
    // contacts editor) so the user can add one, rather than firing an empty tel:.
    const onCallDoctor = useCallback(() => {
        const doctor = profile?.emergencyContacts?.find((c) => c.type === 'doctor');
        const sanitized = doctor ? sanitizeTelNumber(doctor.number) : null;
        if (!sanitized) {
            // @ts-ignore — global nav augmentation: Profile is reachable from the Home stack
            navigation.navigate('Profile');
            return;
        }
        const url = `tel:${sanitized}`;
        Linking.canOpenURL(url)
            .then((supported) => {
                if (supported) return Linking.openURL(url);
                // Dialer unavailable (e.g. web/tablet) — fall back to the contacts editor.
                // @ts-ignore — global nav augmentation
                navigation.navigate('Profile');
            })
            .catch(() => {});
    }, [profile, navigation]);

    const missed = computeMissedCount(state);
    const fidyaRemaining = computeFidyaRemaining(state);

    return (
        <SafeAreaView style={styles.safe} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>{t('cycle8.ramadan.title')}</Text>
                <Text style={styles.subtitle}>{t('cycle8.ramadan.subtitle')}</Text>

                <View style={styles.draftBanner}>
                    <Text style={styles.draftBannerText}>{t('cycle8.ramadan.draftBanner')}</Text>
                </View>

                <TouchableOpacity
                    style={[
                        styles.consultRow,
                        state.consultedDoctor && styles.consultRowChecked,
                    ]}
                    onPress={onConsulted}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: state.consultedDoctor }}
                    {...(Platform.OS === 'web' ? { 'aria-checked': state.consultedDoctor } : {})}
                >
                    <View style={[styles.checkbox, state.consultedDoctor && styles.checkboxChecked]}>
                        {state.consultedDoctor && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>
                    <Text style={styles.consultText}>{t('cycle8.ramadan.consultDoctor')}</Text>
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>{t('cycle8.ramadan.trimesterTitle')}</Text>
                {G.trimesters.map((trim) => (
                    <Card key={trim.id} style={styles.trimCard}>
                        <Text style={styles.trimTitle}>{pickLabel(trim, lang)}</Text>
                        <Text style={styles.trimWeeks}>
                            {t('cycle8.ramadan.weeks')} : {trim.weeks}
                        </Text>
                        <Text style={styles.trimSubLabel}>{t('cycle8.ramadan.keyRisks')}</Text>
                        {pickRisks(trim, lang).map((r, i) => (
                            <Text key={i} style={styles.bullet}>
                                • {r}
                            </Text>
                        ))}
                        <Text style={styles.trimSubLabel}>{t('cycle8.ramadan.recommendation')}</Text>
                        <Text style={styles.recommendation}>{pickRecommendation(trim, lang)}</Text>
                    </Card>
                ))}

                <Card style={[styles.warnCard]}>
                    <Text style={styles.warnTitle}>
                        🚨 {pickSectionLabel(G.break_fast_warning_signs, lang)}
                    </Text>
                    {G.break_fast_warning_signs.items.map((it, i) => (
                        <Text key={i} style={styles.bullet}>
                            • {pickItem(it, lang)}
                        </Text>
                    ))}
                </Card>

                <Card style={styles.tipCard}>
                    <Text style={styles.tipTitle}>🌅 {pickSectionLabel(G.suhoor_tips, lang)}</Text>
                    {G.suhoor_tips.items.map((it, i) => (
                        <Text key={i} style={styles.bullet}>
                            • {pickItem(it, lang)}
                        </Text>
                    ))}
                </Card>

                <Card style={styles.tipCard}>
                    <Text style={styles.tipTitle}>🌙 {pickSectionLabel(G.iftar_tips, lang)}</Text>
                    {G.iftar_tips.items.map((it, i) => (
                        <Text key={i} style={styles.bullet}>
                            • {pickItem(it, lang)}
                        </Text>
                    ))}
                </Card>

                <Text style={styles.sectionTitle}>{t('cycle8.ramadan.trackerTitle')}</Text>
                <Text style={styles.trackerSub}>{t('cycle8.ramadan.trackerSubtitle')}</Text>

                <View style={styles.logRow}>
                    <Button
                        title={t('cycle8.ramadan.logBroken')}
                        onPress={() => onLog('broken')}
                        variant="secondary"
                    />
                    <View style={{ width: theme.spacing.s }} />
                    <Button
                        title={t('cycle8.ramadan.logSkipped')}
                        onPress={() => onLog('skipped')}
                        variant="secondary"
                    />
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{missed}</Text>
                        <Text style={styles.statLabel}>{t('cycle8.ramadan.missedDays')}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{state.fidyaPaidCount}</Text>
                        <Text style={styles.statLabel}>{t('cycle8.ramadan.fidyaPaid')}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{fidyaRemaining}</Text>
                        <Text style={styles.statLabel}>{t('cycle8.ramadan.fidyaRemaining')}</Text>
                    </View>
                </View>

                <View style={styles.fidyaRow}>
                    <Button title={t('cycle8.ramadan.fidyaPlus')} onPress={onFidyaPlus} variant="primary" />
                    <View style={{ width: theme.spacing.s }} />
                    <Button title={t('cycle8.ramadan.fidyaMinus')} onPress={onFidyaMinus} variant="ghost" />
                </View>

                {state.daysToMakeUp.length === 0 ? (
                    <Text style={styles.empty}>{t('cycle8.ramadan.noMissedDays')}</Text>
                ) : (
                    state.daysToMakeUp.map((d) => (
                        <View key={d.id} style={styles.dayRow}>
                            <Text style={styles.dayDate}>{d.dateISO}</Text>
                            <Text style={styles.dayStatus}>
                                {d.status === 'broken'
                                    ? t('cycle8.ramadan.logBroken')
                                    : t('cycle8.ramadan.logSkipped')}
                            </Text>
                            <TouchableOpacity onPress={() => onRemove(d.id)} accessibilityLabel={t('cycle8.ramadan.remove')}>
                                <Text style={styles.removeBtn}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                )}

                <TouchableOpacity onPress={onCallDoctor} style={styles.callRow} accessibilityRole="button">
                    <Text style={styles.callText}>📞 {t('cycle8.ramadan.callDoctor')}</Text>
                </TouchableOpacity>

                <Text style={styles.disclaimer}>{t('cycle8.ramadan.disclaimer')}</Text>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.l },
    title: { ...theme.typography.h2, marginBottom: theme.spacing.xs },
    subtitle: { ...theme.typography.body, color: theme.colors.textLight, marginBottom: theme.spacing.m },
    draftBanner: {
        backgroundColor: theme.colors.warningSoftBg,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.l,
    },
    draftBannerText: { ...theme.typography.caption, color: theme.colors.warningTextDark },
    consultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.l,
    },
    consultRowChecked: { backgroundColor: theme.colors.surfaceGreenTint },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: theme.colors.border,
        marginEnd: theme.spacing.m,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
    checkboxMark: { color: theme.colors.white, fontWeight: '700' },
    consultText: { ...theme.typography.body, flex: 1 },
    sectionTitle: { ...theme.typography.h3, color: theme.colors.text, marginTop: theme.spacing.l, marginBottom: theme.spacing.s },
    trimCard: { padding: theme.spacing.m, marginBottom: theme.spacing.s },
    trimTitle: { ...theme.typography.h3, color: theme.colors.primary, marginBottom: theme.spacing.xs },
    trimWeeks: { ...theme.typography.caption, color: theme.colors.textLight, marginBottom: theme.spacing.s },
    trimSubLabel: { ...theme.typography.label, color: theme.colors.text, marginTop: theme.spacing.s, marginBottom: theme.spacing.xs },
    bullet: { ...theme.typography.body, color: theme.colors.text, lineHeight: 22, marginBottom: theme.spacing.xs },
    recommendation: { ...theme.typography.body, color: theme.colors.text, lineHeight: 22 },
    warnCard: { backgroundColor: theme.colors.feedbackErrorBg, padding: theme.spacing.m, marginVertical: theme.spacing.s },
    warnTitle: { ...theme.typography.h3, color: theme.colors.red700, marginBottom: theme.spacing.s },
    tipCard: { backgroundColor: theme.colors.surfaceGreenTint, padding: theme.spacing.m, marginVertical: theme.spacing.s },
    tipTitle: { ...theme.typography.h3, color: theme.colors.green800, marginBottom: theme.spacing.s },
    trackerSub: { ...theme.typography.caption, color: theme.colors.textLight, marginBottom: theme.spacing.m },
    logRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: theme.spacing.l },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: theme.spacing.m, gap: theme.spacing.s },
    statBox: {
        flex: 1,
        padding: theme.spacing.m,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
    },
    statValue: { ...theme.typography.h2, color: theme.colors.primary, fontWeight: '700' },
    statLabel: { ...theme.typography.caption, color: theme.colors.textLight, textAlign: 'center', marginTop: theme.spacing.xs },
    fidyaRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: theme.spacing.l },
    empty: { ...theme.typography.caption, color: theme.colors.textLight, textAlign: 'center', padding: theme.spacing.m },
    dayRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.s,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.borderLight,
    },
    dayDate: { ...theme.typography.body, color: theme.colors.text, flex: 1 },
    dayStatus: { ...theme.typography.caption, color: theme.colors.textLight, marginEnd: theme.spacing.m },
    removeBtn: { color: theme.colors.error, fontSize: 18, fontWeight: '700', paddingHorizontal: theme.spacing.s },
    callRow: { padding: theme.spacing.m, alignItems: 'center', marginTop: theme.spacing.l },
    callText: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '600' },
    disclaimer: {
        ...theme.typography.caption,
        color: theme.colors.textLight,
        fontStyle: 'italic',
        marginTop: theme.spacing.l,
        textAlign: 'center',
    },
});
