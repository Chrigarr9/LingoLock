import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';
import { VocabularyCard as VocabCardType } from '../types/vocabulary';

interface VocabularyCardProps {
  card: VocabCardType;
  showAnswer: boolean;
  isCorrect?: boolean;
}

export function VocabularyCard({ card, showAnswer, isCorrect }: VocabularyCardProps) {
  const theme = useAppTheme();

  const answerColor =
    isCorrect === undefined
      ? theme.colors.onSurface
      : isCorrect
        ? theme.custom.success
        : theme.colors.error;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.custom.glassBackground,
          borderColor: theme.custom.glassBorder,
        },
        Platform.select({
          web: { backdropFilter: `blur(${theme.custom.glassBlur}px)` } as any,
          default: {},
        }),
      ]}
    >
      <Text
        variant="displaySmall"
        style={[styles.frontText, { color: theme.colors.onSurface }]}
      >
        {card.front}
      </Text>

      {showAnswer && (
        <>
          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
          <Text
            variant="headlineSmall"
            style={[styles.backText, { color: answerColor }]}
          >
            {card.back}
            {isCorrect !== undefined && (
              <Text style={{ color: answerColor }}>
                {isCorrect ? '  \u2713' : '  \u2717'}
              </Text>
            )}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  frontText: {
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: -0.5,
    fontSize: 34,
  },
  separator: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginVertical: 20,
  },
  backText: {
    textAlign: 'center',
    fontWeight: '500',
  },
});
