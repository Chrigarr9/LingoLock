import { buildSession } from './cardSelector';
import { loadEnabledBundles, loadNewWordsPerDay } from './storage';
import { getBundle } from '../content/bundles';
import type { ChapterData, SessionCard } from '../types/vocabulary';

export interface EnabledDeckSessionOptions {
  newWordBudget?: number;
  sourceApp?: string;
  bypassIntroCap?: boolean;
  maxCards?: number;
}

function getEnabledChapters(): ChapterData[][] {
  return loadEnabledBundles()
    .map((bundleId) => {
      const bundle = getBundle(bundleId);
      if (bundle.config.id !== bundleId) return null;
      return bundle.chapters;
    })
    .filter((chapters): chapters is ChapterData[] => chapters !== null);
}

export function buildEnabledDeckSession(options: EnabledDeckSessionOptions = {}): SessionCard[] {
  const maxCards = options.maxCards ?? Infinity;
  const result: SessionCard[] = [];
  let remainingNewBudget = options.newWordBudget ?? loadNewWordsPerDay();

  for (const chapters of getEnabledChapters()) {
    if (result.length >= maxCards) break;
    const remainingCards = maxCards - result.length;
    const deckSession = buildSession(
      chapters,
      remainingNewBudget,
      options.sourceApp,
      options.bypassIntroCap ?? false,
    ).slice(0, remainingCards);
    result.push(...deckSession);
    const introducedNew = deckSession.filter((sc) => sc.isFirstEncounter).length;
    remainingNewBudget = Math.max(0, remainingNewBudget - introducedNew);
  }

  return result;
}

export function getNewlyDueEnabledCards(excludeIds: Set<string>): SessionCard[] {
  const result: SessionCard[] = [];
  for (const chapters of getEnabledChapters()) {
    const deckSession = buildSession(chapters, 0).filter((sc) => !excludeIds.has(sc.card.id));
    result.push(...deckSession);
  }
  return result;
}

export function getEnabledDeckPracticeCount(): number {
  return buildEnabledDeckSession({ newWordBudget: loadNewWordsPerDay() }).length;
}

export function areEnabledDecksClear(): boolean {
  return buildEnabledDeckSession({ newWordBudget: Infinity, bypassIntroCap: true, maxCards: 1 }).length === 0;
}
