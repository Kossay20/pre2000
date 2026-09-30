import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';

interface Props {
    visible: boolean;
    password: string;
    loading: boolean;
    onChangePassword: (value: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}

/**
 * Password prompt for the account-deletion reauth step on Android and web
 * (Alert.prompt is iOS-only). Rendered by useAccountDeletion's callers.
 */
export const ReauthDeleteModal = ({ visible, password, loading, onChangePassword, onCancel, onConfirm }: Props) => {
    const { t } = useTranslation();
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                if (!loading) onCancel();
            }}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>{t('profile.reauthTitle')}</Text>
                    <Text style={styles.message}>{t('profile.reauthMessage')}</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={onChangePassword}
                        secureTextEntry
                        autoFocus
                        editable={!loading}
                        placeholder="••••••••"
                        accessibilityLabel={t('profile.reauthMessage')}
                    />
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => {
                                if (!loading) onCancel();
                            }}
                            disabled={loading}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.cancel')}
                        >
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.confirmButton, loading && styles.confirmButtonDisabled]}
                            onPress={onConfirm}
                            disabled={loading}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.confirm')}
                        >
                            {loading ? (
                                <ActivityIndicator color={theme.colors.white} />
                            ) : (
                                <Text style={styles.confirmText}>{t('common.confirm')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.l,
        padding: 20,
        ...getShadowStyle(4, theme.colors.black, 0.15, 8, { width: 0, height: 4 }),
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: 16,
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        borderRadius: theme.borderRadius.m,
        padding: 14,
        fontSize: 16,
        backgroundColor: theme.colors.white,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 16,
    },
    cancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.surface,
    },
    cancelText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    confirmButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.error,
        minWidth: 100,
        alignItems: 'center',
    },
    confirmButtonDisabled: {
        opacity: 0.7,
        backgroundColor: theme.colors.neutral300,
    },
    confirmText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.white,
    },
});
