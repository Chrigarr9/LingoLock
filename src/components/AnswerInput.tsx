/**
 * AnswerInput component - iOS-native text input for vocabulary answers
 *
 * Features:
 * - Auto-focus for immediate typing
 * - Return key submit (iOS "done" button)
 * - Button submit as alternative
 * - Clears after submission
 * - Disables during answer display
 * - Follows iOS design guidelines and dark mode
 */

import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, useColorScheme } from 'react-native';

interface AnswerInputProps {
  /** Called when user submits answer (via return key or button) */
  onSubmit: (answer: string) => void;

  /** Disable input and button (e.g., while showing answer) */
  disabled?: boolean;

  /** Placeholder text shown when input is empty */
  placeholder?: string;
}

/**
 * iOS-native text input for answering vocabulary challenges
 *
 * Design principles:
 * - Auto-focus: User can start typing immediately
 * - Return key type: "done" with auto-disable when empty
 * - iOS system colors for placeholder (follows dark mode)
 * - System font (SF Pro) and standard text size (17pt)
 * - Rounded corners (8pt) matching iOS design language
 */
export function AnswerInput({
  onSubmit,
  disabled = false,
  placeholder = 'Your answer'
}: AnswerInputProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (answer.trim()) {
      onSubmit(answer);
      setAnswer('');  // Clear input after submit
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={answer}
        onChangeText={setAnswer}
        placeholder={placeholder}
        placeholderTextColor={
          isDark
            ? 'rgba(235, 235, 245, 0.3)'  // iOS dark mode placeholder (30% opacity white)
            : 'rgba(60, 60, 67, 0.3)'     // iOS light mode placeholder (30% opacity gray)
        }
        autoCapitalize="none"           // Don't force capitals (vocabulary may be lowercase)
        autoCorrect={false}              // Don't auto-correct user's vocabulary answer
        autoFocus={true}                 // Focus immediately so user can start typing
        returnKeyType="done"             // iOS keyboard shows "Done" button
        enablesReturnKeyAutomatically={true}  // iOS: disable return key when empty
        onSubmitEditing={handleSubmit}   // Handle return key press
        editable={!disabled}             // Disable editing while showing answer
        style={[
          styles.input,
          {
            backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7',  // iOS system background
            color: isDark ? '#ffffff' : '#000000',            // iOS label color
          }
        ]}
      />
      <View style={styles.buttonContainer}>
        <Button
          title="Check Answer"
          onPress={handleSubmit}
          disabled={disabled || !answer.trim()}  // Disable if disabled or empty input
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  input: {
    fontSize: 17,          // iOS body text size (standard)
    fontFamily: 'System',  // SF Pro on iOS, Roboto on Android
    padding: 12,
    borderRadius: 8,       // iOS standard corner radius for input fields
    marginBottom: 12,
  },
  buttonContainer: {
    marginTop: 8,
  },
});
