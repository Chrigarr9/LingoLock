/**
 * React hook for handling deep link events
 * Listens for lingolock:// URLs in both cold start and background state
 */

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { parseDeepLink } from '../utils/deepLinkHandler';
import { ChallengeParams } from '../types/vocabulary';

/**
 * Hook to listen for deep link events and handle them
 * @param onDeepLink - Callback function that receives parsed challenge parameters
 */
export function useDeepLink(onDeepLink: (params: ChallengeParams) => void) {
  useEffect(() => {
    // Handle initial URL (app opened from deep link - cold start)
    const handleInitialURL = async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        console.log('[DeepLink] Initial URL:', url);
        const params = parseDeepLink(url);
        if (params) {
          onDeepLink(params);
        }
      }
    };

    // Handle subsequent URLs (app already running - background state)
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[DeepLink] Event URL:', event.url);
      const params = parseDeepLink(event.url);
      if (params) {
        onDeepLink(params);
      }
    });

    handleInitialURL();

    return () => subscription.remove();
  }, [onDeepLink]);
}
