import { theme } from '../../theme';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking, ScrollView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePregnancy, EmergencyContact } from '../../context/PregnancyContext';
import { showAlert } from '../../utils/alert';
import { confirmAction } from '../../utils/uiUtils';
import { createLogger } from '../../utils/logger';

const log = createLogger('EmergencyContactsSection');

export { TEL_VALIDATION_REGEX, sanitizeTelNumber } from './EmergencyContactsSection.helpers';
import { TEL_VALIDATION_REGEX, sanitizeTelNumber } from './EmergencyContactsSection.helpers';

export const EmergencyContactsSection = () => {
    const { t } = useTranslation();
    const { profile, setProfile } = usePregnancy();
    const [isAdding, setIsAdding] = useState(false);

    // Form state
    const [newName, setNewName] = useState('');
    const [newNumber, setNewNumber] = useState('');
    const [newType, setNewType] = useState<EmergencyContact['type']>('partner');

    const contacts = profile?.emergencyContacts || [];

    const handleCall = (number: string) => {
        const sanitized = sanitizeTelNumber(number);
        if (!sanitized) {
            showAlert(t('common.error'), t('emergency.invalidNumber') || t('common.error'));
            return;
        }
        const url = `tel:${sanitized}`;
        Linking.canOpenURL(url)
            .then(supported => {
                if (!supported) {
                    showAlert(t('common.error'), t('emergency.callError'));
                } else {
                    return Linking.openURL(url);
                }
            })
            .catch(err => log.error('An error occurred', err));
    };

    const handleAdd = async () => {
        if (!newName.trim() || !newNumber.trim()) {
            showAlert(t('common.error'), t('emergency.validationError'));
            return;
        }

        if (!TEL_VALIDATION_REGEX.test(newNumber.trim())) {
            showAlert(t('common.error'), t('emergency.invalidNumber'));
            return;
        }

        const newContact: EmergencyContact = {
            id: Date.now().toString(),
            name: newName.trim(),
            number: newNumber.trim(),
            type: newType
        };

        const updatedContacts = [...contacts, newContact];

        try {
            await setProfile({
                ...profile!,
                emergencyContacts: updatedContacts
            });
            setIsAdding(false);
            setNewName('');
            setNewNumber('');
            setNewType('partner');
            log.info('Contact added');
        } catch (error) {
            log.error('Error adding contact', error);
            showAlert(t('common.error'), t('emergency.addError'));
        }
    };

    const handleDelete = (id: string) => {
        confirmAction(
            t('emergency.deleteConfirm'),
            t('profile.deleteContactConfirm'),
            async () => {
                try {
                    const updatedContacts = contacts.filter(c => c.id !== id);
                    await setProfile({
                        ...profile!,
                        emergencyContacts: updatedContacts
                    });
                } catch (error) {
                    log.error('Error deleting contact', error);
                }
            },
            undefined,
            t('common.cancel'),
            t('common.delete')
        );
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'partner': return t('emergency.types.partner');
            case 'doctor': return t('emergency.types.doctor');
            case 'sos': return t('emergency.types.sos');
            default: return t('emergency.types.other');
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'sos': return theme.colors.critical; // Red
            case 'doctor': return theme.colors.blue600; // Blue
            case 'partner': return theme.colors.pinkAccent; // Pink
            default: return theme.colors.gray500; // Grey
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>🆘 {t('emergency.title')}</Text>
                {!isAdding && (
                    <TouchableOpacity
                        onPress={() => setIsAdding(true)}
                        style={styles.addButton}
                        accessibilityRole="button"
                        accessibilityLabel={t('emergency.add')}
                    >
                        <Text style={styles.addButtonText}>+</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* List */}
            {contacts.length === 0 && !isAdding ? (
                <Text style={styles.emptyText}>{t('emergency.empty')}</Text>
            ) : (
                contacts.map(contact => (
                    <View key={contact.id} style={styles.contactRow}>
                        <View style={styles.contactInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={[styles.typeBadge, { backgroundColor: getTypeColor(contact.type) }]}>
                                    <Text style={styles.typeText}>{getTypeLabel(contact.type)}</Text>
                                </View>
                                <Text style={styles.contactName}>{contact.name}</Text>
                            </View>
                            <Text style={styles.contactNumber}>{contact.number}</Text>
                        </View>

                        <View style={styles.actions}>
                            <TouchableOpacity
                                onPress={() => handleCall(contact.number)}
                                style={[styles.actionButton, styles.callButton]}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.callContact', { name: contact.name })}
                                accessibilityHint={contact.number}
                            >
                                <Text style={styles.actionIcon}>📞</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleDelete(contact.id)}
                                style={[styles.actionButton, styles.deleteButton]}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.deleteContact', { name: contact.name })}
                            >
                                <Text style={styles.actionIcon}>🗑️</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))
            )}

            {/* Add Form */}
            {isAdding && (
                <View style={styles.addForm}>
                    <Text style={styles.formTitle}>{t('emergency.add')}</Text>

                    <View style={styles.typeSelector}>
                        {(['partner', 'doctor', 'sos', 'other'] as const).map(type => (
                            <TouchableOpacity
                                key={type}
                                onPress={() => setNewType(type)}
                                style={[
                                    styles.typeButton,
                                    newType === type && { backgroundColor: getTypeColor(type), borderColor: getTypeColor(type) }
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={getTypeLabel(type)}
                                accessibilityState={{ selected: newType === type }}
                                {...(Platform.OS === 'web' ? { 'aria-selected': newType === type } : {})}
                            >
                                <Text style={[
                                    styles.typeButtonText,
                                    newType === type && { color: theme.colors.white }
                                ]}>
                                    {getTypeLabel(type)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder={t('emergency.name')}
                        value={newName}
                        onChangeText={setNewName}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder={t('emergency.phone')}
                        value={newNumber}
                        onChangeText={setNewNumber}
                        keyboardType="phone-pad"
                    />

                    <View style={styles.formActions}>
                        <TouchableOpacity
                            onPress={() => setIsAdding(false)}
                            style={[styles.formButton, styles.cancelFormButton]}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.cancel')}
                        >
                            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleAdd}
                            style={[styles.formButton, styles.addFormButton]}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.save')}
                        >
                            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.red700,
    },
    addButton: {
        backgroundColor: theme.colors.surfaceRose,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonText: {
        fontSize: 20,
        color: theme.colors.red700,
        fontWeight: 'bold',
        marginTop: -2,
    },
    emptyText: {
        color: theme.colors.neutral400,
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: 8,
    },
    contactRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    contactInfo: {
        flex: 1,
    },
    contactName: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.neutral900,
    },
    contactNumber: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    typeText: {
        color: theme.colors.white,
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    callButton: {
        backgroundColor: theme.colors.surfaceGreenTint,
    },
    deleteButton: {
        backgroundColor: theme.colors.surfaceRose,
    },
    actionIcon: {
        fontSize: 16,
    },
    addForm: {
        marginTop: 8,
        padding: 12,
        backgroundColor: theme.colors.neutral25,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    formTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.neutral900,
        marginBottom: 12,
    },
    input: {
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    typeSelector: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    typeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        backgroundColor: theme.colors.white,
    },
    typeButtonText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    formActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    formButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelFormButton: {
        backgroundColor: theme.colors.neutral100,
    },
    addFormButton: {
        backgroundColor: theme.colors.red700,
    },
    cancelButtonText: {
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    saveButtonText: {
        color: theme.colors.white,
        fontWeight: '600',
    },
});
