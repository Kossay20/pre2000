import { theme } from '../theme';
import { Platform, ViewStyle, TextStyle } from 'react-native';
import { hexToRgba } from './hexToRgba';

export { hexToRgba };

/**
 * Generates cross-platform shadow styles.
 * - Web: Uses `boxShadow`
 * - iOS: Uses `shadow*` props
 * - Android: Uses `elevation`
 *
 * @param elevation - Android elevation level (default: 5)
 * @param color - Shadow color (default: theme.colors.black)
 * @param opacity - Shadow opacity (default: 0.2)
 * @param radius - Shadow radius (default: 4)
 * @param offset - Shadow offset (default: { width: 0, height: 2 })
 */
export const getShadowStyle = (
    elevation: number = 5,
    color: string = theme.colors.black,
    opacity: number = 0.2,
    radius: number = 4,
    offset: { width: number; height: number } = { width: 0, height: 2 }
): ViewStyle => {
    if (Platform.OS === 'android') {
        return {
            elevation,
            shadowColor: color,
        };
    }

    if (Platform.OS === 'web') {
        return {
            // @ts-ignore - boxShadow is valid on web but might not be in RN types yet
            boxShadow: `${offset.width}px ${offset.height}px ${radius}px ${hexToRgba(color, opacity)}`,
        };
    }

    // iOS
    return {
        shadowColor: color,
        shadowOffset: offset,
        shadowOpacity: opacity,
        shadowRadius: radius,
    };
};

/**
 * Generates cross-platform text shadow styles.
 * - Web: Uses `textShadow`
 * - iOS/Android: Uses `textShadow*` props
 */
export const getTextShadowStyle = (
    color: string = theme.colors.black,
    opacity: number = 0.2,
    radius: number = 4,
    offset: { width: number; height: number } = { width: 0, height: 2 }
): TextStyle => {
    const shadowColor = hexToRgba(color, opacity);

    if (Platform.OS === 'web') {
        return {
            // @ts-ignore
            textShadow: `${offset.width}px ${offset.height}px ${radius}px ${shadowColor}`,
        };
    }

    return {
        textShadowColor: shadowColor,
        textShadowOffset: offset,
        textShadowRadius: radius,
    };
};

/**
 * Thumb colour props for a `<Switch>`.
 * react-native-web ignores `thumbColor` while the switch is ON and paints its own
 * default teal unless `activeThumbColor` is set. Native has no such prop,
 * so it is only added on web — where the store screenshots are taken.
 */
export const switchThumbProps = (color: string): { thumbColor: string; activeThumbColor?: string } =>
    Platform.OS === 'web' ? { thumbColor: color, activeThumbColor: color } : { thumbColor: color };
