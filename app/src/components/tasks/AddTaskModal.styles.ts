import { StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';

export const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: theme.colors.blackAlpha50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        maxHeight: '90%',
        backgroundColor: theme.colors.white,
        borderRadius: 20,
        padding: 24,
        ...getShadowStyle(8, theme.colors.black, 0.3, 8, { width: 0, height: 4 }),
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: theme.colors.neutral900,
    },
    closeButton: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginEnd: -theme.spacing.s,
    },
    closeText: {
        fontSize: 24,
        color: theme.colors.textMuted,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.neutral700,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.neutral200,
        borderRadius: 12,
        padding: 12,
        fontSize: 16,
        backgroundColor: theme.colors.surfaceGrayStripe,
    },
    priorityButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    priorityButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: theme.colors.neutral200,
        backgroundColor: theme.colors.surfaceGrayStripe,
        alignItems: 'center',
    },
    priorityButtonActiveHigh: {
        borderColor: theme.colors.red800,
        backgroundColor: theme.colors.red800,
    },
    priorityButtonActiveMedium: {
        borderColor: theme.colors.deepOrange900,
        backgroundColor: theme.colors.deepOrange900,
    },
    priorityButtonActiveLow: {
        borderColor: theme.colors.green800,
        backgroundColor: theme.colors.green800,
    },
    priorityButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    // White on the filled chip — the Active* fills above are the dark (AA) shades.
    priorityButtonTextActive: {
        color: theme.colors.white,
    },
    error: {
        color: theme.colors.error,
        fontSize: 14,
        marginBottom: 12,
        textAlign: 'center',
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.accent,
    },
    createButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: theme.colors.accent,
        alignItems: 'center',
    },
    createButtonDisabled: {
        opacity: 0.5,
    },
    createButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.white,
    },

    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    datePickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surfaceGrayStripe,
        padding: 12,
        borderRadius: 12,
        marginTop: 8,
    },
    dateLabel: {
        fontSize: 14,
        color: theme.colors.neutral700,
    },
    dateButton: {
        backgroundColor: theme.colors.white,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.neutral200,
    },
    dateButtonText: {
        fontSize: 16,
        color: theme.colors.neutral900,
        fontWeight: '600',
    },
    dateButtonsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    dateOptionButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.neutral200,
        backgroundColor: theme.colors.white,
        alignItems: 'center',
    },
    dateOptionButtonActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    dateOptionText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    dateOptionTextActive: {
        color: theme.colors.white,
        fontWeight: '600',
    },
    selectedDateText: {
        fontSize: 14,
        color: theme.colors.accent,
        textAlign: 'center',
        marginTop: 4,
        fontWeight: '500',
    },
    infoBox: {
        backgroundColor: theme.colors.surfaceBlueTint,
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: theme.colors.blue200,
    },
    infoText: {
        fontSize: 13,
        color: theme.colors.blue800,
        lineHeight: 18,
    },
    recurrenceContainer: {
        marginTop: 12,
        backgroundColor: theme.colors.surfaceGrayStripe,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.neutral50,
    },
    segmentControl: {
        flexDirection: 'row',
        backgroundColor: theme.colors.disabled,
        borderRadius: 8,
        padding: 2,
        marginBottom: 12,
    },
    segmentButton: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        borderRadius: 6,
    },
    segmentButtonActive: {
        backgroundColor: theme.colors.white,
        ...getShadowStyle(1, theme.colors.black, 0.1, 2, { width: 0, height: 1 }),
    },
    segmentButtonText: {
        fontSize: 12,
        fontWeight: '500',
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    segmentButtonTextActive: {
        color: theme.colors.neutral900,
        fontWeight: 'bold',
    },
    intervalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    intervalLabel: {
        fontSize: 14,
        color: theme.colors.neutral700,
    },
    intervalInput: {
        borderWidth: 1,
        borderColor: theme.colors.neutral200,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        width: 60,
        textAlign: 'center',
        backgroundColor: theme.colors.white,
        fontSize: 16,
    },
    daysContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    dayBubble: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.neutral50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dayBubbleActive: {
        backgroundColor: theme.colors.accent,
    },
    dayBubbleText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    dayBubbleTextActive: {
        color: theme.colors.white,
    },
});
