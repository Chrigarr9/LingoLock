import { loadCardState } from '../services/storage';
import { isCardMastered } from '../services/fsrs';
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
