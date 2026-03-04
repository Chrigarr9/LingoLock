import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Image, type ImageSourcePropType } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAppTheme } from '../theme';
import { cardImages, cardAudios } from '../content/bundle';
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
  // Ref to always call the latest onAudioFinish callback without re-triggering the effect
  const onAudioFinishRef = useRef(onAudioFinish);
  onAudioFinishRef.current = onAudioFinish;

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
        // Resolve audio source: bundled asset (number from require()) or URI string
        const audioSource = cardAudios[card.audio!]
          ?? (card.audio!.startsWith('http') ? { uri: card.audio! } : null);

        if (!audioSource) {
          onAudioFinishRef.current?.();
          return;
        }

        const { sound } = await Audio.Sound.createAsync(
          typeof audioSource === 'number' ? audioSource : audioSource,
          { shouldPlay: true },
        );
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;

        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            onAudioFinishRef.current?.();
          }
        });
      } catch (_err) {
        // Audio failed to load — treat as if no audio (call onAudioFinish
        // so challenge screen falls back to timer-based advance)
        onAudioFinishRef.current?.();
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

  // --- Image source resolution ---
  // Bundled images: card.image is a key like "ch01_s00" → look up in cardImages
  // URI fallback: if card.image is a URL string, use { uri } directly
  const imageSource: ImageSourcePropType | null = card.image
    ? (cardImages[card.image] ?? (card.image.startsWith('http') ? { uri: card.image } : null))
    : null;

  const [imageError, setImageError] = useState(false);
  // Reset error state when card changes so a previous card's broken image
  // doesn't hide the next card's image
  useEffect(() => {
    setImageError(false);
  }, [card.id]);
  const showImage = !!imageSource && !imageError;

  // Text content rendered below the image (or as sole card content)
  const textContent = (
    <>
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
          <View style={styles.hintRow}>
            <Icon source="lightbulb-outline" size={18} color={theme.custom.brandOrange} />
            <Text
              variant="bodyLarge"
              style={[styles.germanHint, { color: theme.custom.brandOrange }]}
            >
              {card.germanHint}
            </Text>
          </View>
          <Text
            variant="labelSmall"
            style={[styles.answerTypeLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            {answerTypeLabel}
          </Text>
        </>
      )}
    </>
  );

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
        showImage && { padding: 0 },
      ]}
    >
      {/* Hero image — flush at top, full card width, ratio-enforcing wrapper */}
      {showImage && (
        <View style={styles.cardImageWrapper}>
          <Image
            source={imageSource!}
            style={styles.cardImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        </View>
      )}

      {/* Text content — padded wrapper when image present, direct children otherwise */}
      {showImage ? (
        <View style={styles.cardTextContent}>{textContent}</View>
      ) : (
        textContent
      )}
    </View>
  );
}

/**
 * Card image aspect ratio — must match the pipeline output (config.py width/height).
 * Pipeline generates at 768×512 = 3:2. Changing one? Change both.
 */
const CARD_IMAGE_RATIO = 3 / 2;

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
  cardImageWrapper: {
    width: '100%',
    aspectRatio: CARD_IMAGE_RATIO,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardTextContent: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    gap: 4,
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
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
