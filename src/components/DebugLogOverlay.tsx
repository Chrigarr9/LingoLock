import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, ScrollView, StyleSheet, Pressable, Share } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLogEntries, subscribeLog, clearLog, type LogEntry } from '../services/debugLog';
import { useAppTheme } from '../theme';

interface DebugLogOverlayProps {
  visible: boolean;
  onClose: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function DebugLogOverlay({ visible, onClose }: DebugLogOverlayProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<LogEntry[]>(getLogEntries());

  useEffect(() => {
    return subscribeLog(() => setEntries(getLogEntries()));
  }, []);

  const handleShare = useCallback(async () => {
    const text = entries
      .map((e) => `${formatTime(e.ts)}  [${e.tag}]  ${e.message}`)
      .join('\n');
    try {
      await Share.share({ message: text || '(no entries)' });
    } catch {
      // user cancelled
    }
  }, [entries]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
            Debug Log ({entries.length})
          </Text>
          <View style={styles.headerActions}>
            <Pressable onPress={handleShare} style={[styles.btn, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: '600' }}>Share</Text>
            </Pressable>
            <Pressable onPress={clearLog} style={[styles.btn, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: '600' }}>Clear</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[styles.btn, { backgroundColor: theme.colors.primary }]}>
              <Text style={{ color: theme.colors.onPrimary, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
        >
          {entries.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic' }}>
              No log entries yet.
            </Text>
          ) : (
            entries.map((e, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.timestamp, { color: theme.colors.onSurfaceVariant }]}>
                  {formatTime(e.ts)}
                </Text>
                <Text style={[styles.tag, { color: theme.custom.brandBlue }]}>
                  [{e.tag}]
                </Text>
                <Text style={[styles.message, { color: theme.colors.onSurface }]} selectable>
                  {e.message}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  headerActions: { flexDirection: 'row', gap: 6 },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 4, gap: 4 },
  row: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  timestamp: { fontFamily: 'Courier', fontSize: 11, minWidth: 88 },
  tag: { fontFamily: 'Courier', fontSize: 11, fontWeight: '700' },
  message: { fontFamily: 'Courier', fontSize: 11, flex: 1, flexWrap: 'wrap' },
});
