/**
 * Build MC4 choices for a cloze card: correct word + 3 distractors, shuffled.
 */
import { shuffle } from './shuffle';
import type { ClozeCard } from '../types/vocabulary';

export function buildMcChoices(card: ClozeCard): string[] {
  const distractors = card.distractors.slice(0, 3);
  const choices = [card.wordInContext, ...distractors];
  return shuffle(choices);
}
