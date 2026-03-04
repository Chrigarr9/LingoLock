import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';
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
import {
  saveCardState,
  loadCardState,
  loadAudioMuted,
  saveAudioMuted,
  loadNewWordsPerDay,
  recordNewWordsIntroduced,
} from '../src/services/storage';
import { updateStatsAfterSession, recordAbort, getStreak } from '../src/services/statsService';
import { validateAnswer } from '../src/utils/answerValidation';
import { pauseNotifications, resumeNotifications } from '../src/services/notificationScheduler';
import { updateWidgetData } from '../src/services/widgetService';
import type { SessionCard } from '../src/types/vocabulary';

/** How long to show the answer reveal before auto-advancing on correct answer */
const AUTO_ADVANCE_MS = 1500;

function getMotivationalMessage(accuracy: number): string {
  if (accuracy === 100) return '¡Perfecto! Every answer correct.';
  if (accuracy >= 80) return '¡Muy bien! Great session.';
  if (accuracy >= 60) return '¡Bien! Keep practising.';
  return 'Every mistake is a lesson. ¡Ánimo!';
}

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
    count: string;
    type: 'unlock' | 'app_open';
    mode?: 'continuous' | 'fixed';
  }>();
  const router = useRouter();
  const theme = useAppTheme();
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalCardCount = useRef(0);
  const newCardCount = useRef(0);

  // Default mode to 'continuous' when absent
  const mode = params.mode ?? 'continuous';

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
  const [isMuted, setIsMuted] = useState(() => loadAudioMuted());
  const [isEmpty, setIsEmpty] = useState(false);

  // --------------------------------------------------------------------------
  // Session initialization
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Pause notifications when entering practice session
    pauseNotifications().catch((err) => {
      console.error('[Challenge] Failed to pause notifications:', err);
    });

    let session: SessionCard[];
    if (mode === 'continuous') {
      session = buildSession(loadNewWordsPerDay(), params.source);
    } else {
      // fixed mode: use count param
      session = buildSession(parseInt(params.count || '3', 10), params.source);
    }

    if (session.length === 0) {
      // No due cards and daily budget exhausted — show "all caught up" screen
      setIsEmpty(true);
      setIsComplete(true);
    } else {
      setQueue(session);
      originalCardCount.current = session.length;

      // Count new cards (no existing FSRS state at session start)
      newCardCount.current = session.filter((sc) => loadCardState(sc.card.id) === null).length;
    }

    console.log('[Challenge] Started:', {
      source: params.source,
      mode,
      type: params.type,
      sessionLength: session.length,
    });

    // Resume notifications when exiting practice session
    return () => {
      resumeNotifications().catch((err) => {
        console.error('[Challenge] Failed to resume notifications:', err);
      });
      updateWidgetData(); // Refresh widget with next card
    };
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

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      saveAudioMuted(next);
      return next;
    });
  };

  // --------------------------------------------------------------------------
  // Navigation helpers
  // --------------------------------------------------------------------------
  const advanceToNext = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    const nextIndex = currentIndex + 1;
    if (nextIndex < originalCardCount.current) {
      setCurrentIndex(nextIndex);
      setShowAnswer(false);
      setIsCorrect(null);
      setAnsweredChoice(null);
      setShowReveal(false);
    } else {
      updateStatsAfterSession(correctCount, originalCardCount.current, params.source ?? 'unknown');
      // Record new words introduced during this session
      recordNewWordsIntroduced(newCardCount.current);
      // Resume notifications and refresh widget after session completion
      resumeNotifications().catch((err) => {
        console.error('[Challenge] Failed to resume notifications on completion:', err);
      });
      updateWidgetData();
      setIsComplete(true);
    }
  };

  const scheduleAdvance = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(advanceToNext, AUTO_ADVANCE_MS);
  };

  const handleAudioFinish = () => {
    // Only auto-advance on correct answers when audio finishes.
    // Wrong answers always require manual "Next" tap.
    if (isCorrect === true) {
      advanceToNext();
    }
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
    // If card has audio and not muted, ClozeCardDisplay will play audio
    // and call onAudioFinish when done — that triggers advanceToNext.
    // Otherwise fall back to timer-based advance.
    const hasAudio = !!sessionCard.card.audio && !isMuted;
    if (!hasAudio) {
      scheduleAdvance();
    }
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
  // Celebration data (computed when complete)
  // --------------------------------------------------------------------------
  const accuracyPercent = Math.round((correctCount / (originalCardCount.current || 1)) * 100);
  const streakCount = isComplete && !isEmpty ? getStreak() : 0;
  const motivationalMessage = getMotivationalMessage(accuracyPercent);

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
            // Only fixed forced sessions count as aborts — not voluntary continuous practice
            if (mode === 'fixed' && !isComplete) {
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
        <IconButton
          icon={isMuted ? 'volume-off' : 'volume-high'}
          size={22}
          iconColor={theme.colors.onSurface}
          onPress={toggleMute}
          accessibilityLabel={isMuted ? 'Unmute audio' : 'Mute audio'}
        />
      </View>

      {/* Progress */}
      {!isComplete && (
        <View style={styles.progressArea}>
          <View style={styles.progressRow}>
            <Text
              variant="labelSmall"
              style={[styles.progressLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              CHAPTER {getCurrentChapter()} · CARD {currentIndex + 1} OF {originalCardCount.current}
            </Text>
            <Text
              variant="labelSmall"
              style={[styles.progressLabel, { color: theme.custom.brandOrange }]}
            >
              {correctCount} correct
            </Text>
          </View>
          <ProgressDots total={originalCardCount.current} current={currentIndex} />
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
                  isMuted={isMuted}
                  onAudioFinish={handleAudioFinish}
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
                  isMuted={isMuted}
                  onAudioFinish={handleAudioFinish}
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

            {/* Next button — always visible after answering */}
            {showAnswer && (
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
        {isComplete && (
          <View style={styles.completionArea}>
            {isEmpty ? (
              /* Empty session — no cards available */
              <View style={[styles.completionCard, glassStyle]}>
                <Text
                  variant="headlineMedium"
                  style={[styles.completionTitle, { color: theme.colors.onSurface }]}
                >
                  You're all caught up!
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}
                >
                  No cards due and daily word budget reached. Come back tomorrow!
                </Text>
              </View>
            ) : (
              /* Normal session completion */
              <View style={[styles.completionCard, glassStyle]}>
                {/* Hero accuracy number */}
                <Text
                  variant="displayLarge"
                  style={[styles.accuracyHero, { color: theme.custom.brandOrange }]}
                >
                  {accuracyPercent}%
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[styles.accuracySubtitle, { color: theme.colors.onSurfaceVariant }]}
                >
                  {correctCount}/{originalCardCount.current} correct answers
                </Text>
                <Text
                  variant="bodyLarge"
                  style={[styles.motivationalMessage, { color: theme.colors.onSurface }]}
                >
                  {motivationalMessage}
                </Text>
                {streakCount > 1 && (
                  <View style={styles.streakRow}>
                    <Icon source="fire" size={18} color={theme.custom.brandOrange} />
                    <Text
                      variant="labelLarge"
                      style={[styles.streakLine, { color: theme.custom.brandOrange }]}
                    >
                      {streakCount} day streak!
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Done button for voluntary/continuous practice */}
            {(mode === 'continuous' || isEmpty) && (
              <Pressable
                onPress={() => router.back()}
                style={[styles.doneButton, { backgroundColor: 'rgba(255,160,86,0.90)' }]}
                accessibilityLabel="Done"
                accessibilityRole="button"
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            )}

            {/* ContinueButton only for fixed forced sessions */}
            {mode === 'fixed' && !isEmpty && params.source && (
              <ContinueButton
                sourceApp={params.source}
                challengeType={params.type || 'app_open'}
              />
            )}
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
  completionTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  accuracyHero: {
    fontWeight: '800',
    letterSpacing: -2,
  },
  accuracySubtitle: {
    marginTop: 4,
    textAlign: 'center',
  },
  motivationalMessage: {
    marginTop: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  streakLine: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  doneButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 20,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
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
