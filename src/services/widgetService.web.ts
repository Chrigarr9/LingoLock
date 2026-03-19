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
  answerType: 'mc4' | 'text' | 'selfRated';
  choices?: string[];
  imageUri?: string;
  cardsLeft: number;
  streakCount: number;
  spellInput?: string;
  spellChoices?: string[];
  frontText?: string;
  backText?: string;
  isRevealed?: boolean;
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
 * Web stub: no-op spell action.
 */
export function processSpellAction(
  _cardId: string,
  _action: 'char' | 'back' | 'submit',
  _char?: string,
): { submitted: boolean; isCorrect?: boolean; correctAnswer?: string } {
  return { submitted: true, isCorrect: false, correctAnswer: '' };
}

/**
 * Web stub: returns null (no reveal on web).
 */
export function processWidgetReveal(_cardId: string): WidgetCardData | null {
  return null;
}

/**
 * Web stub: returns not rated.
 */
export function processWidgetRate(
  _cardId: string,
  _rating: '1' | '3',
): { rated: boolean } {
  return { rated: false };
}

/**
 * Web stub: no-op.
 */
export function clearWidgetData(): void {
  // No-op on web
}

/**
 * Web stub: returns empty string.
 */
export function getSpellingState(_cardId: string): string {
  return '';
}

/**
 * Web stub: returns empty array.
 */
export function buildSpellChoices(
  _correctAnswer: string,
  _currentPosition: number,
  _count?: number,
  _characters?: string[],
): string[] {
  return [];
}
