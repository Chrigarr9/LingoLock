import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { getStreak, getChapterMastery, getCardsDueCount, getCurrentChapterNumber } from '../src/services/statsService';
import { getTotalCards } from '../src/content/bundle';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  const [streak, setStreak] = useState(0);
  const [chapterProgress, setChapterProgress] = useState(0);
  const [cardsDue, setCardsDue] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(1);

  // Refresh stats when screen gains focus (returning from challenge)
  useFocusEffect(
    useCallback(() => {
      setStreak(getStreak());
      const chapter = getCurrentChapterNumber();
      setCurrentChapter(chapter);
      setChapterProgress(getChapterMastery(chapter));
      setCardsDue(getCardsDueCount());
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

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.logoContainer, { backgroundColor: theme.colors.primaryContainer }]}>
              <Text style={[styles.logoIcon, { color: theme.custom.brandOrange }]}>
                {'\uD83C\uDF0D'}
              </Text>
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
            <Text style={[styles.badgeText, { color: theme.custom.labelMuted }]}>
              {'\uD83C\uDF0D'}  SPANISH
            </Text>
          </View>
        </View>

        {/* Greeting */}
        <Text
          variant="displaySmall"
          style={[styles.greeting, { color: theme.colors.onSurface }]}
        >
          {'¡Hola!\nReady to practice?'}
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
              <Text style={styles.fireIcon}>{'\uD83D\uDD25'}</Text>
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

        {/* Start Practice CTA */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/challenge',
              params: { source: 'Practice', count: '5', type: 'app_open' },
            })
          }
          style={[styles.ctaButton, { backgroundColor: 'rgba(255,160,86,0.90)' }]}
        >
          <Text style={styles.ctaText}>Start Practice</Text>
          <Text style={styles.ctaArrow}>{'\u25B6'}</Text>
        </Pressable>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <Pressable
              onPress={() => {}}
              style={[styles.actionTile, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}
            >
              <Text style={[styles.actionIcon, { color: theme.custom.brandOrange }]}>
                {'\uD83D\uDCD6'}
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.actionLabel, { color: theme.colors.onSurface }]}
              >
                VOCABULARY
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {}}
              style={[styles.actionTile, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}
            >
              <Text style={[styles.actionIcon, { color: theme.custom.brandOrange }]}>
                {'\uD83D\uDCCA'}
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.actionLabel, { color: theme.colors.onSurface }]}
              >
                STATS
              </Text>
            </Pressable>
          </View>

          {/* Tutorial link */}
          <Pressable
            onPress={() => router.push('/tutorial')}
            style={[styles.tutorialLink, { backgroundColor: theme.custom.cardBackground, borderColor: theme.custom.cardBorder }]}
          >
            <Text style={{ color: theme.custom.brandOrange, fontSize: 18 }}>{'\uD83D\uDCD6'}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600', flex: 1 }}>
              Setup Tutorial
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>{'\u203A'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
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
  logoIcon: {
    fontSize: 20,
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
  fireIcon: {
    fontSize: 20,
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
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
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
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    fontWeight: '700',
    letterSpacing: 1.5,
    fontSize: 10,
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
