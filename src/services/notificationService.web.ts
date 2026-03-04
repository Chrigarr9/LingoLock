/**
 * Web platform no-op stubs for notification service.
 * Notifications are not supported on web platform.
 */

export interface NotificationData {
  cardId: string;
  correctAnswer: string;
  choices?: string[];
  answerType: 'text' | 'mc2' | 'mc4';
  deliveryTime: number;
  mcMapping?: Record<string, string>;
}

export async function registerNotificationCategories(): Promise<void> {
  // No-op on web
}

export async function requestNotificationPermissions(): Promise<boolean> {
  return false; // Not supported on web
}

export function setupNotifications(): () => void {
  return () => {}; // No-op cleanup
}
