import { StyleSheet } from 'react-native';
import { theme } from '../theme';
import { getShadowStyle } from '../utils/styleUtils';

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
    },
    loadingText: {
        marginTop: 16,
        color: theme.colors.textSecondary,
        fontSize: 15,
    },
    header: {
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 16,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
    },
    headerContent: {},
    monthRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    navButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    monthContainer: {
        alignItems: 'center',
        flex: 1,
    },
    monthText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.white,
        textTransform: 'capitalize',
    },
    weekText: {
        fontSize: 13,
        color: theme.colors.white,
        fontWeight: '600',
        marginTop: 4,
    },
    rdvInfoText: {
        fontSize: 14,
        color: theme.colors.white,
        fontWeight: '500',
        textAlign: 'center',
        marginBottom: 4,
    },
    navArrow: {
        fontSize: 32,
        color: theme.colors.white,
        fontWeight: 'bold',
    },
    disabledArrow: {
        opacity: 0.3,
    },
    headerActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    rdvCountBadge: {
        backgroundColor: theme.colors.headerChipBg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        flexDirection: 'row',
        gap: 4,
    },
    rdvCountText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    rdvCountLabel: {
        fontSize: 11,
        color: theme.colors.white,
        fontWeight: '500',
    },
    weekBadge: {
        backgroundColor: theme.colors.headerChipBg,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.xl,
        borderWidth: 1,
        borderColor: theme.colors.whiteAlpha40,
    },
    weekBadgeText: {
        color: theme.colors.white,
        fontSize: 12,
        fontWeight: '600',
    },
    suggestionsButton: {
        backgroundColor: theme.colors.amber500Alpha90,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.xl,
    },
    suggestionsButtonText: {
        color: theme.colors.text,
        fontSize: 12,
        fontWeight: '600',
    },
    suggestionsSection: {
        backgroundColor: theme.colors.surfaceAmberTint,
        marginHorizontal: 0, // listContent supplies the gutter (see monthGrid)
        marginVertical: 8,
        borderRadius: theme.borderRadius.m,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.amberBorder,
    },
    suggestionsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    suggestionsSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.deepOrange900,
    },
    suggestionsSectionClose: {
        fontSize: 18,
        color: theme.colors.textLight,
        padding: 4,
    },
    suggestionsContainer: {
        position: 'relative',
    },
    suggestionsScrollView: {
        maxHeight: 300,
    },
    suggestionsScrollContent: {
        paddingBottom: 30,
    },
    scrollIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 4,
        paddingHorizontal: 8,
        backgroundColor: theme.colors.amber500Alpha85,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        alignItems: 'center',
    },
    scrollIndicatorText: {
        fontSize: 9,
        fontWeight: '600',
        color: theme.colors.deepOrange900,
        textAlign: 'center',
    },
    suggestionItem: {
        backgroundColor: theme.colors.white,
        padding: 10,
        borderRadius: theme.borderRadius.s,
        marginBottom: 6,
        borderStartWidth: 3,
        borderStartColor: theme.colors.accentAmber,
    },
    suggestionItemTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
    suggestionItemDesc: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 4,
    },
    suggestionItemDate: {
        fontSize: 10,
        color: theme.colors.textMuted,
        marginTop: 4,
        fontStyle: 'italic',
    },
    todayButton: {
        backgroundColor: theme.colors.headerChipBg,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.xl,
        borderWidth: 1,
        borderColor: theme.colors.whiteAlpha50,
    },
    todayButtonText: {
        color: theme.colors.white,
        fontSize: 12,
        fontWeight: '600',
    },
    viewToggleContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.headerChipBg,
        borderRadius: theme.borderRadius.xl,
        padding: 2,
    },
    viewToggle: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 18,
    },
    viewToggleActive: {
        backgroundColor: theme.colors.white,
    },
    viewToggleText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.white,
    },
    viewToggleTextActive: {
        color: theme.colors.accent,
    },
    statsCard: {
        backgroundColor: theme.colors.white,
        marginHorizontal: 0, // listContent supplies the gutter (see monthGrid)
        marginTop: 16,
        marginBottom: 12,
        padding: 16,
        borderRadius: theme.borderRadius.l,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    statsTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 12,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    statLabel: {
        fontSize: 12,
        color: theme.colors.textLight,
        marginTop: 4,
    },
    monthGrid: {
        backgroundColor: theme.colors.white,
        // The FlatList content already has a 16pt gutter (listContent). A second 16pt
        // margin here shrank each day cell to 41pt on a 375pt phone — under the 44pt target.
        marginHorizontal: 0,
        marginVertical: 12,
        borderRadius: theme.borderRadius.l,
        padding: 12,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    weekDaysHeader: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    weekDayLabel: {
        flex: 1,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textLight,
    },
    monthDaysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    monthDayWrapper: {
        width: '14.28%',
        aspectRatio: 1,
    },
    monthDay: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: theme.borderRadius.s,
    },
    monthDaySelected: {
        borderWidth: 2,
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.lavenderBlush,
    },
    monthDayToday: {
        backgroundColor: theme.colors.surfaceBlueTint,
    },
    monthDayText: {
        fontSize: 14,
        color: theme.colors.text,
        fontWeight: '500',
    },
    monthDayTextSelected: {
        color: theme.colors.accent,
        fontWeight: 'bold',
    },
    monthDayTextToday: {
        color: theme.colors.info,
        fontWeight: 'bold',
    },
    monthDayTextDisabled: {
        color: theme.colors.neutral300,
    },
    monthDayEmpty: {
        width: '14.28%',
        aspectRatio: 1,
    },
    eventDotSmall: {
        position: 'absolute',
        bottom: 4,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.primary,
    },
    eventBadge: {
        position: 'absolute',
        bottom: 2,
        backgroundColor: theme.colors.accent,
        minWidth: 16,
        height: 16,
        borderRadius: theme.borderRadius.s,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    eventBadgeSelected: {
        backgroundColor: theme.colors.white,
    },
    eventBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    eventBadgeTextSelected: {
        color: theme.colors.accent,
    },
    eventDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.primary,
        position: 'absolute',
        bottom: 4,
    },
    eventDotSelected: {
        backgroundColor: theme.colors.white,
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    filterChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.xl,
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: theme.colors.disabled,
    },
    activeFilterChip: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    filterText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    activeFilterText: {
        color: theme.colors.white,
        fontWeight: '600',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 120,
    },
    // Centred copy kept out of the FAB's column (56pt button + 20pt inset − the 16pt
    // list gutter = 60): at 375pt the "+" sat on the end of "Aucun événement…".
    emptyState: {
        alignItems: 'center',
        marginTop: 40,
        paddingVertical: 24,
        paddingHorizontal: 60,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyStateText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 8,
    },
    emptyStateSubtext: {
        fontSize: 14,
        color: theme.colors.textLight,
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        ...getShadowStyle(8, theme.colors.black, 0.3, 8, { width: 0, height: 4 }),
    },
    fabGradient: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fabIcon: {
        fontSize: 32,
        color: theme.colors.white,
        fontWeight: '300',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.white,
        textTransform: 'capitalize',
    },
    headerSubtitle: {
        fontSize: 12,
        color: theme.colors.white,
        marginTop: 2,
    },
    viewSelector: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    selectorGroup: {
        flexDirection: 'row',
        backgroundColor: theme.colors.headerChipBg,
        borderRadius: theme.borderRadius.xl,
        padding: 2,
    },
    selectorButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 18,
    },
    selectorButtonActive: {
        backgroundColor: theme.colors.white,
    },
    selectorText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.white,
    },
    selectorTextActive: {
        color: theme.colors.accent,
    },
    suggestionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.amber500Alpha90,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.l,
    },
    suggestionText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
});
