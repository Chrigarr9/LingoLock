import { validateAnswer, normalizeForDisplay } from './answerValidation';

describe('validateAnswer', () => {
  // -----------------------------------------------------------------------
  // Exact matches after normalization
  // -----------------------------------------------------------------------
  test('exact match is correct and not fuzzy', () => {
    expect(validateAnswer('hola', 'hola')).toEqual({ correct: true, fuzzy: false });
  });

  test('case-insensitive match is not fuzzy', () => {
    expect(validateAnswer('Hola', 'hola')).toEqual({ correct: true, fuzzy: false });
    expect(validateAnswer('HOLA', 'hola')).toEqual({ correct: true, fuzzy: false });
  });

  test('diacritic-insensitive match is not fuzzy', () => {
    expect(validateAnswer('café', 'cafe')).toEqual({ correct: true, fuzzy: false });
    expect(validateAnswer('cafe', 'café')).toEqual({ correct: true, fuzzy: false });
  });

  test('apostrophe variations match (fuzzy due to straight apostrophe)', () => {
    // U+2019 (curly) is stripped by normalize, but U+0027 (straight) is not —
    // so "lete" vs "l'ete" differs by 1 char and goes through fuzzy matching
    expect(validateAnswer("l\u2019été", "l'ete")).toEqual({ correct: true, fuzzy: true });
  });

  test('whitespace trimming is not fuzzy', () => {
    expect(validateAnswer('  hello  ', 'hello')).toEqual({ correct: true, fuzzy: false });
  });

  test('empty strings match', () => {
    expect(validateAnswer('', '')).toEqual({ correct: true, fuzzy: false });
  });

  // -----------------------------------------------------------------------
  // Fuzzy matching (edit distance) — correct but flagged as fuzzy
  // -----------------------------------------------------------------------
  test('allows 1 typo in a 5+ character word (fuzzy)', () => {
    // "pregumta" vs "pregunta" — 1 edit in 8 chars (12.5% < 20%)
    expect(validateAnswer('pregumta', 'pregunta')).toEqual({ correct: true, fuzzy: true });
  });

  test('allows 1 typo in a 6 character word (fuzzy)', () => {
    // "hablar" → "hablqr" — 1 edit in 6 chars (16.7% < 20%)
    expect(validateAnswer('hablqr', 'hablar')).toEqual({ correct: true, fuzzy: true });
  });

  test('rejects 2 typos in a 5 character word', () => {
    // "holxx" vs "holas" — 2 edits in 5 chars (40% > 20%)
    expect(validateAnswer('holxx', 'holas')).toEqual({ correct: false });
  });

  test('requires exact match for very short words (1-4 chars)', () => {
    // "es" — 2 chars, maxDistance = floor(2 * 0.2) = 0
    expect(validateAnswer('es', 'es')).toEqual({ correct: true, fuzzy: false });
    expect(validateAnswer('ex', 'es')).toEqual({ correct: false });

    // "hola" — 4 chars, maxDistance = floor(4 * 0.2) = 0
    expect(validateAnswer('hola', 'hola')).toEqual({ correct: true, fuzzy: false });
    expect(validateAnswer('holx', 'hola')).toEqual({ correct: false });
  });

  test('allows fuzzy match for longer words', () => {
    // "habitación" normalized = "habitacion" (10 chars), maxDistance = 2
    expect(validateAnswer('havitacion', 'habitación')).toEqual({ correct: true, fuzzy: true }); // 1 edit
    expect(validateAnswer('havitaciom', 'habitación')).toEqual({ correct: true, fuzzy: true }); // 2 edits
  });

  // -----------------------------------------------------------------------
  // Wrong answers
  // -----------------------------------------------------------------------
  test('completely wrong answer is rejected', () => {
    expect(validateAnswer('goodbye', 'hello')).toEqual({ correct: false });
  });

  test('empty input for non-empty answer is rejected', () => {
    expect(validateAnswer('', 'hola')).toEqual({ correct: false });
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
