/**
 * Deep link URL parser for lingolock:// scheme
 * Extracts parameters from URLs like:
 * - lingolock://challenge?source=Instagram&count=3&type=app_open
 * - lingolock://widget-answer?cardId=gato-ch01-s03&choice=gato
 */

import * as Linking from 'expo-linking';
import { ChallengeParams, WidgetAnswerParams } from '../types/vocabulary';

export type DeepLinkParams =
  | { type: 'challenge'; params: ChallengeParams }
  | { type: 'widget-answer'; params: WidgetAnswerParams };

/**
 * Parses a deep link URL and extracts parameters
 * @param url - The deep link URL to parse
 * @returns DeepLinkParams object with discriminated type, or null if invalid
 */
export function parseDeepLink(url: string): DeepLinkParams | null {
  try {
    const parsed = Linking.parse(url);

    // Route based on hostname
    if (parsed.hostname === 'challenge') {
      return parseChallengeLink(parsed);
    } else if (parsed.hostname === 'widget-answer') {
      return parseWidgetAnswerLink(parsed);
    } else {
      console.warn(`[DeepLink] Invalid hostname: ${parsed.hostname}, expected "challenge" or "widget-answer"`);
      return null;
    }
  } catch (error) {
    console.error('[DeepLink] Failed to parse URL:', url, error);
    return null;
  }
}

/**
 * Parses a challenge deep link
 */
function parseChallengeLink(parsed: ReturnType<typeof Linking.parse>): DeepLinkParams | null {
  try {

    // Extract and validate parameters
    const source = parsed.queryParams?.source as string;
    const countStr = parsed.queryParams?.count as string;
    const type = parsed.queryParams?.type as string;

    if (!source || !countStr || !type) {
      console.warn('[DeepLink] Missing required challenge parameters:', { source, count: countStr, type });
      return null;
    }

    const count = parseInt(countStr, 10);
    if (isNaN(count) || count < 1 || count > 10) {
      console.warn(`[DeepLink] Invalid count: ${countStr}, must be 1-10`);
      return null;
    }

    if (type !== 'unlock' && type !== 'app_open') {
      console.warn(`[DeepLink] Invalid type: ${type}, must be 'unlock' or 'app_open'`);
      return null;
    }

    return {
      type: 'challenge',
      params: {
        source,
        count,
        type: type as 'unlock' | 'app_open'
      }
    };
  } catch (error) {
    console.error('[DeepLink] Failed to parse challenge link:', error);
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
