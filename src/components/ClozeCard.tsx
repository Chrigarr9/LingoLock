import React from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';
import type { SessionCard } from '../types/vocabulary';

interface ClozeCardDisplayProps {
  sessionCard: SessionCard;
  showAnswer: boolean;
  isCorrect?: boolean;
}

/**
 * Renders a cloze card: sentence with blank + German hint before answer;
 * full sentence with highlighted correct word after answering.
 *
 * CARD-09: Conditionally renders image if sessionCard.card.image is present.
 * CARD-10: Conditionally renders audio play button if sessionCard.card.audio is present.
 */
export function ClozeCardDisplay({ sessionCard, showAnswer, isCorrect }: ClozeCardDisplayProps) {
  const theme = useAppTheme();
  const { card, answerType } = sessionCard;

  // iOS system colors, consistent with Phase 1
  const correctColor = '#34C759';
  const incorrectColor = '#FF3B30';

  // Answer type label
  const answerTypeLabel =
    answerType === 'mc2'
      ? 'Choose 1 of 2'
      : answerType === 'mc4'
        ? 'Choose 1 of 4'
        : 'Type answer';

  // Split sentence on _____ to render blank
  const sentenceParts = card.sentence.split('_____');

  // Render audio play button using expo-av (graceful fallback if not installed)
  const handlePlayAudio = async () => {
    if (!card.audio) return;
    try {
      // Dynamic require so the app doesn't crash if expo-av is not installed.
      // Type as any to avoid requiring @types/expo-av at compile time.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const expoAv = require('expo-av') as any;
      const { sound } = await expoAv.Audio.Sound.createAsync({ uri: card.audio });
      await sound.playAsync();
    } catch (_err) {
      // expo-av not installed yet (Phase 3) — silent no-op
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.custom.glassBackground,
          borderColor: theme.custom.glassBorder,
        },
        Platform.select({
          web: { backdropFilter: `blur(${theme.custom.glassBlur}px)` } as any,
          default: {},
        }),
      ]}
    >
      {/* CARD-09: Optional image above sentence */}
      {card.image ? (
        <Image
          source={{ uri: card.image }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      ) : null}

      {/* Sentence with blank or answered word */}
      <View style={styles.sentenceRow}>
        {showAnswer ? (
          /* After answering: full sentence with highlighted word */
          <Text
            variant="headlineSmall"
            style={[styles.sentenceText, { color: theme.colors.onSurface }]}
          >
            {sentenceParts[0]}
            <Text
              style={{
                color: isCorrect === false ? incorrectColor : correctColor,
                fontWeight: '700',
              }}
            >
              {card.wordInContext}
            </Text>
            {sentenceParts[1] ?? ''}
          </Text>
        ) : (
          /* Before answering: blank as underlined span */
          <Text
            variant="headlineSmall"
            style={[styles.sentenceText, { color: theme.colors.onSurface }]}
          >
            {sentenceParts[0]}
            <Text style={styles.blankSpan}>{'_____'}</Text>
            {sentenceParts[1] ?? ''}
          </Text>
        )}
      </View>

      {/* After-answer feedback: correct/incorrect indicator */}
      {showAnswer && (
        <>
          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
          <Text
            variant="bodyMedium"
            style={[
              styles.feedbackText,
              { color: isCorrect === false ? incorrectColor : correctColor },
            ]}
          >
            {isCorrect === false
              ? `\u2717 ${card.wordInContext}`
              : `\u2713 ${card.wordInContext}`}
          </Text>
        </>
      )}

      {/* Before-answer info: separator + German hint + answer type */}
      {!showAnswer && (
        <>
          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />

          {/* German hint with lightbulb icon */}
          <Text
            variant="bodyLarge"
            style={[styles.germanHint, { color: theme.custom.brandOrange }]}
          >
            {'\uD83D\uDCA1 '}{card.germanHint}
          </Text>

          {/* Answer type indicator */}
          <Text
            variant="labelSmall"
            style={[styles.answerTypeLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            {answerTypeLabel}
          </Text>

          {/* CARD-10: Optional audio play button */}
          {card.audio ? (
            <Text
              variant="labelMedium"
              style={[styles.audioButton, { color: theme.custom.brandOrange }]}
              onPress={handlePlayAudio}
              accessibilityLabel="Play audio for this word"
              accessibilityRole="button"
            >
              {'\uD83D\uDD0A'} Play audio
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 4,
  },
  cardImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 12,
  },
  sentenceRow: {
    width: '100%',
  },
  sentenceText: {
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 32,
  },
  blankSpan: {
    textDecorationLine: 'underline',
    fontWeight: '700',
    color: 'transparent',
    borderBottomWidth: 2,
  },
  separator: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginVertical: 12,
  },
  germanHint: {
    fontWeight: '600',
    textAlign: 'center',
  },
  answerTypeLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    marginTop: 4,
  },
  audioButton: {
    marginTop: 8,
    fontWeight: '600',
  },
  feedbackText: {
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 18,
  },
});
