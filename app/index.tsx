import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, List, Surface, Text } from 'react-native-paper';
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
        >
          Start Practice
        </Button>

        <Surface style={styles.statsSurface} elevation={1}>
          <StatRow label="Today" value="0 / 0" />
          <StatRow label="Success" value="--" />
          <StatRow label="Total" value={`${getTotalCards()} cards`} />
        </Surface>

        <Surface style={styles.menuSurface} elevation={1}>
          <List.Item
            title="Setup Tutorial"
            left={(props) => <List.Icon {...props} icon="book-open-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/tutorial')}
          />
          <List.Item
            title="Manage Decks"
            left={(props) => <List.Icon {...props} icon="cards-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {}}
            description="Coming in Phase 3"
          />
        </Surface>
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
    gap: 16,
  },
  practiceButton: {
    paddingVertical: 4,
  },
  practiceButtonContent: {
    paddingVertical: 8,
  },
  statsSurface: {
    padding: 16,
    borderRadius: 12,
  },
  menuSurface: {
    borderRadius: 12,
    overflow: 'hidden',
  },
});
