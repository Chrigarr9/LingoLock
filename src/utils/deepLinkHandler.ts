/**
 * Deep link URL parser for lingolock:// scheme
 * Extracts parameters from URLs like:
 * - lingolock://widget-answer?cardId=gato-ch01-s03&choice=gato
 */

import * as Linking from 'expo-linking';
import { WidgetAnswerParams, WidgetSpellParams, WidgetRevealParams, WidgetRateParams } from '../types/vocabulary';

export type DeepLinkParams =
  | { type: 'widget-answer'; params: WidgetAnswerParams }
  | { type: 'widget-spell'; params: WidgetSpellParams }
  | { type: 'widget-reveal'; params: WidgetRevealParams }
  | { type: 'widget-rate'; params: WidgetRateParams };

/**
 * Parses a deep link URL and extracts parameters
 * @param url - The deep link URL to parse
 * @returns DeepLinkParams object with discriminated type, or null if invalid
 */
export function parseDeepLink(url: string): DeepLinkParams | null {
  try {
    // Skip non-lingolock URLs (on web, the page URL itself triggers link events)
    if (!url.startsWith('lingolock://') && !url.includes('lingolock://')) {
      return null;
    }

    const parsed = Linking.parse(url);

    // Route based on hostname
    if (parsed.hostname === 'widget-answer') {
      return parseWidgetAnswerLink(parsed);
    } else if (parsed.hostname === 'widget-spell') {
      return parseWidgetSpellLink(parsed);
    } else if (parsed.hostname === 'widget-reveal') {
      return parseWidgetRevealLink(parsed);
    } else if (parsed.hostname === 'widget-rate') {
      return parseWidgetRateLink(parsed);
    } else {
      console.warn(`[DeepLink] Invalid hostname: ${parsed.hostname}`);
      return null;
    }
  } catch (error) {
    console.error('[DeepLink] Failed to parse URL:', url, error);
    return null;
  }
}

/**
 * Parses a widget answer deep link
 */
function parseWidgetAnswerLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  try {
    // Extract and validate parameters
    const cardId = parsed.queryParams?.cardId as string;
    const choice = parsed.queryParams?.choice as string;

    if (!cardId || !choice) {
      console.warn('[DeepLink] Missing required widget-answer parameters:', { cardId, choice });
      return null;
    }

    return {
      type: 'widget-answer',
      params: {
        cardId,
        choice
      }
    };
  } catch (error) {
    console.error('[DeepLink] Failed to parse widget-answer link:', error);
    return null;
  }
}

/**
 * Parses a widget spell mode deep link
 * Actions: char (add character), back (delete last), submit (validate answer)
 */
function parseWidgetSpellLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  try {
    const cardId = parsed.queryParams?.cardId as string;
    const action = parsed.queryParams?.action as string;

    if (!cardId || !action) {
      console.warn('[DeepLink] Missing required widget-spell parameters:', { cardId, action });
      return null;
    }

    if (action !== 'char' && action !== 'back' && action !== 'submit') {
      console.warn(`[DeepLink] Invalid spell action: ${action}`);
      return null;
    }

    const char = parsed.queryParams?.char as string | undefined;
    if (action === 'char' && !char) {
      console.warn('[DeepLink] Missing char for spell char action');
      return null;
    }

    return {
      type: 'widget-spell',
      params: { cardId, action, char }
    };
  } catch (error) {
    console.error('[DeepLink] Failed to parse widget-spell link:', error);
    return null;
  }
}

/**
 * Parses a widget reveal deep link (self-rated card flip)
 */
function parseWidgetRevealLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  const cardId = parsed.queryParams?.cardId as string;
  if (!cardId) {
    console.warn('[DeepLink] Missing cardId for widget-reveal');
    return null;
  }
  return { type: 'widget-reveal', params: { cardId } };
}

/**
 * Parses a widget rate deep link (self-rated card rating)
 */
function parseWidgetRateLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  const cardId = parsed.queryParams?.cardId as string;
  const rating = parsed.queryParams?.rating as string;
  if (!cardId || !rating) {
    console.warn('[DeepLink] Missing params for widget-rate:', { cardId, rating });
    return null;
  }
  if (rating !== '1' && rating !== '3') {
    console.warn(`[DeepLink] Invalid rating: ${rating}, must be 1 or 3`);
    return null;
  }
  return { type: 'widget-rate', params: { cardId, rating: rating as '1' | '3' } };
}
