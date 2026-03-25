import { Platform, AppState, AppStateStatus } from 'react-native';
import { consumeAutomationSource } from '../../modules/expo-app-intents/src';

/**
 * Consume any stale automation source from UserDefaults.
 * Navigation is handled entirely by the deep link path (lingolock://challenge).
 * This just clears the UserDefaults fallback value to prevent it from
 * persisting across app launches.
 */
function clearStaleAutomationSource(): void {
  if (Platform.OS !== 'ios') return;
  const source = consumeAutomationSource();
  if (source) {
    console.log('[Automation] Cleared stale automation source:', source);
  }
}

/**
 * Register AppState listener that clears stale automation sources
 * when the app comes to the foreground.
 *
 * @returns Cleanup function to remove the listener
 */
export function setupAutomationListener(): () => void {
  if (Platform.OS !== 'ios') return () => {};

  // Clear on cold start after a delay
  const timeout = setTimeout(() => clearStaleAutomationSource(), 1000);

  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      setTimeout(() => clearStaleAutomationSource(), 1000);
    }
  });

  return () => {
    clearTimeout(timeout);
    subscription.remove();
  };
}
