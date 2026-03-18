import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { BundleConfig } from '../types/bundle';
import type { ChapterData } from '../types/vocabulary';
import { getBundle } from './bundles';
import { loadActiveBundle, saveActiveBundle, migrateCardIdsToNamespaced } from '../services/storage';

// Run migration at module load (synchronous, before any component renders)
migrateCardIdsToNamespaced();

interface ActiveBundleContextValue {
  config: BundleConfig;
  chapters: ChapterData[];
  cardImages: Record<string, number>;
  cardAudios: Record<string, number>;
  /** Switch the active bundle (triggers re-render) */
  switchBundle: (bundleId: string) => void;
}

const ActiveBundleContext = createContext<ActiveBundleContextValue | null>(null);

export function ActiveBundleProvider({ children }: { children: React.ReactNode }) {
  const [bundleId, setBundleId] = useState(() => loadActiveBundle());

  const switchBundle = useCallback((newBundleId: string) => {
    saveActiveBundle(newBundleId);
    setBundleId(newBundleId);
  }, []);

  const value = useMemo(() => {
    const bundle = getBundle(bundleId);
    return {
      config: bundle.config,
      chapters: bundle.chapters,
      cardImages: bundle.cardImages,
      cardAudios: bundle.cardAudios,
      switchBundle,
    };
  }, [bundleId, switchBundle]);

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
