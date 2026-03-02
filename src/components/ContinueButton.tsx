/**
 * ContinueButton component - Returns user to source app after challenge completion
 * iOS-native button design that attempts to open the source app via deep link
 */

import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, useColorScheme, Alert } from 'react-native';
import { openSourceApp } from '../utils/deepLinkOpener';

interface ContinueButtonProps {
  /** Name of the source app to return to (e.g., "Instagram") */
  sourceApp: string;

  /** Type of challenge that was completed */
  challengeType: 'unlock' | 'app_open';

  /** Optional callback when button is pressed (before opening deep link) */
  onPress?: () => void;
}

/**
 * Button that returns user to the source app after completing a challenge
 *
 * Behavior:
 * - For 'app_open' type: Attempts to open source app via deep link
 * - For 'unlock' type: Shows message to manually return to home screen
 * - Shows error alert if deep link fails (app not installed, etc.)
 *
 * Design:
 * - iOS-native button style (rounded, filled, system colors)
 * - Prominent placement (primary action after challenge)
 * - Clear label: "Continue to [App Name]"
 * - Automatic dark mode adaptation
 */
export function ContinueButton({ sourceApp, challengeType, onPress }: ContinueButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [isOpening, setIsOpening] = useState(false);

  const handlePress = async () => {
    // Call optional callback first
    onPress?.();

    // For unlock type, show instructional message instead of opening deep link
    if (challengeType === 'unlock') {
      Alert.alert(
        'Challenge Complete!',
        'You can now return to your home screen and access your apps.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    // For app_open type, attempt to open the source app
    setIsOpening(true);
    console.log(`[ContinueButton] Attempting to open: ${sourceApp}`);

    const result = await openSourceApp(sourceApp);

    setIsOpening(false);

    if (!result.success) {
      // Show error alert if deep link failed
      Alert.alert(
        'Cannot Open App',
        result.error || `Unable to open ${sourceApp}. Please open it manually.`,
        [{ text: 'OK', style: 'default' }]
      );
      console.error('[ContinueButton] Failed to open app:', result);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: isDark ? '#0a84ff' : '#007aff' },  // iOS system blue
        isOpening && styles.buttonDisabled
      ]}
      onPress={handlePress}
      disabled={isOpening}
      activeOpacity={0.7}
      accessibilityLabel={`Continue to ${sourceApp}`}
      accessibilityRole="button"
      accessibilityHint={`Opens ${sourceApp}`}
    >
      <Text style={styles.buttonText}>
        {isOpening ? 'Opening...' : `Continue to ${sourceApp}`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'System',
  },
});
