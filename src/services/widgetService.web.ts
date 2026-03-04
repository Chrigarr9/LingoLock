/**
 * Widget Service — Web platform no-op stubs
 *
 * Widgets are iOS/Android-only. Web builds need these stubs to prevent
 * build errors when the widget service is imported.
 */

export interface WidgetCardData {
  cardId: string;
  sentence: string;
  germanHint: string;
  correctAnswer: string;
  answerType: 'mc2' | 'mc4' | 'text';
  choices?: string[];
  imageUri?: string;
  cardsLeft: number;
  streakCount: number;
}

/**
 * Web stub: always returns null (no cards due).
 */
export function getWidgetCardData(): WidgetCardData | null {
  return null;
}

/**
 * Web stub: no-op.
 */
export function updateWidgetData(): void {
  // No-op on web
}

/**
 * Web stub: returns incorrect with empty answer.
 */
export function processWidgetAnswer(
  _cardId: string,
  _selectedChoice: string,
): { isCorrect: boolean; correctAnswer: string } {
  return { isCorrect: false, correctAnswer: '' };
}

/**
 * Web stub: no-op.
 */
export function clearWidgetData(): void {
  // No-op on web
}
