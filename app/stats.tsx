import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text, ProgressBar } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { CHAPTERS, getTotalCards } from '../src/content/bundle';
import { getStreak, getSuccessRate, getChapterMastery } from '../src/services/statsService';
import { loadCardState } from '../src/services/storage';
import { isCardMastered, isDue } from '../src/services/fsrs';

export default function StatsScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  // Trigger re-render when this screen gains focus so stats stay fresh
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, [])
  );

  // ---------------------------------------------------------------------------
  // Compute overall summary stats
  // ---------------------------------------------------------------------------
  const successRate = useMemo(() => getSuccessRate(), [focusKey]);
  const streak = useMemo(() => getStreak(), [focusKey]);

  const totalCards = useMemo(() => getTotalCards(), []);

  const totalMastered = useMemo(() => {
    let count = 0;
    for (const chapter of CHAPTERS) {
      for (const card of chapter.cards) {
        const state = loadCardState(card.id);
        if (state !== null && isCardMastered(state)) {
          count += 1;
        }
      }
    }
    return count;
  }, [focusKey]);

  // ---------------------------------------------------------------------------
  // Compute per-chapter stats
  // ---------------------------------------------------------------------------
  const chapterStats = useMemo(() => {
    return CHAPTERS.map((ch) => {
      const mastery = getChapterMastery(ch.chapterNumber);
      const total = ch.cards.length;
      const mastered = ch.cards.filter((card) => {
        const state = loadCardState(card.id);
        return state !== null && isCardMastered(state);
      }).length;
      const dueCount = ch.cards.filter((card) => {
        const state = loadCardState(card.id);
        return state !== null && isDue(state);
      }).length;
      return {
        chapterNumber: ch.chapterNumber,
        mastery,
        total,
        mastered,
        dueCount,
      };
    });
  }, [focusKey]);

  // ---------------------------------------------------------------------------
  // Styles derived from theme
  // ---------------------------------------------------------------------------
  const cardStyle = {
    backgroundColor: theme.custom.cardBackground,
    borderColor: theme.custom.cardBorder,
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
        {/* Overall Summary Card */}
        <View style={[styles.summaryCard, cardStyle]}>
          <Text
            variant="labelSmall"
            style={[styles.sectionLabel, { color: theme.custom.labelMuted }]}
          >
            OVERALL PROGRESS
          </Text>

          <View style={styles.summaryGrid}>
            {/* Success rate */}
            <View style={styles.summaryItem}>
              <Text
                variant="headlineLarge"
                style={[styles.summaryHero, { color: theme.custom.brandOrange }]}
              >
                {successRate}%
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.summaryItemLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                SUCCESS RATE
              </Text>
            </View>

            {/* Streak */}
            <View style={styles.summaryItem}>
              <Text
                variant="headlineLarge"
                style={[styles.summaryHero, { color: theme.colors.onSurface }]}
              >
                {streak}
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.summaryItemLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                {streak === 1 ? 'DAY STREAK' : 'DAYS STREAK'}
              </Text>
            </View>

            {/* Mastered */}
            <View style={styles.summaryItem}>
              <Text
                variant="headlineLarge"
                style={[styles.summaryHero, { color: theme.custom.success }]}
              >
                {totalMastered}
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.summaryItemLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                MASTERED
              </Text>
            </View>

            {/* Total */}
            <View style={styles.summaryItem}>
              <Text
                variant="headlineLarge"
                style={[styles.summaryHero, { color: theme.colors.onSurface }]}
              >
                {totalCards}
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.summaryItemLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                TOTAL CARDS
              </Text>
            </View>
          </View>
        </View>

        {/* Per-Chapter Breakdown */}
        <Text
          variant="labelSmall"
          style={[styles.sectionLabel, styles.chapterSectionLabel, { color: theme.custom.labelMuted }]}
        >
          BY CHAPTER
        </Text>

        {chapterStats.map((ch) => (
          <Pressable
            key={ch.chapterNumber}
            onPress={() =>
              router.push({
                pathname: '/vocabulary',
                params: { chapter: String(ch.chapterNumber) },
              })
            }
            style={[styles.chapterCard, cardStyle]}
            accessibilityLabel={`Chapter ${ch.chapterNumber}, ${ch.mastery}% mastered. Tap to view vocabulary.`}
            accessibilityRole="button"
          >
            {/* Row: title + mastery % */}
            <View style={styles.chapterHeader}>
              <Text
                variant="titleSmall"
                style={[styles.chapterTitle, { color: theme.colors.onSurface }]}
              >
                Chapter {ch.chapterNumber}
              </Text>
              <Text
                variant="labelMedium"
                style={[styles.masteryPercent, { color: theme.custom.brandOrange }]}
              >
                {ch.mastery}%
              </Text>
            </View>

            {/* Progress bar */}
            <ProgressBar
              progress={ch.mastery / 100}
              color={theme.custom.brandOrange}
              style={styles.progressBar}
            />

            {/* Stats line */}
            <Text
              variant="labelSmall"
              style={[styles.chapterStats, { color: theme.colors.onSurfaceVariant }]}
            >
              {ch.mastered}/{ch.total} mastered
              {ch.dueCount > 0 ? `  ·  ${ch.dueCount} due` : '  ·  all caught up'}
            </Text>
          </Pressable>
        ))}
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 10,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 10,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    minWidth: '40%',
    alignItems: 'flex-start',
  },
  summaryHero: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  summaryItemLabel: {
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 9,
    marginTop: 2,
  },
  chapterSectionLabel: {
    marginTop: 6,
  },
  chapterCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chapterTitle: {
    fontWeight: '700',
  },
  masteryPercent: {
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  chapterStats: {
    fontWeight: '500',
  },
});
