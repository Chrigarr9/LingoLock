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
import { loadCardState, saveCardState, loadAllCardStates } from './storage';
import { CHAPTERS } from '../content/bundle';
import { getStreak } from './statsService';
import { updateStatsAfterSession } from './statsService';
import type { ClozeCard } from '../types/vocabulary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetCardData {
  cardId: string;
  sentence: string;       // Cloze sentence with _____ gap
  germanHint: string;     // German hint word
  correctAnswer: string;  // wordInContext
  answerType: 'mc2' | 'mc4' | 'text';  // Determines widget interaction mode
  choices?: string[];     // MC choices for mc2/mc4 cards
  imageUri?: string;      // Optional card image
  cardsLeft: number;      // Total cards remaining in session
  streakCount: number;    // Current streak
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

function buildChoices(card: ClozeCard, answerType: 'mc2' | 'mc4'): string[] {
  const distractorCount = answerType === 'mc2' ? 1 : 3;
  const distractors = card.distractors.slice(0, distractorCount);
  const choices = [card.wordInContext, ...distractors];
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
  // Scan all chapters for due review cards (only cards with state)
  const dueCards: ClozeCard[] = [];
  for (const chapter of CHAPTERS) {
    for (const card of chapter.cards) {
      const state = loadCardState(card.id);
      if (state !== null && isDue(state)) {
        dueCards.push(card);
      }
    }
  }

  if (dueCards.length === 0) {
    return null; // No cards due — widget shows empty state
  }

  // Get first due card
  const card = dueCards[0];
  const cardState = loadCardState(card.id);
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
  if (answerType === 'mc2' || answerType === 'mc4') {
    widgetData.choices = buildChoices(card, answerType);
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
  let card: ClozeCard | null = null;
  for (const chapter of CHAPTERS) {
    const found = chapter.cards.find((c) => c.id === cardId);
    if (found) {
      card = found;
      break;
    }
  }

  if (!card) {
    // Card not found — shouldn't happen, but return safe default
    return { isCorrect: false, correctAnswer: '' };
  }

  // Validate answer
  const isCorrect = selectedChoice === card.wordInContext;

  // Load or create CardState
  const loadedState = loadCardState(card.id);
  const cardState = loadedState === null
    ? createNewCardState(card.id)
    : loadedState;

  // Update FSRS state
  const updatedState = scheduleReview(cardState, isCorrect);
  saveCardState(card.id, updatedState);

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
