import { StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { TABLET_CONTENT_MAX_WIDTH } from '../../utils/layout';

export const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: theme.colors.blackAlpha50,
        justifyContent: 'flex-end',
    },
    modalContainer: {
        // Bottom sheet: full width on a phone, the app's column width on a tablet
        // (the Modal renders over the whole window, outside TabletFrame).
        width: '100%',
        maxWidth: TABLET_CONTENT_MAX_WIDTH,
        alignSelf: 'center',
        backgroundColor: theme.colors.white,
        borderTopStartRadius: 24,
        borderTopEndRadius: 24,
        maxHeight: '80%',
        minHeight: 400,
    },
    header: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        // Cycle 2 F310 RTL : `end` flip auto en arabe.
        end: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.neutral100,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    closeButtonText: {
        fontSize: 18,
        color: theme.colors.textSecondary,
    },
    headerContent: {
        alignItems: 'center',
        paddingTop: 8,
    },
    headerIcon: {
        fontSize: 40,
        marginBottom: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.colors.neutral900,
        textAlign: 'center',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.neutral900,
        marginBottom: 12,
    },
    intensityOptions: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },
    intensityOption: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        borderColor: theme.colors.disabled,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.white,
    },
    intensityOptionActive: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.background,
    },
    intensityOptionText: {
        fontSize: 20,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    intensityOptionTextActive: {
        color: theme.colors.accent,
    },
    timesContainer: {
        gap: 12,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    timeLabel: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        width: 80,
    },
    timeInput: {
        flex: 1,
        height: 44,
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 16,
        textAlign: 'center',
    },
    hint: {
        fontSize: 13,
        color: theme.colors.textMuted,
        marginTop: 8,
        fontStyle: 'italic',
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: theme.colors.borderLight,
    },
    saveButton: {
        backgroundColor: theme.colors.accent,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: theme.colors.white,
        fontSize: 16,
        fontWeight: '600',
    },
    intensityOptionSubtext: {
        fontSize: 12,
        color: theme.colors.textMuted,
        marginTop: 2,
    },
    timeInputError: {
        borderColor: theme.colors.error,
        backgroundColor: theme.colors.surfaceRose,
    },
    errorContainer: {
        backgroundColor: theme.colors.surfaceRose,
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    errorText: {
        color: theme.colors.red800,
        fontSize: 14,
        textAlign: 'center',
    },
    // Simple +/- mode styles
    simpleIntensityContainer: {
        alignItems: 'center',
        gap: 12,
    },
    simpleIntensityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    plusMinusButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.colors.lavenderBlush,
        borderWidth: 2,
        borderColor: theme.colors.pinkAccentA100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    plusMinusDisabled: {
        borderColor: theme.colors.disabled,
        backgroundColor: theme.colors.neutral100,
    },
    plusMinusText: {
        fontSize: 28,
        fontWeight: '600',
        color: theme.colors.accent,
    },
    intensityDisplay: {
        alignItems: 'center',
        minWidth: 80,
    },
    intensityDisplayText: {
        fontSize: 32,
        fontWeight: '700',
        color: theme.colors.accent,
    },
    intensityDisplaySubtext: {
        fontSize: 14,
        color: theme.colors.textMuted,
    },
    advancedLink: {
        fontSize: 13,
        color: theme.colors.textMuted,
        textDecorationLine: 'underline',
        marginTop: 8,
    },
    resetButton: {
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 8,
    },
    resetButtonText: {
        fontSize: 14,
        color: theme.colors.textMuted,
    },
    // V2.2: Dynamic time slots styles
    timeRowV2: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    timeInputGroup: {
        flex: 1,
    },
    timeInputV2: {
        height: 48,
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        borderRadius: 12,
        paddingHorizontal: 8,
        backgroundColor: theme.colors.white,
    },
    removeTimeButton: {
        width: 40,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.lavenderBlush,
        borderRadius: 12,
        // Cycle 2 F310 RTL.
        marginStart: 4,
    },
    removeTimeIcon: {
        fontSize: 18,
    },
    addTimeButton: {
        borderWidth: 1,
        borderColor: theme.colors.accent,
        borderStyle: 'dashed',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 4,
    },
    addTimeText: {
        fontSize: 14,
        color: theme.colors.accent,
        fontWeight: '500',
    },
    timeButtonV2: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    timeButtonText: {
        fontSize: 18,
        color: theme.colors.neutral900,
        fontWeight: '600',
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
});
