import type { ChapterData, ClozeCard } from '../types/vocabulary';

jest.mock('./storage', () => ({
  loadEnabledBundles: jest.fn(() => ['deck-a', 'deck-b']),
  loadCardState: jest.fn(),
  loadAllCardStates: jest.fn(() => []),
  loadNewWordsIntroducedToday: jest.fn(() => 0),
  loadNewWordsPerDay: jest.fn(() => 20),
}));

jest.mock('./fsrs', () => ({
  isDue: jest.fn((state) => Boolean(state?.dueNow)),
  getAnswerType: jest.fn(() => 'mc4'),
  isCardLearned: jest.fn(() => false),
}));

const makeCard = (id: string, chapter: number): ClozeCard => ({
  kind: 'cloze',
  id,
  lemma: id,
  wordInContext: id,
  germanHint: id,
  sentence: '_____',
  sentenceTranslation: id,
  pos: 'noun',
  contextNote: 'singular',
  chapter,
  cefrLevel: 'A1',
  distractors: ['x', 'y', 'z'],
});

const chapter = (cards: ClozeCard[]): ChapterData[] => [{ chapterNumber: 1, cards }];

const deckA = chapter([makeCard('deck-a:a1', 1), makeCard('deck-a:a2', 1)]);
const deckB = chapter([
  makeCard('deck-b:b1', 1),
  makeCard('deck-b:b2', 1),
  makeCard('deck-b:b3', 1),
  makeCard('deck-b:b4', 1),
]);

jest.mock('../content/bundles', () => ({
  getBundle: jest.fn((bundleId: string) => ({
    config: { id: bundleId },
    chapters: bundleId === 'deck-a' ? deckA : deckB,
    simpleCards: [],
    cardImages: {},
    cardAudios: {},
  })),
}));

import { buildEnabledDeckSession, getEnabledDeckPracticeCount, areEnabledDecksClear } from './enabledDeckSession';
import { loadCardState } from './storage';

const mockLoadCardState = loadCardState as jest.MockedFunction<typeof loadCardState>;

describe('enabledDeckSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCardState.mockReturnValue(null);
  });

  it('fills a screen-time requirement across enabled decks without interleaving', () => {
    const session = buildEnabledDeckSession({
      newWordBudget: 5,
      sourceApp: 'Instagram',
      bypassIntroCap: true,
      maxCards: 5,
    });

    expect(session.map((sc) => sc.card.id)).toEqual([
      'deck-a:a1',
      'deck-a:a2',
      'deck-b:b1',
      'deck-b:b2',
      'deck-b:b3',
    ]);
  });

  it('reports practice count across all enabled decks', () => {
    expect(getEnabledDeckPracticeCount()).toBe(6);
  });

  it('is clear only when no enabled deck can produce practice cards', () => {
    expect(areEnabledDecksClear()).toBe(false);
    mockLoadCardState.mockReturnValue({ cardId: 'x', due: new Date(Date.now() + 86_400_000).toISOString() } as any);
    expect(areEnabledDecksClear()).toBe(true);
  });
});
