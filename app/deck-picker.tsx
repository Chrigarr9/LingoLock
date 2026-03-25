import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, getGlassStyle, getCardStyle } from '../src/theme';
import { useActiveBundle } from '../src/content/activeBundleProvider';
import { getAvailableBundles, getBundle } from '../src/content/bundles';
import { loadActiveBundle } from '../src/services/storage';
import { getCardsDueCount } from '../src/services/statsService';
import { useApkgImport } from '../src/hooks/useApkgImport';
import type { BundleConfig } from '../src/types/bundle';

export default function DeckPickerScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const glassStyle = getGlassStyle(theme);
  const cardStyle = getCardStyle(theme);
  const { switchBundle } = useActiveBundle();
  const activeBundleId = loadActiveBundle();
  const bundles = getAvailableBundles();
  const { importing, importProgress, handleImport, confirmDeleteDeck } = useApkgImport();

  const getDueCount = (bundle: BundleConfig): number => {
    try {
      return getCardsDueCount(getBundle(bundle.id).chapters);
    } catch (err) {
      console.error(`[DeckPicker] Failed to get due count for "${bundle.id}":`, err);
      return 0;
    }
  };

  const handleSelect = (bundleId: string) => {
    switchBundle(bundleId);
    router.back();
  };

  const onImport = () => {
    handleImport((deckId) => {
      switchBundle(deckId);
      router.back();
    });
  };

  const onDeleteDeck = (bundle: BundleConfig) => {
    confirmDeleteDeck(bundle.id, bundle.displayLabel, {
      activeBundleId,
      onDeleted: (fallbackId) => {
        if (fallbackId) switchBundle(fallbackId);
      },
    });
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Switch between your vocabulary decks
        </Text>

        <View style={[styles.section, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            Your Decks
          </Text>

          {bundles.map((bundle, index) => {
            const isActive = bundle.id === activeBundleId;
            const isImported = bundle.type === 'imported';
            const dueCount = isImported ? null : getDueCount(bundle);

            return (
              <TouchableOpacity
                key={bundle.id}
                style={[
                  styles.deckRow,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.custom.separator },
                  isActive && { backgroundColor: theme.colors.primaryContainer, borderRadius: 14, marginHorizontal: -12, paddingHorizontal: 12 },
                ]}
                onPress={() => handleSelect(bundle.id)}
                onLongPress={isImported ? () => onDeleteDeck(bundle) : undefined}
              >
                <View style={styles.deckInfo}>
                  <Text
                    variant="titleMedium"
                    style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                  >
                    {bundle.displayLabel}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
                  >
                    {isImported
                      ? `${bundle.cardCount ?? 0} cards · Imported`
                      : `${dueCount} cards due`}
                  </Text>
                </View>
                {isActive && (
                  <View style={[styles.activeBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.primary, fontWeight: '700' }}
                    >
                      Active
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.section, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            Add Decks
          </Text>

          {importing ? (
            <View style={styles.importingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {importProgress}
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.actionRow} onPress={onImport}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.primary, fontWeight: '600' }}
              >
                + Import your own deck
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
              >
                Import an .apkg file from Anki
              </Text>
            </TouchableOpacity>
          )}

          <View style={[styles.actionRow, styles.disabledRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.custom.separator }]}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              + Download more
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
            >
              Coming soon
            </Text>
          </View>
        </View>

        {Platform.OS !== 'web' && (
          <Text
            variant="bodySmall"
            style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
          >
            Long-press an imported deck to delete it
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  deckInfo: {
    flex: 1,
  },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 12,
  },
  actionRow: {
    paddingVertical: 16,
  },
  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  disabledRow: {
    opacity: 0.4,
  },
  hint: {
    textAlign: 'center',
    marginTop: 4,
  },
});
