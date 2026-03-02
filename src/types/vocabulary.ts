/**
 * Core vocabulary data types for LingoLock
 * Phase 1: Used with placeholder data
 * Phase 3: Populated from Anki .apkg imports
 */

/**
 * Represents a single vocabulary flashcard
 */
export interface VocabularyCard {
  /** Unique identifier for the card */
  id: string;

  /** Front side of the card (typically the question/prompt) */
  front: string;

  /** Back side of the card (the answer) */
  back: string;

  /** Optional media URL (image/audio) - Phase 3+ */
  media?: string;

  /** Optional tags for categorization - Phase 3+ */
  tags?: string[];

  /** Deck this card belongs to - Phase 3+ */
  deckId?: string;
}

/**
 * Parameters for challenge screen deep linking and routing
 */
export interface ChallengeParams {
  /** ID of the card to display */
  cardId?: string;

  /** Whether this was triggered by app blocking (affects UI/behavior) */
  fromBlocking?: boolean;

  /** Timestamp when challenge was triggered */
  triggeredAt?: string;
}

/**
 * User's answer submission for validation
 */
export interface AnswerSubmission {
  /** The card being answered */
  cardId: string;

  /** User's typed answer */
  userAnswer: string;

  /** Timestamp of submission */
  submittedAt: Date;
}

/**
 * Result of answer validation
 */
export interface ValidationResult {
  /** Whether the answer is correct */
  isCorrect: boolean;

  /** Normalized user answer (trimmed, case-adjusted) */
  normalizedUserAnswer: string;

  /** Normalized expected answer */
  normalizedExpectedAnswer: string;

  /** Optional feedback message */
  feedback?: string;
}
