import { Platform } from 'react-native';

/**
 * react-native-chart-kit draws its axis labels as bare SVG <text>. On the web those have no
 * font-family and the browser falls back to its serif default, so the numbers sat in Times
 * next to a sans-serif app (E-053). Native renders SVG text with the system font already.
 */
export const chartLabelProps: { fontFamily?: string } = Platform.OS === 'web'
    ? { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }
    : {};
