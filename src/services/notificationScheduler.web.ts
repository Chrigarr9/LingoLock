/**
 * Notification Scheduler — Web stub (no-op)
 *
 * Notifications are not applicable on web platforms.
 * This file provides no-op implementations to match the native API.
 */

/**
 * Schedule a batch of vocabulary notifications (no-op on web).
 */
export async function scheduleNotificationBatch(): Promise<void> {
  // No-op
}

/**
 * Cancel all scheduled notifications (no-op on web).
 */
export async function cancelAllNotifications(): Promise<void> {
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
