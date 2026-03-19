import { Platform, Alert, Linking, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { validateAnswer } from '../utils/answerValidation';
import { scheduleReview, createNewCardState } from './fsrs';
import { loadCardState, saveCardState, loadNotificationsEnabled } from './storage';
import { updateStatsAfterSession, checkAndAdvanceStreak } from './statsService';
import { scheduleNotificationBatch, cancelAllNotifications, initScheduler } from './notificationScheduler';
import { updateWidgetData } from './widgetService';
import { getCardById } from '../content/bundles';
import type { ClozeCard } from '../types/vocabulary';

// Configure foreground notification handler at module top-level
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Notification data payload attached to scheduled notifications
 */
export interface NotificationData {
  cardId: string;
  correctAnswer: string;
  choices?: string[];
  answerType: 'text' | 'mc4';
  mcMapping?: Record<string, string>; // Maps action IDs to actual words: { "answer-a": "gato", "answer-b": "perro" }
}

/**
 * Register notification categories with action buttons.
 * Two categories:
 * - vocabulary-text: Text input field for typing answers
 * - vocabulary-mc: Multiple choice A/B/C/D buttons
 *
 * Note: On iOS, button titles are fixed at registration time.
 * For MC, the notification body lists "A) word1  B) word2  C) word3  D) word4"
 * and users tap the matching letter button.
 */
export async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await Notifications.setNotificationCategoryAsync('vocabulary-text', [
    {
      identifier: 'answer-text',
      buttonTitle: 'Answer',
      options: {
        opensAppToForeground: false,
      },
      textInput: {
        submitButtonTitle: 'Submit',
        placeholder: 'Type your answer...',
      },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('vocabulary-mc', [
    {
      identifier: 'answer-a',
      buttonTitle: 'A',
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: 'answer-b',
      buttonTitle: 'B',
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: 'answer-c',
      buttonTitle: 'C',
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: 'answer-d',
      buttonTitle: 'D',
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
}

/**
 * Request notification permissions from the user.
 * Implements soft prompt flow:
 * - If already granted: return true
 * - If denied: show alert directing to Settings
 * - If undetermined: return false (don't auto-request on first launch;
 *   the Settings screen toggle handles explicit opt-in)
 *
 * @returns true if permissions granted, false otherwise
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    return true;
  }

  if (existingStatus === 'denied') {
    Alert.alert(
      'Notifications Disabled',
      'Please enable notifications in Settings to receive vocabulary practice reminders.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => Linking.openSettings(),
        },
      ]
    );
    return false;
  }

  // Status is 'undetermined' — don't auto-request on first launch.
  // The Settings screen toggle will call this function explicitly when the user
  // opts in, giving them context about why notifications are needed first.
  return false;
}

/**
 * Process notification answer: validate, update FSRS, update stats.
 *
 * Does NOT reschedule notifications — the remaining batch is still valid
 * with different cards. The AppState listener handles cancel/reschedule
 * on foreground/background transitions.
 *
 * Handles both MC button answers (via mcMapping) and text input answers.
 */
async function processNotificationAnswer(response: Notifications.NotificationResponse): Promise<void> {
  const { actionIdentifier, userText } = response;
  const data = response.notification.request.content.data as unknown as NotificationData;

  console.log('[Notifications] Processing answer:', {
    actionIdentifier,
    userText,
    cardId: data.cardId,
  });

  // Load card from content bundle
  const result = getCardById(data.cardId);
  const card = result?.card ?? null;

  if (!card || card.kind !== 'cloze') {
    console.error('[Notifications] Card not found or not a cloze card:', data.cardId);
    return;
  }

  let isCorrect = false;
  let userAnswer = '';

  // Handle MC button answer
  if (actionIdentifier.startsWith('answer-') && data.mcMapping) {
    userAnswer = data.mcMapping[actionIdentifier];
    if (userAnswer) {
      isCorrect = userAnswer === data.correctAnswer;
      console.log('[Notifications] MC answer:', { userAnswer, correctAnswer: data.correctAnswer, isCorrect });
    }
  }
  // Handle text answer
  else if (actionIdentifier === 'answer-text' && userText) {
    userAnswer = userText;
    isCorrect = validateAnswer(userText, data.correctAnswer);
    console.log('[Notifications] Text answer:', { userText, correctAnswer: data.correctAnswer, isCorrect });
  }
  // Handle default action (tapped notification body to open app)
  else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    console.log('[Notifications] User tapped notification — opening app');
    // AppState listener will cancel notifications when app comes to foreground
    // and reschedule when it goes back to background
    updateWidgetData();
    return;
  }

  // Update FSRS state
  const existingState = loadCardState(card.id);
  const cardState = existingState ?? createNewCardState(card.id);
  const updatedState = scheduleReview(cardState, isCorrect ? 'good' : 'again');
  saveCardState(card.id, updatedState);

  // Update stats (1 card session from 'notification' source)
  updateStatsAfterSession(isCorrect ? 1 : 0, 1, 'notification');
  checkAndAdvanceStreak();

  // Send feedback notification (no rescheduling — rest of batch is still valid)
  if (isCorrect) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '',
        body: `\u2713 ${card.germanHint}`,
        data: {},
      },
      trigger: null, // Immediate
    });
  } else {
    const feedbackBody = `\u2717 ${data.correctAnswer} \u2014 ${card.sentenceTranslation}`;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '',
        body: feedbackBody,
        data: {},
      },
      trigger: null, // Immediate
    });
  }

  // Refresh widget with updated data
  updateWidgetData();
}

/**
 * Set up notification infrastructure:
 * - Register notification categories
 * - Initialize scheduler
 * - Request permissions
 * - Register AppState listener for foreground/background transitions
 * - Register response listener
 *
 * @returns Cleanup function to remove listeners
 */
// Module-level cleanup for idempotent setup — calling setupNotifications()
// again (e.g., from Settings re-enable) tears down previous listeners first.
let activeCleanup: (() => void) | null = null;

export function setupNotifications(): () => void {
  if (Platform.OS === 'web') {
    return () => {}; // No-op cleanup
  }

  // Tear down previous setup if called again (idempotent)
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  // Respect user's persisted preference — if they toggled notifications off
  // in Settings, don't restart the scheduler on next app launch.
  if (!loadNotificationsEnabled()) {
    console.log('[Notifications] Notifications disabled by user — skipping setup');
    return () => {};
  }

  // Register categories
  registerNotificationCategories().catch((err) => {
    console.error('[Notifications] Failed to register categories:', err);
  });

  // Initialize scheduler
  initScheduler();

  // Request permissions
  requestNotificationPermissions().then((granted) => {
    if (granted) {
      console.log('[Notifications] Permissions granted');
      // No scheduling here — app is active at startup, no notifications needed.
      // The AppState listener below will schedule when app goes to background.
    } else {
      console.log('[Notifications] Permissions not granted — notifications disabled');
    }
  }).catch((err) => {
    console.error('[Notifications] Failed to request permissions:', err);
  });

  // Track previous AppState for transition detection
  let prevAppState: AppStateStatus = AppState.currentState;

  // AppState listener: cancel on foreground, schedule batch on background
  const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    const wasActive = prevAppState === 'active';
    const isNowActive = nextState === 'active';
    const isNowBackground = nextState === 'background';
    prevAppState = nextState;

    if (isNowActive && !wasActive) {
      // Transitioning TO foreground: cancel all scheduled notifications
      console.log('[Notifications] App came to foreground — cancelling notifications');
      cancelAllNotifications().catch((err) => {
        console.error('[Notifications] Failed to cancel notifications:', err);
      });
    } else if (isNowBackground && wasActive) {
      // Transitioning TO background: schedule a fresh batch
      console.log('[Notifications] App went to background — scheduling notification batch');
      scheduleNotificationBatch().catch((err) => {
        console.error('[Notifications] Failed to schedule notification batch:', err);
      });
    }
  });

  // Register response listener
  const subscription = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
    console.log('[Notifications] Response received:', response);
    processNotificationAnswer(response).catch((err) => {
      console.error('[Notifications] Failed to process answer:', err);
    });
  });

  // Store and return cleanup function
  activeCleanup = () => {
    subscription.remove();
    appStateSubscription.remove();
  };

  return activeCleanup;
}
