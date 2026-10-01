import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import { theme } from '../../theme';
import { styles } from '../../screens/HealthDashboardScreen.styles';

interface HealthWeightModalProps {
    visible: boolean;
    weightInput: string;
    onChangeWeight: (text: string) => void;
    onClose: () => void;
    onSave: () => void;
    t: (key: string, options?: any) => string;
}

export const HealthWeightModal: React.FC<HealthWeightModalProps> = ({
    visible,
    weightInput,
    onChangeWeight,
    onClose,
    onSave,
    t,
}) => {
    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modal}>
                    <Text style={styles.modalTitle}>{t('dashboard.addWeight')}</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={t('dashboard.weightPlaceholder')}
                        placeholderTextColor={theme.colors.neutral400}
                        keyboardType="decimal-pad"
                        value={weightInput}
                        onChangeText={onChangeWeight}
                    />
                    <View style={styles.modalActions}>
                        <TouchableOpacity
                            style={[styles.modalButton, styles.modalButtonCancel]}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.cancel')}
                        >
                            <Text style={styles.modalButtonText}>{t('dashboard.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalButton, styles.modalButtonSave]}
                            onPress={onSave}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.save')}
                            accessibilityHint={t('a11y.saveChangesHint')}
                        >
                            <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>{t('dashboard.save')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};
