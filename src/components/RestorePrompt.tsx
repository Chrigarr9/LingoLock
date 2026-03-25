/**
 * RestorePrompt — shown on fresh install when a Keychain backup is found.
 * User can restore progress or start fresh.
 */
import React, { useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';

import type { BackupMeta } from '../services/backupService';

interface Props {
  visible: boolean;
  meta: BackupMeta;
  onRestore: () => Promise<void>;
  onStartFresh: () => void;
}

export function RestorePrompt({ visible, meta, onRestore, onStartFresh }: Props) {
  const theme = useTheme();
  const [restoring, setRestoring] = useState(false);

  const formattedDate = new Date(meta.ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await onRestore();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
            Welcome back!
          </Text>

          <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
            We found your previous progress (saved {formattedDate}).
          </Text>

          <View style={styles.stats}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {'\u2022'} {meta.cardCount} cards reviewed
            </Text>
            {meta.importedDecks.length > 0 && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {'\u2022'} Imported decks: {meta.importedDecks.map(d => d.name).join(', ')}
              </Text>
            )}
          </View>

          <Button
            mode="contained"
            onPress={handleRestore}
            loading={restoring}
            disabled={restoring}
            style={styles.button}
          >
            Restore Progress
          </Button>

          <Button
            mode="text"
            onPress={onStartFresh}
            disabled={restoring}
            style={styles.button}
          >
            Start Fresh
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    elevation: 4,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    textAlign: 'center',
    marginBottom: 16,
  },
  stats: {
    marginBottom: 24,
    gap: 4,
  },
  button: {
    marginBottom: 8,
  },
});
