/**
 * React hook for listening to deep link events
 * Handles both cold start (app opened from deep link) and background (app already running) scenarios
 */

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { parseDeepLink, DeepLinkParams } from '../utils/deepLinkHandler';

/**
 * Hook to listen for deep link events and route to appropriate handlers
 * @param onDeepLink - Callback function invoked when a valid deep link is received
 */
export function useDeepLink(onDeepLink: (params: DeepLinkParams) => void) {
  useEffect(() => {
    // Handle initial URL (app opened from deep link - cold start)
    const handleInitialURL = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          console.log('[DeepLink] Initial URL (cold start):', url);
          const params = parseDeepLink(url);
          if (params) {
            onDeepLink(params);
          }
        }
      } catch (error) {
        console.error('[DeepLink] Failed to get initial URL:', error);
      }
    };

    // Handle subsequent URLs (app already running - background state)
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[DeepLink] Event URL (background):', event.url);
      const params = parseDeepLink(event.url);
      if (params) {
        onDeepLink(params);
      }
    });

    // Check for initial URL on mount
    handleInitialURL();

    // Cleanup: remove event listener on unmount
    return () => {
      subscription.remove();
    };
  }, [onDeepLink]);
}
