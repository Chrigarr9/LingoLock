import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Image, Pressable, Animated, type ImageSourcePropType } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useAppTheme, getGlassStyle } from '../theme';
import { useActiveBundle } from '../content/activeBundleProvider';
import type { SessionCard } from '../types/vocabulary';

interface ClozeCardDisplayProps {
  sessionCard: SessionCard;
  showAnswer: boolean;
  isCorrect?: boolean;
  /** Answer was accepted via fuzzy matching (typo tolerated) */
  isFuzzy?: boolean;
  /** Whether audio is muted (user preference from header toggle) */
  isMuted: boolean;
  /** Playback speed multiplier (0.75, 1.0, 1.25) — defaults to 1.0 */
  playbackSpeed?: number;
  /** Called when sentence audio finishes playing. Challenge screen uses this for advance timing. */
  onAudioFinish?: () => void;
  /** Called when user taps the hint button (demotes answer type) */
  onHintRequest?: () => void;
  /** Called when user taps "Already know this?" */
  onAlreadyKnow?: () => void;
  /** When true, gently pulse the hint button to attract attention */
  hintShouldBlink?: boolean;
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
  isFuzzy,
  isMuted,
  playbackSpeed = 1.0,
  onAudioFinish,
  onHintRequest,
  onAlreadyKnow,
  userAnswer,
  hintShouldBlink = false,
}: ClozeCardDisplayProps) {
  const theme = useAppTheme();
  const { cardImages, cardAudios } = useActiveBundle();
  // ClozeCardDisplay is only rendered for mc4/text cards, never selfRated
  const card = sessionCard.card as import('../types/vocabulary').ClozeCard;
  const soundRef = useRef<AudioPlayer | null>(null);
  // Ref to always call the latest onAudioFinish callback without re-triggering the effect
  const onAudioFinishRef = useRef(onAudioFinish);
  onAudioFinishRef.current = onAudioFinish;

  const correctColor = theme.custom.success;
  const incorrectColor = theme.colors.error;
  const fuzzyColor = theme.custom.brandOrange;

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
  // Image renders only if data exists and load succeeded. Sizing is handled by
  // flexbox: the wrapper has `flex: 1, minHeight: 0`, so it grows to fill
  // remaining vertical space within the card and collapses to 0 when the
  // text+input+keyboard already consume the screen.
  const showImage = !!imageSource && !imageError;

  // Can the German hint be tapped to demote the answer type? (text/scramble only)
  const hintIsTappable = !!onHintRequest;

  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (hintShouldBlink && hintIsTappable) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      blinkAnim.stopAnimation();
      blinkAnim.setValue(1);
    }
  }, [hintShouldBlink, hintIsTappable]);

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
                color: isCorrect === false ? incorrectColor : isFuzzy ? fuzzyColor : correctColor,
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
            <Text style={[styles.blankSpan, { color: theme.colors.onSurfaceVariant }]}>{'______'}</Text>
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
      {showAnswer && isCorrect === true && isFuzzy && userAnswer && (
        <Text
          variant="bodyMedium"
          style={[styles.feedbackText, { color: fuzzyColor }]}
        >
          {`\u2248 ${userAnswer}`}
        </Text>
      )}
      {showAnswer && isCorrect === true && !isFuzzy && (
        <Text
          variant="bodyMedium"
          style={[styles.feedbackText, { color: correctColor }]}
        >
          {`\u2713 ${card.germanHint}`}
          {card.germanHintGeneral ? (
            <Text style={[styles.germanHintGeneral, { color: theme.colors.onSurfaceVariant }]}>
              {`  (${card.germanHintGeneral})`}
            </Text>
          ) : null}
        </Text>
      )}

      {/* German hint — tappable in text mode to reveal spelling hint */}
      {!showAnswer && (
        <View style={styles.hintArea}>
          <Pressable
            onPress={hintIsTappable ? onHintRequest : undefined}
            style={styles.hintRow}
            accessibilityRole={hintIsTappable ? 'button' : undefined}
            accessibilityLabel={hintIsTappable ? 'Make it easier' : undefined}
          >
            <Animated.View style={{ opacity: blinkAnim }}>
              <Icon
                source={hintIsTappable ? 'lightbulb-on-outline' : 'lightbulb-outline'}
                size={22}
                color={hintIsTappable ? theme.custom.hintYellow : theme.custom.brandBlue}
              />
            </Animated.View>
            <Text
              variant="bodyLarge"
              style={[styles.germanHint, { color: hintIsTappable ? theme.custom.hintYellow : theme.custom.brandBlue }]}
            >
              {card.germanHint}
              {card.germanHintGeneral ? (
                <Text style={[styles.germanHintGeneral, { color: theme.colors.onSurfaceVariant }]}>
                  {`  (${card.germanHintGeneral})`}
                </Text>
              ) : null}
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
        showImage && styles.cardWithImage,
      ]}
    >
      {/* Hero image — flush at top, full card width, flexes to fill remaining
          vertical space inside the card. `minHeight: 0` lets the wrapper
          collapse to 0 when there's no room (e.g. keyboard up on small phone)
          rather than pushing the input off-screen. */}
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

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 4,
    overflow: 'hidden',
  },
  cardWithImage: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: 0,
    justifyContent: 'flex-start',
  },
  cardImageWrapper: {
    flex: 1,
    minHeight: 0,
    width: '100%',
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
  germanHintGeneral: {
    fontWeight: '400',
    fontSize: 14,
    opacity: 0.7,
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
