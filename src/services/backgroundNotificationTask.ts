import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_NOTIFICATION_TASK = 'background-notification-reschedule';

// Task must be defined at module level (TaskManager requirement)
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    const { cancelAllNotifications, scheduleNotificationBatch } = await import('./notificationScheduler');
    await cancelAllNotifications();
    await scheduleNotificationBatch();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundNotificationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
  if (isRegistered) return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
    minimumInterval: 15 * 60, // 15 minutes (iOS may adjust)
    stopOnTerminate: false,
    startOnBoot: false,
  });
}

export async function unregisterBackgroundNotificationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
  if (!isRegistered) return;

  await BackgroundFetch.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
}
