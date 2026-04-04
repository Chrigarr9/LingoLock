import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, getGlassStyle, labelOverlineStyle } from '../src/theme';
import { ClozeCardDisplay } from '../src/components/ClozeCard';
import { AnswerReveal } from '../src/components/AnswerReveal';
import { AnswerInput } from '../src/components/AnswerInput';
import { LetterScramble } from '../src/components/LetterScramble';
import { MultipleChoiceGrid } from '../src/components/MultipleChoiceGrid';
import { loadScreenTimeEnabled, loadUnlockCount, loadDueCardsCleared, incrementUnlockCount, saveDueCardsCleared } from '../src/services/storage';
import { getRequiredCardCount, shouldUseFlatRate } from '../src/services/escalationService';
import { startUnlockWindow } from '../src/services/screenTimeService';
import { getTotalDueCount } from '../src/services/statsService';
import { ProgressDots } from '../src/components/ProgressDots';
import { SelfRatedCard } from '../src/components/SelfRatedCard';
import { buildSession, handleWrongAnswer, getCurrentChapter, getDueCards } from '../src/services/cardSelector';
import type { SimpleCard } from '../src/types/simpleCard';
import type { ClozeCard } from '../src/types/vocabulary';
import { scheduleReview, createNewCardState, demoteAnswerType } from '../src/services/fsrs';
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
import { updateStatsAfterSession, getStreak, checkAndAdvanceStreak } from '../src/services/statsService';
import { validateAnswer } from '../src/utils/answerValidation';
import { buildMcChoices } from '../src/utils/cardChoices';
import { useKeyboard } from '../src/hooks/useKeyboardVisible';
import { updateWidgetData } from '../src/services/widgetService';
import { rescheduleAfterExternalAnswer } from '../src/services/notificationScheduler';
import type { SessionCard } from '../src/types/vocabulary';
import { useActiveBundle } from '../src/content/activeBundleProvider';

/** How long to show the answer reveal before auto-advancing on correct answer */
const AUTO_ADVANCE_MS = 1500;

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
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

  const source = params.source ?? '';
  const isScreenTime = source === 'screentime' && loadScreenTimeEnabled();

  const screenTimeRequirement = useMemo(() => {
    if (!isScreenTime) return 0;
    const unlockCount = loadUnlockCount();
    const dueCleared = loadDueCardsCleared();
    return getRequiredCardCount(unlockCount, dueCleared);
  }, [isScreenTime]);

  // --------------------------------------------------------------------------
  // Session state
  // --------------------------------------------------------------------------
  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isFuzzy, setIsFuzzy] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredChoice, setAnsweredChoice] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => loadAudioMuted());
  const [audioSpeed] = useState(() => loadAudioSpeed());
  const [isEmpty, setIsEmpty] = useState(false);
  /** When user taps hint, the answer type is demoted one level (text→scramble, scramble→mc4) */
  const [demotedMode, setDemotedMode] = useState<'mc4' | 'scramble' | 'text' | null>(null);
  const [hasMoreCards, setHasMoreCards] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const keyboard = useKeyboard();

  // --------------------------------------------------------------------------
  // Session initialization
  // --------------------------------------------------------------------------
  useEffect(() => {
    // Screen Time sessions bypass the daily new word limit — the gate should
    // always have cards. Voluntary practice respects the limit.
    const budget = isScreenTime ? Infinity : loadNewWordsPerDay();
    const session = buildSession(chapters, budget, params.source);

    if (session.length === 0) {
      // Check if unlimited budget would yield cards (budget exhausted, not truly done)
      const extra = isScreenTime ? [] : buildSession(chapters, Infinity, params.source);
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
      isScreenTime,
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
  const baseAnswerType = currentCard?.answerType ?? 'mc4';
  const answerType = demotedMode ?? baseAnswerType;
  const isMC = answerType === 'mc4';
  const isScramble = answerType === 'scramble';
  const isSelfRated = baseAnswerType === 'selfRated';
  const hintUsed = demotedMode !== null;
  /** MC choices — from session card if available, generated on demand for hint demotion */
  const mcChoices = isMC && currentCard?.card.kind === 'cloze'
    ? (currentCard.answerType === 'mc4' ? currentCard.choices : buildMcChoices(currentCard.card))
    : [];

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
        setIsFuzzy(false);
        setAnsweredChoice(null);
        setUserAnswer(null);
        setShowReveal(false);
        setDemotedMode(null);
        return nextIndex;
      } else {
        updateStatsAfterSession(correctCountRef.current, totalCardCount.current, params.source ?? 'unknown');
        checkAndAdvanceStreak();
        recordNewWordsIntroduced(answeredNewCardIds.current.size);
        updateWidgetData();
        rescheduleAfterExternalAnswer().catch(e => console.error('[Challenge] Reschedule failed:', e));
        // Check if due cards are now cleared (for escalation mode switch)
        if (isScreenTime && !loadDueCardsCleared()) {
          if (shouldUseFlatRate(getTotalDueCount())) {
            saveDueCardsCleared();
          }
        }
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
    // Only auto-advance on correct, non-fuzzy answers when audio finishes.
    // Wrong and fuzzy answers always require manual "Next" tap.
    setIsCorrect((currentCorrect) => {
      if (currentCorrect === true) {
        setIsFuzzy((currentFuzzy) => {
          if (!currentFuzzy) advanceToNext();
          return currentFuzzy;
        });
      }
      return currentCorrect;
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
  const handleCorrect = (sessionCard: SessionCard, grade: ReviewGrade, fuzzy = false) => {
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
    // Don't auto-advance on fuzzy matches — user should see the typo feedback
    if (!fuzzy) {
      const hasAudio = !!sessionCard.card.audio && !isMuted;
      if (!hasAudio) {
        scheduleAdvance();
      }
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

  const handleTextSubmit = (typedAnswer: string) => {
    if (!currentCard || currentCard.card.kind !== 'cloze') return;
    setUserAnswer(typedAnswer);
    const result = validateAnswer(typedAnswer, currentCard.card.wordInContext);
    if (result.correct) {
      setIsFuzzy(result.fuzzy);
      // Fuzzy match (typo) or hint used → Hard (shorter interval), otherwise Good
      handleCorrect(currentCard, result.fuzzy || hintUsed ? 'hard' : 'good', result.fuzzy);
    } else {
      handleIncorrect(currentCard);
    }
  };

  const handleMCSelect = (choice: string) => {
    if (!currentCard || currentCard.card.kind !== 'cloze') return;
    setAnsweredChoice(choice);
    setUserAnswer(choice);
    const correct = choice === currentCard.card.wordInContext;
    if (correct) {
      handleCorrect(currentCard, 'good');
    } else {
      handleIncorrect(currentCard);
    }
  };

  const handleHintRequest = () => {
    if (answerType === 'text' || answerType === 'scramble') {
      setDemotedMode(demoteAnswerType(answerType));
    }
  };

  const handleClose = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!isComplete && answeredNewCardIds.current.size > 0) {
      recordNewWordsIntroduced(answeredNewCardIds.current.size);
    }
    if (isScreenTime && correctCountRef.current >= screenTimeRequirement) {
      incrementUnlockCount();
      startUnlockWindow();
    }
    router.dismissAll();
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
    setIsFuzzy(false);
    setAnsweredChoice(null);
    setUserAnswer(null);
    setShowReveal(false);
    setDemotedMode(null);
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

  const glassStyle = getGlassStyle(theme);

  // --------------------------------------------------------------------------
  // Screen Time: inline "Unlock" button after requirement met
  // --------------------------------------------------------------------------
  const showUnlockButton = isScreenTime && correctCount >= screenTimeRequirement;

  // --------------------------------------------------------------------------
  // Celebration data (computed when complete)
  // --------------------------------------------------------------------------
  const accuracyPercent = Math.min(100, Math.round((correctCount / (totalCardCount.current || 1)) * 100));
  const streakCount = isComplete && !isEmpty ? getStreak() : 0;
  const motivationalMessage = getMotivationalMessage(accuracyPercent);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: keyboard.height > 0 ? 0 : insets.bottom }]}
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
        <View style={styles.headerRight}>
          {showUnlockButton && (
            <Pressable
              onPress={() => {
                incrementUnlockCount();
                startUnlockWindow();
                router.dismissAll();
              }}
              style={[styles.headerContinue, { backgroundColor: theme.colors.surfaceVariant }]}
              accessibilityLabel="Unlock apps"
              accessibilityRole="button"
            >
              <Text style={[styles.headerContinueText, { color: theme.colors.onSurfaceVariant }]}>
                Unlock
              </Text>
              <Icon source="lock-open-outline" size={12} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          )}
          <IconButton
            icon={isMuted ? 'volume-off' : 'volume-high'}
            size={22}
            iconColor={theme.colors.onSurface}
            onPress={toggleMute}
            accessibilityLabel={isMuted ? 'Unmute audio' : 'Mute audio'}
          />
        </View>
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
      <View
        style={[styles.keyboardAvoid, Platform.OS === 'ios' && keyboard.height > 0 && { paddingBottom: keyboard.height }]}
      >
        <View
          style={[styles.contentScroll, styles.content, keyboard.height > 0 && styles.contentKeyboardUp]}
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
        >

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
                  userAnswer={userAnswer ?? undefined}
                  contentHeight={contentHeight}
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
                      choices={mcChoices}
                      correctAnswer={currentCard.card.kind === 'cloze' ? currentCard.card.wordInContext : ''}
                      answeredChoice={answeredChoice}
                      onSelect={handleMCSelect}
                    />
                  </View>
                )}
              </View>
            )}

            {isScramble && !isSelfRated && (
              /* Letter scramble mode */
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
                  onHintRequest={!showAnswer ? handleHintRequest : undefined}
                  userAnswer={userAnswer ?? undefined}
                  contentHeight={contentHeight}
                />

                {/* Answer reveal — shown after answering */}
                <AnswerReveal
                  sessionCard={currentCard}
                  visible={showReveal}
                />

                {!showAnswer && currentCard.card.kind === 'cloze' && (
                  <LetterScramble
                    word={currentCard.card.wordInContext}
                    onSubmit={handleTextSubmit}
                  />
                )}
              </View>
            )}

            {!isMC && !isScramble && !isSelfRated && (
              /* Text input mode */
              <View style={[styles.textArea, keyboard.height > 0 && styles.textAreaKeyboardUp]}>
                <ClozeCardDisplay
                  key={currentCard.card.id}
                  sessionCard={currentCard}
                  showAnswer={showAnswer}
                  isCorrect={isCorrect ?? undefined}
                  isFuzzy={isFuzzy}
                  isMuted={isMuted}
                  playbackSpeed={audioSpeed}
                  onAudioFinish={handleAudioFinish}
                  onHintRequest={!showAnswer ? handleHintRequest : undefined}
                  keyboardHeight={keyboard.height}
                  userAnswer={userAnswer ?? undefined}
                  contentHeight={contentHeight}
                />

                {/* Answer reveal — shown after answering */}
                <AnswerReveal
                  sessionCard={currentCard}
                  visible={showReveal}
                />

                {/* Spacer pushes input toward keyboard while card stays pinned to top */}
                {keyboard.height > 0 && !showAnswer && <View style={styles.keyboardSpacer} />}

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
                  {correctCount}/{totalCardCount.current} correct answers
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

            <Pressable
              onPress={() => {
                if (isScreenTime && correctCountRef.current >= screenTimeRequirement) {
                  incrementUnlockCount();
                  startUnlockWindow();
                }
                router.dismissAll();
              }}
              style={[styles.doneButton, { backgroundColor: theme.colors.primary }]}
              accessibilityLabel="Done"
              accessibilityRole="button"
            >
              <Text style={[styles.doneButtonText, { color: theme.colors.onPrimary }]}>
                {isScreenTime && correctCountRef.current >= screenTimeRequirement
                  ? 'Unlock Apps'
                  : 'Done'}
              </Text>
            </Pressable>
          </View>
        )}
        </View>
      </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerContinue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  headerContinueText: {
    fontSize: 12,
    fontWeight: '600',
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
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  contentKeyboardUp: {
    paddingBottom: 12,
  },
  mcArea: {
    paddingTop: 16,
    gap: 0,
  },
  textArea: {
    paddingTop: 16,
    gap: 0,
  },
  textAreaKeyboardUp: {
    flex: 1,
  },
  keyboardSpacer: {
    flex: 1,
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
