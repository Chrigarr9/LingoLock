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
      <View style={styles.track}>
        {Array.from({ length: total }, (_, i) => {
          const isActive = i === current && !results?.[i];
          let backgroundColor: string;
          if (results?.[i] === 'correct') {
            backgroundColor = theme.custom.success;
          } else if (results?.[i] === 'incorrect') {
            backgroundColor = theme.colors.error;
          } else if (isActive) {
            backgroundColor = theme.colors.primary;
          } else {
            backgroundColor = theme.colors.outline;
          }

          return (
            <View
              key={i}
              style={[
                styles.segment,
                { backgroundColor, flex: 1 },
                isActive && { opacity: 1 },
                !isActive && !results?.[i] && { opacity: 0.4 },
              ]}
            />
          );
        })}
      </View>
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.5 }}
      >
        {current + 1} / {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 40,
    gap: 8,
  },
  track: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    maxWidth: 200,
  },
  segment: {
    height: 3,
    borderRadius: 1.5,
  },
});
