import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Pressable, ScrollView } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { getStreak, getChapterMastery, getCardsDueCount, getCurrentChapterNumber } from '../src/services/statsService';
import { getTotalCards } from '../src/content/bundle';
import { usePWAInstall } from '../src/hooks/usePWAInstall';

function getSpanishGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';   // 0-11
  if (hour < 20) return 'Buenas tardes'; // 12-19
  return 'Buenas noches';                 // 20-23
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  const [streak, setStreak] = useState(0);
  const [chapterProgress, setChapterProgress] = useState(0);
  const [cardsDue, setCardsDue] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [greeting, setGreeting] = useState(getSpanishGreeting);
  const promptInstall = usePWAInstall();

  // Refresh stats when screen gains focus (returning from challenge)
  useFocusEffect(
    useCallback(() => {
      setStreak(getStreak());
      const chapter = getCurrentChapterNumber();
      setCurrentChapter(chapter);
      setChapterProgress(getChapterMastery(chapter));
      setCardsDue(getCardsDueCount());
      // Refresh greeting in case time-of-day has changed
      setGreeting(getSpanishGreeting());
    }, [])
  );

  const glassStyle = {
    backgroundColor: theme.custom.glassBackground,
    borderColor: theme.custom.glassBorder,
    ...Platform.select({
      web: { backdropFilter: `blur(${theme.custom.glassBlur}px)` } as any,
      default: {},
    }),
  };

  // CTA label changes based on whether any cards are due
  const ctaLabel = cardsDue === 0 ? 'Review anyway' : 'Start Practice';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.logoContainer, { backgroundColor: theme.colors.primaryContainer }]}>
              <Icon source="earth" size={20} color={theme.custom.brandOrange} />
            </View>
            <Text
              variant="titleLarge"
              style={[styles.appTitle, { color: theme.colors.onSurface }]}
            >
              LingoLock
            </Text>
          </View>
          <IconButton
            icon="cog-outline"
            size={22}
            iconColor={theme.colors.onSurfaceVariant}
            onPress={() => router.push('/settings')}
            accessibilityLabel="Settings"
          />
        </View>

        {/* Language Badge */}
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: theme.colors.primaryContainer,
                borderColor: 'rgba(255,160,86,0.20)',
              },
            ]}
          >
            <View style={styles.badgeContent}>
              <Icon source="earth" size={12} color={theme.custom.labelMuted} />
              <Text style={[styles.badgeText, { color: theme.custom.labelMuted }]}>
                SPANISH
              </Text>
            </View>
          </View>
        </View>

        {/* Greeting */}
        <Text
          variant="displaySmall"
          style={[styles.greeting, { color: theme.colors.onSurface }]}
        >
          {`${greeting}\nReady to practice?`}
        </Text>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Streak Card (full width) */}
          <View style={[styles.streakCard, glassStyle]}>
            <View>
              <Text
                variant="labelSmall"
                style={[styles.statLabel, { color: theme.custom.labelMuted }]}
              >
                CURRENT STREAK
              </Text>
              <Text
                variant="headlineLarge"
                style={[styles.streakValue, { color: theme.colors.onSurface }]}
              >
                {streak} {streak === 1 ? 'day' : 'days'}
              </Text>
            </View>
            <View
              style={[styles.fireCircle, { backgroundColor: theme.custom.brandOrange }]}
            >
              <Icon source="fire" size={22} color="#FFFFFF" />
            </View>
          </View>

          {/* Progress Card */}
          <View style={[styles.halfCard, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}>
            <Text
              variant="labelSmall"
              style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              {`PROGRESS IN\nCHAPTER ${currentChapter}`}
            </Text>
            <Text
              variant="headlineMedium"
              style={[styles.halfCardValue, { color: theme.colors.onSurface }]}
            >
              {chapterProgress}%
            </Text>
            <View style={[styles.miniBar, { backgroundColor: theme.colors.surfaceVariant }]}>
              <View style={[styles.miniBarFill, { backgroundColor: theme.custom.brandOrange, width: `${chapterProgress}%` }]} />
            </View>
          </View>

          {/* Cards Due Card */}
          <View style={[styles.halfCard, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}>
            <Text
              variant="labelSmall"
              style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              CARDS DUE
            </Text>
            <Text
              variant="headlineMedium"
              style={[styles.halfCardValue, { color: theme.colors.onSurface }]}
            >
              {cardsDue}
            </Text>
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
            >
              {cardsDue === 0 ? 'All caught up!' : 'Review ready'}
            </Text>
          </View>
        </View>

        {/* Start Practice / Review anyway CTA */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/challenge',
              params: { source: 'Practice', type: 'app_open', mode: 'continuous' },
            })
          }
          style={[styles.ctaButton, { backgroundColor: 'rgba(255,160,86,0.90)' }]}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <Text style={styles.ctaArrow}>{'\u25B6'}</Text>
        </Pressable>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <Pressable
              onPress={() => router.push('/vocabulary')}
              style={[styles.actionTile, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}
              accessibilityLabel="Vocabulary"
              accessibilityRole="button"
            >
              <Icon source="book-open-variant" size={24} color={theme.custom.brandOrange} />
              <Text
                variant="labelSmall"
                style={[styles.actionLabel, { color: theme.colors.onSurface }]}
              >
                VOCABULARY
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/stats')}
              style={[styles.actionTile, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}
              accessibilityLabel="Stats"
              accessibilityRole="button"
            >
              <Icon source="chart-bar" size={24} color={theme.custom.brandOrange} />
              <Text
                variant="labelSmall"
                style={[styles.actionLabel, { color: theme.colors.onSurface }]}
              >
                STATS
              </Text>
            </Pressable>
          </View>

          {/* PWA install prompt — web only, when browser supports it */}
          {promptInstall && (
            <Pressable
              onPress={promptInstall}
              style={[styles.installBanner, { backgroundColor: theme.custom.brandOrange }]}
              accessibilityLabel="Install app"
              accessibilityRole="button"
            >
              <Icon source="download" size={18} color="#FFFFFF" />
              <Text style={styles.installText}>Install LingoLock</Text>
            </Pressable>
          )}

          {/* Tutorial link — hidden on web */}
          {Platform.OS !== 'web' && (
            <Pressable
              onPress={() => router.push('/tutorial')}
              style={[styles.tutorialLink, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}
            >
              <Icon source="book-open-variant" size={18} color={theme.custom.brandOrange} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600', flex: 1 }}>
                Setup Tutorial
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>{'\u203A'}</Text>
            </Pressable>
          )}
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appTitle: {
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  badgeRow: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  greeting: {
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 42,
    marginBottom: 16,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  streakCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  statLabel: {
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 10,
    marginBottom: 2,
  },
  streakValue: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  fireCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  halfCard: {
    flex: 1,
    minWidth: '40%',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    gap: 2,
  },
  halfCardValue: {
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  miniBar: {
    height: 5,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 20,
    marginTop: 4,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  ctaArrow: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  bottomSection: {
    marginTop: 16,
    gap: 10,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionLabel: {
    fontWeight: '700',
    letterSpacing: 1.5,
    fontSize: 10,
  },
  installBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 20,
  },
  installText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  tutorialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
});
