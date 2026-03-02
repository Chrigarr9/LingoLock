import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface ProgressDotsProps {
  total: number;
  current: number;
  results?: ('correct' | 'incorrect' | null)[];
}

export function ProgressDots({ total, current, results }: ProgressDotsProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => {
          let backgroundColor: string;
          if (results?.[i] === 'correct') {
            backgroundColor = theme.custom.success;
          } else if (results?.[i] === 'incorrect') {
            backgroundColor = theme.colors.error;
          } else if (i === current) {
            backgroundColor = theme.colors.primary;
          } else {
            backgroundColor = theme.colors.surfaceVariant;
          }

          return (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor },
                i === current && !results?.[i] && styles.activeDot,
              ]}
            />
          );
        })}
      </View>
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        card {current + 1} of {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
