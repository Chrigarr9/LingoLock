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
import { ContinueButton } from '../src/components/ContinueButton';
import { PLACEHOLDER_CARDS } from '../src/data/placeholderVocabulary';

/**
 * Challenge screen displays vocabulary cards in fullscreen modal
 *
 * Features:
 * - Receives deep link parameters (source, count, type)
 * - Displays vocabulary cards from placeholder data
 * - Emergency escape via close button (✕) in top-right
 * - Continue button after completion to return to source app
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
  const [isComplete, setIsComplete] = useState(false);

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

  const handleContinue = () => {
    console.log('[Challenge] Continue button pressed, deep link flow initiated');
    // Deep link opener will handle opening the source app
    // After deep link attempt, user can manually close the app if needed
  };

  // Simulate challenge completion for testing (temporary)
  // In real implementation, this will be triggered after answering all cards correctly
  useEffect(() => {
    // Auto-complete after 2 seconds for demonstration
    const timer = setTimeout(() => {
      setIsComplete(true);
      console.log('[Challenge] Challenge completed, showing continue button');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

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

        {/* Show continue button after challenge completion */}
        {isComplete && params.source && (
          <View style={styles.continueButtonContainer}>
            <ContinueButton
              sourceApp={params.source}
              challengeType={params.type || 'app_open'}
              onPress={handleContinue}
            />
          </View>
        )}

        {/* Input field and navigation buttons will be added in later plans */}
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
  continueButtonContainer: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
});
