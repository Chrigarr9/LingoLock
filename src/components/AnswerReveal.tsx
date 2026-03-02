import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';
import type { SessionCard } from '../types/vocabulary';

interface AnswerRevealProps {
  sessionCard: SessionCard;
  isCorrect: boolean;
  visible: boolean;
}

/**
 * Post-answer reveal panel shown below the ClozeCard after the user answers.
 * Displays the German sentence translation and grammar/POS notes.
 *
 * Visible when `visible` is true; hidden otherwise (simple conditional render).
 */
export function AnswerReveal({ sessionCard, isCorrect: _isCorrect, visible }: AnswerRevealProps) {
  const theme = useAppTheme();
  const { card } = sessionCard;

  if (!visible) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.custom.glassBackground,
          borderColor: theme.custom.glassBorder,
        },
      ]}
    >
      {/* Full German sentence translation */}
      <Text
        variant="bodyMedium"
        style={[styles.translation, { color: theme.colors.onSurfaceVariant }]}
      >
        {card.sentenceTranslation}
      </Text>

      {/* POS + context note */}
      {(card.pos || card.contextNote) && (
        <Text
          variant="labelSmall"
          style={[styles.grammarNote, { color: theme.custom.labelMuted }]}
        >
          {[card.pos, card.contextNote].filter(Boolean).join(' \u00B7 ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 12,
    gap: 6,
  },
  translation: {
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  grammarNote: {
    textAlign: 'center',
    textTransform: 'lowercase',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
