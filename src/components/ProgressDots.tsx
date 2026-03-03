import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../theme';

interface ProgressDotsProps {
  total: number;
  current: number;
  results?: ('correct' | 'incorrect' | null)[];
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  const theme = useAppTheme();
  const progress = total > 0 ? current / total : 0;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.track,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              backgroundColor: theme.colors.primary,
              opacity: 0.6,
              width: `${Math.round(progress * 100)}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
