import { theme } from '../../theme';

export type ButtonVariant =
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'destructive'
    | 'ghost'
    | 'success';

export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonVariantStyle {
    backgroundColor: string;
    textColor: string;
    borderColor?: string;
}

export interface ButtonSizeStyle {
    paddingVertical: number;
    paddingHorizontal: number;
    fontSize: number;
    minHeight: number;
}

/**
 * Pure helper — mapping variant + disabled → couleurs.
 * Extrait pour testabilité sans dépendance au runtime React Native.
 */
export function resolveButtonVariant(
    variant: ButtonVariant,
    disabled: boolean
): ButtonVariantStyle {
    if (disabled) {
        if (variant === 'outline' || variant === 'ghost') {
            return {
                backgroundColor: 'transparent',
                textColor: theme.colors.placeholder,
                borderColor: variant === 'outline' ? theme.colors.disabled : undefined,
            };
        }
        // Cycle 2 F301 : white-on-disabled = ratio ~1.4:1 (WCAG AA fail).
        // neutral700 sur disabled = ~7:1, lisible sans donner l'air actif.
        return { backgroundColor: theme.colors.disabled, textColor: theme.colors.neutral700 };
    }

    switch (variant) {
        case 'primary':
            return { backgroundColor: theme.colors.primary, textColor: theme.colors.white };
        case 'secondary':
            return {
                backgroundColor: theme.colors.secondary,
                textColor: theme.colors.white,
            };
        case 'outline':
            return {
                backgroundColor: 'transparent',
                textColor: theme.colors.primary,
                borderColor: theme.colors.primary,
            };
        case 'ghost':
            return { backgroundColor: 'transparent', textColor: theme.colors.primary };
        case 'destructive':
            return { backgroundColor: theme.colors.error, textColor: theme.colors.white };
        case 'success':
            return { backgroundColor: theme.colors.success, textColor: theme.colors.white };
        default:
            return { backgroundColor: theme.colors.primary, textColor: theme.colors.white };
    }
}

export function resolveButtonSize(size: ButtonSize): ButtonSizeStyle {
    switch (size) {
        case 'small':
            // Cycle 2 F300 : Apple HIG min 44pt + Android Material min 48dp.
            // 44 satisfait les deux et passe la review accessibility App Store.
            return {
                paddingVertical: theme.spacing.s,
                paddingHorizontal: theme.spacing.m,
                fontSize: 14,
                minHeight: 44,
            };
        case 'large':
            return {
                paddingVertical: theme.spacing.m + 2,
                paddingHorizontal: theme.spacing.xl,
                fontSize: 17,
                minHeight: 56,
            };
        case 'medium':
        default:
            return {
                paddingVertical: theme.spacing.m,
                paddingHorizontal: theme.spacing.l,
                fontSize: 16,
                minHeight: 48,
            };
    }
}
