/**
 * RtlAwareChevron — chevron / arrow glyph that auto-flips for RTL languages.
 *
 * Le bug ressenti utilisateur "boutons et flèches inversés en arabe" venait du fait
 * qu'on hardcodait des glyphes Unicode (›, ‹, →, ←, ➤) sans les inverser quand
 * `I18nManager.isRTL` est actif. Ce composant centralise le pattern.
 *
 * USAGE — remplace les glyphes hardcodés :
 *   <Text>{isRTL ? '‹' : '›'}</Text>          // ❌ pattern manuel répétitif
 *   <RtlAwareChevron direction="forward" />   // ✅ auto-mirror
 *
 * direction="forward"  → pointe vers où le contenu progresse (next, open, deeper)
 * direction="back"     → pointe vers où l'on revient (back, prev)
 * direction="up" / "down" → ne sont jamais miroités
 *
 * Variants visuels: 'thin' (› ‹), 'bold' (❯ ❮), 'arrow' (→ ←), 'caret' (▶ ◀)
 *
 * Note : si tu utilises @expo/vector-icons (Ionicons), préférer `chevron-forward` /
 * `chevron-back` qui sont déjà miroités par Ionicons. Ce composant existe pour les
 * cas où on garde du Text glyph (perf, design custom).
 */

import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
    ChevronDirection,
    ChevronVariant,
    resolveChevronGlyph,
} from './RtlAwareChevron.helpers';

export type { ChevronDirection, ChevronVariant } from './RtlAwareChevron.helpers';
export { resolveChevronGlyph } from './RtlAwareChevron.helpers';

interface RtlAwareChevronProps {
    direction: ChevronDirection;
    variant?: ChevronVariant;
    color?: string;
    size?: number;
    style?: StyleProp<TextStyle>;
    /** Override accessibilityLabel — par défaut le glyphe est marqué décoratif. */
    accessibilityLabel?: string;
}

export const RtlAwareChevron: React.FC<RtlAwareChevronProps> = ({
    direction,
    variant = 'thin',
    color,
    size = 16,
    style,
    accessibilityLabel,
}) => {
    // CB4-FIX: derive RTL from the active LANGUAGE, not I18nManager.isRTL. On web, setupRTL()
    // intentionally skips forceRTL (it would cause a reload loop), so I18nManager.isRTL stays false
    // even though the layout is mirrored via document.dir — which left chevrons (chatbot send,
    // calendar nav) pointing the wrong way in Arabic/Tunisian. Language is the correct source.
    const { i18n } = useTranslation();
    const isRtl = i18n.language === 'ar' || i18n.language === 'tn';
    const glyph = resolveChevronGlyph(direction, variant, isRtl);
    const isDecorative = accessibilityLabel === undefined;
    return (
        <Text
            style={[{ fontSize: size, color }, style]}
            accessibilityElementsHidden={isDecorative}
            importantForAccessibility={isDecorative ? 'no-hide-descendants' : 'yes'}
            accessibilityLabel={accessibilityLabel}
        >
            {glyph}
        </Text>
    );
};
