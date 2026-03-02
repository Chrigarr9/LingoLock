import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';
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
        <ProgressDots total={cardCount} current={currentIndex} results={results} />
        <IconButton
          icon="close"
          size={20}
          iconColor={theme.colors.onSurfaceVariant}
          onPress={() => router.back()}
          accessibilityLabel="Close challenge"
          style={styles.closeButton}
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
                <Button
                  mode="contained"
                  onPress={handleNext}
                  style={{ borderRadius: 12 }}
                  contentStyle={{ paddingVertical: 6 }}
                  labelStyle={{ fontSize: 16, fontWeight: '600', letterSpacing: 0 }}
                >
                  {currentIndex < cards.length - 1 ? 'Next' : 'Finish'}
                </Button>
              </View>
            )}
          </>
        )}

        {isComplete && params.source && (
          <View style={styles.completionArea}>
            <View style={styles.completionContent}>
              <Text
                variant="displaySmall"
                style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.5 }}
              >
                Done
              </Text>
              <Text
                variant="titleLarge"
                style={{ color: theme.custom.success, fontWeight: '600', marginTop: 8 }}
              >
                {correctCount}/{cardCount} correct
              </Text>
            </View>
            <ContinueButton
              sourceApp={params.source}
              challengeType={params.type || 'app_open'}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
  },
  closeButton: {
    marginLeft: 'auto',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  inputArea: {
    marginTop: 28,
    gap: 12,
  },
  completionArea: {
    gap: 32,
    alignItems: 'center',
  },
  completionContent: {
    alignItems: 'center',
  },
});
