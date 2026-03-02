/**
 * Answer validation utility with fuzzy matching
 *
 * Validates user answers with tolerance for:
 * - Case differences (Hola = hola = HOLA)
 * - Diacritics/accents (café = cafe, résumé = resume)
 * - Apostrophe variations (' vs ')
 * - Leading/trailing whitespace
 * - Minor typos (configurable threshold)
 */

import Fuse from 'fuse.js';

/**
 * Normalize string: lowercase, remove diacritics, remove apostrophes, trim whitespace
 *
 * @param str - Input string to normalize
 * @returns Normalized string ready for comparison
 */
function normalize(str: string): string {
  return str
    .normalize('NFD')                      // Decompose accents (é -> e + combining accent)
    .replace(/[\u0300-\u036f]/g, '')      // Remove combining diacritical marks
    .replace(/['']/g, '')                  // Remove apostrophes (both ' and ')
    .toLowerCase()
    .trim();
}

/**
 * Validate user answer against correct answer with fuzzy matching
 *
 * Strategy:
 * 1. First try exact match after normalization (fast path)
 * 2. Fall back to Fuse.js fuzzy matching for typo tolerance
 *
 * @param userInput - User's answer (raw input)
 * @param correctAnswer - Correct answer from vocabulary card
 * @returns true if answer is correct (within threshold), false otherwise
 *
 * @example
 * validateAnswer('hola', 'Hola') // true (case)
 * validateAnswer("l'été", 'lete') // true (apostrophe + diacritic)
 * validateAnswer('café', 'cafe') // true (diacritic)
 * validateAnswer(' hello  ', 'hello') // true (whitespace)
 * validateAnswer('goodbye', 'hello') // false (wrong answer)
 */
export function validateAnswer(userInput: string, correctAnswer: string): boolean {
  const normalizedInput = normalize(userInput);
  const normalizedCorrect = normalize(correctAnswer);

  // Fast path: exact match after normalization
  if (normalizedInput === normalizedCorrect) {
    return true;
  }

  // Fuzzy match using Fuse.js for typo tolerance
  const fuse = new Fuse([normalizedCorrect], {
    threshold: 0.2,           // 0.0 = exact, 1.0 = match anything (0.2 allows small typos)
    ignoreLocation: true,     // Don't care where in string match occurs
    includeScore: true,       // Include match quality score in results
  });

  const result = fuse.search(normalizedInput);
  return result.length > 0;
}

/**
 * Get normalized version of string for debugging/display
 *
 * Useful for troubleshooting validation issues or showing
 * users what their input was normalized to.
 *
 * @param str - String to normalize
 * @returns Normalized version of input
 */
export function normalizeForDisplay(str: string): string {
  return normalize(str);
}
