import { Platform, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { getShadowStyle } from '../utils/styleUtils';

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    header: {
        paddingTop: 60,
        paddingBottom: 32,
        // Without an inset a long e-mail ran edge to edge on a 280pt screen.
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    profileCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: theme.colors.headerChipBg,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: theme.colors.whiteAlpha50,
        marginBottom: 16,
    },
    profileLetter: {
        fontSize: 48,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.white,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: theme.colors.white,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    card: {
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.l,
        padding: 20,
        marginBottom: 16,
        ...getShadowStyle(3, theme.colors.black, 0.1, 6, { width: 0, height: 2 }),
    },
    pregnancyCard: {
        backgroundColor: theme.colors.gradientPinkEnd,
        borderWidth: 1,
        borderColor: theme.colors.borderPinkPastel,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 16,
    },
    editButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.accent,
    },
    editButtonText: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: '600',
    },
    infoRow: {
        flexDirection: 'row',
        gap: 16,
    },
    infoItem: {
        flex: 1,
        backgroundColor: theme.colors.primaryAlpha10,
        padding: 16,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
    },
    infoLabel: {
        fontSize: 12,
        color: theme.colors.textLight,
        marginBottom: 8,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    infoValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.accent,
    },
    form: {
        gap: 12,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        borderRadius: theme.borderRadius.m,
        padding: 14,
        fontSize: 16,
        backgroundColor: theme.colors.white,
    },
    inputDisabled: {
        backgroundColor: theme.colors.surface,
        color: theme.colors.textSecondary,
    },
    countrySelector: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    countryButton: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.xl,
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        backgroundColor: theme.colors.white,
    },
    countryButtonSelected: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    countryButtonText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    countryButtonTextSelected: {
        color: theme.colors.white,
        fontWeight: '600',
    },
    dateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    physicalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    dateHint: {
        fontSize: 12,
        color: theme.colors.textLight,
        marginTop: 2,
    },
    dateButton: {
        backgroundColor: theme.colors.surfaceBlueTint,
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.m,
    },
    dateButtonText: {
        fontSize: 14,
        color: theme.colors.info,
        fontWeight: '600',
    },
    dateButtonTextDisabled: {
        color: theme.colors.textSecondary,
    },
    separator: {
        height: 1,
        backgroundColor: theme.colors.borderLight,
        marginVertical: 8,
    },
    dpaContainer: {
        backgroundColor: theme.colors.surfaceAmberTint,
        padding: 16,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
        borderColor: theme.colors.amberBorder,
    },
    // The due date is information, not a warning: the app's text brown on the amber card
    // (brick red made it read like an error).
    dpaText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginTop: 8,
    },
    dpaSubtext: {
        fontSize: 12,
        color: theme.colors.textLight,
        marginTop: 4,
        fontStyle: 'italic',
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: theme.colors.surface,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    saveButton: {
        backgroundColor: theme.colors.accent,
        paddingVertical: 14,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        marginTop: 16,
    },
    saveButtonDisabled: {
        opacity: 0.7,
        backgroundColor: theme.colors.neutral300,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.white,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 12,
        marginStart: 4,
    },
    languageRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    logoutButton: {
        backgroundColor: theme.colors.surfaceRose,
        paddingVertical: 14,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        marginBottom: 16,
    },
    logoutButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.error,
    },
    resetButton: {
        backgroundColor: theme.colors.surfaceOrangeTint,
        paddingVertical: 14,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 2,
        borderColor: theme.colors.warning,
    },
    resetButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.deepOrange900,
    },
    userTypeBadge: {
        backgroundColor: theme.colors.surfaceBlueTint,
        padding: 16,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        marginTop: 16,
    },
    userTypeText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.info,
        marginBottom: 4,
    },
    userTypeSubtext: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    menuSection: {
        marginTop: 24,
        backgroundColor: theme.colors.neutral25,
        borderRadius: theme.borderRadius.l,
        borderWidth: 1,
        borderColor: theme.colors.neutral50,
        overflow: 'hidden',
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.neutral50,
        backgroundColor: theme.colors.white,
    },
    menuRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuIcon: {
        fontSize: 20,
        marginEnd: 12,
        width: 24,
        textAlign: 'center',
    },
    menuLabel: {
        fontSize: 16,
        color: theme.colors.text,
        fontWeight: '500',
    },
    menuArrow: {
        fontSize: 20,
        color: theme.colors.neutral300,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 24 : 16,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.neutral50,
    },
    modalHeaderButton: {
        padding: 8,
    },
    modalHeaderText: {
        fontSize: 16,
        color: theme.colors.accent,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
});
