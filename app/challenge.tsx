/**
 * Challenge Screen - Fullscreen vocabulary challenge interface
 * Core learning interface where users answer vocabulary questions
 *
 * Design: iOS-native, minimalist, card-based presentation
 * Entry: Deep link via lingolock://challenge?source=Instagram&count=3&type=app_open
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, useColorScheme, SafeAreaView, StatusBar, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VocabularyCard } from '../src/components/VocabularyCard';
import { PLACEHOLDER_CARDS } from '../src/data/placeholderVocabulary';

/**
 * Challenge screen displays vocabulary cards in fullscreen modal
 *
 * Features:
 * - Receives deep link parameters (source, count, type)
 * - Displays vocabulary cards from placeholder data
 * - Emergency escape via close button (✕) in top-right
 * - Automatic dark mode adaptation
 * - SafeAreaView handles iOS notch and home indicator
 */
export default function ChallengeScreen() {
  const params = useLocalSearchParams<{
    source: string;
    count: string;
    type: 'unlock' | 'app_open';
  }>();
  const router = useRouter();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const cardCount = parseInt(params.count || '3', 10);
  const cards = PLACEHOLDER_CARDS.slice(0, cardCount);
  const currentCard = cards[currentIndex];

  useEffect(() => {
    // Log challenge start for debugging
    console.log('[Challenge] Started:', {
      source: params.source,
      count: cardCount,
      type: params.type
    });
  }, []);

  const handleEmergencyExit = () => {
    console.log('[Challenge] Emergency exit triggered');
    router.back();
  };

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: isDark ? '#000000' : '#ffffff' }
    ]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Emergency escape close button (top-right) */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleEmergencyExit}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Close challenge"
        accessibilityRole="button"
      >
        <Text style={[
          styles.closeIcon,
          { color: isDark ? '#8e8e93' : '#8e8e93' }  // iOS secondary label color
        ]}>✕</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {currentCard && (
          <VocabularyCard
            card={currentCard}
            showAnswer={showAnswer}
          />
        )}

        {/* Input field and navigation buttons will be added in Plans 05 and 06 */}
        {/* For now, this screen just displays the vocabulary card */}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  closeIcon: {
    fontSize: 28,
    fontWeight: '300',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
});
