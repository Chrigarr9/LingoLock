/**
 * VocabularyWidget — expo-widgets extension entry point (NOT actively used)
 *
 * ⚠️  DUAL MAINTENANCE WARNING ⚠️
 * The actual widget rendering is driven by the layout function string in
 * src/services/widgetService.ts (passed via `new Widget(name, layoutFn)`).
 * That string IS the source of truth for what users see.
 *
 * This file exists because expo-widgets may require it as a Metro bundle
 * entry point for the widget extension process. If you change widget
 * appearance, edit the layout function string in widgetService.ts — NOT
 * this file.
 */

import React from 'react';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { VStack, HStack, Text, Button, Spacer, Divider } from '@expo/ui/swift-ui';
import {
  padding,
  frame,
  font,
  foregroundStyle,
  buttonStyle,
  tint,
  lineLimit,
  multilineTextAlignment,
} from '@expo/ui/swift-ui/modifiers';
import { getWidgetCardData } from '../src/services/widgetService';

// ---------------------------------------------------------------------------
// Widget props — data passed via timeline snapshots
// ---------------------------------------------------------------------------

interface VocabularyWidgetProps {
  cardId?: string;
  sentence?: string;
  germanHint?: string;
  answerType?: 'mc2' | 'mc4' | 'text' | 'selfRated';
  choices?: string[];
  cardsLeft?: number;
  streakCount?: number;
  // Spell mode fields
  spellInput?: string;
  spellChoices?: string[];
  // Self-rated mode fields
  frontText?: string;
  backText?: string;
  isRevealed?: boolean;
}

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------

const BRAND_ORANGE = '#FFA056';
const COLOR_RED = '#EF5350';
const COLOR_GREEN = '#66BB6A';
const COLOR_BLUE = '#5B8EC4';

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Progress text shown at the bottom of Home Screen widgets */
function ProgressFooter({ cardsLeft }: { cardsLeft?: number }) {
  if (cardsLeft === undefined || cardsLeft <= 0) return null;
  return (
    <Text modifiers={[
      font({ size: 12 }),
      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
      padding({ top: 4 }),
    ]}>
      {cardsLeft} cards left today
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ streakCount }: { streakCount?: number }) {
  return (
    <VStack alignment="center" spacing={8} modifiers={[
      padding({ all: 16 }),
      frame({ maxWidth: Infinity, maxHeight: Infinity }),
    ]}>
      <Text modifiers={[font({ size: 20, weight: 'bold' })]}>
        All caught up!
      </Text>
      {streakCount && streakCount > 0 ? (
        <Text modifiers={[
          font({ size: 14 }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}>
          {streakCount} day streak
        </Text>
      ) : null}
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Self-rated card (imported deck) — revealed state
// ---------------------------------------------------------------------------

function SelfRatedRevealed({
  cardId,
  frontText,
  backText,
  isLockScreen,
}: {
  cardId: string;
  frontText: string;
  backText?: string;
  isLockScreen: boolean;
}) {
  if (isLockScreen) {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[
        padding({ all: 4 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
      ]}>
        <Text modifiers={[
          font({ size: 12 }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          lineLimit(1),
        ]}>
          {frontText}
        </Text>
        <Text modifiers={[
          font({ size: 13, weight: 'semibold' }),
          lineLimit(2),
        ]}>
          {backText}
        </Text>
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={4} modifiers={[
      padding({ all: 16 }),
      frame({ maxWidth: Infinity, maxHeight: Infinity }),
    ]}>
      <Text modifiers={[
        font({ size: 14 }),
        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        lineLimit(2),
      ]}>
        {frontText}
      </Text>
      <Divider />
      <Text modifiers={[
        font({ size: 16, weight: 'semibold' }),
        lineLimit(3),
      ]}>
        {backText}
      </Text>
      <Spacer />
      <HStack spacing={8}>
        <Button
          target={`rate:${cardId}:1`}
          label="Again"
          modifiers={[
            buttonStyle('borderedProminent'),
            tint(COLOR_RED),
          ]}
        />
        <Button
          target={`rate:${cardId}:3`}
          label="Good"
          modifiers={[
            buttonStyle('borderedProminent'),
            tint(COLOR_GREEN),
          ]}
        />
      </HStack>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Self-rated card — unrevealed state
// ---------------------------------------------------------------------------

function SelfRatedHidden({
  cardId,
  frontText,
  cardsLeft,
  isLockScreen,
}: {
  cardId: string;
  frontText: string;
  cardsLeft?: number;
  isLockScreen: boolean;
}) {
  if (isLockScreen) {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[
        padding({ all: 4 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
      ]}>
        <Text modifiers={[
          font({ size: 13, weight: 'semibold' }),
          lineLimit(3),
        ]}>
          {frontText}
        </Text>
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={8} modifiers={[
      padding({ all: 16 }),
      frame({ maxWidth: Infinity, maxHeight: Infinity }),
    ]}>
      <Text modifiers={[
        font({ size: 18, weight: 'semibold' }),
        lineLimit(4),
      ]}>
        {frontText}
      </Text>
      <Spacer />
      <Button
        target={`reveal:${cardId}`}
        label="Reveal"
        modifiers={[
          buttonStyle('borderedProminent'),
          tint(COLOR_BLUE),
        ]}
      />
      <ProgressFooter cardsLeft={cardsLeft} />
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// MC card display
// ---------------------------------------------------------------------------

function MCCard({
  cardId,
  sentence,
  germanHint,
  choices,
  cardsLeft,
  isLockScreen,
  isSmall,
}: {
  cardId: string;
  sentence: string;
  germanHint?: string;
  choices: string[];
  cardsLeft?: number;
  isLockScreen: boolean;
  isSmall: boolean;
}) {
  // Lock screen: sentence + hint only (no buttons — tap opens app)
  if (isLockScreen) {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[
        padding({ all: 4 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
      ]}>
        <Text modifiers={[
          font({ size: 13, weight: 'semibold' }),
          lineLimit(2),
        ]}>
          {sentence}
        </Text>
        {germanHint ? (
          <Text modifiers={[
            font({ size: 12 }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            lineLimit(1),
          ]}>
            {germanHint}
          </Text>
        ) : null}
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={4} modifiers={[
      padding({ all: 16 }),
      frame({ maxWidth: Infinity, maxHeight: Infinity }),
    ]}>
      {/* Sentence */}
      <Text modifiers={[
        font({ size: isSmall ? 15 : 16, weight: 'semibold' }),
        lineLimit(3),
      ]}>
        {sentence}
      </Text>

      {/* Hint — shown on all home screen sizes */}
      {germanHint ? (
        <Text modifiers={[
          font({ size: 13 }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          lineLimit(1),
        ]}>
          {germanHint}
        </Text>
      ) : null}

      <Spacer />

      {/* MC answer buttons */}
      <VStack spacing={4}>
        {choices.map((choice: string, index: number) => {
          const letter = String.fromCharCode(65 + index);
          return (
            <Button
              key={index}
              target={`answer:${cardId}:${choice}`}
              label={`${letter}) ${choice}`}
              modifiers={[
                buttonStyle('borderedProminent'),
                tint(BRAND_ORANGE),
              ]}
            />
          );
        })}
      </VStack>

      {/* Progress */}
      <ProgressFooter cardsLeft={cardsLeft} />
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Spell mode — Lock Screen (accessoryRectangular)
// ---------------------------------------------------------------------------

function SpellLockScreen({
  sentence,
  germanHint,
}: {
  cardId: string;
  sentence: string;
  germanHint?: string;
  spellInput: string;
  spellChoices: string[];
}) {
  return (
    <VStack alignment="leading" spacing={2} modifiers={[
      padding({ all: 4 }),
      frame({ maxWidth: Infinity, maxHeight: Infinity }),
    ]}>
      <Text modifiers={[
        font({ size: 13, weight: 'semibold' }),
        lineLimit(2),
      ]}>
        {sentence}
      </Text>
      {germanHint ? (
        <Text modifiers={[
          font({ size: 12 }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          lineLimit(1),
        ]}>
          {germanHint}
        </Text>
      ) : null}
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Spell mode — Home Screen (systemSmall / systemMedium)
// ---------------------------------------------------------------------------

function SpellHomeScreen({
  cardId,
  sentence,
  germanHint,
  spellInput,
  spellChoices,
  cardsLeft,
  isSmall,
}: {
  cardId: string;
  sentence: string;
  germanHint?: string;
  spellInput: string;
  spellChoices: string[];
  cardsLeft?: number;
  isSmall: boolean;
}) {
  return (
    <VStack alignment="leading" spacing={4} modifiers={[
      padding({ all: 16 }),
      frame({ maxWidth: Infinity, maxHeight: Infinity }),
    ]}>
      {/* Sentence */}
      <Text modifiers={[
        font({ size: isSmall ? 15 : 16, weight: 'semibold' }),
        lineLimit(isSmall ? 2 : 3),
      ]}>
        {sentence}
      </Text>

      {/* Hint — shown on all home screen sizes */}
      {germanHint ? (
        <Text modifiers={[
          font({ size: 13 }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          lineLimit(1),
        ]}>
          {germanHint}
        </Text>
      ) : null}

      <Spacer />

      {/* Input display */}
      <Text modifiers={[
        font({ size: 20, weight: 'semibold', design: 'monospaced' }),
        multilineTextAlignment('center'),
        frame({ maxWidth: Infinity }),
        padding({ vertical: 4 }),
      ]}>
        {spellInput || '_'}
      </Text>

      {/* Char buttons row */}
      <HStack spacing={6}>
        {spellChoices.map((char: string, index: number) => (
          <Button
            key={index}
            target={`spell:${cardId}:char:${char}`}
            label={char}
            modifiers={[
              buttonStyle('borderedProminent'),
              tint(BRAND_ORANGE),
            ]}
          />
        ))}
      </HStack>

      {/* Back / Submit row */}
      <HStack spacing={8}>
        <Button
          target={`spell:${cardId}:back`}
          label="\u2190"
          modifiers={[buttonStyle('bordered')]}
        />
        <Button
          target={`spell:${cardId}:submit`}
          label="\u2713 Submit"
          modifiers={[
            buttonStyle('borderedProminent'),
            tint(COLOR_GREEN),
          ]}
        />
      </HStack>

      {/* Progress */}
      <ProgressFooter cardsLeft={cardsLeft} />
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Main widget component
// ---------------------------------------------------------------------------

function VocabularyWidgetComponent(
  props: VocabularyWidgetProps,
  env: WidgetEnvironment,
) {
  const {
    cardId, sentence, germanHint, answerType,
    choices, cardsLeft, streakCount,
    spellInput, spellChoices,
    frontText, backText, isRevealed,
  } = props;

  const family = env.widgetFamily;
  const isLockScreen = family === 'accessoryRectangular';
  const isSmall = family === 'systemSmall';

  // Self-rated mode (imported deck cards)
  if (cardId && frontText) {
    if (isRevealed) {
      return (
        <SelfRatedRevealed
          cardId={cardId}
          frontText={frontText}
          backText={backText}
          isLockScreen={isLockScreen}
        />
      );
    }
    return (
      <SelfRatedHidden
        cardId={cardId}
        frontText={frontText}
        cardsLeft={cardsLeft}
        isLockScreen={isLockScreen}
      />
    );
  }

  // Empty state
  if (!cardId || !sentence) {
    return <EmptyState streakCount={streakCount} />;
  }

  // MC card display
  if ((answerType === 'mc2' || answerType === 'mc4') && choices && choices.length > 0) {
    return (
      <MCCard
        cardId={cardId}
        sentence={sentence}
        germanHint={germanHint}
        choices={choices}
        cardsLeft={cardsLeft}
        isLockScreen={isLockScreen}
        isSmall={isSmall}
      />
    );
  }

  // Spell mode
  const currentInput = spellInput ?? '';
  const charButtons = spellChoices ?? [];

  if (isLockScreen) {
    return (
      <SpellLockScreen
        cardId={cardId}
        sentence={sentence}
        germanHint={germanHint}
        spellInput={currentInput}
        spellChoices={charButtons}
      />
    );
  }

  return (
    <SpellHomeScreen
      cardId={cardId}
      sentence={sentence}
      germanHint={germanHint}
      spellInput={currentInput}
      spellChoices={charButtons}
      cardsLeft={cardsLeft}
      isSmall={isSmall}
    />
  );
}

// ---------------------------------------------------------------------------
// Widget instance + initialization
// ---------------------------------------------------------------------------

export const vocabularyWidget = createWidget<VocabularyWidgetProps>(
  'VocabularyWidget',
  VocabularyWidgetComponent,
);

/**
 * Initialize widget with current card data on app launch.
 * Call from the app's root layout.
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
    const { getStreak } = require('../src/services/statsService');
    vocabularyWidget.updateSnapshot({
      streakCount: getStreak(),
    });
  }
}
