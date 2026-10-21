import { StyleSheet } from 'react-native';
import { theme } from '../theme';
import { MODAL_MAX_WIDTH } from '../utils/layout';

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    /* U-FIX-5: medical disclaimer block */
    disclaimer: {
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 24,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        borderStartWidth: 3,
        borderStartColor: theme.colors.warning,
    },
    disclaimerText: {
        fontSize: 12,
        color: theme.colors.textLight,
        lineHeight: 18,
        // Cycle 4 F823 RTL : `auto` au lieu de hardcoded 'left' → suit la direction du parent.
        textAlign: 'auto',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: theme.colors.textSecondary,
    },
    header: {
        padding: 24,
        paddingTop: 40,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    headerSubtitle: {
        fontSize: 16,
        color: theme.colors.white,
        marginTop: 4,
    },
    section: {
        backgroundColor: theme.colors.white,
        margin: 16,
        padding: 20,
        borderRadius: theme.borderRadius.l,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    addButton: {
        backgroundColor: theme.colors.accent,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.m,
        // 44pt tall in the box itself (hitSlop is ignored on web); the negative margin keeps the
        // section header's height, as linkTouch does (E-006).
        minHeight: 44,
        justifyContent: 'center',
        marginVertical: -8,
    },
    addButtonText: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: '600',
    },
    // "See all" text links: 44pt tall pressable, negative margin keeps the header height.
    linkTouch: {
        minHeight: 44,
        justifyContent: 'center',
        marginVertical: -12,
        paddingHorizontal: 4,
    },
    linkText: {
        color: theme.colors.accent,
        fontSize: 14,
        fontWeight: '600',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    statBox: {
        alignItems: 'center',
    },
    // The two halves of the Glycémie summary. A box as wide as its text let "Mesure hors
    // objectif ce mois-ci" run on one line into the card's edge; an equal share of the
    // row makes the label wrap inside it.
    glucoseStatBox: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    glucoseStatText: {
        textAlign: 'center',
        alignSelf: 'stretch',
    },
    statLabel: {
        fontSize: 14,
        color: theme.colors.textMuted,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    chart: {
        marginVertical: 8,
        borderRadius: theme.borderRadius.l,
    },
    emptyText: {
        textAlign: 'center',
        color: theme.colors.textMuted,
        fontSize: 14,
        fontStyle: 'italic',
        paddingVertical: 20,
    },
    bpCard: {
        backgroundColor: theme.colors.surfacePurpleTint,
        padding: 16,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        marginBottom: 16,
    },
    bpLabel: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    bpValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: theme.colors.accentPurple,
    },
    bpDate: {
        fontSize: 12,
        color: theme.colors.textMuted,
        marginTop: 4,
    },
    bpHistoryItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    bpHistoryValue: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
    historyValueColumn: {
        flexShrink: 1,
        alignItems: 'flex-start',
    },
    historyFlag: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.deepOrange900,
        marginTop: 2,
    },
    bpHistoryDate: {
        fontSize: 14,
        color: theme.colors.textMuted,
    },
    appointmentsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    appointmentBox: {
        flex: 1,
        padding: 20,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
    },
    appointmentNumber: {
        fontSize: 36,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    appointmentLabel: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginTop: 4,
    },
    progressContainer: {
        alignItems: 'center',
    },
    progressText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 12,
    },
    progressBar: {
        width: '100%',
        height: 12,
        backgroundColor: theme.colors.disabled,
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.colors.success,
    },
    progressPercentage: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.success,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.blackAlpha50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modal: {
        width: '85%',
        maxWidth: MODAL_MAX_WIDTH,
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.xl,
        padding: 24,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 20,
        textAlign: 'center',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        borderRadius: theme.borderRadius.m,
        padding: 12,
        fontSize: 16,
        marginBottom: 16,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        padding: 14,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
    },
    modalButtonCancel: {
        backgroundColor: theme.colors.borderLight,
    },
    modalButtonSave: {
        backgroundColor: theme.colors.primaryStrong,
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
    symptomsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    symptomChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: theme.borderRadius.xl,
        backgroundColor: theme.colors.surface,
        borderWidth: 1.5,
        borderColor: theme.colors.borderLight,
    },
    symptomChipActive: {
        backgroundColor: theme.colors.surfaceBlush,
        borderColor: theme.colors.primary,
    },
    symptomEmoji: {
        fontSize: 16,
    },
    symptomLabel: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    symptomLabelActive: {
        color: theme.colors.accent,
        fontWeight: '600',
    },
});
