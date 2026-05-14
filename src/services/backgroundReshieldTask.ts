/**
 * Periodic background safety net: re-apply the user's blocklist when iOS
 * has dropped DeviceActivityMonitor.intervalDidEnd. Without this, a user who
 * unlocks → uses YouTube for an hour → never re-opens LingoLock would have
 * permanent unlock until they manually open the app again (the JS-side
 * AppState safety net only runs when LingoLock foregrounds).
 *
 * expo-background-task runs at iOS's discretion — minimum interval 15
 * minutes, often longer. Acceptable: worst case the user gets ~15-30 extra
 * minutes of unlock past the 10-minute window before the task lands.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_RESHIELD_TASK = 'lingolock-reshield-check';

// Task must be defined at module level (TaskManager requirement). Imported
// from _layout.tsx so this runs at JS bundle init even on cold launch from a
// background-task wake.
TaskManager.defineTask(BACKGROUND_RESHIELD_TASK, async () => {
  try {
    const { maybeRestoreShields } = await import('./screenTimeService');
    const { logDebug } = await import('./debugLog');
    // Log unconditionally so the on-device debug overlay shows whether iOS
    // is actually scheduling the task. If shields never re-apply and there
    // are zero "task fired" entries between unlocks, iOS isn't running it.
    logDebug('BackgroundReshield', 'task fired', { ts: Date.now() });
    const restored = maybeRestoreShields();
    logDebug('BackgroundReshield', 'result', { restored });
    // The Expo BackgroundTaskResult enum only has Success and Failed (no
    // NoData / NoNewData like the deprecated background-fetch API had).
    // Return Success whether we restored or not — the task ran cleanly.
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn('[backgroundReshieldTask] Failed:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundReshieldTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_RESHIELD_TASK);
  if (isRegistered) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_RESHIELD_TASK, {
    minimumInterval: 15,
  });
}

export async function unregisterBackgroundReshieldTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_RESHIELD_TASK);
  if (!isRegistered) return;
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_RESHIELD_TASK);
}
