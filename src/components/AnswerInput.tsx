import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button } from 'react-native-paper';

interface AnswerInputProps {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AnswerInput({
  onSubmit,
  disabled = false,
  placeholder = 'Type your answer',
}: AnswerInputProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (answer.trim()) {
      onSubmit(answer);
      setAnswer('');
    }
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
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        disabled={disabled}
        style={styles.input}
      />
      <Button
        mode="contained"
        onPress={handleSubmit}
        disabled={disabled || !answer.trim()}
        style={styles.button}
      >
        Check Answer
      </Button>
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
    paddingVertical: 4,
  },
});
