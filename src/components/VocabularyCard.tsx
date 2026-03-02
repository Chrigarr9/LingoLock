import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, Divider } from 'react-native-paper';
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
    <Card style={styles.card} mode="elevated">
      <Card.Content style={styles.content}>
        <Text variant="headlineLarge" style={[styles.frontText, { color: theme.colors.onSurface }]}>
          {card.front}
        </Text>

        {showAnswer && (
          <>
            <Divider style={styles.divider} />
            <Text variant="headlineSmall" style={[styles.backText, { color: answerColor }]}>
              {card.back} {isCorrect !== undefined && (isCorrect ? ' \u2713' : ' \u2717')}
            </Text>
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 200,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  frontText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  divider: {
    width: '60%',
    marginVertical: 16,
  },
  backText: {
    textAlign: 'center',
    fontWeight: '500',
  },
});
