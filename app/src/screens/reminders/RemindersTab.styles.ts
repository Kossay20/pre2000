import { StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.neutral25, // Lighter background
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: theme.colors.textLight,
        fontSize: 16,
    },
    permissionBanner: {
        backgroundColor: theme.colors.warningSoftBg,
        padding: 12,
        minHeight: 44,
        justifyContent: 'center',
    },
    permissionText: {
        fontSize: 13,
        color: theme.colors.warningTextDark,
        textAlign: 'center',
    },

    // Header
    header: {
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 16,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: theme.colors.neutral900,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },

    // Sections
    sectionContainer: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.neutral900,
        marginBottom: 12,
        marginStart: 4,
    },

    // Essentials List
    essentialsContainer: {
        backgroundColor: theme.colors.white,
        borderRadius: 20,
        ...getShadowStyle(4, theme.colors.black, 0.05, 8, { width: 0, height: 2 }),
        overflow: 'hidden',
    },
    essentialCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    essentialContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginEnd: 12,
    },
    essentialIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: theme.colors.lavenderBlush,
        justifyContent: 'center',
        alignItems: 'center',
        marginEnd: 12,
    },
    essentialIcon: {
        fontSize: 20,
    },
    essentialInfo: {
        flex: 1,
        marginEnd: 12,
    },
    essentialName: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 2,
    },
    essentialDesc: {
        fontSize: 13,
        color: theme.colors.textLight,
    },
    essentialsNote: {
        fontSize: 12,
        color: theme.colors.textMuted,
        textAlign: 'center',
        marginTop: 12,
        fontStyle: 'italic',
    },
    reassuringText: {
        fontSize: 12,
        color: theme.colors.pinkDark700,
        paddingHorizontal: 16,
        paddingBottom: 12,
        fontStyle: 'italic',
        backgroundColor: theme.colors.lavenderBlush,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    // New unified styles to match ReminderCardV2
    essentialMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    essentialSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },
    essentialSummaryText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    // 44pt target around a 16pt gear; the negative margin keeps the card row's
    // height and alignment what they were with the old 4pt padding.
    essentialEditButton: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        margin: -10,
    },
    essentialEditIcon: {
        fontSize: 16,
    },

    // Accordion Sections
    sectionBlock: {
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        marginBottom: 12,
        ...getShadowStyle(2, theme.colors.black, 0.03, 4, { width: 0, height: 1 }),
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: theme.colors.white,
    },
    sectionHeaderExpanded: {
        backgroundColor: theme.colors.white, // Keep white
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    sectionIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginEnd: 12,
    },
    sectionIcon: {
        fontSize: 18,
    },
    sectionHeaderTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
    sectionCount: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    /** Base typographie chevron accordion — rotation appliquée via sectionArrowCollapsed / Rotated */
    sectionArrowBase: {
        fontWeight: '300',
    },
    sectionArrowCollapsed: {
        transform: [{ rotate: '90deg' }],
    },
    sectionArrowRotated: {
        transform: [{ rotate: '-90deg' }],
    },
    sectionContent: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },

    // Cap Banner
    capBanner: {
        backgroundColor: theme.colors.surfaceGreenTint,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 24,
        borderRadius: 16,
        alignItems: 'center',
    },
    capBannerText: {
        fontSize: 14,
        color: theme.colors.green800,
        fontWeight: '600',
        marginBottom: 4,
    },
    capBannerSubtext: {
        fontSize: 12,
        color: theme.colors.green400,
    },
});
