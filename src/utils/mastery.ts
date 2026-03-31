import { loadCardState } from '../services/storage';
import { isCardMastered, getCardProgressLevel } from '../services/fsrs';
import type { MasteryStatus } from '../types/vocabulary';
import type { AppTheme } from '../theme';

/** Derive mastery status for a card from its stored FSRS state. */
export function deriveMastery(cardId: string): MasteryStatus {
  const state = loadCardState(cardId);
  if (state === null) return 'New';
  if (isCardMastered(state)) return 'Mastered';
  return 'Learning';
}

/** Map mastery status to the appropriate theme color. */
export function getMasteryColor(status: MasteryStatus, theme: AppTheme): string {
  switch (status) {
    case 'Mastered': return theme.custom.success;
    case 'Learning': return theme.custom.brandBlue;
    default:         return theme.colors.onSurfaceVariant;
  }
}

/** Progress level (0-5) → bar fill percentage. */
export function getProgressPercent(cardId: string): number {
  const state = loadCardState(cardId);
  return getCardProgressLevel(state) * 20;
}

/** Progress level → bar color. Blue for early stages, green for familiar/mastered. */
export function getProgressColor(cardId: string, theme: AppTheme): string {
  const state = loadCardState(cardId);
  const level = getCardProgressLevel(state);
  if (level >= 5) return theme.custom.success;      // Mastered — green
  if (level >= 4) return '#6BC490';                  // Familiar — green-ish
  return theme.custom.brandBlue;                     // Learning/Reviewing — blue
}
