import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface MultipleChoiceGridProps {
  choices: string[];
  correctAnswer: string;
  answeredChoice: string | null;
  onSelect: (choice: string) => void;
}

export function MultipleChoiceGrid({
  choices,
  correctAnswer,
  answeredChoice,
  onSelect,
}: MultipleChoiceGridProps) {
  const theme = useAppTheme();
  const isRevealed = answeredChoice !== null;

  const getChoiceStyle = (choice: string) => {
    if (isRevealed) {
      if (choice === correctAnswer) {
        return {
          backgroundColor: 'rgba(52,199,89,0.10)',
          borderColor: theme.custom.success,
          opacity: 1,
        };
      }
      if (choice === answeredChoice) {
        return {
          backgroundColor: 'rgba(255,59,48,0.08)',
          borderColor: theme.colors.error,
          opacity: 1,
        };
      }
      return {
        backgroundColor: theme.custom.cardBackground,
        borderColor: theme.custom.cardBorder,
        opacity: 0.4,
      };
    }

    return {
      backgroundColor: theme.custom.cardBackground,
      borderColor: theme.custom.cardBorder,
      opacity: 1,
    };
  };

  const getTextColor = (choice: string) => {
    if (isRevealed) {
      if (choice === correctAnswer) return theme.custom.success;
      if (choice === answeredChoice) return theme.colors.error;
      return theme.colors.onSurfaceVariant;
    }
    return theme.colors.onSurface;
  };

  return (
    <View style={styles.grid}>
      {choices.map((choice) => {
        const choiceStyle = getChoiceStyle(choice);
        return (
          <Pressable
            key={choice}
            onPress={() => onSelect(choice)}
            style={[
              styles.choice,
              {
                backgroundColor: choiceStyle.backgroundColor,
                borderColor: choiceStyle.borderColor,
                opacity: choiceStyle.opacity,
              },
            ]}
            disabled={isRevealed}
          >
            <Text
              variant="titleMedium"
              style={[styles.choiceText, { color: getTextColor(choice) }]}
            >
              {choice}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  choice: {
    width: '47%',
    flexGrow: 1,
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  choiceText: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
