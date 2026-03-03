import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAppTheme } from '../theme';
import type { SessionCard } from '../types/vocabulary';

interface ClozeCardDisplayProps {
  sessionCard: SessionCard;
  showAnswer: boolean;
  isCorrect?: boolean;
  /** Whether audio is muted (user preference from header toggle) */
  isMuted: boolean;
  /** Called when sentence audio finishes playing. Challenge screen uses this for advance timing. */
  onAudioFinish?: () => void;
}

/**
 * Renders a cloze card: sentence with blank + German hint before answer;
 * full sentence with highlighted correct word after answering.
 *
 * Plays sentence audio automatically when the answer is revealed (unless muted).
 * Renders an image above the sentence when available.
 */
export function ClozeCardDisplay({
  sessionCard,
  showAnswer,
  isCorrect,
  isMuted,
  onAudioFinish,
}: ClozeCardDisplayProps) {
  const theme = useAppTheme();
  const { card, answerType } = sessionCard;
  const soundRef = useRef<Audio.Sound | null>(null);

  const correctColor = theme.custom.success;
  const incorrectColor = theme.colors.error;

  const answerTypeLabel =
    answerType === 'mc2'
      ? 'Choose 1 of 2'
      : answerType === 'mc4'
        ? 'Choose 1 of 4'
        : 'Type answer';

  const sentenceParts = card.sentence.split('_____');

  // --- Audio lifecycle ---
  // Play audio when answer is revealed (if available and not muted)
  useEffect(() => {
    if (!showAnswer || !card.audio || isMuted) return;

    let cancelled = false;

    const playAudio = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: card.audio! },
          { shouldPlay: true },
        );
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;

        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            onAudioFinish?.();
          }
        });
      } catch (_err) {
        // Audio failed to load — treat as if no audio (call onAudioFinish
        // so challenge screen falls back to timer-based advance)
        onAudioFinish?.();
      }
    };

    playAudio();

    return () => {
      cancelled = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [showAnswer, card.audio, isMuted]);

  // Cleanup sound on unmount (safety net)
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  // --- Image error handling ---
  const [imageError, setImageError] = React.useState(false);
  const showImage = !!card.image && !imageError;

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
        // When image is present, remove top padding so image sits flush with card top
        showImage && styles.cardWithImage,
      ]}
    >
      {/* Sentence image — above the sentence, inside the card */}
      {showImage && (
        <Image
          source={{ uri: card.image }}
          style={[
            styles.cardImage,
            { borderColor: theme.custom.glassBorder },
          ]}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      )}

      {/* Sentence with blank or answered word */}
      <View style={styles.sentenceRow}>
        {showAnswer ? (
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

      {/* After-answer feedback */}
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

      {/* Before-answer info */}
      {!showAnswer && (
        <>
          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
          <Text
            variant="bodyLarge"
            style={[styles.germanHint, { color: theme.custom.brandOrange }]}
          >
            {'\uD83D\uDCA1 '}{card.germanHint}
          </Text>
          <Text
            variant="labelSmall"
            style={[styles.answerTypeLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            {answerTypeLabel}
          </Text>
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
    overflow: 'hidden',
  },
  cardWithImage: {
    paddingTop: 0,
  },
  cardImage: {
    width: '100%',
    maxHeight: 160,
    aspectRatio: 16 / 9,
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
    marginBottom: 16,
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
  feedbackText: {
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 18,
  },
});
