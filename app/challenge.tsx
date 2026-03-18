import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Pressable, ScrollView, KeyboardAvoidingView } from 'react-native';
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
import { buildSession, handleWrongAnswer, getCurrentChapter, getDueCards } from '../src/services/cardSelector';
import { scheduleReview, createNewCardState, generateHintText } from '../src/services/fsrs';
import type { ReviewGrade } from '../src/services/fsrs';
import {
  saveCardState,
  loadCardState,
  loadAudioMuted,
  saveAudioMuted,
  loadAudioSpeed,
  loadNewWordsPerDay,
  recordNewWordsIntroduced,
} from '../src/services/storage';
import { updateStatsAfterSession, recordAbort, getStreak } from '../src/services/statsService';
import { validateAnswer } from '../src/utils/answerValidation';
import { useKeyboardVisible } from '../src/hooks/useKeyboardVisible';
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
  const originalCardCount = useRef(0);   // original session length — used for stats
  const totalCardCount = useRef(0);      // grows when wrong-answer cards are re-inserted
  const retriesUsed = useRef(new Set<string>()); // card IDs that have already been re-inserted once
  const answeredNewCardIds = useRef(new Set<string>()); // card IDs of new cards that were answered

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
  const [audioSpeed] = useState(() => loadAudioSpeed());
  const [isEmpty, setIsEmpty] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [hasMoreCards, setHasMoreCards] = useState(false);
  const keyboardVisible = useKeyboardVisible();

  // --------------------------------------------------------------------------
  // Session initialization
  // --------------------------------------------------------------------------
  useEffect(() => {
    let session: SessionCard[];
    if (mode === 'continuous') {
      session = buildSession(loadNewWordsPerDay(), params.source);
    } else {
      session = buildSession(parseInt(params.count || '3', 10), params.source);
    }

    if (session.length === 0) {
      // Check if unlimited budget would yield cards (budget exhausted, not truly done)
      const extra = buildSession(Infinity, params.source);
      setHasMoreCards(extra.length > 0);
      setIsEmpty(true);
      setIsComplete(true);
    } else {
      setQueue(session);
      originalCardCount.current = session.length;
      totalCardCount.current = session.length;
    }

    console.log('[Challenge] Started:', {
      source: params.source,
      mode,
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
  const answerType = currentCard?.answerType ?? 'mc4';
  const isMC = answerType === 'mc4';

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

    // On every card advance, check for cards that became due mid-session
    // (e.g. 10-min FSRS intervals). Appends them so the progress counter
    // updates immediately and the user doesn't need to return to the home screen.
    const queueIds = new Set(queue.map((sc) => sc.card.id));
    const newlyDue = getDueCards(queueIds);
    if (newlyDue.length > 0) {
      const updated = [...queue, ...newlyDue];
      totalCardCount.current = updated.length;
      setQueue(updated);
      console.log(`[Challenge] Appended ${newlyDue.length} newly-due card(s)`);
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < totalCardCount.current) {
      setCurrentIndex(nextIndex);
      setShowAnswer(false);
      setIsCorrect(null);
      setAnsweredChoice(null);
      setShowReveal(false);
      setHintUsed(false);
    } else {
      updateStatsAfterSession(correctCount, originalCardCount.current, params.source ?? 'unknown');
      recordNewWordsIntroduced(answeredNewCardIds.current.size);
      const extra = buildSession(Infinity, params.source);
      setHasMoreCards(extra.length > 0);
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
  const updateCardFSRS = (sessionCard: SessionCard, grade: ReviewGrade) => {
    const cardId = sessionCard.card.id;
    const existing = loadCardState(cardId);
    const currentState = existing ?? createNewCardState(cardId);
    const nextState = scheduleReview(currentState, grade);
    saveCardState(cardId, nextState);
  };

  // --------------------------------------------------------------------------
  // Answer handlers
  // --------------------------------------------------------------------------
  const handleCorrect = (sessionCard: SessionCard, grade: ReviewGrade) => {
    updateCardFSRS(sessionCard, grade);
    if (sessionCard.isFirstEncounter) answeredNewCardIds.current.add(sessionCard.card.id);
    setIsCorrect(true);
    setShowAnswer(true);
    setShowReveal(true);
    setCorrectCount((c) => c + 1);
    const hasAudio = !!sessionCard.card.audio && !isMuted;
    if (!hasAudio) {
      scheduleAdvance();
    }
  };

  const handleIncorrect = (sessionCard: SessionCard) => {
    updateCardFSRS(sessionCard, 'again');
    const cardId = sessionCard.card.id;
    if (sessionCard.isFirstEncounter) answeredNewCardIds.current.add(cardId);
    setIsCorrect(false);
    setShowAnswer(true);
    setShowReveal(true);
    // Only re-insert once per card — prevents the last-4-cards silent-drop bug
    // and guards against infinite retry loops.
    if (!retriesUsed.current.has(cardId)) {
      retriesUsed.current.add(cardId);
      // Pre-compute the new queue outside the state updater — updaters must be
      // pure (no side effects), and React may call them twice in Strict Mode.
      const newQ = handleWrongAnswer(queue, currentIndex, sessionCard);
      totalCardCount.current = newQ.length;
      setQueue(newQ);
    }
  };

  const handleTextSubmit = (userAnswer: string) => {
    if (!currentCard) return;
    const correct = validateAnswer(userAnswer, currentCard.card.wordInContext);
    if (correct) {
      // Hint used → Hard (shorter interval), otherwise Good
      handleCorrect(currentCard, hintUsed ? 'hard' : 'good');
    } else {
      handleIncorrect(currentCard);
    }
  };

  const handleMCSelect = (choice: string) => {
    if (!currentCard) return;
    setAnsweredChoice(choice);
    const correct = choice === currentCard.card.wordInContext;
    if (correct) {
      handleCorrect(currentCard, 'good');
    } else {
      handleIncorrect(currentCard);
    }
  };

  const handleHintRequest = () => {
    setHintUsed(true);
  };

  const startExtraSession = () => {
    const extra = buildSession(Infinity, params.source);
    if (extra.length === 0) return;
    setQueue(extra);
    originalCardCount.current = extra.length;
    totalCardCount.current = extra.length;
    retriesUsed.current = new Set();
    answeredNewCardIds.current = new Set();
    setCurrentIndex(0);
    setShowAnswer(false);
    setIsCorrect(null);
    setAnsweredChoice(null);
    setShowReveal(false);
    setHintUsed(false);
    setIsComplete(false);
    setIsEmpty(false);
    setHasMoreCards(false);
    setCorrectCount(0);
  };

  const handleAlreadyKnow = () => {
    if (!currentCard) return;
    // Rate as Easy — large stability boost, card will return as text mode
    handleCorrect(currentCard, 'easy');
  };

  // Generate hint text for current card (text mode only)
  const currentHintText = currentCard?.answerType === 'text' && currentCard.hintLevel
    ? generateHintText(currentCard.card.wordInContext, currentCard.hintLevel)
    : undefined;

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
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="close"
          size={22}
          iconColor={theme.colors.onSurface}
          onPress={() => {
            if (advanceTimer.current) clearTimeout(advanceTimer.current);
            // Record new words seen before abort — but NOT if session already completed
            // (advanceToNext already recorded them; isComplete may still be false in the
            // current closure if the user taps close before the next render).
            if (!isComplete && answeredNewCardIds.current.size > 0) {
              recordNewWordsIntroduced(answeredNewCardIds.current.size);
            }
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
              CHAPTER {getCurrentChapter()} · CARD {currentIndex + 1} OF {totalCardCount.current}
            </Text>
            <Text
              variant="labelSmall"
              style={[styles.progressLabel, { color: theme.custom.brandBlue }]}
            >
              {correctCount} correct
            </Text>
          </View>
          <ProgressDots total={totalCardCount.current} current={currentIndex} />
        </View>
      )}

      {/* Content — scrollable so tall cards + MC4 grid + keyboard don't overflow */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {!isComplete && currentCard && (
          <>
            {isMC ? (
              /* Multiple Choice mode (MC4) */
              <View style={styles.mcArea}>
                <ClozeCardDisplay
                  sessionCard={currentCard}
                  showAnswer={showAnswer}
                  isCorrect={isCorrect ?? undefined}
                  isMuted={isMuted}
                  playbackSpeed={audioSpeed}
                  onAudioFinish={handleAudioFinish}
                  onAlreadyKnow={currentCard.isFirstEncounter ? handleAlreadyKnow : undefined}
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
                  playbackSpeed={audioSpeed}
                  onAudioFinish={handleAudioFinish}
                  hintText={currentHintText}
                  hintUsed={hintUsed}
                  onHintRequest={handleHintRequest}
                  hideImage={keyboardVisible}
                />

                {/* Answer reveal — shown after answering */}
                <AnswerReveal
                  sessionCard={currentCard}
                  isCorrect={isCorrect ?? false}
                  visible={showReveal}
                />

                {!showAnswer && (
                  <View style={styles.inputArea}>
                    <AnswerInput onSubmit={handleTextSubmit} hideButton={keyboardVisible} />
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
          <View style={[styles.completionArea, { width: '100%' }]}>
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
                  {hasMoreCards
                    ? `Daily word budget reached. Tap below to keep learning!`
                    : `No cards due and no new words available. Come back tomorrow!`}
                </Text>
              </View>
            ) : (
              /* Normal session completion */
              <View style={[styles.completionCard, glassStyle]}>
                {/* Hero accuracy number */}
                <Text
                  variant="displayLarge"
                  style={[styles.accuracyHero, { color: theme.custom.brandBlue }]}
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
                    <Icon source="fire" size={18} color={theme.custom.brandBlue} />
                    <Text
                      variant="labelLarge"
                      style={[styles.streakLine, { color: theme.custom.brandBlue }]}
                    >
                      {streakCount} day streak!
                    </Text>
                  </View>
                )}
              </View>
            )}

            {!isEmpty && hasMoreCards && (
              <Pressable
                onPress={startExtraSession}
                style={[styles.learnMoreButton, { backgroundColor: theme.colors.surfaceVariant }]}
                accessibilityLabel="Learn more new words"
                accessibilityRole="button"
              >
                <Text style={[styles.learnMoreText, { color: theme.colors.onSurface }]}>
                  Learn more new words
                </Text>
              </Pressable>
            )}

            {isEmpty && hasMoreCards && (
              <Pressable
                onPress={startExtraSession}
                style={[styles.learnMoreButton, { backgroundColor: theme.colors.surfaceVariant }]}
                accessibilityLabel="Learn more new words"
                accessibilityRole="button"
              >
                <Text style={[styles.learnMoreText, { color: theme.colors.onSurface }]}>Learn more new words</Text>
              </Pressable>
            )}

            {/* Done button for voluntary/continuous practice */}
            {(mode === 'continuous' || isEmpty) && (
              <Pressable
                onPress={() => router.back()}
                style={[styles.doneButton, { backgroundColor: theme.colors.primary }]}
                accessibilityLabel="Done"
                accessibilityRole="button"
              >
                <Text style={[styles.doneButtonText, { color: theme.colors.onPrimary }]}>Done</Text>
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
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  mcArea: {
    paddingTop: 16,
    gap: 0,
  },
  textArea: {
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
    flex: 1,
    gap: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
  learnMoreButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 20,
  },
  learnMoreText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
