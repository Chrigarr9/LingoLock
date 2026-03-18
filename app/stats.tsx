import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text, ProgressBar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, getCardStyle, labelOverlineStyle } from '../src/theme';
import { CHAPTERS, getTotalCards } from '../src/content/bundle';
import { getStreak, getSuccessRate, getChapterMastery } from '../src/services/statsService';
import { loadCardState } from '../src/services/storage';
import { isCardMastered, isDue } from '../src/services/fsrs';
import { useFocusRefresh } from '../src/hooks/useFocusRefresh';

export default function StatsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const focusKey = useFocusRefresh();

  // ---------------------------------------------------------------------------
  // Compute all stats in a single pass over all card states
  // ---------------------------------------------------------------------------
  const { successRate, streak, totalCards, totalMastered, chapterStats } = useMemo(() => {
    // Load all card states once — single pass for both totalMastered and chapterStats
    const chapters = CHAPTERS.map((ch) => {
      let mastered = 0;
      let dueCount = 0;
      for (const card of ch.cards) {
        const state = loadCardState(card.id);
        if (state !== null) {
          if (isCardMastered(state)) mastered++;
          if (isDue(state)) dueCount++;
        }
      }
      return {
        chapterNumber: ch.chapterNumber,
        mastery: getChapterMastery(ch.chapterNumber),
        total: ch.cards.length,
        mastered,
        dueCount,
      };
    });

    return {
      successRate: getSuccessRate(),
      streak: getStreak(),
      totalCards: getTotalCards(),
      totalMastered: chapters.reduce((sum, ch) => sum + ch.mastered, 0),
      chapterStats: chapters,
    };
  }, [focusKey]);

  const cardStyle = getCardStyle(theme);

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
            style={[labelOverlineStyle.label, { color: theme.custom.labelMuted }]}
          >
            OVERALL PROGRESS
          </Text>

          <View style={styles.summaryGrid}>
            {/* Success rate */}
            <View style={styles.summaryItem}>
              <Text
                variant="headlineLarge"
                style={[styles.summaryHero, { color: theme.custom.brandBlue }]}
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
          style={[labelOverlineStyle.label, styles.chapterSectionLabel, { color: theme.custom.labelMuted }]}
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
                style={[styles.masteryPercent, { color: theme.custom.brandBlue }]}
              >
                {ch.mastery}%
              </Text>
            </View>

            {/* Progress bar */}
            <ProgressBar
              progress={ch.mastery / 100}
              color={theme.custom.brandBlue}
              style={styles.progressBar}
            />

            {/* Stats line */}
            <Text
              variant="labelSmall"
              style={[styles.chapterStatsText, { color: theme.colors.onSurfaceVariant }]}
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
  chapterStatsText: {
    fontWeight: '500',
  },
});
