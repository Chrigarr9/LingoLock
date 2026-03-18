'use client';
/**
 * VocabularyWidget - Home Screen and Lock Screen widget component
 *
 * Displays vocabulary cards for on-widget practice (iOS 17+ interactive widgets).
 *
 * Widget behavior by card type:
 *   - MC cards (mc2/mc4): Shows A/B/C/D answer buttons directly on widget
 *   - Text cards: Shows character-picker "spell" keyboard (4 char buttons + back + submit)
 *   - Empty state: Shows "All caught up!" message when no cards due
 *
 * Widget sizes:
 *   - systemMedium (Home Screen): Full sentence + hint + spell/MC buttons + progress
 *   - systemSmall (Home Screen): Sentence + spell/MC buttons (compact)
 *   - accessoryRectangular (Lock Screen): Compact char buttons + input display
 */

import React from 'react';
import { createWidget } from 'expo-widgets';
import { getWidgetCardData } from '../src/services/widgetService';

// Widget props type (data passed via timeline)
interface VocabularyWidgetProps {
  cardId?: string;
  sentence?: string;
  germanHint?: string;
  answerType?: 'mc2' | 'mc4' | 'text' | 'selfRated';
  choices?: string[];
  cardsLeft?: number;
  streakCount?: number;
  // Spell mode fields (character-picker keyboard for text cards)
  spellInput?: string;
  spellChoices?: string[];
  // Self-rated mode fields (imported deck cards)
  frontText?: string;
  backText?: string;
  isRevealed?: boolean;
}

/**
 * Determine how many character buttons to show based on widget family.
 * Larger widgets get more buttons; Lock Screen gets fewer.
 */
function getCharButtonCount(family?: string): number {
  switch (family) {
    case 'accessoryRectangular': return 4;
    case 'systemSmall': return 4;
    case 'systemMedium':
    default: return 4;
  }
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
 *   2. Deep linking (lingolock://widget-answer, lingolock://widget-spell) - connects buttons to app
 *   3. Widget configuration (app.json) - registers widget with iOS
 */
function VocabularyWidgetComponent(props: VocabularyWidgetProps & { family?: string }) {
  const {
    family, cardId, sentence, germanHint, answerType,
    choices, cardsLeft, streakCount,
    spellInput, spellChoices,
    frontText, backText, isRevealed,
  } = props;

  const isLockScreen = family === 'accessoryRectangular';
  const isSmall = family === 'systemSmall';

  // Self-rated mode — must come BEFORE empty state check (sentence is empty for these)
  if (cardId && frontText) {
    if (isRevealed) {
      return (
        <View style={styles.container}>
          <View style={styles.cardContent}>
            <Text style={isLockScreen ? styles.sentenceCompact : styles.selfRatedFrontSmall}>{frontText}</Text>
            <View style={styles.selfRatedDivider} />
            <Text style={isLockScreen ? styles.sentenceCompact : styles.sentence}>{backText}</Text>
          </View>
          <View style={styles.selfRatedButtons}>
            <Button
              url={`lingolock://widget-rate?cardId=${cardId}&rating=1`}
              style={styles.againButton}
              label="✗"
            />
            <Button
              url={`lingolock://widget-rate?cardId=${cardId}&rating=3`}
              style={styles.goodButton}
              label="✓"
            />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.cardContent}>
          <Text style={isLockScreen ? styles.sentenceCompact : styles.sentence}>{frontText}</Text>
        </View>
        <Button
          url={`lingolock://widget-reveal?cardId=${cardId}`}
          style={styles.revealWidgetButton}
          label="Reveal"
        />
        {!isLockScreen && cardsLeft !== undefined && cardsLeft > 0 ? (
          <Text style={styles.progress}>{cardsLeft} cards left today</Text>
        ) : null}
      </View>
    );
  }

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
          <Text style={isLockScreen ? styles.sentenceCompact : styles.sentence}>{sentence}</Text>
          {!isLockScreen ? <Text style={styles.hint}>{germanHint}</Text> : null}
        </View>

        {/* MC answer buttons - iOS 17+ Button support */}
        <View style={styles.buttonContainer}>
          {choices?.map((choice: string, index: number) => {
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
        {!isLockScreen && cardsLeft !== undefined && cardsLeft > 0 ? (
          <Text style={styles.progress}>{cardsLeft} cards left today</Text>
        ) : null}
      </View>
    );
  }

  // Spell mode — character-picker keyboard for text cards
  // Shows typed input + 4 character buttons + back (←) + submit (✓)
  const currentInput = spellInput ?? '';
  const charButtons = spellChoices ?? [];

  if (isLockScreen) {
    // Lock Screen: ultra-compact layout — input + char buttons + back in one row
    return (
      <View style={styles.lockScreenContainer}>
        <Text style={styles.lockScreenInput}>
          {currentInput || '···'}
        </Text>
        <View style={styles.lockScreenButtons}>
          {charButtons.map((char: string, index: number) => (
            <Button
              key={index}
              url={`lingolock://widget-spell?cardId=${cardId}&action=char&char=${encodeURIComponent(char)}`}
              style={styles.charButtonCompact}
              label={char}
            />
          ))}
          <Button
            url={`lingolock://widget-spell?cardId=${cardId}&action=back`}
            style={styles.backButtonCompact}
            label="←"
          />
          <Button
            url={`lingolock://widget-spell?cardId=${cardId}&action=submit`}
            style={styles.submitButtonCompact}
            label="✓"
          />
        </View>
      </View>
    );
  }

  // Home Screen (systemSmall / systemMedium): sentence + input display + char buttons + back/submit
  return (
    <View style={styles.container}>
      <View style={styles.cardContent}>
        <Text style={isSmall ? styles.sentenceCompact : styles.sentence}>{sentence}</Text>
        {!isSmall ? <Text style={styles.hint}>{germanHint}</Text> : null}
      </View>

      {/* Current typed input */}
      <View style={styles.spellInputContainer}>
        <Text style={styles.spellInputText}>
          {currentInput || '_'}
        </Text>
      </View>

      {/* Character picker buttons */}
      <View style={styles.charButtonRow}>
        {charButtons.map((char: string, index: number) => (
          <Button
            key={index}
            url={`lingolock://widget-spell?cardId=${cardId}&action=char&char=${encodeURIComponent(char)}`}
            style={styles.charButton}
            label={char}
          />
        ))}
      </View>

      {/* Back and Submit buttons */}
      <View style={styles.actionButtonRow}>
        <Button
          url={`lingolock://widget-spell?cardId=${cardId}&action=back`}
          style={styles.backButton}
          label="←"
        />
        <Button
          url={`lingolock://widget-spell?cardId=${cardId}&action=submit`}
          style={styles.submitButton}
          label="✓ Submit"
        />
      </View>

      {/* Progress indicator */}
      {!isSmall && cardsLeft !== undefined && cardsLeft > 0 ? (
        <Text style={styles.progress}>{cardsLeft} cards left today</Text>
      ) : null}
    </View>
  );
}

// Styles (expo-widgets may use SwiftUI-compatible styling)
const styles = {
  container: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between' as const,
    height: '100%',
  },
  cardContent: {
    marginBottom: 8,
  },
  sentence: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  sentenceCompact: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 2,
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
  progress: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
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

  // Spell mode — Home Screen
  spellInputContainer: {
    padding: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginBottom: 8,
    minHeight: 36,
    display: 'flex',
    justifyContent: 'center' as const,
  },
  spellInputText: {
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: 2,
    textAlign: 'center' as const,
  },
  charButtonRow: {
    display: 'flex',
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginBottom: 8,
  },
  charButton: {
    width: 44,
    height: 44,
    backgroundColor: '#FFA056',
    borderRadius: 10,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    fontSize: 20,
    fontWeight: '600' as const,
  },
  actionButtonRow: {
    display: 'flex',
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  backButton: {
    width: 44,
    height: 36,
    backgroundColor: '#DDD',
    borderRadius: 8,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    fontSize: 18,
  },
  submitButton: {
    flex: 1,
    height: 36,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },

  // Spell mode — Lock Screen (accessoryRectangular)
  lockScreenContainer: {
    padding: 4,
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: '100%',
    gap: 4,
  },
  lockScreenInput: {
    fontSize: 12,
    fontWeight: '600' as const,
    minWidth: 30,
    textAlign: 'center' as const,
  },
  lockScreenButtons: {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 3,
  },
  charButtonCompact: {
    width: 24,
    height: 24,
    backgroundColor: '#FFA056',
    borderRadius: 6,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  backButtonCompact: {
    width: 24,
    height: 24,
    backgroundColor: '#DDD',
    borderRadius: 6,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    fontSize: 14,
  },
  submitButtonCompact: {
    width: 24,
    height: 24,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    fontSize: 14,
    color: '#FFF',
  },

  // Self-rated mode styles
  selfRatedFrontSmall: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  selfRatedDivider: {
    height: 1,
    backgroundColor: '#DDD',
    marginVertical: 4,
  },
  selfRatedButtons: {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'center' as const,
  },
  againButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#EF5350',
    borderRadius: 8,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700' as const,
  },
  goodButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#66BB6A',
    borderRadius: 8,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700' as const,
  },
  revealWidgetButton: {
    padding: 10,
    backgroundColor: '#5B8EC4',
    borderRadius: 8,
    display: 'flex',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
};

// Placeholder View/Text/Button components
// (expo-widgets may provide these or require SwiftUI-compatible JSX)
function View({ children, style }: { children?: React.ReactNode; style?: any }) {
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
      spellInput: cardData.spellInput,
      spellChoices: cardData.spellChoices,
      frontText: cardData.frontText,
      backText: cardData.backText,
      isRevealed: cardData.isRevealed,
    });
  } else {
    // No cards due - show empty state with streak
    const { getStreak } = require('../src/services/statsService');
    vocabularyWidget.updateSnapshot({
      streakCount: getStreak(),
    });
  }
}
