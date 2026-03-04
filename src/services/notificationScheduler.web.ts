/**
 * Notification Scheduler — Web stub (no-op)
 *
 * Notifications are not applicable on web platforms.
 * This file provides no-op implementations to match the native API.
 */

/**
 * Schedule the next vocabulary notification (no-op on web).
 */
export async function scheduleNextNotification(): Promise<void> {
  // No-op
}

/**
 * Cancel all scheduled notifications (no-op on web).
 */
export async function cancelAllNotifications(): Promise<void> {
  // No-op
}

/**
 * Pause notifications (no-op on web).
 */
export async function pauseNotifications(): Promise<void> {
  // No-op
}

/**
 * Resume notifications (no-op on web).
 */
export async function resumeNotifications(): Promise<void> {
  // No-op
}

/**
 * Handle swipe-away (no-op on web).
 */
export async function handleSwipeAway(): Promise<void> {
  // No-op
}

/**
 * Set notification interval (no-op on web).
 */
export async function setNotificationInterval(_seconds: number): Promise<void> {
  // No-op
}

/**
 * Initialize the scheduler (no-op on web).
 */
export function initScheduler(): void {
  // No-op
}

/**
 * Check if notifications are paused (always false on web).
 */
export function isNotificationPaused(): boolean {
  return false;
}
