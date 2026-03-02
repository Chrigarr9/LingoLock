import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ProgressBar } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface StatsCardProps {
  streak: number;
  progressPercent: number;
  cardsDue: number;
}

export function StatsCard({ streak, progressPercent, cardsDue }: StatsCardProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.custom.cardBackground,
          borderColor: theme.custom.cardBorder,
        },
      ]}
    >
      <View style={styles.streakRow}>
        <Text
          variant="headlineMedium"
          style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.5 }}
        >
          {streak}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, marginLeft: 6 }}
        >
          day streak {streak > 0 ? '\uD83D\uDD25' : ''}
        </Text>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Progress
          </Text>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
            {progressPercent}%
          </Text>
        </View>
        <ProgressBar
          progress={progressPercent / 100}
          color={theme.colors.primary}
          style={[styles.progressBar, { backgroundColor: theme.colors.surfaceVariant }]}
        />
      </View>

      <View style={[styles.dueRow, { borderTopColor: theme.custom.separator }]}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Cards due today
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurface, fontWeight: '600' }}
        >
          {cardsDue}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    padding: 16,
    paddingBottom: 12,
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  dueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
