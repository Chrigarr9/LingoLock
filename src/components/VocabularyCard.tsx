/**
 * VocabularyCard component - iOS-native card design for vocabulary display
 * Displays vocabulary question with minimalist, card-based presentation
 * Follows iOS Human Interface Guidelines with automatic dark mode support
 */

import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { VocabularyCard as VocabCardType } from '../types/vocabulary';

interface VocabularyCardProps {
  /** The vocabulary card to display */
  card: VocabCardType;

  /** Whether to show the answer (back) side */
  showAnswer: boolean;

  /** Whether the user's answer was correct (affects answer text color) */
  isCorrect?: boolean;
}

/**
 * Displays a vocabulary flashcard with iOS-native styling
 *
 * Design principles:
 * - Card-based presentation (not full-bleed)
 * - Vocabulary is the hero (largest element, centered)
 * - Minimal chrome (no headers, icons, branding)
 * - Neutral, professional, modern feel
 * - Follows iOS design conventions (SF Pro font, system colors)
 */
export function VocabularyCard({ card, showAnswer, isCorrect }: VocabularyCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[
      styles.card,
      { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }
    ]}>
      {/* Front (Question) - Always visible */}
      <Text style={[
        styles.frontText,
        { color: isDark ? '#ffffff' : '#000000' }
      ]}>
        {card.front}
      </Text>

      {/* Back (Answer) - Only shown after submission */}
      {showAnswer && (
        <Text style={[
          styles.backText,
          { color: isCorrect ? '#34c759' : '#ff3b30' }  // iOS system green/red
        ]}>
          {card.back}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 32,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,  // Android shadow
  },
  frontText: {
    fontSize: 34,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'System',  // SF Pro on iOS
  },
  backText: {
    fontSize: 28,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
    fontFamily: 'System',
  },
});
