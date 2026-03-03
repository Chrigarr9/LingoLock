import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { ClozeCardDisplay } from '../src/components/ClozeCard';
import { AnswerReveal } from '../src/components/AnswerReveal';
import { AnswerInput } from '../src/components/AnswerInput';
import { MultipleChoiceGrid } from '../src/components/MultipleChoiceGrid';
import { ContinueButton } from '../src/components/ContinueButton';
import { ProgressDots } from '../src/components/ProgressDots';
import { buildSession, handleWrongAnswer, getCurrentChapter } from '../src/services/cardSelector';
import { scheduleReview, createNewCardState } from '../src/services/fsrs';
import { saveCardState, loadCardState } from '../src/services/storage';
import { updateStatsAfterSession, recordAbort } from '../src/services/statsService';
import { validateAnswer } from '../src/utils/answerValidation';
import type { SessionCard } from '../src/types/vocabulary';

/** How long to show the answer reveal before auto-advancing on correct answer */
const AUTO_ADVANCE_MS = 1500;

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
    count: string;
    type: 'unlock' | 'app_open';
  }>();
  const router = useRouter();
  const theme = useAppTheme();
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalCardCount = useRef(0);

  // --------------------------------------------------------------------------
  // Session state
  // --------------------------------------------------------------------------
  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredChoice, setAnsweredChoice] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);

  // Parse count param; default to 3
  const cardCount = Math.min(parseInt(params.count || '3', 10), 10);

  // --------------------------------------------------------------------------
  // Session initialization — replace PLACEHOLDER_CARDS with buildSession
  // --------------------------------------------------------------------------
  useEffect(() => {
    const session = buildSession(cardCount, params.source);
    setQueue(session);
    originalCardCount.current = cardCount;

    console.log('[Challenge] Started:', {
      source: params.source,
      count: cardCount,
      type: params.type,
      sessionLength: session.length,
    });
  }, []);

  // Timer cleanup on unmount
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  // --------------------------------------------------------------------------
  // Derived values
  // --------------------------------------------------------------------------
  const currentCard: SessionCard | undefined = queue[currentIndex];
  const answerType = currentCard?.answerType ?? 'mc2';
  const isMC = answerType === 'mc2' || answerType === 'mc4';

  // --------------------------------------------------------------------------
  // Navigation helpers
  // --------------------------------------------------------------------------
  const advanceToNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < originalCardCount.current) {
      setCurrentIndex(nextIndex);
      setShowAnswer(false);
      setIsCorrect(null);
      setAnsweredChoice(null);
      setShowReveal(false);
    } else {
      // All original cards have been answered at least once — session complete
      updateStatsAfterSession(correctCount, originalCardCount.current, params.source ?? 'unknown');
      setIsComplete(true);
    }
  };

  const scheduleAdvance = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(advanceToNext, AUTO_ADVANCE_MS);
  };

  // --------------------------------------------------------------------------
  // FSRS state update helper
  // --------------------------------------------------------------------------
  const updateCardFSRS = (sessionCard: SessionCard, correct: boolean) => {
    const cardId = sessionCard.card.id;
    const existing = loadCardState(cardId);
    const currentState = existing ?? createNewCardState(cardId);
    const nextState = scheduleReview(currentState, correct);
    saveCardState(cardId, nextState);
  };

  // --------------------------------------------------------------------------
  // Answer handlers
  // --------------------------------------------------------------------------
  const handleCorrect = (sessionCard: SessionCard) => {
    updateCardFSRS(sessionCard, true);
    setIsCorrect(true);
    setShowAnswer(true);
    setShowReveal(true);
    setCorrectCount((c) => c + 1);
    scheduleAdvance();
  };

  const handleIncorrect = (sessionCard: SessionCard) => {
    updateCardFSRS(sessionCard, false);
    setIsCorrect(false);
    setShowAnswer(true);
    setShowReveal(true);
    // Re-insert wrong card ~4 positions ahead in queue
    setQueue((q) => handleWrongAnswer(q, currentIndex, sessionCard));
    // No auto-advance — user must tap "Next"
  };

  const handleTextSubmit = (userAnswer: string) => {
    if (!currentCard) return;
    const correct = validateAnswer(userAnswer, currentCard.card.wordInContext);
    if (correct) {
      handleCorrect(currentCard);
    } else {
      handleIncorrect(currentCard);
    }
  };

  const handleMCSelect = (choice: string) => {
    if (!currentCard) return;
    setAnsweredChoice(choice);
    const correct = choice === currentCard.card.wordInContext;
    if (correct) {
      handleCorrect(currentCard);
    } else {
      handleIncorrect(currentCard);
    }
  };

  // --------------------------------------------------------------------------
  // Glass style (reuse from Phase 1 pattern)
  // --------------------------------------------------------------------------
  const glassStyle = {
    backgroundColor: theme.custom.glassBackground,
    borderColor: theme.custom.glassBorder,
    ...Platform.select({
      web: { backdropFilter: `blur(${theme.custom.glassBlur}px)` } as any,
      default: {},
    }),
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="close"
          size={22}
          iconColor={theme.colors.onSurface}
          onPress={() => {
            if (advanceTimer.current) clearTimeout(advanceTimer.current);
            // Only forced sessions (unlock/app_open) count as aborts
            const isForced = params.type === 'unlock' || params.type === 'app_open';
            if (isForced && !isComplete) {
              recordAbort(params.source ?? 'unknown');
            }
            router.back();
          }}
          accessibilityLabel="Close challenge"
        />
        {!isComplete && (
          <View style={styles.headerCenter}>
            <Text
              variant="labelSmall"
              style={[styles.headerLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              CARD
            </Text>
            <Text
              variant="titleMedium"
              style={[styles.headerTitle, { color: theme.colors.onSurface }]}
            >
              {params.source || 'Practice'}
            </Text>
          </View>
        )}
        <View style={{ width: 48 }} />
      </View>

      {/* Progress */}
      {!isComplete && (
        <View style={styles.progressArea}>
          <View style={styles.progressRow}>
            <Text
              variant="labelSmall"
              style={[styles.progressLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              CHAPTER {getCurrentChapter()} · CARD {currentIndex + 1} OF {originalCardCount.current || cardCount}
            </Text>
            <Text
              variant="labelSmall"
              style={[styles.progressLabel, { color: theme.custom.brandOrange }]}
            >
              {correctCount} correct
            </Text>
          </View>
          <ProgressDots total={originalCardCount.current || cardCount} current={currentIndex} />
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {!isComplete && currentCard && (
          <>
            {isMC ? (
              /* Multiple Choice mode (MC2 or MC4) */
              <View style={styles.mcArea}>
                {/* Cloze card replaces old front/back question text */}
                <ClozeCardDisplay
                  sessionCard={currentCard}
                  showAnswer={showAnswer}
                  isCorrect={isCorrect ?? undefined}
                />

                {/* Answer reveal — shown after answering */}
                <AnswerReveal
                  sessionCard={currentCard}
                  isCorrect={isCorrect ?? false}
                  visible={showReveal}
                />

                {/* MC choices grid — hidden after answering */}
                {!showAnswer && (
                  <View style={styles.mcGrid}>
                    <MultipleChoiceGrid
                      choices={currentCard.choices ?? []}
                      correctAnswer={currentCard.card.wordInContext}
                      answeredChoice={answeredChoice}
                      onSelect={handleMCSelect}
                    />
                  </View>
                )}
              </View>
            ) : (
              /* Text input mode */
              <View style={styles.textArea}>
                <ClozeCardDisplay
                  sessionCard={currentCard}
                  showAnswer={showAnswer}
                  isCorrect={isCorrect ?? undefined}
                />

                {/* Answer reveal — shown after answering */}
                <AnswerReveal
                  sessionCard={currentCard}
                  isCorrect={isCorrect ?? false}
                  visible={showReveal}
                />

                {!showAnswer && (
                  <View style={styles.inputArea}>
                    <AnswerInput onSubmit={handleTextSubmit} />
                  </View>
                )}
              </View>
            )}

            {/* Next button — only shown for wrong answers (correct auto-advances) */}
            {showAnswer && isCorrect === false && (
              <Pressable
                onPress={advanceToNext}
                style={[styles.nextButton, { backgroundColor: theme.colors.surfaceVariant }]}
                accessibilityLabel="Next card"
                accessibilityRole="button"
              >
                <Text style={[styles.nextButtonText, { color: theme.colors.onSurface }]}>
                  Next
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* Completion screen */}
        {isComplete && params.source && (
          <View style={styles.completionArea}>
            <View style={[styles.completionCard, glassStyle]}>
              <Text
                variant="displayMedium"
                style={[styles.completionScore, { color: theme.colors.onSurface }]}
              >
                {correctCount}/{originalCardCount.current || cardCount}
              </Text>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                correct answers
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
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 10,
  },
  headerTitle: {
    fontWeight: '700',
  },
  progressArea: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  mcArea: {
    flex: 1,
    paddingTop: 16,
    gap: 0,
  },
  textArea: {
    flex: 1,
    paddingTop: 16,
    gap: 0,
  },
  mcGrid: {
    width: '100%',
    marginTop: 20,
  },
  inputArea: {
    marginTop: 20,
    gap: 12,
  },
  completionArea: {
    gap: 24,
    alignItems: 'center',
  },
  completionCard: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
    borderRadius: 20,
    borderWidth: 1,
    width: '100%',
  },
  completionScore: {
    fontWeight: '700',
    letterSpacing: -1,
  },
  nextButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 20,
    marginTop: 20,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
