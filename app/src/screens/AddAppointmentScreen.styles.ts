import { StyleSheet } from 'react-native';
import { theme } from '../theme';

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    contentContainer: {
        padding: theme.spacing.l,
    },
    header: {
        marginBottom: theme.spacing.xl,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700' as const,
        marginBottom: theme.spacing.xs,
        color: theme.colors.text,
    },
    headerSubtitle: {
        ...theme.typography.body,
        color: theme.colors.textLight,
    },
    // Guest banner — shown above the form so the account requirement is known
    // before anything is typed, not after Save.
    guestBanner: {
        backgroundColor: theme.colors.surfaceBlueTint,
        borderRadius: 12,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.l,
        borderStartWidth: 4,
        borderStartColor: theme.colors.info,
    },
    guestBannerTitle: {
        ...theme.typography.body,
        fontWeight: '700' as const,
        color: theme.colors.info,
        marginBottom: theme.spacing.xs,
    },
    guestBannerMsg: {
        ...theme.typography.caption,
        color: theme.colors.textSecondary,
    },
    guestBannerCta: {
        ...theme.typography.body,
        fontWeight: '700' as const,
        color: theme.colors.accent,
        marginTop: theme.spacing.s,
    },
    form: {
        gap: theme.spacing.l,
    },
    row: {
        flexDirection: 'row',
        gap: theme.spacing.m,
    },
    inputGroup: {
        marginBottom: theme.spacing.m,
    },
    label: {
        fontSize: 14,
        fontWeight: '600' as const,
        marginBottom: theme.spacing.xs,
        color: theme.colors.text,
    },
    input: {
        ...theme.typography.body,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        padding: theme.spacing.m,
        backgroundColor: theme.colors.white,
    },
    notesInput: {
        height: 120,
        textAlignVertical: 'top',
    },
    dateButton: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        padding: theme.spacing.m,
        backgroundColor: theme.colors.white,
    },
    dateText: {
        ...theme.typography.body,
        color: theme.colors.text,
    },
    // CAL-07: localized human-readable read-out shown under the web date control
    dateReadout: {
        fontSize: 12,
        color: theme.colors.textLight,
        marginTop: theme.spacing.xs,
    },
    actions: {
        flexDirection: 'row',
        gap: theme.spacing.m,
        marginTop: theme.spacing.l,
    },
    button: {
        flex: 1,
        padding: theme.spacing.m,
        borderRadius: 12,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600' as const,
        color: theme.colors.text,
    },
    saveButton: {
        backgroundColor: theme.colors.accent,
    },
    saveButtonDisabled: {
        opacity: 0.5,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600' as const,
        color: theme.colors.white,
    },
    typeContainer: {
        flexDirection: 'row',
        gap: theme.spacing.m,
    },
    typeButton: {
        flex: 1,
        padding: theme.spacing.m,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.white,
        alignItems: 'center',
    },
    typeButtonActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    typeText: {
        fontSize: 14,
        fontWeight: '600' as const,
        color: theme.colors.text,
    },
    typeTextActive: {
        color: theme.colors.white,
    },
    remindersSection: {
        backgroundColor: theme.colors.surfaceAmberTint,
        borderRadius: 12,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: theme.colors.amberBorder,
    },
    remindersSectionTitle: {
        fontSize: 15,
        fontWeight: '600' as const,
        color: theme.colors.accentOrangeDeep,
        marginBottom: theme.spacing.m,
    },
    reminderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: theme.spacing.s,
    },
    reminderInfo: {
        flex: 1,
    },
    reminderLabel: {
        fontSize: 14,
        fontWeight: '500' as const,
        color: theme.colors.text,
    },
    reminderDesc: {
        fontSize: 12,
        color: theme.colors.textLight,
        marginTop: 2,
    },
    iosPickerOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.blackAlpha40,
        justifyContent: 'flex-end',
        borderTopStartRadius: 24,
        borderTopEndRadius: 24,
        overflow: 'hidden',
    },
    iosPickerContent: {
        backgroundColor: theme.colors.white,
        height: 300,
        paddingBottom: 20,
    },
    iosPickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.disabled,
        backgroundColor: theme.colors.neutral25,
    },
    iosPickerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.neutral900,
    },
    iosPickerDoneText: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.accent,
    },
    pickerContainer: {
        marginTop: theme.spacing.m,
        backgroundColor: theme.colors.surfaceGrayStripe,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    picker: {
        width: '100%',
        backgroundColor: theme.colors.surfaceGrayStripe,
    },
    closePickerButton: {
        padding: theme.spacing.m,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.borderLight,
    },
    closePickerText: {
        color: theme.colors.accent,
        fontWeight: '600',
        fontSize: 16,
    },
});
