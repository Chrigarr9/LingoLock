import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { AVAILABLE_BUNDLES, getBundle } from '../content/bundles';
import { loadActiveBundle } from '../services/storage';
import { getCardsDueCount } from '../services/statsService';

interface BundlePickerProps {
  visible: boolean;
  onClose: () => void;
  onBundleChanged: (bundleId: string) => void;
}

export function BundlePicker({ visible, onClose, onBundleChanged }: BundlePickerProps) {
  const theme = useTheme();
  const activeBundleId = loadActiveBundle();

  const handleSelect = (bundleId: string) => {
    onBundleChanged(bundleId);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Language Pair</Text>

          {AVAILABLE_BUNDLES.map((bundle) => {
            const isActive = bundle.id === activeBundleId;
            const dueCount = getCardsDueCount(getBundle(bundle.id).chapters);
            return (
              <TouchableOpacity
                key={bundle.id}
                style={[styles.row, isActive && { backgroundColor: theme.colors.primaryContainer }]}
                onPress={() => handleSelect(bundle.id)}
              >
                <View>
                  <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                    {bundle.displayLabel}
                  </Text>
                  {isActive && (
                    <Text style={[styles.active, { color: theme.colors.primary }]}>Active</Text>
                  )}
                </View>
                <Text style={[styles.due, { color: theme.colors.onSurfaceVariant }]}>
                  {dueCount} due
                </Text>
              </TouchableOpacity>
            );
          })}

          <View style={[styles.row, styles.disabledRow]}>
            <Text style={{ color: '#999' }}>
              + Download more (coming soon)
            </Text>
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
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
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
});
