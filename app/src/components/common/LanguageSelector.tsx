import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
// W1 #11: removed the dead `expo-updates` import (language change goes through i18n/rtl's
// changeLanguage, never expo-updates) and the unused I18nManager import.

export const LanguageSelector = ({ isCompact }: { isCompact?: boolean }) => {
    const { i18n, t } = useTranslation();
    const [modalVisible, setModalVisible] = React.useState(false);
    // W1 #11: guard against a rapid double-tap firing changeLanguage twice (each triggers an
    // RTL flip / potential reload) before the modal closes.
    const changingRef = React.useRef(false);

    const changeLanguage = async (lang: string) => {
        if (changingRef.current) return;
        changingRef.current = true;
        try {
            const { changeLanguage } = require('../../i18n/rtl');
            await changeLanguage(lang);
            setModalVisible(false);
        } finally {
            changingRef.current = false;
        }
    };

    const languages = [
        { code: 'fr', label: 'Français', flag: '🇫🇷' },
        // #12b: MSA Arabic = pan-regional, not one country (matches LanguageSelectScreen's 🌍).
        { code: 'ar', label: 'العربية', flag: '🌍' },
        { code: 'tn', label: 'العربية + الدارجة', flag: '🇹🇳' },
        { code: 'en', label: 'English', flag: '🇺🇸' },
    ];

    const currentLang = languages.find(l => l.code === i18n.language) || languages[0];

    return (
        <View>
            <TouchableOpacity
                style={styles.selectorButton}
                onPress={() => setModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('common.chooseLanguage')}
                accessibilityHint={currentLang.label}
            >
                <Text style={styles.flag} accessibilityElementsHidden importantForAccessibility="no">{currentLang.flag}</Text>
                <Text style={styles.code}>{currentLang.code.toUpperCase()}</Text>
            </TouchableOpacity>

            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setModalVisible(false)}
                >
                    {/* W1 #11: capture taps on the modal body so they don't bubble to the overlay
                        and dismiss the modal when the user taps the title or padding. */}
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <Text style={styles.modalTitle}>{t('common.chooseLanguage')}</Text>
                        {languages.map((lang) => (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.langOption,
                                    i18n.language === lang.code && styles.selectedOption
                                ]}
                                onPress={() => changeLanguage(lang.code)}
                                accessibilityRole="button"
                                accessibilityLabel={lang.label}
                                accessibilityState={{ selected: i18n.language === lang.code }}
                            >
                                <Text style={styles.optionFlag} accessibilityElementsHidden importantForAccessibility="no">{lang.flag}</Text>
                                <Text style={[
                                    styles.optionLabel,
                                    i18n.language === lang.code && styles.selectedLabel
                                ]}>
                                    {lang.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    selectorButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.whiteAlpha50,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        // W1 #20: WCAG 2.5.5 — guarantee a 44pt tap target.
        minHeight: 44,
    },
    flag: {
        fontSize: 16,
        marginEnd: 6,
    },
    code: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.blackAlpha50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: theme.colors.white,
        borderRadius: 20,
        padding: 20,
        width: '80%',
        maxWidth: 300,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
        color: theme.colors.text,
    },
    langOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    selectedOption: {
        backgroundColor: theme.colors.cardBackground,
    },
    optionFlag: {
        fontSize: 24,
        marginEnd: 16,
    },
    optionLabel: {
        fontSize: 16,
        color: theme.colors.text,
    },
    selectedLabel: {
        fontWeight: 'bold',
        color: theme.colors.accent,
    },
});
