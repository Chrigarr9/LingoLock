import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import type { BundleConfig } from '../types/bundle';
import type { ChapterData } from '../types/vocabulary';
import type { SimpleCard } from '../types/simpleCard';
import { getBundle, registerImportedBundle } from './bundles';
import { loadActiveBundle, saveActiveBundle, migrateCardIdsToNamespaced } from '../services/storage';
import { getImportedDecks, loadImportedDeckCards } from '../services/importedDeckStore';

// Run migration at module load (synchronous, before any component renders)
migrateCardIdsToNamespaced();

interface ActiveBundleContextValue {
  config: BundleConfig;
  chapters: ChapterData[];
  simpleCards: SimpleCard[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
  /** Switch the active bundle (triggers re-render) */
  switchBundle: (bundleId: string) => void;
}

const ActiveBundleContext = createContext<ActiveBundleContextValue | null>(null);

export function ActiveBundleProvider({ children }: { children: React.ReactNode }) {
  const [bundleId, setBundleId] = useState(() => loadActiveBundle());
  const [importedLoaded, setImportedLoaded] = useState(false);

  // Load imported decks into memory on app start
  useEffect(() => {
    async function loadImported() {
      const metas = getImportedDecks();
      for (const meta of metas) {
        try {
          const cards = await loadImportedDeckCards(meta.id);
          registerImportedBundle(meta.id, {
            config: {
              id: meta.id,
              type: 'imported',
              nativeLanguage: '',
              targetLanguage: '',
              displayLabel: meta.name,
              greetings: { morning: '', afternoon: '', evening: '' },
              motivational: { perfect: '', great: '', good: '', encouragement: '' },
              spellCharacters: [],
              searchPlaceholder: '',
              cardCount: meta.cardCount,
              importedAt: meta.importedAt,
            },
            chapters: [],
            simpleCards: cards,
            cardImages: {},
            cardAudios: {},
          });
        } catch (error) {
          console.error(`[ActiveBundle] Failed to load imported deck ${meta.id}:`, error);
        }
      }
      setImportedLoaded(true);
    }
    loadImported();
  }, []);

  const switchBundle = useCallback((newBundleId: string) => {
    saveActiveBundle(newBundleId);
    setBundleId(newBundleId);
  }, []);

  const value = useMemo(() => {
    const bundle = getBundle(bundleId);
    return {
      config: bundle.config,
      chapters: bundle.chapters,
      simpleCards: bundle.simpleCards,
      cardImages: bundle.cardImages,
      cardAudios: bundle.cardAudios,
      switchBundle,
    };
  }, [bundleId, switchBundle, importedLoaded]);

  return (
    <ActiveBundleContext.Provider value={value}>
      {children}
    </ActiveBundleContext.Provider>
  );
}

export function useActiveBundle(): ActiveBundleContextValue {
  const ctx = useContext(ActiveBundleContext);
  if (!ctx) throw new Error('useActiveBundle must be used within ActiveBundleProvider');
  return ctx;
}
