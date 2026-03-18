export interface BundleConfig {
  id: string;
  /** 'builtin' for pipeline-generated bundles, 'imported' for user-imported decks */
  type: 'builtin' | 'imported';
  nativeLanguage: string;
  targetLanguage: string;
  displayLabel: string;
  greetings: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  motivational: {
    perfect: string;
    great: string;
    good: string;
    encouragement: string;
  };
  spellCharacters: string[];
  searchPlaceholder: string;
  /** Total cards (only for imported decks — builtin decks derive from chapters) */
  cardCount?: number;
  /** ISO date of import (only for imported decks) */
  importedAt?: string;
}

export interface Bundle {
  config: BundleConfig;
  chapters: import('./vocabulary').ChapterData[];
  /** Simple front/back cards (imported decks only, empty array for builtin) */
  simpleCards: import('./simpleCard').SimpleCard[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
}
