import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Platform, Pressable, KeyboardAvoidingView } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, getGlassStyle, labelOverlineStyle } from '../src/theme';
import { ClozeCardDisplay } from '../src/components/ClozeCard';
import { AnswerReveal } from '../src/components/AnswerReveal';
import { AnswerInput } from '../src/components/AnswerInput';
import { MultipleChoiceGrid } from '../src/components/MultipleChoiceGrid';
import { ContinueButton } from '../src/components/ContinueButton';
import { ProgressDots } from '../src/components/ProgressDots';
import { SelfRatedCard } from '../src/components/SelfRatedCard';
import { buildSession, handleWrongAnswer, getCurrentChapter, getDueCards } from '../src/services/cardSelector';
import type { SimpleCard } from '../src/types/simpleCard';
import type { ClozeCard } from '../src/types/vocabulary';
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
import { updateStatsAfterSession, recordAbort, getStreak, checkAndAdvanceStreak } from '../src/services/statsService';
import { validateAnswer } from '../src/utils/answerValidation';
import { useKeyboard } from '../src/hooks/useKeyboardVisible';
import { updateWidgetData } from '../src/services/widgetService';
import type { SessionCard } from '../src/types/vocabulary';
import { useActiveBundle } from '../src/content/activeBundleProvider';

/** How long to show the answer reveal before auto-advancing on correct answer */
const AUTO_ADVANCE_MS = 1500;

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
    count: string;
    type: 'unlock' | 'app_open';
    mode?: 'continuous' | 'fixed';
  }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { config, chapters } = useActiveBundle();

  function getMotivationalMessage(accuracy: number): string {
    if (accuracy === 100) return config.motivational.perfect || 'Perfect!';
    if (accuracy >= 80) return config.motivational.great || 'Great job!';
    if (accuracy >= 60) return config.motivational.good || 'Good work!';
    return config.motivational.encouragement || 'Keep going!';
  }

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalCardCount = useRef(0);   // original session length — used for stats
  const totalCardCount = useRef(0);      // grows when wrong-answer cards are re-inserted
  const retriesUsed = useRef(new Set<string>()); // card IDs that have already been re-inserted once
  const answeredNewCardIds = useRef(new Set<string>()); // card IDs of new cards that were answered
  // Accumulate correct count in a ref to avoid stale closures in setTimeout callbacks
  const correctCountRef = useRef(0);
  // Cache chapter number at session start — avoids O(chapters × cards) scan on every render
  const sessionChapter = useRef(0);

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
  const keyboard = useKeyboard();

  // --------------------------------------------------------------------------
  // Session initialization
  // --------------------------------------------------------------------------
  useEffect(() => {
    let session: SessionCard[];
    if (mode === 'continuous') {
      session = buildSession(chapters, loadNewWordsPerDay(), params.source);
    } else {
      session = buildSession(chapters, parseInt(params.count || '3', 10), params.source);
    }

    if (session.length === 0) {
      // Check if unlimited budget would yield cards (budget exhausted, not truly done)
      const extra = buildSession(chapters, Infinity, params.source);
      setHasMoreCards(extra.length > 0);
      setIsEmpty(true);
      setIsComplete(true);
    } else {
      setQueue(session);
      originalCardCount.current = session.length;
      totalCardCount.current = session.length;
      sessionChapter.current = getCurrentChapter(chapters);
    }

    console.log('[Challenge] Started:', {
      source: params.source,
      mode,
      type: params.type,
      sessionLength: session.length,
    });
    return () => {
      updateWidgetData();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const isSelfRated = answerType === 'selfRated';

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
  const advanceToNext = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);

    // On every card advance, check for cards that became due mid-session.
    // This handles both FSRS learning steps (1min → 10min intervals for cards
    // answered earlier this session) and cards from other chapters that became due.
    // Only exclude cards still pending in the queue (not yet answered) — answered
    // cards must be eligible for re-queuing so learning steps complete in-session.
    setQueue((prevQueue) => {
      const nextIndex = currentIndex + 1;
      const pendingIds = new Set(
        prevQueue.slice(nextIndex).map((sc) => sc.card.id),
      );
      const newlyDue = getDueCards(chapters, pendingIds);
      if (newlyDue.length > 0) {
        const updated = [...prevQueue, ...newlyDue];
        totalCardCount.current = updated.length;
        console.log(`[Challenge] Appended ${newlyDue.length} newly-due card(s)`);
        return updated;
      }
      return prevQueue;
    });

    setCurrentIndex((prevIndex) => {
      const nextIndex = prevIndex + 1;
      if (nextIndex < totalCardCount.current) {
        setShowAnswer(false);
        setIsCorrect(null);
        setAnsweredChoice(null);
        setShowReveal(false);
        setHintUsed(false);
        return nextIndex;
      } else {
        updateStatsAfterSession(correctCountRef.current, originalCardCount.current, params.source ?? 'unknown');
        checkAndAdvanceStreak();
        recordNewWordsIntroduced(answeredNewCardIds.current.size);
        updateWidgetData();
        const extra = buildSession(chapters, Infinity, params.source);
        setHasMoreCards(extra.length > 0);
        setIsComplete(true);
        return prevIndex;
      }
    });
  }, [params.source, chapters, currentIndex]);

  const scheduleAdvance = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(advanceToNext, AUTO_ADVANCE_MS);
  }, [advanceToNext]);

  const handleAudioFinish = useCallback(() => {
    // Only auto-advance on correct answers when audio finishes.
    // Wrong answers always require manual "Next" tap.
    // Read isCorrect from the ref-based approach: since this is called from
    // ClozeCard's audio finish, we check the current state via a functional pattern.
    // The ClozeCard only fires onAudioFinish after showAnswer=true, so isCorrect
    // is already set by the time this fires.
    setIsCorrect((current) => {
      if (current === true) {
        advanceToNext();
      }
      return current;
    });
  }, [advanceToNext]);

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
    setCorrectCount((c) => {
      const next = c + 1;
      correctCountRef.current = next;
      return next;
    });
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
    if (!currentCard || currentCard.card.kind !== 'cloze') return;
    const correct = validateAnswer(userAnswer, currentCard.card.wordInContext);
    if (correct) {
      // Hint used → Hard (shorter interval), otherwise Good
      handleCorrect(currentCard, hintUsed ? 'hard' : 'good');
    } else {
      handleIncorrect(currentCard);
    }
  };

  const handleMCSelect = (choice: string) => {
    if (!currentCard || currentCard.card.kind !== 'cloze') return;
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

  const handleClose = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    // Record new words seen before abort — but NOT if session already completed
    if (!isComplete && answeredNewCardIds.current.size > 0) {
      recordNewWordsIntroduced(answeredNewCardIds.current.size);
    }
    if (mode === 'fixed' && !isComplete) {
      recordAbort(params.source ?? 'unknown');
    }
    router.back();
  };

  const startExtraSession = () => {
    const extra = buildSession(chapters, Infinity, params.source);
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
    correctCountRef.current = 0;
  };

  const handleAlreadyKnow = () => {
    if (!currentCard) return;
    // Rate as Easy — large stability boost, card will return as text mode
    handleCorrect(currentCard, 'easy');
  };

  const handleSelfRate = (grade: ReviewGrade) => {
    if (!currentCard) return;
    updateCardFSRS(currentCard, grade);
    if (currentCard.isFirstEncounter) answeredNewCardIds.current.add(currentCard.card.id);
    const isPositive = grade !== 'again';
    if (isPositive) {
      setCorrectCount((c) => {
        const next = c + 1;
        correctCountRef.current = next;
        return next;
      });
    }
    setShowAnswer(true);
    advanceToNext();
  };

  // Generate hint text for current card (text mode only)
  const currentHintText = currentCard?.answerType === 'text' && currentCard.hintLevel
    ? generateHintText(currentCard.card.wordInContext, currentCard.hintLevel)
    : undefined;

  const glassStyle = getGlassStyle(theme);

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
    <View
      style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={22}
          iconColor={theme.colors.onSurface}
          onPress={handleClose}
          accessibilityLabel="Close challenge"
        />
        {!isComplete && (
          <View style={styles.headerCenter}>
            <Text
              variant="labelSmall"
              style={[labelOverlineStyle.label, { color: theme.colors.onSurfaceVariant, letterSpacing: 1.5 }]}
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
              style={[labelOverlineStyle.label, { color: theme.colors.onSurfaceVariant, letterSpacing: 0.5 }]}
            >
              CHAPTER {sessionChapter.current} · CARD {currentIndex + 1} OF {totalCardCount.current}
            </Text>
            <Text
              variant="labelSmall"
              style={[labelOverlineStyle.label, { color: theme.custom.brandBlue, letterSpacing: 0.5 }]}
            >
              {correctCount} correct
            </Text>
          </View>
          <ProgressDots total={totalCardCount.current} current={currentIndex} />
        </View>
      )}

      {/* Content */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.contentScroll, styles.content]}>

        {!isComplete && currentCard && (
          <>
            {isMC && !isSelfRated && (
              /* Multiple Choice mode (MC4) */
              <View style={styles.mcArea}>
                <ClozeCardDisplay
                  key={currentCard.card.id}
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
                  visible={showReveal}
                />

                {/* MC choices grid — hidden after answering */}
                {!showAnswer && (
                  <View style={styles.mcGrid}>
                    <MultipleChoiceGrid
                      choices={currentCard.answerType === 'mc4' ? currentCard.choices : []}
                      correctAnswer={currentCard.card.kind === 'cloze' ? currentCard.card.wordInContext : ''}
                      answeredChoice={answeredChoice}
                      onSelect={handleMCSelect}
                    />
                  </View>
                )}
              </View>
            )}

            {!isMC && !isSelfRated && (
              /* Text input mode */
              <View style={styles.textArea}>
                <ClozeCardDisplay
                  key={currentCard.card.id}
                  sessionCard={currentCard}
                  showAnswer={showAnswer}
                  isCorrect={isCorrect ?? undefined}
                  isMuted={isMuted}
                  playbackSpeed={audioSpeed}
                  onAudioFinish={handleAudioFinish}
                  hintText={currentHintText}
                  hintUsed={hintUsed}
                  onHintRequest={handleHintRequest}
                  keyboardHeight={keyboard.height}
                />

                {/* Answer reveal — shown after answering */}
                <AnswerReveal
                  sessionCard={currentCard}
                  visible={showReveal}
                />

                {!showAnswer && (
                  <View style={styles.inputArea}>
                    <AnswerInput onSubmit={handleTextSubmit} hideButton={keyboard.visible} />
                  </View>
                )}
              </View>
            )}

            {currentCard.answerType === 'selfRated' && (
              <View style={styles.mcArea}>
                <SelfRatedCard
                  key={currentCard.card.id}
                  card={currentCard.card}
                  onRate={handleSelfRate}
                  isMuted={isMuted}
                  playbackSpeed={audioSpeed}
                />
              </View>
            )}

            {/* Next button — visible after answering, hidden for selfRated (auto-advances via onRate) */}
            {showAnswer && !isSelfRated && (
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

            {hasMoreCards && (
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
        </View>
      </KeyboardAvoidingView>
    </View>
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
