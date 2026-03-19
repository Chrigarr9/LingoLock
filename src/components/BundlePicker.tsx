import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Platform, Animated } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAvailableBundles, getBundle } from '../content/bundles';
import { loadActiveBundle } from '../services/storage';
import { getCardsDueCount } from '../services/statsService';
import { useApkgImport } from '../hooks/useApkgImport';
import type { BundleConfig } from '../types/bundle';

interface BundlePickerProps {
  visible: boolean;
  onClose: () => void;
  onBundleChanged: (bundleId: string) => void;
}

export function BundlePicker({ visible, onClose, onBundleChanged }: BundlePickerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const activeBundleId = loadActiveBundle();
  const [refreshKey, setRefreshKey] = useState(0);
  const { importing, importProgress, handleImport, confirmDeleteDeck } = useApkgImport();

  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [visible]);

  const bundles = getAvailableBundles();

  const handleSelect = (bundleId: string) => {
    onBundleChanged(bundleId);
    onClose();
  };

  const onImport = () => {
    handleImport((deckId) => {
      onBundleChanged(deckId);
      setRefreshKey((k) => k + 1);
      onClose();
    });
  };

  const onDeleteDeck = (bundle: BundleConfig) => {
    confirmDeleteDeck(bundle.id, bundle.displayLabel, {
      activeBundleId,
      onDeleted: (fallbackId) => {
        if (fallbackId) onBundleChanged(fallbackId);
        setRefreshKey((k) => k + 1);
      },
    });
  };

  const getDueCount = (bundle: BundleConfig): number => {
    try {
      return getCardsDueCount(getBundle(bundle.id).chapters);
    } catch {
      return 0;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={[styles.sheetContainer]}>
        <Animated.View style={[styles.sheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(20, insets.bottom), transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }) }] }]}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Decks</Text>

          {bundles.map((bundle) => {
            const isActive = bundle.id === activeBundleId;
            const isImported = bundle.type === 'imported';

            return (
              <TouchableOpacity
                key={bundle.id}
                style={[styles.row, isActive && { backgroundColor: theme.colors.primaryContainer }]}
                onPress={() => handleSelect(bundle.id)}
                onLongPress={isImported ? () => onDeleteDeck(bundle) : undefined}
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
            <TouchableOpacity style={styles.row} onPress={onImport}>
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
        </Animated.View>
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
    paddingBottom: 20,
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
