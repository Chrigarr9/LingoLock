import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAvailableBundles, getBundle } from '../content/bundles';
import { loadActiveBundle } from '../services/storage';
import { getCardsDueCount } from '../services/statsService';
import { useApkgImport } from '../hooks/useApkgImport';
import { useAppTheme, getGlassStyle } from '../theme';
import type { BundleConfig } from '../types/bundle';

interface BundlePickerProps {
  visible: boolean;
  onClose: () => void;
  onBundleChanged: (bundleId: string) => void;
}

export function BundlePicker({ visible, onClose, onBundleChanged }: BundlePickerProps) {
  const theme = useAppTheme();
  const glassStyle = getGlassStyle(theme);
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
        <View style={styles.sheetContainer}>
          <Animated.View
            style={[
              styles.sheet,
              glassStyle,
              {
                paddingBottom: Math.max(20, insets.bottom),
                transform: [
                  {
                    translateY: slideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text
              variant="labelSmall"
              style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Choose Deck
            </Text>

            {bundles.map((bundle, index) => {
              const isActive = bundle.id === activeBundleId;
              const isImported = bundle.type === 'imported';

              return (
                <TouchableOpacity
                  key={bundle.id}
                  style={[
                    styles.row,
                    isActive && { backgroundColor: theme.colors.primaryContainer },
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.custom.separator },
                  ]}
                  onPress={() => handleSelect(bundle.id)}
                  onLongPress={isImported ? () => onDeleteDeck(bundle) : undefined}
                >
                  <View style={styles.header}>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isActive
                            ? theme.colors.primary + '30'
                            : theme.colors.primary + '18',
                        },
                      ]}
                    >
                      <Text
                        variant="labelMedium"
                        style={{ color: theme.colors.primary, fontWeight: '700' }}
                      >
                        {bundle.displayLabel.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.textContent}>
                      <Text
                        variant="titleSmall"
                        style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                      >
                        {bundle.displayLabel}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18, marginTop: 2 }}
                      >
                        {isActive && isImported
                          ? `Active · ${bundle.cardCount ?? 0} cards · Imported`
                          : isActive
                            ? `Active · ${getDueCount(bundle)} due`
                            : isImported
                              ? `${bundle.cardCount ?? 0} cards · Imported`
                              : `${getDueCount(bundle)} due`}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.custom.separator }}>
              {importing ? (
                <View style={[styles.row, styles.importingRow]}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {importProgress}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.row} onPress={onImport}>
                  <Text
                    variant="titleSmall"
                    style={{ color: theme.colors.primary, fontWeight: '500' }}
                  >
                    + Import your own deck
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.row, styles.disabledRow]} disabled>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  + Download more (coming soon)
                </Text>
              </TouchableOpacity>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 20,
    width: '100%',
    ...(Platform.OS === 'web' ? { maxWidth: 480 } : {}),
  },
  sectionTitle: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  textContent: {
    flex: 1,
  },
  disabledRow: {
    opacity: 0.4,
  },
  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
