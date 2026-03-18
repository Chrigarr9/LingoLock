import { validateAnswer, normalizeForDisplay } from './answerValidation';

describe('validateAnswer', () => {
  // -----------------------------------------------------------------------
  // Exact matches after normalization
  // -----------------------------------------------------------------------
  test('exact match is correct', () => {
    expect(validateAnswer('hola', 'hola')).toBe(true);
  });

  test('case-insensitive match', () => {
    expect(validateAnswer('Hola', 'hola')).toBe(true);
    expect(validateAnswer('HOLA', 'hola')).toBe(true);
  });

  test('diacritic-insensitive match', () => {
    expect(validateAnswer('café', 'cafe')).toBe(true);
    expect(validateAnswer('cafe', 'café')).toBe(true);
  });

  test('apostrophe variations match', () => {
    expect(validateAnswer("l\u2019été", "l'ete")).toBe(true);
  });

  test('whitespace trimming', () => {
    expect(validateAnswer('  hello  ', 'hello')).toBe(true);
  });

  test('empty strings match', () => {
    expect(validateAnswer('', '')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Fuzzy matching (edit distance)
  // -----------------------------------------------------------------------
  test('allows 1 typo in a 5+ character word', () => {
    // "pregumta" vs "pregunta" — 1 edit in 8 chars (12.5% < 20%)
    expect(validateAnswer('pregumta', 'pregunta')).toBe(true);
  });

  test('allows 1 typo in a 6 character word', () => {
    // "hablar" → "hablqr" — 1 edit in 6 chars (16.7% < 20%)
    expect(validateAnswer('hablqr', 'hablar')).toBe(true);
  });

  test('rejects 2 typos in a 5 character word', () => {
    // "holxx" vs "holas" — 2 edits in 5 chars (40% > 20%)
    expect(validateAnswer('holxx', 'holas')).toBe(false);
  });

  test('requires exact match for very short words (1-4 chars)', () => {
    // "es" — 2 chars, maxDistance = floor(2 * 0.2) = 0
    expect(validateAnswer('es', 'es')).toBe(true);
    expect(validateAnswer('ex', 'es')).toBe(false);

    // "hola" — 4 chars, maxDistance = floor(4 * 0.2) = 0
    expect(validateAnswer('hola', 'hola')).toBe(true);
    expect(validateAnswer('holx', 'hola')).toBe(false);
  });

  test('allows fuzzy match for longer words', () => {
    // "habitación" normalized = "habitacion" (10 chars), maxDistance = 2
    expect(validateAnswer('havitacion', 'habitación')).toBe(true); // 1 edit
    expect(validateAnswer('havitaciom', 'habitación')).toBe(true); // 2 edits
  });

  // -----------------------------------------------------------------------
  // Wrong answers
  // -----------------------------------------------------------------------
  test('completely wrong answer is rejected', () => {
    expect(validateAnswer('goodbye', 'hello')).toBe(false);
  });

  test('empty input for non-empty answer is rejected', () => {
    expect(validateAnswer('', 'hola')).toBe(false);
  });
});

describe('normalizeForDisplay', () => {
  test('normalizes diacritics and case', () => {
    expect(normalizeForDisplay('Café')).toBe('cafe');
  });

  test('removes apostrophes', () => {
    expect(normalizeForDisplay("l'été")).toBe('lete');
  });

  test('trims whitespace', () => {
    expect(normalizeForDisplay('  hello  ')).toBe('hello');
  });
});
