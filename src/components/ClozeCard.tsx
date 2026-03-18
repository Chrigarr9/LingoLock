import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Image, Pressable, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useAppTheme, getGlassStyle } from '../theme';
import { useActiveBundle } from '../content/activeBundleProvider';
import type { SessionCard } from '../types/vocabulary';

interface ClozeCardDisplayProps {
  sessionCard: SessionCard;
  showAnswer: boolean;
  isCorrect?: boolean;
  /** Whether audio is muted (user preference from header toggle) */
  isMuted: boolean;
  /** Playback speed multiplier (0.75, 1.0, 1.25) — defaults to 1.0 */
  playbackSpeed?: number;
  /** Called when sentence audio finishes playing. Challenge screen uses this for advance timing. */
  onAudioFinish?: () => void;
  /** Pre-generated hint text (e.g., "P _ _ _ _ _ _ A") */
  hintText?: string;
  /** Whether hint has been used for this card presentation */
  hintUsed?: boolean;
  /** Called when user taps the hint button */
  onHintRequest?: () => void;
  /** Called when user taps "Already know this?" */
  onAlreadyKnow?: () => void;
  /** When true, the hero image is hidden (e.g. keyboard is open) */
  hideImage?: boolean;
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
  playbackSpeed = 1.0,
  onAudioFinish,
  hintText,
  hintUsed,
  onHintRequest,
  onAlreadyKnow,
  hideImage = false,
}: ClozeCardDisplayProps) {
  const theme = useAppTheme();
  const { cardImages, cardAudios } = useActiveBundle();
  const { card, answerType } = sessionCard;
  const soundRef = useRef<AudioPlayer | null>(null);
  // Ref to always call the latest onAudioFinish callback without re-triggering the effect
  const onAudioFinishRef = useRef(onAudioFinish);
  onAudioFinishRef.current = onAudioFinish;

  const { height: windowHeight } = useWindowDimensions();
  // On short screens, shrink the image so the MC grid / input stays visible.
  // ~440px is the approximate non-image overhead (header ~50 + progress ~30
  // + card text/hint ~100 + MC grid ~190 + padding/gaps ~70).
  // Below 60px the image is too small to be useful — hide it entirely.
  const imageMaxHeight = Math.max(0, Math.min(200, windowHeight - 440));
  const shouldShowImage = imageMaxHeight >= 60;

  const correctColor = theme.custom.success;
  const incorrectColor = theme.colors.error;

  const sentenceParts = card.sentence.split('_____');

  // --- Audio lifecycle ---
  // Play audio when answer is revealed (if available and not muted)
  useEffect(() => {
    if (!showAnswer || !card.audio || isMuted) return;

    let cancelled = false;

    const playAudio = () => {
      try {
        const audioSource = cardAudios[card.audio!] ?? { uri: card.audio! };
        const player = createAudioPlayer(audioSource);
        if (cancelled) {
          player.remove();
          return;
        }
        soundRef.current = player;

        if (playbackSpeed !== 1.0) {
          player.setPlaybackRate(playbackSpeed);
        }

        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            onAudioFinishRef.current?.();
          }
        });

        player.play();
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
        soundRef.current.remove();
        soundRef.current = null;
      }
    };
  }, [showAnswer, card.audio, isMuted, playbackSpeed]);

  // Cleanup sound on unmount (safety net)
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.remove();
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
  const showImage = !!imageSource && !imageError && !hideImage && shouldShowImage;

  // Can the German hint be tapped to reveal a spelling hint? (text mode only)
  const hintIsTappable = answerType === 'text' && !hintUsed && !!onHintRequest;

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
            {/* Blank or spelling hint replacing the blank */}
            {answerType === 'text' && hintUsed && hintText ? (
              <Text style={[styles.hintInBlank, { color: theme.colors.onSurfaceVariant }]}>
                {hintText}
              </Text>
            ) : (
              <Text style={styles.blankSpan}>{'_____'}</Text>
            )}
            {sentenceParts[1] ?? ''}
          </Text>
        )}
      </View>

      {/* After-answer feedback */}
      {showAnswer && (
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
      )}

      {/* German hint — tappable in text mode to reveal spelling hint */}
      {!showAnswer && (
        <View style={styles.hintArea}>
          <Pressable
            onPress={hintIsTappable ? onHintRequest : undefined}
            style={styles.hintRow}
            accessibilityRole={hintIsTappable ? 'button' : undefined}
            accessibilityLabel={hintIsTappable ? 'Show spelling hint' : undefined}
          >
            <Icon
              source={hintIsTappable ? 'lightbulb-on-outline' : 'lightbulb-outline'}
              size={22}
              color={theme.custom.brandBlue}
            />
            <Text
              variant="bodyLarge"
              style={[styles.germanHint, { color: theme.custom.brandBlue }]}
            >
              {card.germanHint}
            </Text>
          </Pressable>
          {sessionCard.isFirstEncounter && onAlreadyKnow && (
            <Pressable onPress={onAlreadyKnow} accessibilityRole="button">
              <Text
                variant="labelSmall"
                style={[styles.alreadyKnowLink, { color: theme.colors.onSurfaceVariant }]}
              >
                I know this
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </>
  );

  return (
    <View
      style={[
        styles.card,
        getGlassStyle(theme),
        showImage && { padding: 0 },
      ]}
    >
      {/* Hero image — flush at top, full card width, ratio-enforcing wrapper */}
      {showImage && (
        <View style={[styles.cardImageWrapper, { maxHeight: imageMaxHeight }]}>
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
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 20,
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
    paddingVertical: 14,
    paddingHorizontal: 20,
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
  hintInBlank: {
    fontFamily: 'monospace',
    fontWeight: '400',
    letterSpacing: 2,
    textDecorationLine: 'underline',
  },
  hintArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 4,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  germanHint: {
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 17,
  },
  alreadyKnowLink: {
    textDecorationLine: 'underline',
    marginLeft: 12,
    opacity: 0.6,
    fontSize: 11,
  },
  feedbackText: {
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 18,
    marginTop: 2,
  },
});
