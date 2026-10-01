import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';

interface Props {
    visible: boolean;
    password: string;
    loading: boolean;
    // Differs when her data is already erased and only the account is left to delete.
    message: string;
    onChangePassword: (value: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
    // Sends a password-reset email to the signed-in address; hidden when there is none.
    onForgotPassword?: () => void;
}

/**
 * Password prompt for the account-deletion reauth step on Android and web
 * (Alert.prompt is iOS-only). Rendered by useAccountDeletion's callers.
 */
export const ReauthDeleteModal = ({ visible, password, loading, message, onChangePassword, onCancel, onConfirm, onForgotPassword }: Props) => {
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
                    <Text style={styles.message}>{message}</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={onChangePassword}
                        secureTextEntry
                        autoFocus
                        editable={!loading}
                        // A dotted placeholder read as a password already typed in.
                        placeholder={t('passwordPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        accessibilityLabel={t('passwordPlaceholder')}
                        accessibilityHint={message}
                    />
                    {onForgotPassword && (
                        <TouchableOpacity
                            style={styles.forgotButton}
                            onPress={onForgotPassword}
                            disabled={loading}
                            accessibilityRole="link"
                            accessibilityLabel={t('forgotPassword')}
                        >
                            <Text style={styles.forgotText}>{t('forgotPassword')}</Text>
                        </TouchableOpacity>
                    )}
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
                            accessibilityLabel={t('common.deleteForever')}
                        >
                            {loading ? (
                                <ActivityIndicator color={theme.colors.white} />
                            ) : (
                                <Text style={styles.confirmText}>{t('common.deleteForever')}</Text>
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
    forgotButton: {
        alignSelf: 'flex-start',
        minHeight: 44,
        justifyContent: 'center',
        marginTop: 4,
    },
    forgotText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.primaryStrong,
        textDecorationLine: 'underline',
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
