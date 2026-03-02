import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface StatRowProps {
  label: string;
  value: string;
}

export function StatRow({ label, value }: StatRowProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.row}>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {label}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
});
