import React, { useState, useCallback, useMemo } from 'react';
import { SectionList, View, StyleSheet, Pressable } from 'react-native';
import { Text, Searchbar } from 'react-native-paper';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { CHAPTERS } from '../src/content/bundle';
import { loadCardState } from '../src/services/storage';
import { isCardMastered } from '../src/services/fsrs';
import { getChapterMastery } from '../src/services/statsService';
import type { ClozeCard } from '../src/types/vocabulary';

type MasteryStatus = 'new' | 'learning' | 'mastered';

interface SectionData {
  title: string;
  chapterNumber: number;
  data: ClozeCard[];
}

export default function VocabularyScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const params = useLocalSearchParams<{ chapter?: string }>();

  const [search, setSearch] = useState('');
  const [focusKey, setFocusKey] = useState(0);

  // Refresh mastery data every time screen gains focus
  useFocusEffect(useCallback(() => { setFocusKey(k => k + 1); }, []));

  const filterChapter = params.chapter ? parseInt(params.chapter, 10) : null;

  // Compute mastery status for every card (memoized — per RESEARCH.md Pitfall 3)
  const masteryMap = useMemo<Record<string, MasteryStatus>>(() => {
    const map: Record<string, MasteryStatus> = {};
    for (const ch of CHAPTERS) {
      for (const card of ch.cards) {
        const state = loadCardState(card.id);
        if (state === null) map[card.id] = 'new';
        else if (isCardMastered(state)) map[card.id] = 'mastered';
        else map[card.id] = 'learning';
      }
    }
    return map;
  }, [focusKey]);

  // Chapter mastery percentages (memoized alongside masteryMap)
  const chapterMastery = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const ch of CHAPTERS) {
      m[ch.chapterNumber] = getChapterMastery(ch.chapterNumber);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Build filtered, search-narrowed sections
  const sections = useMemo<SectionData[]>(() => {
    const lc = search.toLowerCase();
    return CHAPTERS
      .filter(ch => filterChapter === null || ch.chapterNumber === filterChapter)
      .map(ch => ({
        title: `Chapter ${ch.chapterNumber}`,
        chapterNumber: ch.chapterNumber,
        data: ch.cards.filter(card =>
          !lc ||
          card.wordInContext.toLowerCase().includes(lc) ||
          card.germanHint.toLowerCase().includes(lc) ||
          card.lemma.toLowerCase().includes(lc)
        ),
      }))
      .filter(s => s.data.length > 0);
  }, [search, filterChapter, focusKey]);

  // Mastery dot color
  const dotColor = (status: MasteryStatus): string => {
    switch (status) {
      case 'mastered': return theme.custom.success;
      case 'learning': return theme.custom.brandOrange;
      default:         return theme.colors.onSurfaceVariant;
    }
  };

  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
      <Text
        variant="labelSmall"
        style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}
      >
        {section.title.toUpperCase()}
      </Text>
      <Text
        variant="labelSmall"
        style={[styles.sectionMastery, { color: theme.custom.brandOrange }]}
      >
        {chapterMastery[section.chapterNumber] ?? 0}% MASTERED
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: ClozeCard }) => {
    const status = masteryMap[item.id] ?? 'new';
    return (
      <Pressable
        onPress={() =>
          router.push({ pathname: '/vocabulary/[id]', params: { id: item.id } })
        }
        style={({ pressed }) => [
          styles.wordRow,
          {
            backgroundColor: pressed
              ? theme.custom.cardBackground
              : theme.colors.background,
            borderBottomColor: theme.custom.separator,
          },
        ]}
      >
        {/* Mastery dot */}
        <View
          style={[
            styles.masteryDot,
            { backgroundColor: dotColor(status) },
          ]}
        />

        {/* Word info */}
        <View style={styles.wordInfo}>
          <Text
            variant="bodyLarge"
            style={[styles.spanishWord, { color: theme.colors.onSurface }]}
          >
            {item.wordInContext}
          </Text>
          <Text
            variant="bodySmall"
            style={[styles.germanHint, { color: theme.colors.onSurfaceVariant }]}
          >
            {item.germanHint}
          </Text>
        </View>

        {/* Chevron */}
        <Text style={[styles.chevron, { color: theme.colors.onSurfaceVariant }]}>
          {'\u203A'}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Screen title */}
      <View style={[styles.screenHeader, { borderBottomColor: theme.custom.separator }]}>
        <Text
          variant="headlineSmall"
          style={[styles.screenTitle, { color: theme.colors.onSurface }]}
        >
          Vocabulary
        </Text>
        {filterChapter !== null && (
          <Text
            variant="labelMedium"
            style={{ color: theme.custom.brandOrange, marginTop: 2 }}
          >
            Chapter {filterChapter}
          </Text>
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search Spanish or German..."
          value={search}
          onChangeText={setSearch}
          style={[styles.searchBar, { backgroundColor: theme.custom.cardBackground }]}
          inputStyle={{ color: theme.colors.onSurface }}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          iconColor={theme.colors.onSurfaceVariant}
        />
      </View>

      {/* Word list */}
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              variant="bodyLarge"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
            >
              {search ? 'No words match your search.' : 'No vocabulary yet.'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  screenTitle: {
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBar: {
    borderRadius: 12,
    elevation: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionMastery: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  masteryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  wordInfo: {
    flex: 1,
    gap: 2,
  },
  spanishWord: {
    fontWeight: '600',
  },
  germanHint: {
    // no additional overrides needed
  },
  chevron: {
    fontSize: 20,
  },
  empty: {
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  listContent: {
    paddingBottom: 20,
  },
});
