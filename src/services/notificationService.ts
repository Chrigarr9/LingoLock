import { Platform, Alert, Linking, AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { validateAnswer } from '../utils/answerValidation';
import { scheduleReview, createNewCardState } from './fsrs';
import { loadCardState, saveCardState, loadNotificationsEnabled } from './storage';
import { updateStatsAfterSession, checkAndAdvanceStreak } from './statsService';
import { scheduleNotificationBatch, dismissDeliveredVocabNotifications, cancelAllNotifications, initScheduler } from './notificationScheduler';
import { updateWidgetData, syncPendingWidgetAnswers } from './widgetService';
import { getCardById } from '../content/bundles';
import type { ClozeCard } from '../types/vocabulary';

// Configure notification handler — runs for EVERY notification before display.
// Dismisses previous vocab notifications so the new one replaces them.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const id = notification.request.identifier;

    // If this is a new vocab notification, dismiss any previously delivered ones
    if (id.startsWith('lingolock-vocab-')) {
      try {
        const delivered = await Notifications.getPresentedNotificationsAsync();
        for (const n of delivered) {
          if (n.request.identifier.startsWith('lingolock-vocab-') ||
              n.request.identifier === 'lingolock-feedback') {
            await Notifications.dismissNotificationAsync(n.request.identifier);
          }
        }
      } catch {}
    }

    return {
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
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

  // Status is 'undetermined' — request permission from the OS.
  const { status: newStatus } = await Notifications.requestPermissionsAsync();
  return newStatus === 'granted';
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
  // Handle default action (tapped notification body to open app → navigate to challenge)
  else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    console.log('[Notifications] User tapped notification — opening challenge');
    updateWidgetData();
    // Navigate to challenge screen so the user can practice
    try {
      router.push({
        pathname: '/challenge',
        params: { source: 'Notification' },
      });
    } catch (err) {
      console.error('[Notifications] Failed to navigate to challenge:', err);
    }
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

  // Send feedback notification — uses fixed ID so it replaces the question notification
  const feedbackId = 'lingolock-feedback';
  if (isCorrect) {
    await Notifications.scheduleNotificationAsync({
      identifier: feedbackId,
      content: {
        title: '',
        body: `\u2713 ${data.correctAnswer} \u2014 ${card.germanHint}\n${card.sentenceTranslation}`,
        data: {},
      },
      trigger: null, // Immediate
    });
  } else {
    await Notifications.scheduleNotificationAsync({
      identifier: feedbackId,
      content: {
        title: '',
        body: `\u2717 ${data.correctAnswer} \u2014 ${card.germanHint}\n${card.sentenceTranslation}`,
        data: {},
      },
      trigger: null, // Immediate
    });
  }

  // Refresh widget with updated data
  updateWidgetData();

  // Dismiss any older delivered vocab notifications so they don't pile up
  dismissDeliveredVocabNotifications().catch((err) => {
    console.error('[Notifications] Failed to dismiss old notifications:', err);
  });
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

  // Register categories — must complete before first notification fires
  registerNotificationCategories().then(() => {
    console.log('[Notifications] Categories registered: vocabulary-text, vocabulary-mc');
  }).catch((err) => {
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

  // Track whether the app was recently active (before inactive→background).
  // iOS always transitions active → inactive → background, so we need to
  // remember the "active" state across the intermediate "inactive" step.
  let wasRecentlyActive = AppState.currentState === 'active';
  console.log('[Notifications] AppState listener registered, initial state:', AppState.currentState);

  // AppState listener: cancel on foreground, schedule batch on background
  const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    console.log('[Notifications] AppState changed →', nextState, '(wasRecentlyActive:', wasRecentlyActive, ')');
    const isNowActive = nextState === 'active';
    const isNowBackground = nextState === 'background';

    if (isNowActive) {
      wasRecentlyActive = true;
      // Transitioning TO foreground: cancel notifications + sync widget answers
      console.log('[Notifications] App came to foreground — cancelling notifications + syncing widget');
      syncPendingWidgetAnswers();
      cancelAllNotifications().catch((err) => {
        console.error('[Notifications] Failed to cancel notifications:', err);
      });
    } else if (isNowBackground && wasRecentlyActive) {
      wasRecentlyActive = false;
      // Transitioning TO background: sync widget answers, refresh widget, schedule notifications
      console.log('[Notifications] App went to background — syncing + scheduling');
      syncPendingWidgetAnswers();
      updateWidgetData();
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
