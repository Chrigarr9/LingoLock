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

  /** Answer input type: text input, 2-choice MC, or 4-choice MC */
  answerType?: 'text' | 'mc2' | 'mc4';

  /** Answer choices for multiple-choice cards (includes the correct answer) */
  choices?: string[];

  /** Optional tags for categorization - Phase 3+ */
  tags?: string[];

  /** Deck this card belongs to - Phase 3+ */
  deckId?: string;
}

/**
 * Parameters for challenge screen deep linking and routing
 */
export interface ChallengeParams {
  /** Source app that triggered the challenge (from deep link: lingolock://challenge?source=Instagram) */
  source: string;

  /** Number of vocabulary cards to present (1-10) */
  count: number;

  /** Type of challenge trigger */
  type: 'unlock' | 'app_open';

  /** ID of the card to display (optional, for specific card navigation) */
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

// =============================================================================
// Phase 2: Spaced Repetition & Progress types
// =============================================================================

/**
 * Phase 2: Productive cloze card — user sees Spanish sentence with blank + German hint,
 * must produce the Spanish word.
 */
export interface ClozeCard {
  /** Unique ID: "{lemma}-ch{chapter}-s{sentenceIndex}" */
  id: string;
  /** Base form of the word (e.g., "habitación") */
  lemma: string;
  /** Surface form as it appears in the sentence (e.g., "habitación") */
  wordInContext: string;
  /** Contextual German translation hint (e.g., "Zimmer") */
  germanHint: string;
  /** Spanish sentence with _____ replacing the target word */
  sentence: string;
  /** Full German translation of the sentence (shown after answering) */
  sentenceTranslation: string;
  /** Part of speech (e.g., "noun", "verb") */
  pos: string;
  /** Grammar context note (e.g., "feminine singular") */
  contextNote: string;
  /** Chapter number (1-indexed) */
  chapter: number;
  /** CEFR level from vocabulary.json (e.g., "A2") or null */
  cefrLevel: string | null;
  /** Distractor Spanish words for MC modes — same POS, similar CEFR */
  distractors: string[];
  /** Optional image URI — populated by Phase 3 Anki import, undefined for pipeline content */
  image?: string;
  /** Optional audio URI — populated by Phase 3 Anki import, undefined for pipeline content */
  audio?: string;
}

/** Chapter data with its cards */
export interface ChapterData {
  chapterNumber: number;
  cards: ClozeCard[];
}

/** FSRS card state stored in MMKV — extends ts-fsrs Card with our card ID */
export interface CardState {
  cardId: string;
  /** Serialized ts-fsrs Card fields */
  due: string;           // ISO date string
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;         // ts-fsrs State enum value
  last_review?: string;  // ISO date string
}

/** Card in the active session queue — combines content + state + answer type */
export interface SessionCard {
  card: ClozeCard;
  answerType: 'mc2' | 'mc4' | 'text';
  /** Choices for MC modes (includes correct answer + distractors) */
  choices?: string[];
}

/** Stats persisted in MMKV */
export interface PersistedStats {
  currentStreak: number;
  lastSessionDate: string | null;  // ISO date string
  totalCorrect: number;
  totalAnswered: number;
  /** Per-app session tracking: source app name → { sessions, cards } */
  perAppStats: Record<string, { sessions: number; cards: number }>;
  /** Number of forced-session aborts today */
  abortsToday: number;
  /** Date of last abort count reset (YYYY-MM-DD) — resets daily */
  lastAbortDate: string | null;
  /** Lifetime total aborts across all days */
  totalAborts: number;
}
