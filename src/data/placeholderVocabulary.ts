import { VocabularyCard } from '../types/vocabulary';

/**
 * Placeholder vocabulary cards for Phase 1 testing
 *
 * These cards test various edge cases:
 * - Diacritics (ä, ö, ü, é, à, ñ)
 * - Apostrophes and punctuation
 * - Case sensitivity
 * - Multi-word phrases
 * - Special characters
 *
 * Phase 3 will replace this with .apkg imports
 */
export const PLACEHOLDER_CARDS: VocabularyCard[] = [
  {
    id: 'card-001',
    front: 'Hello',
    back: 'Hallo',
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
  },
  {
    id: 'card-004',
    front: 'Goodbye',
    back: 'Auf Wiedersehen',
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
  },
  {
    id: 'card-007',
    front: 'The book',
    back: 'Das Buch',
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
  },
  {
    id: 'card-010',
    front: 'To eat',
    back: 'Essen',
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
