import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button } from 'react-native-paper';
import { openSourceApp } from '../utils/deepLinkOpener';

interface ContinueButtonProps {
  sourceApp: string;
  challengeType: 'unlock' | 'app_open';
  onPress?: () => void;
}

export function ContinueButton({ sourceApp, challengeType, onPress }: ContinueButtonProps) {
  const [isOpening, setIsOpening] = useState(false);

  const handlePress = async () => {
    onPress?.();

    if (challengeType === 'unlock') {
      Alert.alert(
        'Challenge Complete!',
        'You can now return to your home screen and access your apps.',
        [{ text: 'OK', style: 'default' }],
      );
      return;
    }

    setIsOpening(true);
    const result = await openSourceApp(sourceApp);
    setIsOpening(false);

    if (!result.success) {
      Alert.alert(
        'Cannot Open App',
        result.error || `Unable to open ${sourceApp}. Please open it manually.`,
        [{ text: 'OK', style: 'default' }],
      );
    }
  };

  return (
    <Button
      mode="contained"
      onPress={handlePress}
      disabled={isOpening}
      loading={isOpening}
      style={{ borderRadius: 20 }}
      contentStyle={{ paddingVertical: 8 }}
      labelStyle={{ fontSize: 16, fontWeight: '600', letterSpacing: 0 }}
      accessibilityLabel={`Continue to ${sourceApp}`}
      accessibilityHint={`Opens ${sourceApp}`}
    >
      {isOpening ? 'Opening...' : `Open ${sourceApp}`}
    </Button>
  );
}
