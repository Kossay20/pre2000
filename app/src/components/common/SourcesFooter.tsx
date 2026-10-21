import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { useRtl } from '../../hooks/useRtl';
import { resolveContentSources } from '../../data/contentSources';
import { openContentSource } from './SourcesFooter.helpers';

interface SourcesFooterProps {
    /** The record's `sources` field, as stored: ids from CONTENT_SOURCES. */
    sources?: unknown;
}

/**
 * "Sources and references" block under an article or a week's content.
 *
 * Renders nothing until the record cites at least one reviewed authority, so a
 * screen can mount it unconditionally and the citations appear as the content
 * is signed off, without another screen change.
 */
export const SourcesFooter: React.FC<SourcesFooterProps> = ({ sources }) => {
    const { t } = useTranslation();
    const { textAlign } = useRtl();
    const cited = resolveContentSources(sources);

    if (cited.length === 0) return null;

    return (
        <View style={styles.container}>
            <Text style={[styles.title, { textAlign }]} accessibilityRole="header">
                {t('common.sourcesTitle')}
            </Text>
            {cited.map(source => (
                <TouchableOpacity
                    key={source.id}
                    // Plain 'row': under dir=rtl it already runs right-to-left, and a
                    // row-reverse would flip it back (see ArticleDetailScreen header).
                    style={styles.row}
                    onPress={() => openContentSource(source.url)}
                    accessibilityRole="link"
                    accessibilityLabel={`${source.organization}, ${source.title}`}
                    accessibilityHint={t('common.sourcesOpenHint')}
                >
                    <Ionicons
                        name="open-outline"
                        size={14}
                        color={theme.colors.accent}
                        style={styles.icon}
                    />
                    <Text style={[styles.text, { textAlign }]}>
                        <Text style={styles.organization}>{source.organization}</Text>
                        {` — ${source.title}`}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: theme.spacing.l,
        paddingTop: theme.spacing.m,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    title: {
        ...theme.typography.caption,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: theme.spacing.s,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: theme.spacing.xs,
        minHeight: 44,
    },
    icon: {
        marginTop: 2,
        marginEnd: theme.spacing.s,
    },
    text: {
        ...theme.typography.caption2,
        flex: 1,
        color: theme.colors.accent,
    },
    organization: {
        fontWeight: '600',
    },
});
