import React from 'react';
import { View, ScrollView, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../src/theme';
import { getCardById, cardImages } from '../../src/content/bundle';
import { loadCardState } from '../../src/services/storage';
import { isCardMastered } from '../../src/services/fsrs';

type MasteryStatus = 'New' | 'Learning' | 'Mastered';

function deriveMastery(cardId: string): MasteryStatus {
  const state = loadCardState(cardId);
  if (state === null) return 'New';
  if (isCardMastered(state)) return 'Mastered';
  return 'Learning';
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return `In ${diffDays} days`;
}

export default function WordDetailScreen() {
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ id: string }>();

  const card = getCardById(params.id);

  if (!card) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <View style={styles.notFound}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Word not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const cardState = loadCardState(card.id);
  const mastery = deriveMastery(card.id);

  // Mastery dot color
  const masteryColor =
    mastery === 'Mastered'
      ? theme.custom.success
      : mastery === 'Learning'
      ? theme.custom.brandOrange
      : theme.colors.onSurfaceVariant;

  // Resolve image source — bundled (number) or URI (string)
  let imageSource: number | { uri: string } | null = null;
  if (card.image) {
    const bundled = cardImages[card.image];
    if (bundled !== undefined) {
      imageSource = bundled;
    } else {
      imageSource = { uri: card.image };
    }
  }

  // Split sentence around the blank
  const parts = card.sentence.split('_____');
  const hasSplit = parts.length >= 2;

  const glassStyle = {
    backgroundColor: theme.custom.glassBackground,
    borderColor: theme.custom.glassBorder,
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Main glass card */}
        <View style={[styles.glassCard, glassStyle]}>

          {/* 1. Word header */}
          <View style={styles.wordHeader}>
            <Text
              variant="headlineLarge"
              style={[styles.spanishWord, { color: theme.colors.onSurface }]}
            >
              {card.wordInContext}
            </Text>
            <Text
              variant="titleMedium"
              style={[styles.germanHint, { color: theme.colors.onSurfaceVariant }]}
            >
              {card.germanHint}
            </Text>
            <View style={styles.badgeRow}>
              {/* POS badge */}
              <View
                style={[
                  styles.badge,
                  { backgroundColor: theme.colors.primaryContainer, borderColor: 'rgba(255,160,86,0.20)' },
                ]}
              >
                <Text
                  variant="labelSmall"
                  style={[styles.badgeText, { color: theme.custom.labelMuted }]}
                >
                  {card.pos.toUpperCase()}
                </Text>
              </View>
              {/* CEFR badge */}
              {card.cefrLevel ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.primaryContainer, borderColor: 'rgba(255,160,86,0.20)' },
                  ]}
                >
                  <Text
                    variant="labelSmall"
                    style={[styles.badgeText, { color: theme.custom.labelMuted }]}
                  >
                    {card.cefrLevel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: theme.custom.separator }]} />

          {/* 2. Sentence section */}
          <View style={styles.section}>
            <Text
              variant="labelSmall"
              style={[styles.sectionLabel, { color: theme.custom.brandOrange }]}
            >
              SENTENCE
            </Text>
            <Text variant="bodyLarge" style={[styles.sentence, { color: theme.colors.onSurface }]}>
              {hasSplit ? (
                <>
                  {parts[0]}
                  <Text style={{ color: theme.custom.brandOrange, fontWeight: '700' }}>
                    {card.wordInContext}
                  </Text>
                  {parts[1]}
                </>
              ) : (
                card.sentence
              )}
            </Text>
            <Text
              variant="bodyMedium"
              style={[styles.translation, { color: theme.colors.onSurfaceVariant }]}
            >
              {card.sentenceTranslation}
            </Text>
            {card.contextNote ? (
              <Text
                variant="labelSmall"
                style={[styles.contextNote, { color: theme.colors.onSurfaceVariant }]}
              >
                {card.contextNote}
              </Text>
            ) : null}
          </View>

          {/* 3. Image section */}
          {imageSource !== null ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.custom.separator }]} />
              <View style={styles.imageSection}>
                <Image
                  source={imageSource}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
              </View>
            </>
          ) : null}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: theme.custom.separator }]} />

          {/* 4. FSRS Status section */}
          <View style={styles.section}>
            <Text
              variant="labelSmall"
              style={[styles.sectionLabel, { color: theme.custom.brandOrange }]}
            >
              PROGRESS
            </Text>
            {/* Mastery status row */}
            <View style={styles.masteryRow}>
              <View style={[styles.masteryDot, { backgroundColor: masteryColor }]} />
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurface, fontWeight: '600' }}
              >
                {mastery}
              </Text>
            </View>
            {/* FSRS details if card has been reviewed */}
            {cardState !== null ? (
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    REVIEWS
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                  >
                    {cardState.reps}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    LAPSES
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                  >
                    {cardState.lapses}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    NEXT REVIEW
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                  >
                    {formatDate(cardState.due)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}
              >
                Not yet reviewed — will appear in your next session.
              </Text>
            )}
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: theme.custom.separator }]} />

          {/* 5. Chapter info */}
          <View style={styles.section}>
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', letterSpacing: 1 }}
            >
              CHAPTER {card.chapter}
            </Text>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  wordHeader: {
    padding: 20,
    gap: 6,
  },
  spanishWord: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  germanHint: {
    fontWeight: '400',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  section: {
    padding: 20,
    gap: 8,
  },
  imageSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  sentence: {
    lineHeight: 26,
  },
  translation: {
    lineHeight: 22,
  },
  contextNote: {
    fontStyle: 'italic',
    marginTop: 2,
  },
  cardImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  masteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  masteryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
  },
  statItem: {
    gap: 2,
  },
});
