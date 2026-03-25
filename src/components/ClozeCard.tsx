import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Image, Pressable, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
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
  /** Height of the keyboard in pixels (0 when hidden). Image shrinks to fit remaining space. */
  keyboardHeight?: number;
  /** The answer the user actually gave (shown in feedback when incorrect) */
  userAnswer?: string;
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
  keyboardHeight = 0,
  userAnswer,
}: ClozeCardDisplayProps) {
  const theme = useAppTheme();
  const { cardImages, cardAudios } = useActiveBundle();
  // ClozeCardDisplay is only rendered for mc4/text cards, never selfRated
  const card = sessionCard.card as import('../types/vocabulary').ClozeCard;
  const { answerType } = sessionCard;
  const soundRef = useRef<AudioPlayer | null>(null);
  // Ref to always call the latest onAudioFinish callback without re-triggering the effect
  const onAudioFinishRef = useRef(onAudioFinish);
  onAudioFinishRef.current = onAudioFinish;

  const { height: windowHeight } = useWindowDimensions();
  // Calculate available height for the image:
  // Total screen minus fixed UI elements minus keyboard.
  // Fixed overhead: safe area ~89 + header ~44 + progress ~30 + card text/hint ~94
  //   + MC grid ~190 + next button ~60 + padding ~53 = ~560 for MC
  //   + input ~56 + padding ~45 = ~390 for text
  const fixedOverhead = answerType === 'text' ? 340 : 560;
  const availableForImage = windowHeight - fixedOverhead - keyboardHeight;
  const imageMaxHeight = Math.max(0, Math.min(220, availableForImage));
  const shouldShowImage = imageMaxHeight >= 40;

  const correctColor = theme.custom.success;
  const incorrectColor = theme.colors.error;

  const sentenceParts = card.sentence.split('_____');

  // --- Audio lifecycle ---
  // Play audio when answer is revealed (if available and not muted)
  useEffect(() => {
    if (!showAnswer || !card.audio || isMuted) return;

    let cancelled = false;

    const playAudio = async () => {
      try {
        // Use "playback" mode so audio plays even when the iOS silent switch is on
        await setAudioModeAsync({ playsInSilentMode: true });
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
        soundRef.current.pause();
        soundRef.current.remove();
        soundRef.current = null;
      }
    };
  }, [showAnswer, card.audio, isMuted, playbackSpeed]);

  // Cleanup sound on unmount (safety net)
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.pause();
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
  const showImage = !!imageSource && !imageError && shouldShowImage;

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
              <Text style={[styles.blankSpan, { color: theme.colors.onSurfaceVariant }]}>{'______'}</Text>
            )}
            {sentenceParts[1] ?? ''}
          </Text>
        )}
      </View>

      {/* After-answer feedback */}
      {showAnswer && isCorrect === false && userAnswer && (
        <Text
          variant="bodyMedium"
          style={[styles.feedbackText, { color: incorrectColor }]}
        >
          {`\u2717 ${userAnswer}`}
        </Text>
      )}
      {showAnswer && isCorrect === true && (
        <Text
          variant="bodyMedium"
          style={[styles.feedbackText, { color: correctColor }]}
        >
          {`\u2713 ${card.wordInContext}`}
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
        showImage && { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
      ]}
    >
      {/* Hero image — flush at top, full card width, ratio-enforcing wrapper */}
      {showImage && (
        <View style={[styles.cardImageWrapper, { height: imageMaxHeight }]}>
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
    height: undefined,
    overflow: 'hidden',
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
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
    fontWeight: '700',
    letterSpacing: -1,
    fontSize: 20,
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
