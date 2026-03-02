/**
 * Tests for cardSelector service
 * Session building, card priority, wrong-answer re-insertion
 *
 * Mocks: storage.ts (loadCardState, loadAllCardStates), fsrs.ts (isDue, getAnswerType, isCardMastered)
 * The content bundle is imported directly (pure data, no native deps).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('./storage', () => ({
  loadCardState: jest.fn(),
  loadAllCardStates: jest.fn(),
  saveCardState: jest.fn(),
}));

jest.mock('./fsrs', () => ({
  isDue: jest.fn(),
  getAnswerType: jest.fn(),
  isCardMastered: jest.fn(),
  createNewCardState: jest.fn(),
  scheduleReview: jest.fn(),
}));

jest.mock('../content/bundle', () => {
  // Minimal stub of the content bundle with 2 chapters
  const makeCard = (id: string, lemma: string, chapter: number, distractors: string[]) => ({
    id,
    lemma,
    wordInContext: lemma,
    germanHint: `hint-${lemma}`,
    sentence: `_____`,
    sentenceTranslation: `translation`,
    pos: 'noun',
    contextNote: 'singular',
    chapter,
    cefrLevel: 'A1',
    distractors,
  });

  const ch1Cards = [
    makeCard('word1-ch01-s00', 'word1', 1, ['d1', 'd2', 'd3']),
    makeCard('word2-ch01-s01', 'word2', 1, ['d1', 'd2', 'd3']),
    makeCard('word3-ch01-s02', 'word3', 1, ['d1', 'd2', 'd3']),
    makeCard('word4-ch01-s03', 'word4', 1, ['d1', 'd2', 'd3']),
    makeCard('word5-ch01-s04', 'word5', 1, ['d1', 'd2', 'd3']),
  ];

  const ch2Cards = [
    makeCard('word6-ch02-s00', 'word6', 2, ['d1', 'd2', 'd3']),
    makeCard('word7-ch02-s01', 'word7', 2, ['d1', 'd2', 'd3']),
    makeCard('word8-ch02-s02', 'word8', 2, ['d1', 'd2', 'd3']),
  ];

  const CHAPTERS = [
    { chapterNumber: 1, cards: ch1Cards },
    { chapterNumber: 2, cards: ch2Cards },
  ];

  const ALL_CARDS = [...ch1Cards, ...ch2Cards];

  return {
    CHAPTERS,
    ALL_CARDS,
    getCardById: (id: string) => ALL_CARDS.find(c => c.id === id),
    getChapterCards: (n: number) => CHAPTERS.find(c => c.chapterNumber === n)?.cards ?? [],
    getTotalCards: () => ALL_CARDS.length,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { buildSession, handleWrongAnswer, getCurrentChapter } from './cardSelector';
import { loadCardState, loadAllCardStates } from './storage';
import { isDue, getAnswerType, isCardMastered } from './fsrs';

const mockLoadCardState = loadCardState as jest.MockedFunction<typeof loadCardState>;
const mockIsDue = isDue as jest.MockedFunction<typeof isDue>;
const mockGetAnswerType = getAnswerType as jest.MockedFunction<typeof getAnswerType>;
const mockIsCardMastered = isCardMastered as jest.MockedFunction<typeof isCardMastered>;

// Helper: create a minimal CardState
function makeCardState(cardId: string, due: string = new Date(Date.now() - 1000).toISOString()) {
  return {
    cardId,
    due,
    stability: 1.0,
    difficulty: 5.0,
    elapsed_days: 1,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 1, // Learning
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no card states in storage (all cards are new)
  mockLoadCardState.mockReturnValue(null);
  // Default: getAnswerType for null returns 'mc2'
  mockGetAnswerType.mockReturnValue('mc2');
  // Default: isDue returns false
  mockIsDue.mockReturnValue(false);
  // Default: isCardMastered returns false
  mockIsCardMastered.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// buildSession tests
// ---------------------------------------------------------------------------

describe('buildSession', () => {
  test('with 0 due reviews returns 5 new words from chapter 1', () => {
    // All cards are new (no card states)
    mockLoadCardState.mockReturnValue(null);

    const session = buildSession(5);

    expect(session).toHaveLength(5);
    // All from chapter 1 (first 5 are chapter 1 cards)
    for (const sc of session) {
      expect(sc.card.chapter).toBe(1);
    }
    // All should be mc2 (new cards)
    for (const sc of session) {
      expect(sc.answerType).toBe('mc2');
    }
  });

  test('with 3 due reviews returns 3 due + 2 new (including at least 1 new)', () => {
    // word1, word2, word3 are due; rest are new
    const dueIds = ['word1-ch01-s00', 'word2-ch01-s01', 'word3-ch01-s02'];

    mockLoadCardState.mockImplementation((id) => {
      if (dueIds.includes(id)) return makeCardState(id);
      return null;
    });
    mockIsDue.mockImplementation((state) => dueIds.includes(state.cardId));
    mockGetAnswerType.mockImplementation((state) => (state ? 'mc4' : 'mc2'));

    const session = buildSession(5);

    expect(session).toHaveLength(5);
    const dueInSession = session.filter((sc: import('../types/vocabulary').SessionCard) => dueIds.includes(sc.card.id));
    const newInSession = session.filter((sc: import('../types/vocabulary').SessionCard) => !dueIds.includes(sc.card.id));
    expect(dueInSession).toHaveLength(3);
    expect(newInSession).toHaveLength(2);
  });

  test('with 10 due reviews returns 4 due + 1 new (always 1 new guaranteed)', () => {
    // All 5 ch1 cards and 3 ch2 cards could be "due", but we only have 5 ch1 + 3 ch2 = 8 cards total
    // Let's set word1-word5 as due, request 5 — expect 4 due + 1 new
    const dueIds = [
      'word1-ch01-s00',
      'word2-ch01-s01',
      'word3-ch01-s02',
      'word4-ch01-s03',
      'word5-ch01-s04',
    ];

    mockLoadCardState.mockImplementation((id) => {
      if (dueIds.includes(id)) return makeCardState(id);
      return null;
    });
    mockIsDue.mockImplementation((state) => dueIds.includes(state.cardId));
    mockGetAnswerType.mockImplementation((state) => (state ? 'mc4' : 'mc2'));

    const session = buildSession(5);

    expect(session).toHaveLength(5);
    const newInSession = session.filter(sc => !dueIds.includes(sc.card.id));
    expect(newInSession).toHaveLength(1);
    // The new card must come from chapter 2 (ch1 is all due, no new in ch1)
    expect(newInSession[0].card.chapter).toBe(2);
  });

  test('with 0 due and only 3 new in ch1 (ch2 unlocked), returns 3 from ch1 + 2 from ch2', () => {
    // ch1 has word1, word2, word3 already reviewed (not due, not new)
    // word4, word5 have never been seen (null state)
    // But ch1 is 80% mastered so ch2 is unlocked
    // Actually: we need 3 new available from ch1 and ch2 must fill the rest
    // Setup: word1..word3 are reviewed (not due, not new), word4 and word5 are new in ch1
    // ch2 has word6, word7, word8 as new
    // We want: 3 cards from somewhere — let's set 3 cards as new in ch1 and ch2 fills the rest

    // Actually the test says "0 due and 3 new in ch1": word1, word2, word3 are new; word4, word5 reviewed
    // ch2 needs to be reachable — means ch1 >= 80% mastered. With 5 cards and 2 mastered = 40%, not 80%.
    // Let's say word4 and word5 are mastered: 2/5 = 40% — still not 80%.
    // For ch2 to be "unlocked": ch1 mastery >= 80% = 4 of 5 cards mastered.
    // Setup: word3, word4, word5 = mastered; word1, word2 = new. That's 3/5 = 60% < 80%.
    // Setup: word1, word2 = new; word3, word4, word5 = mastered (3/5 = 60%). Not enough.
    // Let's re-read the test: "0 due and 3 new in ch1 (ch2 unlocked)"
    // This implies ch2 is unlocked, meaning ch1 >= 80% mastered.
    // With 5 total ch1 cards, need 4 mastered. So: 1 new + 4 mastered.
    // BUT the test says "3 new in ch1" — so 3 of 5 are new (never seen), 2 mastered = 40%.
    // Hmm, unless "new" here means unseen but chapter unlock is based on something else.
    // Let's interpret: ch1 mastery is >= 80% (4/5 mastered) AND there are 3 new words.
    // Wait, if ch1 has 5 cards and 4 are mastered, only 1 can be "new" (unseen).
    // The test says 3 new in ch1 — so maybe the test is saying: after loading ch1 cards,
    // only 3 are new (no state), and ch2 is already "unlocked" via getCurrentChapter logic.
    // getCurrentChapter logic: first chapter < 80% mastery. If ch1 is 60%, ch1 is current.
    // For ch2 to be used for fill-in, we need ch1 new cards exhausted.
    // Actually the plan says: "If not enough due reviews AND not enough new words in current chapter,
    //   use new words from next unlocked chapter"
    // So ch2 fills in when ch1 new words are exhausted regardless of unlock status.
    // Let's set: 3 new words in ch1, 2 reviewed (not due) in ch1; ch2 has 3 new.
    const reviewedInCh1 = ['word4-ch01-s03', 'word5-ch01-s04'];
    const newInCh1 = ['word1-ch01-s00', 'word2-ch01-s01', 'word3-ch01-s02'];
    const newInCh2 = ['word6-ch02-s00', 'word7-ch02-s01', 'word8-ch02-s02'];

    mockLoadCardState.mockImplementation((id) => {
      if (reviewedInCh1.includes(id)) {
        // reviewed, not due, not new
        return makeCardState(id, new Date(Date.now() + 86400000).toISOString()); // due tomorrow
      }
      return null; // new
    });
    mockIsDue.mockReturnValue(false); // none are due
    mockIsCardMastered.mockReturnValue(false); // none mastered (for getCurrentChapter, ch1 is current)
    mockGetAnswerType.mockReturnValue('mc2');

    const session = buildSession(5);

    expect(session).toHaveLength(5);
    const ch1InSession = session.filter(sc => sc.card.chapter === 1);
    const ch2InSession = session.filter(sc => sc.card.chapter === 2);
    expect(ch1InSession).toHaveLength(3);
    expect(ch2InSession).toHaveLength(2);
  });

  test('MC2 card has 2 choices (correct + 1 distractor), shuffled', () => {
    mockLoadCardState.mockReturnValue(null);
    mockGetAnswerType.mockReturnValue('mc2');

    const session = buildSession(1);

    expect(session).toHaveLength(1);
    const sc = session[0];
    expect(sc.answerType).toBe('mc2');
    expect(sc.choices).toHaveLength(2);
    // Choices must contain the correct word
    expect(sc.choices).toContain(sc.card.wordInContext);
  });

  test('MC4 card has 4 choices (correct + 3 distractors), shuffled', () => {
    mockLoadCardState.mockReturnValue(null);
    mockGetAnswerType.mockReturnValue('mc4');

    const session = buildSession(1);

    expect(session).toHaveLength(1);
    const sc = session[0];
    expect(sc.answerType).toBe('mc4');
    expect(sc.choices).toHaveLength(4);
    expect(sc.choices).toContain(sc.card.wordInContext);
  });

  test('Text card has no choices', () => {
    mockLoadCardState.mockReturnValue(null);
    mockGetAnswerType.mockReturnValue('text');

    const session = buildSession(1);

    expect(session).toHaveLength(1);
    const sc = session[0];
    expect(sc.answerType).toBe('text');
    expect(sc.choices).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleWrongAnswer tests
// ---------------------------------------------------------------------------

describe('handleWrongAnswer', () => {
  function makeSessionCard(id: string): import('../types/vocabulary').SessionCard {
    return {
      card: {
        id,
        lemma: id,
        wordInContext: id,
        germanHint: `hint-${id}`,
        sentence: '_____',
        sentenceTranslation: 'translation',
        pos: 'noun',
        contextNote: 'singular',
        chapter: 1,
        cefrLevel: 'A1',
        distractors: [],
      },
      answerType: 'mc2',
      choices: [id, 'other'],
    };
  }

  test('inserts card at position currentIndex + 4', () => {
    const queue = [
      makeSessionCard('a'),
      makeSessionCard('b'),
      makeSessionCard('c'),
      makeSessionCard('d'),
      makeSessionCard('e'),
      makeSessionCard('f'),
    ];
    const wrongCard = makeSessionCard('wrong');

    // currentIndex = 0, insert at min(0 + 4, 6) = 4
    const newQueue = handleWrongAnswer(queue, 0, wrongCard);

    expect(newQueue[4]).toBe(wrongCard);
    expect(newQueue).toHaveLength(7);
  });

  test('at end of queue appends card at queue.length', () => {
    const queue = [
      makeSessionCard('a'),
      makeSessionCard('b'),
      makeSessionCard('c'),
    ];
    const wrongCard = makeSessionCard('wrong');

    // currentIndex = 2, insert at min(2 + 4, 3) = 3 (append)
    const newQueue = handleWrongAnswer(queue, 2, wrongCard);

    expect(newQueue[3]).toBe(wrongCard);
    expect(newQueue).toHaveLength(4);
  });

  test('returns a new array (immutable)', () => {
    const queue = [makeSessionCard('a'), makeSessionCard('b')];
    const wrongCard = makeSessionCard('wrong');

    const newQueue = handleWrongAnswer(queue, 0, wrongCard);

    expect(newQueue).not.toBe(queue);
  });
});

// ---------------------------------------------------------------------------
// getCurrentChapter tests
// ---------------------------------------------------------------------------

describe('getCurrentChapter', () => {
  test('returns 1 when no cards reviewed', () => {
    mockLoadCardState.mockReturnValue(null);
    mockIsCardMastered.mockReturnValue(false);

    const chapter = getCurrentChapter();

    expect(chapter).toBe(1);
  });

  test('returns 2 when chapter 1 is >= 80% mastered', () => {
    // ch1 has 5 cards. 4/5 = 80% mastered.
    const ch1Cards = [
      'word1-ch01-s00',
      'word2-ch01-s01',
      'word3-ch01-s02',
      'word4-ch01-s03',
      'word5-ch01-s04',
    ];

    const masteredIds = ch1Cards.slice(0, 4); // 4 mastered = 80%

    mockLoadCardState.mockImplementation((id) => {
      if (ch1Cards.includes(id)) return makeCardState(id);
      return null;
    });
    mockIsCardMastered.mockImplementation((state) => masteredIds.includes(state.cardId));

    const chapter = getCurrentChapter();

    expect(chapter).toBe(2);
  });
});
