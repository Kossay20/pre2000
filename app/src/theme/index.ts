import { Platform, ViewStyle } from 'react-native';
import { hexToRgba } from '../utils/hexToRgba';

/**
 * Palette unique (SSOT couleurs). `theme.typography` et `theme.shadows` y font référence
 * pour éviter les hex dupliqués.
 */
const paletteColors = {
    /**
     * Brand pink — decorative only (borders, spinners, dots, indicators). White text
     * on it is 2.68:1, so anything that carries text uses `primaryStrong` instead.
     */
    primary: '#FF6B9D',
    /** Text-bearing pink: header gradient start, pink buttons/pills (white text 4.6:1). */
    primaryStrong: '#D6336C',
    /**
     * Wash for chips sitting on the pink header. It darkens rather than whitens:
     * a white wash lifts the pink toward pastel and white labels on it drop to ~3:1.
     */
    headerChipBg: 'rgba(0, 0, 0, 0.15)',
    secondary: '#FF8FA3',
    accent: '#C2185B',
    background: '#FFF5F8',
    surface: '#F8F9FA',
    onSurface: '#FFFFFF',
    text: '#4E342E',
    textSecondary: '#666666',
    /** Brown caption text. AA (≥4.5:1) on every pink/amber/grey tint the app uses. */
    textLight: '#795548',
    /** Quiet hint/meta text (was #999 / #888 / #9E9E9E as text colours, all under 4.5:1). */
    textMuted: '#6B6B6B',
    white: '#FFFFFF',
    /** Red text & danger fills: AA on white, surface and feedbackErrorBg, and under white text. */
    error: '#C62828',
    /** Green text & success fills (toast, buttons): AA both ways against white. */
    success: '#2E7D32',
    warning: '#FFB74D',
    info: '#1565C0',
    cardBackground: '#FFFFFF',
    border: '#FFC1E3',
    borderLight: '#F0F0F0',
    disabled: '#E0E0E0',
    surfaceElevated: '#FFFFFF',
    divider: '#EEEEEE',
    overlay: 'rgba(0, 0, 0, 0.45)',
    /** Alpha / glass / overlays (P6 SSOT — remplace rgba dispersés) */
    whiteAlpha10: 'rgba(255, 255, 255, 0.1)',
    whiteAlpha15: 'rgba(255, 255, 255, 0.15)',
    whiteAlpha20: 'rgba(255, 255, 255, 0.2)',
    whiteAlpha25: 'rgba(255, 255, 255, 0.25)',
    whiteAlpha30: 'rgba(255, 255, 255, 0.3)',
    whiteAlpha40: 'rgba(255, 255, 255, 0.4)',
    whiteAlpha50: 'rgba(255, 255, 255, 0.5)',
    whiteAlpha60: 'rgba(255, 255, 255, 0.6)',
    whiteAlpha70: 'rgba(255, 255, 255, 0.7)',
    whiteAlpha80: 'rgba(255, 255, 255, 0.8)',
    whiteAlpha85: 'rgba(255, 255, 255, 0.85)',
    whiteAlpha90: 'rgba(255, 255, 255, 0.9)',
    whiteAlpha95: 'rgba(255, 255, 255, 0.95)',
    blackAlpha10: 'rgba(0, 0, 0, 0.1)',
    blackAlpha40: 'rgba(0, 0, 0, 0.4)',
    blackAlpha50: 'rgba(0, 0, 0, 0.5)',
    blackAlpha60: 'rgba(0, 0, 0, 0.6)',
    amber500Alpha85: 'rgba(255, 193, 7, 0.85)',
    amber500Alpha90: 'rgba(255, 193, 7, 0.9)',
    primaryAlpha10: 'rgba(255, 107, 157, 0.1)',
    primaryAlpha15: 'rgba(255, 107, 157, 0.15)',
    orangeDeepAlpha10: 'rgba(255, 111, 0, 0.1)',
    badgeSuccessBgAlpha: 'rgba(129, 199, 132, 0.18)',
    badgeWarningBgAlpha: 'rgba(255, 183, 77, 0.20)',
    badgeErrorBgAlpha: 'rgba(229, 115, 115, 0.18)',
    badgeInfoBgAlpha: 'rgba(25, 118, 210, 0.12)',
    badgeAccentBgAlpha: 'rgba(255, 107, 157, 0.15)',
    placeholder: '#B0B0B0',
    accentAmber: '#FFC107',
    accentAmberDark: '#FFA000',
    accentPurple: '#9C27B0',
    accentOrangeDeep: '#F57C00',
    surfaceTip: '#FFF9E6',
    surfaceRose: '#FFEBEE',
    /** Baby-size display figures (≥22px bold, AA-large 3.7:1 on white) — not for body text. */
    coral: '#E4572E',
    critical: '#F44336',
    /** Ombres & neutres UI (migration hex dispersés) */
    black: '#000000',
    neutral900: '#333333',
    neutral700: '#555555',
    /**
     * Was #999 (2.85:1 on white). Every remaining use is text — input placeholders,
     * the Reminders top-tab inactive label, auth footnotes — so it takes the AA grey
     * (same value as `textMuted`; the scale stays monotonic: 350 #888 < 400 < 700 #555).
     */
    neutral400: '#6B6B6B',
    neutral300: '#CCCCCC',
    neutral200: '#DDDDDD',
    neutral150: '#EEEEEE',
    neutral100: '#F5F5F5',
    neutral75: '#F8F8F8',
    neutral50: '#EFEFEF',
    neutral25: '#FAFAFA',
    neutral350: '#888888',
    textInk: '#1A1A1A',
    blue600: '#2196F3',
    blue800: '#1565C0',
    green500: '#4CAF50',
    orange500: '#FF9800',
    surfaceGreenTint: '#E8F5E9',
    surfaceGreenBorder: '#A5D6A7',
    surfaceOrangeTint: '#FFF3E0',
    surfaceBlueTint: '#E3F2FD',
    surfaceAmberTint: '#FFF8E1',
    amberBorder: '#FFE082',
    surfacePeach: '#FFE0B2',
    surfacePinkTint: '#FCE4EC',
    surfacePurpleTint: '#F3E5F5',
    deepPink: '#880E4F',
    purpleDark: '#6A1B9A',
    pinkAccent: '#E91E63',
    /** Étendue courante composants (hydratation, stats, etc.) */
    cyan600: '#0277BD',
    teal500: '#10B981',
    red800: '#C62828',
    red600: '#E53935',
    red700: '#D32F2F',
    orange600: '#FB8C00',
    gray600: '#757575',
    gray500: '#9E9E9E',
    indigoAccent: '#6B46C1',
    blueGrey800: '#37474F',
    surfaceBluePale: '#F0F7FF',
    surfaceGrayStripe: '#F9F9F9',
    neutral800: '#444444',
    neutral850: '#4A4A4A',
    orange900: '#E65100',
    blue100: '#BBDEFB',
    green100: '#C8E6C9',
    pinkLight: '#F8BBD9',
    gradientPinkStart: '#FFE5F1',
    gradientPinkEnd: '#FFF0F7',
    gradientPeachStart: '#FFEEE8',
    gradientPeachEnd: '#FFE8F0',
    gradientAmberStart: '#FFF8E1',
    gradientAmberEnd: '#FFFDE7',
    gradientGreenStart: '#E8F5E9',
    gradientGreenEnd: '#C8E6C9',
    gradientRoseStart: '#FCE4EC',
    gradientRoseEnd: '#F8BBD9',
    gradientOrangeStart: '#FFF3E0',
    gradientOrangeEnd: '#FFE0B2',
    surfaceWashPink: '#FFF8F8',
    surfacePinkWash: '#FFE8F0',
    lavenderBlush: '#FFF0F5',
    borderPinkPastel: '#FFD6E8',
    shadowHeroPink: '#FF9E9E',
    accentDarkPink: '#D81B60',
    hotPink: '#FF69B4',
    redAccentLight: '#EF5350',
    materialRedDark: '#B00020',
    green700: '#388E3C',
    green400: '#66BB6A',
    green800: '#2E7D32',
    orange400: '#FFA726',
    pinkLightPastel: '#FFB6C1',
    surfacePinkSoft: '#FFE4EC',
    surfaceBlush: '#FFE5EC',
    blueTintVeryPale: '#F0F4FF',
    blueTintPale: '#E0E8FF',
    purple700: '#7B1FA2',
    pink200: '#F48FB1',
    iosGroupedBackground: '#F4F3F4',
    materialGray400: '#BDBDBD',
    surfaceCreamWarm: '#FFF9F5',
    /** Piste Switch « on » (rose léger, lisible sur fond clair) */
    primarySoft: '#FFD6E8',
    indigoAccentMuted: '#6B46C120',
    blue200: '#90CAF9',
    blueGrey900: '#263238',
    blueGrey100: '#CFD8DC',
    cyan50: '#E0F7FA',
    pinkDark700: '#AD1457',
    deepOrange900: '#BF360C',
    sky50: '#F0F9FF',
    pinkAccentBright: '#FF4081',
    roseMisty: '#FFE4E1',
    pink400ui: '#EC407A',
    orangeDeepAccent: '#FF6F00',
    surfacePinkSnow: '#FFF5F9',
    surfacePinkMist: '#FFF5F7',
    warningSoftBg: '#FFF3CD',
    /** PDF export / table zebra & sticky-note blocks */
    surfaceRowZebra: '#FFFCFD',
    surfaceStickyNote: '#FFFEF0',
    amber300: '#FFD54F',
    /** Bannières feedback (SuccessMessage, ErrorMessage) */
    feedbackSuccessBg: '#D4EDDA',
    feedbackSuccessText: '#155724',
    feedbackErrorBg: '#FEEEEE',
    /** Home / tips (ex-hex) */
    amber100: '#FFECB3',
    lightBlue300: '#4FC3F7',
    /** Home cards (BabyGrowth / BabyFacts / WeekReminders) */
    pinkSoft300: '#FF8FB3',
    brownText800: '#5D4037',
    brownText700: '#5D4E37',
    /** Rappels / réglages / stats (ex-hex) */
    pinkAccentA100: '#FF80AB',
    warningTextDark: '#856404',
    orangeStreakLight: '#FF8F00',
    purpleBorderLight: '#E1BEE7',
    amberSurfaceSoft: '#FFE69C',
    /** Bordures rose pâle (hydratation, inputs) */
    pinkBorderSoft: '#F8BBD0',
    /** Priorités calendrier (ex-Tailwind, centralisées pour calendarService) */
    calendarPriorityCritical: '#EF4444',
    calendarPriorityHigh: '#F59E0B',
    calendarPriorityModerate: '#3B82F6',
    calendarPriorityInfo: '#6B7280',
} as const;

export const theme = {
    colors: paletteColors,
    spacing: {
        xs: 4,
        s: 8,
        m: 16,
        l: 24,
        xl: 32,
    },
    borderRadius: {
        s: 8,
        m: 12,
        l: 16,
        xl: 20,
        card: 16,
        round: 999,
    },
    typography: {
        h1: {
            fontSize: 28,
            fontWeight: 'bold' as const,
            color: paletteColors.text,
        },
        h2: {
            fontSize: 22,
            fontWeight: 'bold' as const,
            color: paletteColors.text,
        },
        h3: {
            fontSize: 18,
            fontWeight: 'bold' as const,
            color: paletteColors.text,
        },
        body: {
            fontSize: 16,
            color: paletteColors.text,
            lineHeight: 24,
        },
        caption: {
            fontSize: 14,
            color: paletteColors.textLight,
        },
        caption2: {
            fontSize: 12,
            color: paletteColors.textLight,
            lineHeight: 16,
        },
        button: {
            fontSize: 16,
            fontWeight: '600' as const,
            color: paletteColors.white,
        },
        label: {
            fontSize: 13,
            fontWeight: '600' as const,
            color: paletteColors.text,
            letterSpacing: 0.2,
        },
    },
    shadows: {
        sm: buildShadow({
            color: paletteColors.black,
            opacity: 0.05,
            radius: 2,
            offset: { width: 0, height: 1 },
            elevation: 1,
        }),
        md: buildShadow({
            color: paletteColors.black,
            opacity: 0.08,
            radius: 6,
            offset: { width: 0, height: 3 },
            elevation: 3,
        }),
        lg: buildShadow({
            color: paletteColors.black,
            opacity: 0.12,
            radius: 12,
            offset: { width: 0, height: 6 },
            elevation: 6,
        }),
        /** Chaînes CSS `box-shadow` pour HTML/PDF uniquement — ne pas spread dans un `ViewStyle` RN */
        pdfRoot: '0 4px 12px rgba(255, 107, 157, 0.15)',
        pdfHeader: '0 4px 10px rgba(0, 0, 0, 0.1)',
    },
    animation: {
        durations: {
            fast: 150,
            base: 250,
            slow: 400,
        },
        easings: {
            out: { x1: 0, y1: 0, x2: 0.2, y2: 1 } as const,
            inOut: { x1: 0.4, y1: 0, x2: 0.2, y2: 1 } as const,
        },
    },
};

interface ShadowParams {
    color: string;
    opacity: number;
    radius: number;
    offset: { width: number; height: number };
    elevation: number;
}

function buildShadow({ color, opacity, radius, offset, elevation }: ShadowParams): ViewStyle {
    if (Platform.OS === 'android') {
        return { elevation, shadowColor: color };
    }
    if (Platform.OS === 'web') {
        return {
            // @ts-ignore - boxShadow valide sur web mais types RN incomplets
            boxShadow: `${offset.width}px ${offset.height}px ${radius}px ${hexToRgba(color, opacity)}`,
        };
    }
    return {
        shadowColor: color,
        shadowOffset: offset,
        shadowOpacity: opacity,
        shadowRadius: radius,
    };
}
