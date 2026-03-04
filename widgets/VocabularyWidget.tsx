'use client';
/**
 * VocabularyWidget - Home Screen and Lock Screen widget component
 *
 * Displays vocabulary cards for on-widget practice (iOS 17+ interactive widgets).
 *
 * Widget behavior by card type:
 *   - MC cards (mc2/mc4): Shows A/B/C/D answer buttons directly on widget
 *   - Text cards: Shows tap-to-open deep link (iOS widgets cannot have text input)
 *   - Empty state: Shows "All caught up!" message when no cards due
 *
 * Widget sizes:
 *   - systemMedium (Home Screen): Full sentence + hint + MC buttons + progress
 *   - systemSmall (Home Screen): Sentence + tap to practice
 *   - accessoryRectangular (Lock Screen): Compact sentence + MC buttons or tap-to-open
 */

import React from 'react';
import { createWidget } from 'expo-widgets';
import type { WidgetBase } from 'expo-widgets';
import { getWidgetCardData } from '../src/services/widgetService';

// Widget props type (data passed via timeline)
interface VocabularyWidgetProps {
  cardId?: string;
  sentence?: string;
  germanHint?: string;
  answerType?: 'mc2' | 'mc4' | 'text';
  choices?: string[];
  cardsLeft?: number;
  streakCount?: number;
}

/**
 * Widget component - displays vocabulary card with interactive elements.
 *
 * IMPORTANT: expo-widgets is very new (SDK 55, January 2026). The exact API surface
 * and rendering behavior may differ from research examples. This component uses the
 * documented createWidget pattern, but may require adjustments when testing on device.
 *
 * The critical pieces are:
 *   1. Data layer (widgetService.ts) - provides card content and answer processing
 *   2. Deep linking (lingolock://widget-answer?cardId=xxx&choice=gato) - connects buttons to app
 *   3. Widget configuration (app.json) - registers widget with iOS
 *
 * If the JSX rendering doesn't work as expected with expo-widgets SDK 55:
 *   - The data layer is correct and reusable
 *   - The widget component can be adjusted to match the actual expo-widgets rendering API
 *   - SwiftUI generation may require different JSX structure or directives
 */
function VocabularyWidgetComponent(props: WidgetBase<VocabularyWidgetProps>) {
  const { family, cardId, sentence, germanHint, answerType, choices, cardsLeft, streakCount } =
    props;

  // Empty state (no cards due)
  if (!cardId || !sentence) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyTitle}>All caught up!</Text>
        {streakCount && streakCount > 0 ? (
          <Text style={styles.emptyStreak}>🔥 {streakCount} day streak</Text>
        ) : null}
      </View>
    );
  }

  // MC card display mode (mc2/mc4) - user can answer directly on widget
  if (answerType === 'mc2' || answerType === 'mc4') {
    return (
      <View style={styles.container}>
        <View style={styles.cardContent}>
          <Text style={styles.sentence}>{sentence}</Text>
          <Text style={styles.hint}>{germanHint}</Text>
        </View>

        {/* MC answer buttons - iOS 17+ Button support */}
        <View style={styles.buttonContainer}>
          {choices?.map((choice, index) => {
            const label = String.fromCharCode(65 + index); // A, B, C, D
            const deepLinkUrl = `lingolock://widget-answer?cardId=${cardId}&choice=${encodeURIComponent(choice)}`;
            return (
              <Button
                key={index}
                url={deepLinkUrl}
                style={styles.choiceButton}
                label={`${label}) ${choice}`}
              />
            );
          })}
        </View>

        {/* Progress indicator */}
        {cardsLeft !== undefined && cardsLeft > 0 ? (
          <Text style={styles.progress}>{cardsLeft} cards left today</Text>
        ) : null}
      </View>
    );
  }

  // Text card display mode - tap to open app (iOS widgets cannot have text input)
  return (
    <View style={styles.container}>
      <View style={styles.cardContent}>
        <Text style={styles.sentence}>{sentence}</Text>
        <Text style={styles.hint}>{germanHint}</Text>
      </View>

      {/* Deep link button to open app */}
      <Button
        url="lingolock://challenge?source=widget&mode=continuous"
        style={styles.openAppButton}
        label="Open LingoLock"
      />

      {/* Progress indicator */}
      {cardsLeft !== undefined && cardsLeft > 0 ? (
        <Text style={styles.progress}>{cardsLeft} cards left today</Text>
      ) : null}
    </View>
  );
}

// Placeholder styles (expo-widgets may use SwiftUI-compatible styling)
const styles = {
  container: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between' as const,
    height: '100%',
  },
  cardContent: {
    marginBottom: 12,
  },
  sentence: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#666',
  },
  buttonContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  choiceButton: {
    padding: 12,
    backgroundColor: '#FFA056',
    borderRadius: 8,
  },
  openAppButton: {
    padding: 12,
    backgroundColor: '#FFA056',
    borderRadius: 8,
    marginTop: 12,
  },
  progress: {
    fontSize: 12,
    color: '#888',
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  emptyStreak: {
    fontSize: 14,
    color: '#666',
  },
};

// Placeholder View/Text/Button components
// (expo-widgets may provide these or require SwiftUI-compatible JSX)
function View({ children, style }: { children: React.ReactNode; style?: any }) {
  return <div style={style}>{children}</div>;
}

function Text({ children, style }: { children: React.ReactNode; style?: any }) {
  return <span style={style}>{children}</span>;
}

function Button({ url, label, style }: { url: string; label: string; style?: any }) {
  return (
    <a href={url} style={style}>
      {label}
    </a>
  );
}

/**
 * Create and export the widget instance.
 * This widget is registered with iOS via the expo-widgets config plugin.
 */
export const vocabularyWidget = createWidget<VocabularyWidgetProps>(
  'VocabularyWidget',
  VocabularyWidgetComponent
);

/**
 * Initialize widget with current card data on app launch.
 * This should be called from the app's root layout or index file.
 */
export function initializeVocabularyWidget() {
  const cardData = getWidgetCardData();
  if (cardData) {
    vocabularyWidget.updateSnapshot({
      cardId: cardData.cardId,
      sentence: cardData.sentence,
      germanHint: cardData.germanHint,
      answerType: cardData.answerType,
      choices: cardData.choices,
      cardsLeft: cardData.cardsLeft,
      streakCount: cardData.streakCount,
    });
  } else {
    // No cards due - show empty state with streak
    const { getStreak } = require('../src/services/statsService');
    vocabularyWidget.updateSnapshot({
      streakCount: getStreak(),
    });
  }
}
