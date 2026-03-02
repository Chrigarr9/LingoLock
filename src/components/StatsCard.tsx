import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface, Text, ProgressBar } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface StatsCardProps {
  streak: number;
  progressPercent: number;
  cardsDue: number;
}

export function StatsCard({ streak, progressPercent, cardsDue }: StatsCardProps) {
  const theme = useAppTheme();

  return (
    <Surface style={styles.surface} elevation={1}>
      <View style={styles.streakRow}>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
          {streak > 0 ? '\uD83D\uDD25' : '\u2744\uFE0F'} {streak}-day streak
        </Text>
      </View>
      <View style={styles.progressRow}>
        <ProgressBar
          progress={progressPercent / 100}
          color={theme.colors.primary}
          style={styles.progressBar}
        />
        <Text
          variant="labelSmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {progressPercent}%
        </Text>
      </View>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {cardsDue} cards due today
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
});
