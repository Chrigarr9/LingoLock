/**
 * @deprecated Phase 1 placeholder data — no longer used.
 * Phase 2 uses bundled pipeline content from src/content/bundle.ts
 * and FSRS-scheduled card selection from src/services/cardSelector.ts.
 * Kept for reference only.
 */

import { VocabularyCard } from '../types/vocabulary';

/**
 * Placeholder vocabulary cards for Phase 1 testing
 *
 * Cards use three answer types:
 * - 'text': Free-text input (default)
 * - 'mc4': 4-choice multiple choice (2x2 grid)
 * - 'mc2': 2-choice multiple choice (1x2 grid)
 *
 * Phase 3 will replace this with .apkg imports
 */
export const PLACEHOLDER_CARDS: VocabularyCard[] = [
  {
    id: 'card-001',
    front: 'Hello',
    back: 'Hallo',
    answerType: 'mc4',
    choices: ['Hallo', 'Danke', 'Bitte', 'Morgen'],
  },
  {
    id: 'card-002',
    front: 'Thank you',
    back: 'Danke',
  },
  {
    id: 'card-003',
    front: 'Good morning',
    back: 'Guten Morgen',
    answerType: 'mc4',
    choices: ['Guten Morgen', 'Guten Abend', 'Gute Nacht', 'Auf Wiedersehen'],
  },
  {
    id: 'card-004',
    front: 'Goodbye',
    back: 'Auf Wiedersehen',
    answerType: 'mc4',
    choices: ['Auf Wiedersehen', 'Guten Tag'],
  },
  {
    id: 'card-005',
    front: 'Please',
    back: 'Bitte',
  },
  {
    id: 'card-006',
    front: 'The apple',
    back: 'Der Apfel',
    answerType: 'mc4',
    choices: ['Der Apfel', 'Das Buch', 'Die Tür', 'Der Kaffee'],
  },
  {
    id: 'card-007',
    front: 'The book',
    back: 'Das Buch',
    answerType: 'mc4',
    choices: ['Das Buch', 'Die Schule'],
  },
  {
    id: 'card-008',
    front: 'The door',
    back: 'Die Tür',
  },
  {
    id: 'card-009',
    front: 'Beautiful',
    back: 'Schön',
    answerType: 'mc4',
    choices: ['Schön', 'Schnell', 'Schwer', 'Schlecht'],
  },
  {
    id: 'card-010',
    front: 'To eat',
    back: 'Essen',
    answerType: 'mc4',
    choices: ['Essen', 'Trinken'],
  },
  {
    id: 'card-011',
    front: 'To drink',
    back: 'Trinken',
  },
  {
    id: 'card-012',
    front: 'The coffee',
    back: 'Der Kaffee',
    answerType: 'mc4',
    choices: ['Der Kaffee', 'Das Wasser', 'Der Apfel', 'Das Buch'],
  },
  {
    id: 'card-013',
    front: 'The water',
    back: 'Das Wasser',
  },
  {
    id: 'card-014',
    front: 'Yesterday',
    back: 'Gestern',
    answerType: 'mc4',
    choices: ['Gestern', 'Morgen'],
  },
  {
    id: 'card-015',
    front: 'Tomorrow',
    back: 'Morgen',
  },
  {
    id: 'card-016',
    front: 'The brother',
    back: 'Der Bruder',
    answerType: 'mc4',
    choices: ['Der Bruder', 'Die Schwester', 'Die Mutter', 'Der Vater'],
  },
  {
    id: 'card-017',
    front: 'The sister',
    back: 'Die Schwester',
  },
  {
    id: 'card-018',
    front: 'The mother',
    back: 'Die Mutter',
    answerType: 'mc4',
    choices: ['Die Mutter', 'Der Vater'],
  },
  {
    id: 'card-019',
    front: 'The father',
    back: 'Der Vater',
  },
  {
    id: 'card-020',
    front: 'To understand',
    back: 'Verstehen',
    answerType: 'mc4',
    choices: ['Verstehen', 'Sprechen', 'Arbeiten', 'Essen'],
  },
  {
    id: 'card-021',
    front: 'To speak',
    back: 'Sprechen',
  },
  {
    id: 'card-022',
    front: 'The school',
    back: 'Die Schule',
    answerType: 'mc4',
    choices: ['Die Schule', 'Das Haus'],
  },
  {
    id: 'card-023',
    front: 'The house',
    back: 'Das Haus',
  },
  {
    id: 'card-024',
    front: 'The street',
    back: 'Die Straße',
    answerType: 'mc4',
    choices: ['Die Straße', 'Die Schule', 'Das Haus', 'Die Tür'],
  },
  {
    id: 'card-025',
    front: 'To work',
    back: 'Arbeiten',
  },
];

/**
 * Get a card by its ID
 */
export function getCardById(cardId: string): VocabularyCard | undefined {
  return PLACEHOLDER_CARDS.find(card => card.id === cardId);
}

/**
 * Get a random card for testing
 */
export function getRandomCard(): VocabularyCard {
  const randomIndex = Math.floor(Math.random() * PLACEHOLDER_CARDS.length);
  return PLACEHOLDER_CARDS[randomIndex];
}

/**
 * Get total number of cards
 */
export function getTotalCards(): number {
  return PLACEHOLDER_CARDS.length;
}
