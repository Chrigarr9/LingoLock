import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Card, IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { VocabularyCard } from '../src/components/VocabularyCard';
import { AnswerInput } from '../src/components/AnswerInput';
import { ContinueButton } from '../src/components/ContinueButton';
import { ProgressDots } from '../src/components/ProgressDots';
import { PLACEHOLDER_CARDS } from '../src/data/placeholderVocabulary';
import { validateAnswer } from '../src/utils/answerValidation';

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
    count: string;
    type: 'unlock' | 'app_open';
  }>();
  const router = useRouter();
  const theme = useAppTheme();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [results, setResults] = useState<('correct' | 'incorrect' | null)[]>([]);
  const [correctCount, setCorrectCount] = useState(0);

  const cardCount = Math.min(parseInt(params.count || '3', 10), PLACEHOLDER_CARDS.length);
  const cards = PLACEHOLDER_CARDS.slice(0, cardCount);
  const currentCard = cards[currentIndex];

  useEffect(() => {
    setResults(Array(cardCount).fill(null));
    console.log('[Challenge] Started:', {
      source: params.source,
      count: cardCount,
      type: params.type,
    });
  }, []);

  const handleAnswerSubmit = (userAnswer: string) => {
    const correct = validateAnswer(userAnswer, currentCard.back);
    setIsCorrect(correct);
    setShowAnswer(true);
    const newResults = [...results];
    newResults[currentIndex] = correct ? 'correct' : 'incorrect';
    setResults(newResults);
    if (correct) setCorrectCount((c) => c + 1);
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
      setIsCorrect(null);
    } else {
      setIsComplete(true);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <IconButton
          icon="close"
          size={24}
          iconColor={theme.colors.onSurfaceVariant}
          onPress={() => router.back()}
          accessibilityLabel="Close challenge"
        />
      </View>

      <View style={styles.content}>
        {!isComplete && currentCard && (
          <>
            <VocabularyCard
              card={currentCard}
              showAnswer={showAnswer}
              isCorrect={isCorrect ?? undefined}
            />

            {!showAnswer && (
              <View style={styles.inputArea}>
                <AnswerInput onSubmit={handleAnswerSubmit} />
              </View>
            )}

            {showAnswer && (
              <View style={styles.inputArea}>
                <Button mode="contained" onPress={handleNext}>
                  {currentIndex < cards.length - 1 ? 'Next' : 'Finish'}
                </Button>
              </View>
            )}
          </>
        )}

        {isComplete && params.source && (
          <View style={styles.completionArea}>
            <Card style={styles.completionCard} mode="elevated">
              <Card.Content style={styles.completionContent}>
                <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>
                  Challenge Complete
                </Text>
                <Text
                  variant="bodyLarge"
                  style={{ color: theme.custom.success }}
                >
                  {'\u2713'} {correctCount}/{cardCount} correct
                </Text>
              </Card.Content>
            </Card>
            <ContinueButton
              sourceApp={params.source}
              challengeType={params.type || 'app_open'}
            />
          </View>
        )}
      </View>

      <ProgressDots total={cardCount} current={currentIndex} results={results} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  headerSpacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  inputArea: {
    marginTop: 24,
    gap: 12,
  },
  completionArea: {
    gap: 24,
  },
  completionCard: {
    alignItems: 'center',
  },
  completionContent: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
});
