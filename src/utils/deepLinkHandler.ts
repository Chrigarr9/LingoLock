/**
 * Deep link URL parser for lingolock:// scheme
 * Extracts challenge parameters from URLs like:
 * lingolock://challenge?source=Instagram&count=3&type=app_open
 */

import * as Linking from 'expo-linking';
import { ChallengeParams } from '../types/vocabulary';

/**
 * Parses a deep link URL and extracts challenge parameters
 * @param url - The deep link URL to parse (e.g., "lingolock://challenge?source=Instagram&count=3&type=app_open")
 * @returns ChallengeParams object if URL is valid, null otherwise
 */
export function parseDeepLink(url: string): ChallengeParams | null {
  try {
    const parsed = Linking.parse(url);

    // Validate hostname is "challenge"
    if (parsed.hostname !== 'challenge') {
      console.warn(`[DeepLink] Invalid hostname: ${parsed.hostname}, expected "challenge"`);
      return null;
    }

    // Extract and validate parameters
    const source = parsed.queryParams?.source as string;
    const countStr = parsed.queryParams?.count as string;
    const type = parsed.queryParams?.type as string;

    if (!source || !countStr || !type) {
      console.warn('[DeepLink] Missing required parameters:', { source, count: countStr, type });
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
      source,
      count,
      type: type as 'unlock' | 'app_open'
    };
  } catch (error) {
    console.error('[DeepLink] Failed to parse URL:', url, error);
    return null;
  }
}
