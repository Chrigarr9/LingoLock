/**
 * SelfRatedCard — Front/back card display with reveal + self-rating buttons.
 *
 * Two states:
 *   1. Front: Shows front text (+ optional image). User taps "Reveal" to flip.
 *   2. Revealed: Shows front (smaller) + back (prominent) + 4 rating buttons.
 *
 * Used for imported deck cards (always selfRated) and optionally for
 * builtin cloze cards on the widget.
 */
import React, { useState } from 'react';
import { View, StyleSheet, Image, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme, getGlassStyle } from '../theme';
import type { SimpleCard } from '../types/simpleCard';
import type { ReviewGrade } from '../services/fsrs';

interface SelfRatedCardProps {
  card: SimpleCard;
  onRate: (grade: ReviewGrade) => void;
}

const GRADE_BUTTONS: Array<{ grade: ReviewGrade; label: string; color: string }> = [
  { grade: 'again', label: 'Again', color: '#EF5350' },
  { grade: 'hard', label: 'Hard', color: '#FF9800' },
  { grade: 'good', label: 'Good', color: '#66BB6A' },
  { grade: 'easy', label: 'Easy', color: '#42A5F5' },
];

export function SelfRatedCard({ card, onRate }: SelfRatedCardProps) {
  const [revealed, setRevealed] = useState(false);
  const theme = useAppTheme();
  const glassStyle = getGlassStyle(theme);

  if (!revealed) {
    return (
      <View style={styles.container}>
        {card.image && (
          <Image source={{ uri: card.image }} style={styles.image} resizeMode="cover" />
        )}
        <View style={[styles.card, glassStyle]}>
          <Text variant="headlineSmall" style={[styles.frontText, { color: theme.colors.onSurface }]}>
            {card.front}
          </Text>
        </View>
        <Pressable
          onPress={() => setRevealed(true)}
          style={[styles.revealButton, { backgroundColor: theme.colors.primary }]}
          accessibilityLabel="Reveal answer"
          accessibilityRole="button"
        >
          <Text style={[styles.revealButtonText, { color: theme.colors.onPrimary }]}>
            Reveal
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {card.image && (
        <Image source={{ uri: card.image }} style={styles.image} resizeMode="cover" />
      )}
      <View style={[styles.card, glassStyle]}>
        <Text variant="bodyLarge" style={[styles.frontTextSmall, { color: theme.colors.onSurfaceVariant }]}>
          {card.front}
        </Text>
        <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
        <Text variant="headlineSmall" style={[styles.backText, { color: theme.colors.onSurface }]}>
          {card.back}
        </Text>
      </View>

      <View style={styles.ratingRow}>
        {GRADE_BUTTONS.map(({ grade, label, color }) => (
          <Pressable
            key={grade}
            onPress={() => onRate(grade)}
            style={[styles.ratingButton, { backgroundColor: color }]}
            accessibilityLabel={`Rate ${label}`}
            accessibilityRole="button"
          >
            <Text style={styles.ratingButtonText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  image: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 12,
    maxHeight: 200,
  },
  frontText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  frontTextSmall: {
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  backText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  revealButton: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 20,
  },
  revealButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  ratingButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
