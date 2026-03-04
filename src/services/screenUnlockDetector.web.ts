/**
 * Screen Unlock Detector — Web stub (no-op)
 *
 * Screen unlock detection is not applicable on web platforms.
 * This file provides no-op implementations to match the native API.
 */

/**
 * Start screen unlock detection (no-op on web).
 *
 * @param _onUnlock - Callback (unused on web)
 * @returns Empty cleanup function
 */
export function startScreenUnlockDetection(_onUnlock: () => void): () => void {
  return () => {}; // No-op cleanup
}

/**
 * Stop screen unlock detection (no-op on web).
 */
export function stopScreenUnlockDetection(): void {
  // No-op
}
