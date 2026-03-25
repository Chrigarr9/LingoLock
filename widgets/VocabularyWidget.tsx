/**
 * VocabularyWidget — Home Screen / Lock Screen widget layout.
 *
 * The "widget" directive causes babel-preset-expo to transform this function
 * into a string template literal. That string is stored in UserDefaults and
 * evaluated inside the widget extension's JSContext, where @expo/ui/swift-ui
 * components are stubbed to produce SwiftUI view tree objects.
 *
 * IMPORTANT: Use a standalone function declaration (not `export default function`).
 * The Babel widgets-plugin replaces the function with a `var` declaration — this
 * breaks when nested inside `export default`.
 */

import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { VStack, HStack, Text, Button, Spacer } from '@expo/ui/swift-ui';
import { Link } from '@expo/ui/swift-ui';
import {
  padding,
  font,
  foregroundStyle,
  lineLimit,
  frame,
} from '@expo/ui/swift-ui/modifiers';

interface WidgetProps {
  cardId?: string;
  sentence?: string;
  germanHint?: string;
  correctAnswer?: string;
  sentenceTranslation?: string;
  answerType?: string;
  choices?: string[];
  cardsLeft?: number;
  streakCount?: number;
}

function VocabularyWidgetLayout(
  props: WidgetProps,
  env: WidgetEnvironment,
) {
  "widget";

  const family = env.widgetFamily;
  const isLock = family === 'accessoryRectangular';
  const isSmall = family === 'systemSmall';

  const fP = foregroundStyle({ type: 'hierarchical', style: 'primary' });
  const fS = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

  // ── Lock screen + Small: sentence + hint, tap opens app ──
  if (isSmall || isLock) {
    const pad = isLock ? 4 : 14;

    if (!props.cardId || !props.sentence) {
      return (
        <Link href="lingolock://challenge?source=Widget">
          <VStack alignment="center" spacing={isLock ? 2 : 4} modifiers={[padding({ all: pad })]}>
            <Text modifiers={[font({ size: isLock ? 13 : 16, weight: 'bold' }), fP]}>
              All caught up!
            </Text>
            {(props.streakCount ?? 0) > 0 ? (
              <Text modifiers={[font({ size: isLock ? 10 : 12 }), fS]}>
                {props.streakCount} day streak
              </Text>
            ) : null}
          </VStack>
        </Link>
      );
    }

    return (
      <Link href="lingolock://challenge?source=Widget">
        <VStack alignment="leading" spacing={isLock ? 2 : 4} modifiers={[padding({ all: pad })]}>
          <Text modifiers={[font({ size: isLock ? 13 : 15, weight: 'semibold' }), fP, lineLimit(isLock ? 2 : 4)]}>
            {props.sentence}
          </Text>
          {props.germanHint ? (
            <Text modifiers={[font({ size: isLock ? 12 : 13 }), fS, lineLimit(1)]}>
              {props.germanHint}
            </Text>
          ) : null}
          {(props.cardsLeft ?? 0) > 0 ? (
            <Text modifiers={[font({ size: isLock ? 9 : 11 }), fS]}>
              {props.cardsLeft} cards left
            </Text>
          ) : null}
        </VStack>
      </Link>
    );
  }

  // ── Medium widget: empty state ──
  if (!props.cardId || !props.sentence) {
    return (
      <VStack alignment="center" spacing={6} modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ size: 18, weight: 'bold' }), fP]}>
          All caught up!
        </Text>
        {(props.streakCount ?? 0) > 0 ? (
          <Text modifiers={[font({ size: 12 }), fS]}>
            {props.streakCount} day streak
          </Text>
        ) : null}
      </VStack>
    );
  }

  // ── Medium widget: MC card ──
  if (props.choices && props.choices.length > 0) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 12 })]}>
        {(props.cardsLeft ?? 0) > 0 ? (
          <HStack>
            <Spacer />
            <Text modifiers={[font({ size: 10 }), fS]}>{props.cardsLeft} left</Text>
          </HStack>
        ) : null}
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), fP, lineLimit(3)]}>
          {props.sentence}
        </Text>
        {props.sentenceTranslation ? (
          <Text modifiers={[font({ size: 11 }), fS, lineLimit(2)]}>
            {props.sentenceTranslation}
          </Text>
        ) : null}
        <Spacer />
        <HStack spacing={6}>
          {props.choices.map((c: string, i: number) => (
            <Button
              key={i}
              target={`answer:${props.cardId}:${c}`}
              label={c}
              modifiers={[frame({ maxWidth: 99999 })]}
            />
          ))}
        </HStack>
      </VStack>
    );
  }

  // ── Medium widget: text/spell card (tap to open) ──
  return (
    <Link href="lingolock://challenge?source=Widget">
      <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 12 })]}>
        {(props.cardsLeft ?? 0) > 0 ? (
          <HStack>
            <Spacer />
            <Text modifiers={[font({ size: 10 }), fS]}>{props.cardsLeft} left</Text>
          </HStack>
        ) : null}
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), fP, lineLimit(3)]}>
          {props.sentence}
        </Text>
        {props.germanHint ? (
          <Text modifiers={[font({ size: 13 }), fS, lineLimit(1)]}>
            {props.germanHint}
          </Text>
        ) : null}
      </VStack>
    </Link>
  );
}

export const vocabularyWidget = createWidget<WidgetProps>('VocabularyWidget', VocabularyWidgetLayout);
