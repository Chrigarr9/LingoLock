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

import { isDue, getAnswerType, scheduleReview, createNewCardState } from './fsrs';
import { loadCardState, saveCardState, loadAllCardStates, statsStorage } from './storage';
import { getBundle, getCardById as findCardById } from '../content/bundles';
import { loadEnabledBundles } from './storage';
import { getStreak } from './statsService';
import { updateStatsAfterSession } from './statsService';
import { validateAnswer } from '../utils/answerValidation';
import type { ClozeCard } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetCardData {
  cardId: string;
  sentence: string;       // Cloze sentence with _____ gap
  germanHint: string;     // German hint word
  correctAnswer: string;  // wordInContext
  answerType: 'mc4' | 'text';  // Determines widget interaction mode
  choices?: string[];     // MC choices for mc2/mc4 cards
  imageUri?: string;      // Optional card image
  cardsLeft: number;      // Total cards remaining in session
  streakCount: number;    // Current streak
  // Spell mode fields (populated for text cards on widget)
  spellInput?: string;    // Characters typed so far
  spellChoices?: string[];  // Character buttons to display
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle (for MC choices)
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ---------------------------------------------------------------------------
// MC choice generation
// ---------------------------------------------------------------------------

function buildChoices(card: ClozeCard, answerType: 'mc4' | 'text'): string[] {
  const distractorCount = 3;
  const distractors = card.distractors.slice(0, distractorCount);
  const choices = [card.wordInContext, ...distractors];
  return shuffle(choices);
}

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
  // Scan all enabled bundles for due review cards (only cards with state)
  const enabledIds = loadEnabledBundles();
  const dueCards: Array<{ card: ClozeCard; bundleId: string }> = [];
  for (const bundleId of enabledIds) {
    const bundle = getBundle(bundleId);
    for (const chapter of bundle.chapters) {
      for (const card of chapter.cards) {
        const namespacedId = `${bundleId}:${card.id}`;
        const state = loadCardState(namespacedId);
        if (state !== null && isDue(state)) {
          dueCards.push({ card, bundleId });
        }
      }
    }
  }

  if (dueCards.length === 0) {
    return null; // No cards due — widget shows empty state
  }

  // Get first due card
  const firstDueCard = dueCards[0];
  const card = firstDueCard.card;
  const namespacedId = `${firstDueCard.bundleId}:${card.id}`;
  const cardState = loadCardState(namespacedId);
  const answerType = getAnswerType(cardState);
  const streakCount = getStreak();

  const widgetData: WidgetCardData = {
    cardId: card.id,
    sentence: card.sentence,
    germanHint: card.germanHint,
    correctAnswer: card.wordInContext,
    answerType,
    cardsLeft: dueCards.length,
    streakCount,
  };

  // Add MC choices for mc2/mc4 cards
  if (answerType === 'mc4') {
    widgetData.choices = buildChoices(card, answerType);
  }

  // Add spell mode data for text cards (character picker replaces keyboard on widget)
  if (answerType === 'text') {
    const spellInput = getSpellingState(card.id);
    const bundle = getBundle(firstDueCard.bundleId);
    widgetData.spellInput = spellInput;
    widgetData.spellChoices = buildSpellChoices(
      card.wordInContext, spellInput.length, 4,
      bundle.config.spellCharacters,
    );
  }

  // Add image URI if available (for future expansion when images supported on widgets)
  if (card.image) {
    widgetData.imageUri = card.image;
  }

  return widgetData;
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
  // TODO: Once expo-widgets provides updateTimeline/updateSnapshot API, call it here
  // with getWidgetCardData() payload. For now, this is a no-op placeholder.
  //
  // Expected pattern (when API is available):
  // try {
  //   const cardData = getWidgetCardData();
  //   await WidgetTimeline.update(cardData);
  // } catch (error) {
  //   // Silently no-op if expo-widgets not available (web, pre-SDK 55, etc.)
  // }
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

  if (!card) {
    // Card not found — shouldn't happen, but return safe default
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

  if (!card) {
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

  // Refresh widget with next card
  updateWidgetData();

  return {
    submitted: true,
    isCorrect,
    correctAnswer: card.wordInContext,
  };
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
