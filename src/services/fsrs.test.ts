import { getAnswerType } from './fsrs';
import type { CardState } from '../types/vocabulary';

function makeState(stability: number): CardState {
  return {
    cardId: 'test',
    due: new Date().toISOString(),
    stability,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 2, // Review
  };
}

describe('getAnswerType', () => {
  it('returns mc4 for null (new card)', () => {
    expect(getAnswerType(null)).toBe('mc4');
  });

  it('returns mc4 when stability < 1.0', () => {
    expect(getAnswerType(makeState(0.9))).toBe('mc4');
  });

  it('returns mc4 when stability is 0', () => {
    expect(getAnswerType(makeState(0))).toBe('mc4');
  });

  it('returns scramble when stability is 1.0', () => {
    expect(getAnswerType(makeState(1.0))).toBe('scramble');
  });

  it('returns scramble when stability is 1.9', () => {
    expect(getAnswerType(makeState(1.9))).toBe('scramble');
  });

  it('returns text when stability is exactly 2.0', () => {
    expect(getAnswerType(makeState(2.0))).toBe('text');
  });

  it('returns text when stability is 10.0', () => {
    expect(getAnswerType(makeState(10.0))).toBe('text');
  });
});
