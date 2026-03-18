export interface BundleConfig {
  id: string;
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
}

export interface Bundle {
  config: BundleConfig;
  chapters: import('./vocabulary').ChapterData[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
}
