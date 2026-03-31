import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useAppTheme, getGlassStyle } from '../theme';

interface LetterScrambleProps {
  /** The correct answer word to scramble */
  word: string;
  onSubmit: (answer: string) => void;
  disabled?: boolean;
}

/** Deterministic shuffle using Fisher-Yates */
function shuffleLetters(word: string): string[] {
  const letters = word.split('');
  // Keep shuffling until the result differs from the original
  // (avoids showing the answer un-shuffled for short words)
  for (let attempts = 0; attempts < 10; attempts++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    if (letters.join('') !== word) break;
  }
  return letters;
}

/**
 * Letter scramble input — shows shuffled letter tiles that the user taps
 * in order to reconstruct the target word.
 *
 * Tapping a placed letter returns it to the pool. A "Check" button appears
 * once all letters are placed.
 */
export function LetterScramble({ word, onSubmit, disabled = false }: LetterScrambleProps) {
  const theme = useAppTheme();

  // Shuffled pool — computed once per word
  const shuffled = useMemo(() => shuffleLetters(word), [word]);

  // Each pool slot is either available (true) or placed (false)
  const [available, setAvailable] = useState<boolean[]>(() => shuffled.map(() => true));
  // Indices into `shuffled` in the order the user tapped them
  const [placed, setPlaced] = useState<number[]>([]);

  const builtAnswer = placed.map((i) => shuffled[i]).join('');
  const allPlaced = placed.length === shuffled.length;

  const handlePoolTap = (poolIndex: number) => {
    if (disabled || !available[poolIndex]) return;
    setAvailable((prev) => {
      const next = [...prev];
      next[poolIndex] = false;
      return next;
    });
    setPlaced((prev) => [...prev, poolIndex]);
  };

  const handlePlacedTap = (placedPosition: number) => {
    if (disabled) return;
    const poolIndex = placed[placedPosition];
    setPlaced((prev) => prev.filter((_, i) => i !== placedPosition));
    setAvailable((prev) => {
      const next = [...prev];
      next[poolIndex] = true;
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit(builtAnswer);
  };

  const tileSize = shuffled.length > 8 ? 38 : 44;
  const fontSize = shuffled.length > 8 ? 17 : 20;

  return (
    <View style={styles.container}>
      {/* Answer slots — shows placed letters or empty slots */}
      <View style={styles.answerRow}>
        {shuffled.map((_, i) => {
          const hasLetter = i < placed.length;
          return (
            <Pressable
              key={`slot-${i}`}
              onPress={hasLetter ? () => handlePlacedTap(i) : undefined}
              style={[
                styles.tile,
                {
                  width: tileSize,
                  height: tileSize,
                  backgroundColor: hasLetter
                    ? theme.colors.primaryContainer
                    : theme.custom.glassBackground,
                  borderColor: hasLetter
                    ? theme.colors.primary
                    : theme.custom.glassBorder,
                },
              ]}
            >
              <Text style={[styles.tileLetter, { fontSize, color: theme.colors.onPrimaryContainer }]}>
                {hasLetter ? shuffled[placed[i]] : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Pool — shuffled letter tiles */}
      <View style={styles.poolRow}>
        {shuffled.map((letter, i) => (
          <Pressable
            key={`pool-${i}`}
            onPress={() => handlePoolTap(i)}
            disabled={disabled || !available[i]}
            style={[
              styles.tile,
              {
                width: tileSize,
                height: tileSize,
                backgroundColor: available[i]
                  ? theme.colors.surfaceVariant
                  : 'transparent',
                borderColor: available[i]
                  ? theme.colors.outline
                  : 'transparent',
                opacity: available[i] ? 1 : 0.2,
              },
            ]}
          >
            <Text
              style={[
                styles.tileLetter,
                {
                  fontSize,
                  color: available[i]
                    ? theme.colors.onSurfaceVariant
                    : theme.colors.onSurfaceVariant,
                },
              ]}
            >
              {letter}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Check button — only when all letters placed */}
      <Button
        mode="contained"
        onPress={handleSubmit}
        disabled={disabled || !allPlaced}
        style={[styles.button, !allPlaced && { opacity: 0.4 }]}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
      >
        Check
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    alignItems: 'center',
  },
  answerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  poolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  tile: {
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileLetter: {
    fontWeight: '700',
  },
  button: {
    borderRadius: 20,
    alignSelf: 'stretch',
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
