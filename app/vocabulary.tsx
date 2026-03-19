import React, { useMemo } from 'react';
import { SectionList, View, StyleSheet, Pressable } from 'react-native';
import { Text, Searchbar } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, labelOverlineStyle } from '../src/theme';
import { getChapterMastery } from '../src/services/statsService';
import { useActiveBundle } from '../src/content/activeBundleProvider';
import { deriveMastery, getMasteryColor } from '../src/utils/mastery';
import { useFocusRefresh } from '../src/hooks/useFocusRefresh';
import type { ClozeCard, ChapterData, MasteryStatus } from '../src/types/vocabulary';
import type { SimpleCard } from '../src/types/simpleCard';
import { useState } from 'react';

type AnyCard = ClozeCard | SimpleCard;

interface SectionData {
  title: string;
  chapterNumber: number;
  data: AnyCard[];
}

/** Extract display fields uniformly from either card type */
function getCardDisplay(card: AnyCard): { primary: string; secondary: string } {
  if (card.kind === 'cloze') {
    return { primary: card.wordInContext, secondary: card.germanHint };
  }
  return { primary: card.front, secondary: card.back };
}

/** Get searchable text from either card type */
function getSearchableText(card: AnyCard): string {
  if (card.kind === 'cloze') {
    return `${card.wordInContext} ${card.germanHint} ${card.lemma}`.toLowerCase();
  }
  return `${card.front} ${card.back}`.toLowerCase();
}

export default function VocabularyScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { config, chapters } = useActiveBundle();
  const params = useLocalSearchParams<{ chapter?: string }>();

  const [search, setSearch] = useState('');
  const focusKey = useFocusRefresh();

  const filterChapter = params.chapter ? parseInt(params.chapter, 10) : null;

  // Compute mastery status for every card (memoized)
  const masteryMap = useMemo<Record<string, MasteryStatus>>(() => {
    const map: Record<string, MasteryStatus> = {};
    for (const ch of chapters) {
      for (const card of ch.cards) {
        map[card.id] = deriveMastery(card.id);
      }
    }
    return map;
  }, [focusKey, chapters]);

  // Chapter mastery percentages (memoized alongside masteryMap)
  const chapterMastery = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const ch of chapters) {
      m[ch.chapterNumber] = getChapterMastery(chapters, ch.chapterNumber);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, chapters]);

  // Build filtered, search-narrowed sections
  const sections = useMemo<SectionData[]>(() => {
    const lc = search.toLowerCase();
    return chapters
      .filter(ch => filterChapter === null || ch.chapterNumber === filterChapter)
      .map(ch => ({
        title: `Chapter ${ch.chapterNumber}`,
        chapterNumber: ch.chapterNumber,
        data: ch.cards.filter(card => !lc || getSearchableText(card).includes(lc)),
      }))
      .filter(s => s.data.length > 0);
  }, [search, filterChapter, chapters]);

  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
      <Text
        variant="labelSmall"
        style={[labelOverlineStyle.label, { color: theme.colors.onSurfaceVariant }]}
      >
        {section.title.toUpperCase()}
      </Text>
      <Text
        variant="labelSmall"
        style={[styles.sectionMastery, { color: theme.custom.brandBlue }]}
      >
        {chapterMastery[section.chapterNumber] ?? 0}% MASTERED
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: AnyCard }) => {
    const status = masteryMap[item.id] ?? 'New';
    const { primary, secondary } = getCardDisplay(item);
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
            { backgroundColor: getMasteryColor(status, theme) },
          ]}
        />

        {/* Word info */}
        <View style={styles.wordInfo}>
          <Text
            variant="bodyLarge"
            style={[styles.spanishWord, { color: theme.colors.onSurface }]}
          >
            {primary}
          </Text>
          <Text
            variant="bodySmall"
            style={[styles.germanHint, { color: theme.colors.onSurfaceVariant }]}
          >
            {secondary}
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
      edges={['bottom']}
    >
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder={config.searchPlaceholder}
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
