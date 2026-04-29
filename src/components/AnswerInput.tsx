import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface AnswerInputProps {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Hide the Check button (e.g. when keyboard is open — Enter key submits) */
  hideButton?: boolean;
}

export function AnswerInput({
  onSubmit,
  disabled = false,
  placeholder = 'Type your answer...',
  hideButton = false,
}: AnswerInputProps) {
  const [answer, setAnswer] = useState('');
  const theme = useAppTheme();

  const handleSubmit = () => {
    onSubmit(answer);
    setAnswer('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        mode="outlined"
        value={answer}
        onChangeText={setAnswer}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        disabled={disabled}
        style={styles.input}
        outlineStyle={{ borderRadius: 20 }}
        activeOutlineColor={theme.colors.primary}
        outlineColor={theme.colors.outline}
        placeholderTextColor={theme.colors.onSurfaceVariant}
      />
      {!hideButton && (
        <Button
          mode="contained"
          onPress={handleSubmit}
          disabled={disabled}
          style={styles.button}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
        >
          Check
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  input: {
    fontSize: 17,
  },
  button: {
    borderRadius: 20,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
});
