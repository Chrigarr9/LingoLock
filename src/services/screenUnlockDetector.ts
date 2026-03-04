/**
 * Screen Unlock Detector — AppState-based screen unlock detection
 *
 * Uses AppState timing heuristic to detect screen unlock vs. app switch:
 * - Screen unlock: inactive->active transition with elapsed time < 50ms
 * - App switch: inactive->active transition with elapsed time ~800ms
 *
 * When screen unlock is detected, fires the provided callback (notification scheduler).
 * Includes debounce to prevent rapid repeated detections within 10 seconds.
 */

import { AppState, AppStateStatus } from 'react-native';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let lastInactiveTime: number | null = null;
let onUnlockCallback: (() => void) | null = null;
let lastUnlockTime = 0;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold for screen unlock vs app switch (milliseconds) */
const UNLOCK_THRESHOLD_MS = 50;

/** Debounce interval to prevent rapid repeated detections (milliseconds) */
const DEBOUNCE_INTERVAL_MS = 10000;

// ---------------------------------------------------------------------------
// AppState change handler
// ---------------------------------------------------------------------------

function handleAppStateChange(nextAppState: AppStateStatus): void {
  const now = Date.now();

  if (nextAppState === 'inactive') {
    // Track when app went inactive
    lastInactiveTime = now;
    return;
  }

  if (nextAppState === 'active' && lastInactiveTime !== null) {
    const elapsed = now - lastInactiveTime;
    lastInactiveTime = null;

    // Check if this is a screen unlock (very fast transition)
    if (elapsed < UNLOCK_THRESHOLD_MS) {
      // Debounce: ignore rapid repeated unlocks
      if (now - lastUnlockTime < DEBOUNCE_INTERVAL_MS) {
        console.log('[ScreenUnlock] Debounced - too soon after last unlock');
        return;
      }

      // Valid screen unlock detected
      lastUnlockTime = now;
      console.log('[ScreenUnlock] Detected - elapsed:', elapsed, 'ms');

      if (onUnlockCallback) {
        onUnlockCallback();
      }
    } else {
      console.log('[ScreenUnlock] Ignored - app switch detected (elapsed:', elapsed, 'ms)');
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start screen unlock detection.
 *
 * @param onUnlock - Callback to fire when screen unlock is detected
 * @returns Cleanup function to stop detection
 */
export function startScreenUnlockDetection(onUnlock: () => void): () => void {
  console.log('[ScreenUnlock] Starting detection');

  // Store callback
  onUnlockCallback = onUnlock;

  // Subscribe to AppState changes
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  // Return cleanup function
  return () => {
    stopScreenUnlockDetection();
  };
}

/**
 * Stop screen unlock detection and cleanup.
 */
export function stopScreenUnlockDetection(): void {
  console.log('[ScreenUnlock] Stopping detection');

  // Remove AppState listener
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  // Clear state
  onUnlockCallback = null;
  lastInactiveTime = null;
}
