import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Button, List, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { StatsCard } from '../src/components/StatsCard';
import { StatRow } from '../src/components/StatRow';
import { getTotalCards } from '../src/data/placeholderVocabulary';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        <StatsCard streak={0} progressPercent={0} cardsDue={0} />

        <Button
          mode="contained"
          onPress={() =>
            router.push({
              pathname: '/challenge',
              params: { source: 'Practice', count: '3', type: 'app_open' },
            })
          }
          style={styles.practiceButton}
          contentStyle={styles.practiceButtonContent}
          labelStyle={styles.practiceButtonLabel}
        >
          Start Practice
        </Button>

        <View
          style={[
            styles.statsContainer,
            {
              backgroundColor: theme.custom.cardBackground,
              borderColor: theme.custom.cardBorder,
            },
          ]}
        >
          <StatRow label="Today" value="0 / 0" />
          <StatRow label="Success" value="--" />
          <StatRow label="Total" value={`${getTotalCards()} cards`} isLast />
        </View>

        <View
          style={[
            styles.menuContainer,
            {
              backgroundColor: theme.custom.cardBackground,
              borderColor: theme.custom.cardBorder,
            },
          ]}
        >
          <List.Item
            title="Setup Tutorial"
            titleStyle={styles.menuTitle}
            left={(props) => (
              <List.Icon {...props} icon="book-open-outline" color={theme.colors.onSurfaceVariant} />
            )}
            right={(props) => (
              <List.Icon {...props} icon="chevron-right" color={theme.colors.outline} />
            )}
            onPress={() => router.push('/tutorial')}
            style={[styles.menuItem, { borderBottomColor: theme.custom.separator }]}
          />
          <List.Item
            title="Manage Decks"
            titleStyle={styles.menuTitle}
            description="Coming soon"
            descriptionStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}
            left={(props) => (
              <List.Icon {...props} icon="cards-outline" color={theme.colors.onSurfaceVariant} />
            )}
            right={(props) => (
              <List.Icon {...props} icon="chevron-right" color={theme.colors.outline} />
            )}
            onPress={() => {}}
          />
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
    padding: 16,
    gap: 12,
  },
  practiceButton: {
    borderRadius: 12,
    marginTop: 4,
  },
  practiceButtonContent: {
    paddingVertical: 6,
  },
  practiceButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
  statsContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuTitle: {
    fontSize: 15,
  },
});
