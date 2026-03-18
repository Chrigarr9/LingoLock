/**
 * Answer validation utility with fuzzy matching
 *
 * Validates user answers with tolerance for:
 * - Case differences (Hola = hola = HOLA)
 * - Diacritics/accents (café = cafe, résumé = resume)
 * - Apostrophe variations (' vs ')
 * - Leading/trailing whitespace
 * - Minor typos (edit distance ≤ 20% of word length)
 */

/**
 * Normalize string: lowercase, remove diacritics, remove apostrophes, trim whitespace
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
 * Compute Levenshtein edit distance between two strings.
 * Uses the standard dynamic programming approach with O(min(a,b)) space.
 */
function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) [a, b] = [b, a];

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr = new Array(a.length + 1);

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,      // deletion
        curr[i - 1] + 1,  // insertion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[a.length];
}

/**
 * Validate user answer against correct answer with fuzzy matching.
 *
 * Strategy:
 * 1. Exact match after normalization (fast path)
 * 2. Edit distance check — allows ~1 typo per 5 characters (20% threshold)
 *
 * @example
 * validateAnswer('hola', 'Hola') // true (case)
 * validateAnswer('café', 'cafe') // true (diacritic)
 * validateAnswer('pregumta', 'pregunta') // true (1 typo in 8 chars)
 * validateAnswer('goodbye', 'hello') // false (wrong answer)
 */
export function validateAnswer(userInput: string, correctAnswer: string): boolean {
  const normalizedInput = normalize(userInput);
  const normalizedCorrect = normalize(correctAnswer);

  // Fast path: exact match after normalization
  if (normalizedInput === normalizedCorrect) {
    return true;
  }

  // Fuzzy match: allow edit distance up to 20% of the longer string
  const maxLen = Math.max(normalizedInput.length, normalizedCorrect.length);
  if (maxLen === 0) return true;

  const maxDistance = Math.floor(maxLen * 0.2);
  if (maxDistance === 0) return false; // Very short words: require exact match

  return editDistance(normalizedInput, normalizedCorrect) <= maxDistance;
}

/**
 * Get normalized version of string for debugging/display
 */
export function normalizeForDisplay(str: string): string {
  return normalize(str);
}
