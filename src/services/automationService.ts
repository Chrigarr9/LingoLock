import { Platform, AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { consumeAutomationSource } from '../../modules/expo-app-intents/src';

/** Brief guard against cold-start + AppState both firing within the same cycle */
let pendingCheck = false;

/**
 * Check for a pending App Intent automation on foreground.
 * If found, navigate to the challenge screen with the source app.
 */
export function checkPendingAutomation(): void {
  if (Platform.OS !== 'ios' || pendingCheck) return;

  const source = consumeAutomationSource();
  if (!source) return;

  // Block duplicate calls for 1 second (cold-start race window)
  pendingCheck = true;
  setTimeout(() => { pendingCheck = false; }, 1000);

  console.log('[Automation] Detected pending automation for:', source);
  try {
    router.push({
      pathname: '/challenge',
      params: { source },
    });
  } catch (err) {
    console.error('[Automation] Failed to navigate:', err);
  }
}

/**
 * Register AppState listener that checks for pending automations
 * when the app comes to the foreground.
 *
 * @returns Cleanup function to remove the listener
 */
export function setupAutomationListener(): () => void {
  if (Platform.OS !== 'ios') return () => {};

  // Check immediately on setup (cold start from intent)
  // Use a short delay to ensure navigation is ready
  const timeout = setTimeout(() => checkPendingAutomation(), 300);

  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      checkPendingAutomation();
    }
  });

  return () => {
    clearTimeout(timeout);
    subscription.remove();
  };
}
