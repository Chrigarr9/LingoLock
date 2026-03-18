import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { getAvailableBundles, getBundle, registerImportedBundle, unregisterImportedBundle } from '../content/bundles';
import { loadActiveBundle, cardStorage } from '../services/storage';
import { getCardsDueCount } from '../services/statsService';
import { importApkg } from '../services/apkgImporter';
import { removeImportedDeck, loadImportedDeckCards } from '../services/importedDeckStore';
import type { BundleConfig, Bundle } from '../types/bundle';

interface BundlePickerProps {
  visible: boolean;
  onClose: () => void;
  onBundleChanged: (bundleId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BundlePicker({ visible, onClose, onBundleChanged }: BundlePickerProps) {
  const theme = useTheme();
  const activeBundleId = loadActiveBundle();
  const [refreshKey, setRefreshKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const bundles = getAvailableBundles();

  const handleSelect = (bundleId: string) => {
    onBundleChanged(bundleId);
    onClose();
  };

  const pickFileWeb = (): Promise<{ uri: string; name: string } | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.apkg';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) { resolve(null); return; }
        resolve({ uri: URL.createObjectURL(f), name: f.name });
      };
      input.click();
    });
  };

  const handleImport = async () => {
    try {
      let fileUri: string;
      let fileName: string;

      if (Platform.OS === 'web') {
        const picked = await pickFileWeb();
        if (!picked) return;
        fileUri = picked.uri;
        fileName = picked.name;
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;
        fileUri = result.assets[0].uri;
        fileName = result.assets[0].name ?? '';
      }

      if (!fileName.toLowerCase().endsWith('.apkg')) {
        Alert.alert('Invalid file', 'Please select an .apkg file (Anki deck).');
        return;
      }

      setImporting(true);
      setImportProgress('Starting import...');

      const meta = await importApkg(fileUri, (stage, _pct) => {
        setImportProgress(stage);
      });

      // Load cards into memory and register the bundle
      const cards = await loadImportedDeckCards(meta.id);
      const bundle: Bundle = {
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
      };
      registerImportedBundle(meta.id, bundle);

      // Switch to the newly imported deck
      onBundleChanged(meta.id);
      setRefreshKey((k) => k + 1);
      setImporting(false);
      setImportProgress('');
      onClose();
    } catch (error) {
      setImporting(false);
      setImportProgress('');
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : 'An unknown error occurred.',
      );
    }
  };

  const handleDeleteDeck = (bundle: BundleConfig) => {
    Alert.alert(
      'Delete deck',
      `Remove "${bundle.displayLabel}" and all its progress? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Delete FSRS card states for this deck
            const allKeys = cardStorage.getAllKeys();
            const prefix = `${bundle.id}:`;
            for (const key of allKeys) {
              if (key.startsWith(prefix)) {
                cardStorage.remove(key);
              }
            }

            // Unregister from runtime cache and remove from disk/MMKV
            unregisterImportedBundle(bundle.id);
            removeImportedDeck(bundle.id);

            // If the deleted deck was active, fall back to default
            if (bundle.id === activeBundleId) {
              onBundleChanged('es-de-buenos-aires');
            }

            setRefreshKey((k) => k + 1);
          },
        },
      ],
    );
  };

  const getDueCount = (bundle: BundleConfig): number => {
    try {
      return getCardsDueCount(getBundle(bundle.id).chapters);
    } catch {
      return 0;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={[styles.sheetContainer]}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Decks</Text>

          {bundles.map((bundle) => {
            const isActive = bundle.id === activeBundleId;
            const isImported = bundle.type === 'imported';

            return (
              <TouchableOpacity
                key={bundle.id}
                style={[styles.row, isActive && { backgroundColor: theme.colors.primaryContainer }]}
                onPress={() => handleSelect(bundle.id)}
                onLongPress={isImported ? () => handleDeleteDeck(bundle) : undefined}
              >
                <View style={styles.labelContainer}>
                  <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                    {bundle.displayLabel}
                  </Text>
                  {isActive && (
                    <Text style={[styles.active, { color: theme.colors.primary }]}>Active</Text>
                  )}
                </View>
                <Text style={[styles.due, { color: theme.colors.onSurfaceVariant }]}>
                  {isImported
                    ? `${bundle.cardCount ?? 0} cards \u00B7 Imported`
                    : `${getDueCount(bundle)} due`}
                </Text>
              </TouchableOpacity>
            );
          })}

          {importing ? (
            <View style={[styles.row, styles.importingRow]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.importProgress, { color: theme.colors.onSurfaceVariant }]}>
                {importProgress}
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.row} onPress={handleImport}>
              <Text style={{ color: theme.colors.primary, fontWeight: '500' }}>
                + Import your own deck
              </Text>
            </TouchableOpacity>
          )}

          <View style={[styles.row, styles.disabledRow]}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              + Download more (coming soon)
            </Text>
          </View>
        </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    width: '100%',
    alignItems: 'center',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    ...(Platform.OS === 'web' ? { maxWidth: 480 } : {}),
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  labelContainer: {
    flexShrink: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  active: {
    fontSize: 12,
    marginTop: 2,
  },
  due: {
    fontSize: 14,
  },
  disabledRow: {
    opacity: 0.4,
  },
  importingRow: {
    justifyContent: 'flex-start',
    gap: 12,
  },
  importProgress: {
    fontSize: 14,
  },
});
