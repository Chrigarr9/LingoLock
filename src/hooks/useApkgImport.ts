/**
 * useApkgImport — shared hook for .apkg deck import and deletion.
 *
 * Encapsulates the full import flow (file picking, validation, import,
 * bundle registration) and deck deletion logic used by both BundlePicker
 * and Settings screens.
 */
import { useState } from 'react';
import { Platform, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { importApkg } from '../services/apkgImporter';
import { loadImportedDeckCards, removeImportedDeck } from '../services/importedDeckStore';
import { registerImportedBundle, unregisterImportedBundle, createImportedBundle } from '../content/bundles';
import { cardStorage } from '../services/storage';
import { DEFAULT_BUNDLE_ID } from '../services/storage';

// ---------------------------------------------------------------------------
// File picking (platform-specific)
// ---------------------------------------------------------------------------

function pickFileWeb(): Promise<{ uri: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.apkg';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve({ uri: URL.createObjectURL(file), name: file.name });
    };
    // Resolve null when user cancels the file dialog
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

async function pickFile(): Promise<{ uri: string; name: string } | null> {
  if (Platform.OS === 'web') {
    return pickFileWeb();
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  return { uri: result.assets[0].uri, name: result.assets[0].name ?? '' };
}

// ---------------------------------------------------------------------------
// Deck deletion utility
// ---------------------------------------------------------------------------

/**
 * Delete an imported deck: remove FSRS card states, unregister from runtime
 * cache, remove from persistent storage.
 */
export function deleteImportedDeckData(deckId: string): void {
  // Remove FSRS card states for this deck
  const allKeys = cardStorage.getAllKeys();
  const prefix = `${deckId}:`;
  for (const key of allKeys) {
    if (key.startsWith(prefix)) {
      cardStorage.remove(key);
    }
  }

  // Unregister from runtime cache and remove from disk/storage
  unregisterImportedBundle(deckId);
  removeImportedDeck(deckId);
}

// ---------------------------------------------------------------------------
// Import hook
// ---------------------------------------------------------------------------

interface UseApkgImportResult {
  importing: boolean;
  importProgress: string;
  handleImport: (onSuccess: (deckId: string) => void) => Promise<void>;
  confirmDeleteDeck: (
    deckId: string,
    displayLabel: string,
    opts: { activeBundleId: string; onDeleted: (fallbackId?: string) => void },
  ) => void;
}

export function useApkgImport(): UseApkgImportResult {
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const handleImport = async (onSuccess: (deckId: string) => void) => {
    try {
      const picked = await pickFile();
      if (!picked) return;

      if (!picked.name.toLowerCase().endsWith('.apkg')) {
        Alert.alert('Invalid file', 'Please select an .apkg file (Anki deck).');
        return;
      }

      setImporting(true);
      setImportProgress('Starting import...');

      const meta = await importApkg(picked.uri, (stage) => {
        setImportProgress(stage);
      });

      setImportProgress('Loading cards...');
      const cards = await loadImportedDeckCards(meta.id);
      registerImportedBundle(meta.id, createImportedBundle(meta, cards));

      setImporting(false);
      setImportProgress('');
      onSuccess(meta.id);
    } catch (error) {
      setImporting(false);
      setImportProgress('');
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : 'An unknown error occurred.',
      );
    }
  };

  const confirmDeleteDeck = (
    deckId: string,
    displayLabel: string,
    opts: { activeBundleId: string; onDeleted: (fallbackId?: string) => void },
  ) => {
    const doDelete = () => {
      deleteImportedDeckData(deckId);
      // If the deleted deck was active, fall back to default
      const fallback = deckId === opts.activeBundleId ? DEFAULT_BUNDLE_ID : undefined;
      opts.onDeleted(fallback);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${displayLabel}" and all its data from this device?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Deck',
        `Remove "${displayLabel}" and all its data from this device?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  };

  return { importing, importProgress, handleImport, confirmDeleteDeck };
}
