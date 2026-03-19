/**
 * Widget Service — data preparation and answer processing for Home Screen/Lock Screen widgets
 *
 * Provides card data from the shared FSRS queue for widget display, processes MC answer
 * button taps from widgets, and manages widget timeline updates.
 *
 * Key responsibilities:
 *   - getWidgetCardData(): Fetch next due card for widget display
 *   - processWidgetAnswer(): Handle MC button taps from widget, update FSRS state
 *   - updateWidgetData(): Refresh widget with latest card after any answer (in-app, notification, or widget)
 *   - clearWidgetData(): Clear widget state when no cards due
 *
 * Widget content filtering (per user decision):
 *   - Start conservative: only repetition cards (cards with CardState)
 *   - This avoids showing new cards on Lock Screen (no images yet)
 *   - Due cards are scanned across all chapters (same as buildSession logic)
 */

import { Platform } from 'react-native';
import { isDue, getAnswerType, scheduleReview, createNewCardState, type ReviewGrade } from './fsrs';
import { loadCardState, saveCardState, loadAllCardStates, statsStorage, loadEnabledBundles } from './storage';
import { getBundle, getCardById as findCardById, isImportedBundle } from '../content/bundles';
import { getStreak, updateStatsAfterSession, checkAndAdvanceStreak } from './statsService';
import { validateAnswer } from '../utils/answerValidation';
import type { ClozeCard } from '../types/vocabulary';
import type { SimpleCard } from '../types/simpleCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetCardData {
  cardId: string;
  sentence: string;       // Cloze sentence with _____ gap
  germanHint: string;     // German hint word
  correctAnswer: string;  // wordInContext
  answerType: 'mc4' | 'text' | 'selfRated';  // Determines widget interaction mode
  choices?: string[];     // MC choices for mc2/mc4 cards
  imageUri?: string;      // Optional card image
  cardsLeft: number;      // Total cards remaining in session
  streakCount: number;    // Current streak
  // Spell mode fields (populated for text cards on widget)
  spellInput?: string;    // Characters typed so far
  spellChoices?: string[];  // Character buttons to display
  // Self-rated mode fields (populated for imported deck cards)
  frontText?: string;     // Front text for self-rated cards
  backText?: string;      // Back text (shown after reveal)
  isRevealed?: boolean;   // Whether the card has been flipped
}

import { shuffle } from '../utils/shuffle';
import { buildMcChoices } from '../utils/cardChoices';

// ---------------------------------------------------------------------------
// Spell mode — character picker state
// ---------------------------------------------------------------------------

const SPELL_STATE_KEY = 'widget.spell.input';
const SPELL_CARD_KEY = 'widget.spell.cardId';

/** Read the current spell input from MMKV. Returns '' if no active spell session. */
export function getSpellingState(cardId: string): string {
  const storedCardId = statsStorage.getString(SPELL_CARD_KEY);
  if (storedCardId !== cardId) return '';
  return statsStorage.getString(SPELL_STATE_KEY) ?? '';
}

/** Write the current spell input to MMKV. */
function setSpellingState(cardId: string, input: string): void {
  statsStorage.set(SPELL_CARD_KEY, cardId);
  statsStorage.set(SPELL_STATE_KEY, input);
}

/** Clear the spell state (after submit or card change). */
function clearSpellingState(): void {
  statsStorage.remove(SPELL_CARD_KEY);
  statsStorage.remove(SPELL_STATE_KEY);
}

/**
 * Build character choices for spell mode.
 * Returns `count` characters — one is the correct next character, rest are random distractors.
 * If the user has typed past the word length, all characters are random.
 */
export function buildSpellChoices(
  correctAnswer: string,
  currentPosition: number,
  count: number = 4,
  characters: string[] = 'abcdefghijklmnñopqrstuvwxyzáéíóú'.split(''),
): string[] {
  const choices: string[] = [];
  const correctChar = currentPosition < correctAnswer.length
    ? correctAnswer[currentPosition].toLowerCase()
    : null;

  // Add the correct next character if within word bounds
  if (correctChar) {
    choices.push(correctChar);
  }

  // Fill remaining slots with random distractors (no duplicates)
  while (choices.length < count) {
    const randomChar = characters[Math.floor(Math.random() * characters.length)];
    if (!choices.includes(randomChar)) {
      choices.push(randomChar);
    }
  }

  return shuffle(choices);
}

// ---------------------------------------------------------------------------
// getWidgetCardData
// ---------------------------------------------------------------------------

/**
 * Get the next due card for widget display.
 *
 * Content filtering strategy (conservative for Lock Screen):
 *   - Only repetition cards (cards with stored CardState)
 *   - Scans all CHAPTERS for cards where isDue() is true
 *   - Returns first due card + total count of cards left
 *
 * Returns null if no cards are due (widget shows empty state).
 */
export function getWidgetCardData(): WidgetCardData | null {
  // Single pass: scan all enabled bundles for due cards (both ClozeCard and SimpleCard)
  const enabledIds = loadEnabledBundles();
  const dueCloze: Array<{ card: ClozeCard; bundleId: string }> = [];
  const dueSimple: Array<{ card: SimpleCard; bundleId: string }> = [];

  for (const bundleId of enabledIds) {
    const bundle = getBundle(bundleId);

    if (isImportedBundle(bundleId)) {
      // Imported decks: scan simpleCards (skip chapters to avoid double-counting)
      for (const card of bundle.simpleCards) {
        const state = loadCardState(card.id);
        if (state !== null && isDue(state)) {
          dueSimple.push({ card, bundleId });
        }
      }
    } else {
      // Builtin decks: scan chapters for ClozeCards
      for (const chapter of bundle.chapters) {
        for (const card of chapter.cards) {
          if (card.kind !== 'cloze') continue;
          const state = loadCardState(card.id);
          if (state !== null && isDue(state)) {
            dueCloze.push({ card, bundleId });
          }
        }
      }
    }
  }

  const totalDue = dueCloze.length + dueSimple.length;
  if (totalDue === 0) return null;

  const streakCount = getStreak();

  // Prefer ClozeCards (richer widget interaction), fall back to SimpleCards
  if (dueCloze.length > 0) {
    const firstDue = dueCloze[0];
    const card = firstDue.card;
    const cardState = loadCardState(card.id);
    const answerType = getAnswerType(cardState);

    const widgetData: WidgetCardData = {
      cardId: card.id,
      sentence: card.sentence,
      germanHint: card.germanHint,
      correctAnswer: card.wordInContext,
      answerType,
      cardsLeft: totalDue,
      streakCount,
    };

    if (answerType === 'mc4') {
      widgetData.choices = buildMcChoices(card);
    }

    if (answerType === 'text') {
      const spellInput = getSpellingState(card.id);
      const bundle = getBundle(firstDue.bundleId);
      widgetData.spellInput = spellInput;
      widgetData.spellChoices = buildSpellChoices(
        card.wordInContext, spellInput.length, 4,
        bundle.config.spellCharacters,
      );
    }

    if (card.image) {
      widgetData.imageUri = card.image;
    }

    return widgetData;
  }

  // Only SimpleCards due — self-rated mode
  const firstSimple = dueSimple[0];
  return {
    cardId: firstSimple.card.id,
    sentence: '',
    germanHint: '',
    correctAnswer: '',
    answerType: 'selfRated',
    cardsLeft: totalDue,
    streakCount,
    frontText: firstSimple.card.front,
    backText: firstSimple.card.back,
    isRevealed: false,
  };
}

// ---------------------------------------------------------------------------
// updateWidgetData
// ---------------------------------------------------------------------------

/**
 * Update the widget timeline with fresh card data.
 *
 * This should be called after every answer (in-app, notification, or widget)
 * to keep the widget content fresh.
 *
 * NOTE: expo-widgets API is very new (SDK 55, January 2026). The exact API
 * surface may differ from research examples. If updateTimeline/updateSnapshot
 * APIs are not available in the installed version, this function silently no-ops.
 *
 * The widget rendering component (VocabularyWidget.tsx) will handle the actual
 * display logic — this service provides the data layer.
 */
export function updateWidgetData(): void {
  if (Platform.OS === 'web') return;

  try {
    // Dynamic import to avoid crashes on web / when expo-widgets is unavailable
    const { vocabularyWidget } = require('../../widgets/VocabularyWidget');

    const cardData = getWidgetCardData();
    if (cardData) {
      vocabularyWidget.updateSnapshot({
        cardId: cardData.cardId,
        sentence: cardData.sentence,
        germanHint: cardData.germanHint,
        answerType: cardData.answerType,
        choices: cardData.choices,
        cardsLeft: cardData.cardsLeft,
        streakCount: cardData.streakCount,
        spellInput: cardData.spellInput,
        spellChoices: cardData.spellChoices,
        frontText: cardData.frontText,
        backText: cardData.backText,
        isRevealed: cardData.isRevealed,
      });
    } else {
      // No cards due — show empty state with streak
      vocabularyWidget.updateSnapshot({
        streakCount: getStreak(),
      });
    }
  } catch (error) {
    // Silently no-op if expo-widgets not available
    console.warn('[WidgetService] Failed to update widget:', error);
  }
}

// ---------------------------------------------------------------------------
// processWidgetAnswer
// ---------------------------------------------------------------------------

/**
 * Process an MC answer from a widget button tap.
 *
 * Called when user taps A/B/C/D button on the widget (iOS 17+ Button support).
 * Validates the answer, updates FSRS state, records stats, and refreshes widget.
 *
 * @param cardId - ID of the card being answered
 * @param selectedChoice - The choice text the user tapped (e.g., "gato")
 * @returns { isCorrect: boolean, correctAnswer: string } for widget UI feedback
 */
export function processWidgetAnswer(
  cardId: string,
  selectedChoice: string,
): { isCorrect: boolean; correctAnswer: string } {
  // Load card from content bundle
  const result = findCardById(cardId);
  const card = result?.card ?? null;

  if (!card || card.kind !== 'cloze') {
    console.warn(`[WidgetService] Card not found for widget answer: ${cardId}`);
    return { isCorrect: false, correctAnswer: '' };
  }

  // Validate answer
  const isCorrect = selectedChoice === card.wordInContext;

  // Load or create CardState
  const loadedState = loadCardState(cardId);
  const cardState = loadedState === null
    ? createNewCardState(cardId)
    : loadedState;

  // Update FSRS state
  const updatedState = scheduleReview(cardState, isCorrect ? 'good' : 'again');
  saveCardState(cardId, updatedState);

  // Update stats (1 card session from 'widget' source)
  updateStatsAfterSession(isCorrect ? 1 : 0, 1, 'widget');
  checkAndAdvanceStreak();

  // Refresh widget with next card
  updateWidgetData();

  return {
    isCorrect,
    correctAnswer: card.wordInContext,
  };
}

// ---------------------------------------------------------------------------
// processSpellAction — handle character/back/submit from widget spell keyboard
// ---------------------------------------------------------------------------

/**
 * Process a spell mode action from the widget.
 *
 * - 'char': Append the tapped character to the current input
 * - 'back': Remove the last character from the current input
 * - 'submit': Validate the full input against the correct answer, update FSRS
 *
 * After char/back, refreshes the widget with updated input and new character choices.
 * After submit, clears spell state and advances to the next card.
 *
 * @returns For submit: { submitted: true, isCorrect, correctAnswer }
 *          For char/back: { submitted: false }
 */
export function processSpellAction(
  cardId: string,
  action: 'char' | 'back' | 'submit',
  char?: string,
): { submitted: boolean; isCorrect?: boolean; correctAnswer?: string } {
  if (action === 'char' && char) {
    const current = getSpellingState(cardId);
    setSpellingState(cardId, current + char);
    updateWidgetData();
    return { submitted: false };
  }

  if (action === 'back') {
    const current = getSpellingState(cardId);
    if (current.length > 0) {
      setSpellingState(cardId, current.slice(0, -1));
    }
    updateWidgetData();
    return { submitted: false };
  }

  // action === 'submit'
  const userInput = getSpellingState(cardId);
  clearSpellingState();

  // Find the card
  const result = findCardById(cardId);
  const card = result?.card ?? null;

  if (!card || card.kind !== 'cloze') {
    console.warn(`[WidgetService] Card not found for spell submit: ${cardId}`);
    return { submitted: true, isCorrect: false, correctAnswer: '' };
  }

  // Validate using fuzzy matching (same as in-app text mode)
  const isCorrect = validateAnswer(userInput, card.wordInContext);

  // Load or create CardState
  const loadedState = loadCardState(cardId);
  const cardState = loadedState === null
    ? createNewCardState(cardId)
    : loadedState;

  // Update FSRS state
  const updatedState = scheduleReview(cardState, isCorrect ? 'good' : 'again');
  saveCardState(cardId, updatedState);

  // Update stats
  updateStatsAfterSession(isCorrect ? 1 : 0, 1, 'widget');
  checkAndAdvanceStreak();

  // Refresh widget with next card
  updateWidgetData();

  return {
    submitted: true,
    isCorrect,
    correctAnswer: card.wordInContext,
  };
}

// ---------------------------------------------------------------------------
// processWidgetReveal — flip a self-rated card to show the back
// ---------------------------------------------------------------------------

/**
 * Reveal the back side of a self-rated card.
 *
 * Called when user taps the card on the widget to flip it.
 * Returns updated WidgetCardData with isRevealed=true and backText populated.
 *
 * @param cardId - Namespaced ID of the self-rated card
 * @returns Updated card data with back revealed, or null if card not found
 */
export function processWidgetReveal(cardId: string): WidgetCardData | null {
  const result = findCardById(cardId);
  if (!result) return null;
  const { card } = result;
  if (card.kind !== 'simple') return null; // Not a SimpleCard
  return {
    cardId,
    sentence: '',
    germanHint: '',
    correctAnswer: '',
    answerType: 'selfRated',
    cardsLeft: 0,
    streakCount: getStreak(),
    frontText: card.front,
    backText: card.back,
    isRevealed: true,
  };
}

// ---------------------------------------------------------------------------
// processWidgetRate — rate a self-rated card after reveal
// ---------------------------------------------------------------------------

/**
 * Process a self-rating from the widget after the card back has been revealed.
 *
 * @param cardId - Namespaced ID of the self-rated card
 * @param rating - '1' for Again (forgot), '3' for Good (remembered)
 * @returns { rated: boolean } indicating whether the rating was processed
 */
export function processWidgetRate(
  cardId: string,
  rating: '1' | '3',
): { rated: boolean } {
  const loadedState = loadCardState(cardId);
  const cardState = loadedState ?? createNewCardState(cardId);
  const grade: ReviewGrade = rating === '1' ? 'again' : 'good';
  const updatedState = scheduleReview(cardState, grade);
  saveCardState(cardId, updatedState);
  updateStatsAfterSession(rating === '3' ? 1 : 0, 1, 'widget');
  checkAndAdvanceStreak();
  updateWidgetData();
  return { rated: true };
}

// ---------------------------------------------------------------------------
// clearWidgetData
// ---------------------------------------------------------------------------

/**
 * Clear widget state when user completes all cards.
 * Widget should show empty state after this.
 */
export function clearWidgetData(): void {
  // TODO: When expo-widgets provides API to clear/hide widget, call it here
  // For now, updateWidgetData() will return null from getWidgetCardData()
  // and the widget component should handle empty state rendering
  updateWidgetData();
}
