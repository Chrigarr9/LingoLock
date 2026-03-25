import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_NOTIFICATION_TASK = 'background-notification-reschedule';

// Task must be defined at module level (TaskManager requirement)
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    const { cancelAllNotifications, scheduleNotificationBatch } = await import('./notificationScheduler');
    await cancelAllNotifications();
    await scheduleNotificationBatch();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundNotificationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
    minimumInterval: 15, // minutes (expo-background-task uses minutes, not seconds)
  });
}

export async function unregisterBackgroundNotificationTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
  if (!isRegistered) return;

  await BackgroundTask.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
}
