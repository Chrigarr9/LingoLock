import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useAppTheme } from '../theme';
import { openSourceApp } from '../utils/deepLinkOpener';

interface ContinueButtonProps {
  sourceApp: string;
  onBeforeOpen?: () => void;
}

export function ContinueButton({ sourceApp, onBeforeOpen }: ContinueButtonProps) {
  const theme = useAppTheme();
  const [isOpening, setIsOpening] = useState(false);

  const handlePress = async () => {
    setIsOpening(true);
    onBeforeOpen?.();
    await openSourceApp(sourceApp);
    setIsOpening(false);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isOpening}
      style={[styles.button, { backgroundColor: theme.colors.surfaceVariant }]}
      accessibilityLabel={`Continue to ${sourceApp}`}
      accessibilityRole="button"
    >
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>
        {isOpening ? 'Opening...' : `Continue to ${sourceApp}`}
      </Text>
      <Icon source="arrow-right" size={18} color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 20,
    alignSelf: 'stretch',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
