import React, { useCallback, useMemo, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { MODAL_MAX_WIDTH } from '../utils/layout';
import { Button } from '../components/common/Button';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import {
    HospitalBagItem,
    HospitalBagSection,
    HospitalBagState,
    addCustomItem,
    computeProgress,
    loadState,
    removeCustomItem,
    toggleItem,
} from '../services/hospitalBagService';

const SECTIONS: HospitalBagSection[] = ['papers', 'mom', 'baby', 'partner'];

const labelFor = (item: HospitalBagItem, lang: string): string => {
    switch (lang) {
        case 'fr':
            return item.label_fr;
        case 'ar':
            return item.label_ar;
        case 'tn':
            return item.label_tn || item.label_ar;
        default:
            return item.label_en;
    }
};

export const HospitalBagChecklistScreen: React.FC = () => {
    useScreenAnalytics('HospitalBagChecklistScreen');
    const { t, i18n } = useTranslation();
    // AUDIT-FIX (P2, ar/tn RTL): language-derived RTL — on web the codebase does NOT call
    // I18nManager.forceRTL, so logical margins (marginEnd) resolve to the physical right edge
    // regardless of language. The row mirrors visually under dir=rtl but the checkbox→label gap
    // stayed on the screen-edge side. Pick the spacing side + text alignment explicitly per lang.
    const isRTL = i18n.language === 'ar' || i18n.language === 'tn';
    const [state, setState] = useState<HospitalBagState>({ items: [], checked: {} });
    const [addingFor, setAddingFor] = useState<HospitalBagSection | null>(null);
    const [draft, setDraft] = useState('');

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

    const onToggle = useCallback(async (id: string) => {
        const next = await toggleItem(id);
        setState(next);
    }, []);

    const onRemove = useCallback(async (id: string) => {
        const next = await removeCustomItem(id);
        setState(next);
    }, []);

    const onAddSubmit = useCallback(async () => {
        if (!addingFor) return;
        const next = await addCustomItem(addingFor, draft);
        setState(next);
        setAddingFor(null);
        setDraft('');
    }, [addingFor, draft]);

    const grouped = useMemo(() => {
        const map: Record<HospitalBagSection, HospitalBagItem[]> = {
            papers: [],
            mom: [],
            baby: [],
            partner: [],
        };
        state.items.forEach((item) => {
            map[item.section].push(item);
        });
        return map;
    }, [state.items]);

    const progress = computeProgress(state);
    const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

    return (
        <SafeAreaView style={styles.safe} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>{t('cycle8.hospitalBag.title')}</Text>
                <Text style={styles.subtitle}>{t('cycle8.hospitalBag.subtitle')}</Text>

                <View style={styles.progressWrap}>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.progressText}>
                        {t('cycle8.hospitalBag.progress', { done: progress.done, total: progress.total })}
                    </Text>
                </View>

                <Text style={styles.tip}>{t('cycle8.hospitalBag.tip')}</Text>

                {SECTIONS.map((sec) => (
                    <View key={sec} style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            {t(`cycle8.hospitalBag.sections.${sec}`)}
                        </Text>
                        {grouped[sec].map((item) => {
                            const checked = !!state.checked[item.id];
                            // Cycle 8.2 P2 fix: split nested TouchableOpacity into a non-nested layout.
                            // Outer = View (no press); inner left side = checkbox toggle button;
                            // inner right side = remove button (custom only). Avoids Android event-bubble
                            // bug where remove + toggle both fire, and avoids the screen-reader confusion
                            // of a "checkbox" with a destructive button inside.
                            return (
                                <View key={item.id} style={styles.row}>
                                    <TouchableOpacity
                                        style={styles.rowToggle}
                                        onPress={() => onToggle(item.id)}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked }}
                                        accessibilityLabel={labelFor(item, i18n.language)}
                                        {...(Platform.OS === 'web' ? { 'aria-checked': checked } : {})}
                                    >
                                        <View
                                            style={[
                                                styles.checkbox,
                                                checked && styles.checkboxChecked,
                                            ]}
                                        >
                                            {checked && <Text style={styles.checkboxMark}>✓</Text>}
                                        </View>
                                        <Text
                                            style={[
                                                styles.rowLabel,
                                                { textAlign: isRTL ? 'right' : 'left' },
                                                checked && styles.rowLabelChecked,
                                            ]}
                                            numberOfLines={2}
                                        >
                                            {labelFor(item, i18n.language)}
                                        </Text>
                                    </TouchableOpacity>
                                    {item.custom && (
                                        <TouchableOpacity
                                            onPress={() => onRemove(item.id)}
                                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('cycle8.hospitalBag.removeCustom')}
                                            style={styles.removeBtnTouch}
                                        >
                                            <Text style={styles.removeText}>✕</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        })}
                        <TouchableOpacity
                            style={styles.addRow}
                            onPress={() => setAddingFor(sec)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.addRowText}>+ {t('cycle8.hospitalBag.addCustom')}</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>

            <Modal
                visible={addingFor !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setAddingFor(null)}
            >
                {/* Cycle 8.2 P2 fix: Pressable backdrop dismisses modal on tap-outside (iOS UX).
                    Inner card uses pointer-event swallowing via its own Pressable so taps inside
                    don't bubble up to dismiss. */}
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => {
                        setAddingFor(null);
                        setDraft('');
                    }}
                    accessibilityLabel={t('cycle8.hospitalBag.cancel')}
                >
                    <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation?.()}>
                        <Text style={styles.modalTitle}>{t('cycle8.hospitalBag.addCustom')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('cycle8.hospitalBag.addCustomPlaceholder')}
                            placeholderTextColor={theme.colors.textMuted}
                            value={draft}
                            onChangeText={setDraft}
                            maxLength={80}
                            autoFocus
                            accessibilityLabel={t('cycle8.hospitalBag.addCustom')}
                        />
                        <View style={styles.modalActions}>
                            <Button
                                title={t('cycle8.hospitalBag.cancel')}
                                onPress={() => {
                                    setAddingFor(null);
                                    setDraft('');
                                }}
                                variant="secondary"
                            />
                            <View style={{ width: theme.spacing.s }} />
                            <Button
                                title={t('cycle8.hospitalBag.add')}
                                onPress={onAddSubmit}
                                variant="primary"
                                disabled={!draft.trim()}
                            />
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.l },
    title: { ...theme.typography.h2, marginBottom: theme.spacing.xs },
    subtitle: { ...theme.typography.body, color: theme.colors.textLight, marginBottom: theme.spacing.m },
    progressWrap: { marginBottom: theme.spacing.m },
    progressBarBg: {
        height: 8,
        backgroundColor: theme.colors.border,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: 8,
        backgroundColor: theme.colors.primary,
        borderRadius: 4,
    },
    progressText: { ...theme.typography.caption, color: theme.colors.textLight, marginTop: theme.spacing.xs },
    tip: {
        ...theme.typography.caption,
        color: theme.colors.text,
        backgroundColor: theme.colors.surfaceTip,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.l,
    },
    section: { marginBottom: theme.spacing.l },
    sectionTitle: { ...theme.typography.h3, marginBottom: theme.spacing.s },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.s,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.borderLight,
    },
    // The row's vertical padding lives on the toggle so the whole 44pt row height
    // is the checkbox's tap target, not just the 24pt box and its label line.
    rowToggle: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingVertical: theme.spacing.xs,
    },
    removeBtnTouch: {
        paddingHorizontal: theme.spacing.s,
        paddingVertical: theme.spacing.xs,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: theme.colors.border,
        // DOUBLE-FLIP FIX: the checkbox→label gap used to be swapped by hand in the
        // render (`isRTL ? {marginStart} : {marginEnd}`) because RN-Web would not
        // mirror logical margins while I18nManager.forceRTL was skipped on web.
        // The app now wraps the tree in RN-Web's LocaleProvider, so `marginEnd` DOES
        // mirror — and the manual swap flipped it a second time, putting the gap on
        // the row's outer edge and leaving the Arabic label touching the checkbox
        // border. A plain logical margin is correct on every platform now.
        marginEnd: theme.spacing.m,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    checkboxMark: { color: theme.colors.white, fontWeight: '700' },
    rowLabel: { ...theme.typography.body, flex: 1, color: theme.colors.text },
    rowLabelChecked: { color: theme.colors.textLight, textDecorationLine: 'line-through' },
    removeText: { color: theme.colors.error, fontSize: 18, fontWeight: '700', paddingHorizontal: theme.spacing.s },
    addRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.s },
    addRowText: { ...theme.typography.caption, color: theme.colors.accent, fontWeight: '600' },
    modalBackdrop: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        justifyContent: 'center',
        padding: theme.spacing.l,
    },
    modalCard: {
        width: '100%',
        maxWidth: MODAL_MAX_WIDTH,
        alignSelf: 'center',
        backgroundColor: theme.colors.cardBackground,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.l,
    },
    modalTitle: { ...theme.typography.h3, marginBottom: theme.spacing.m },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        ...theme.typography.body,
        marginBottom: theme.spacing.m,
        color: theme.colors.text,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
