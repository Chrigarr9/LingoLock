import { Platform, Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { validateAnswer } from '../utils/answerValidation';
import { scheduleReview, createNewCardState } from './fsrs';
import { loadCardState, saveCardState } from './storage';
import { updateStatsAfterSession } from './statsService';
import { scheduleNextNotification, handleSwipeAway, initScheduler } from './notificationScheduler';
import { startScreenUnlockDetection, stopScreenUnlockDetection } from './screenUnlockDetector';
import { updateWidgetData } from './widgetService';
import { CHAPTERS } from '../content/bundle';
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
  answerType: 'text' | 'mc2' | 'mc4';
  deliveryTime: number;
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
 * - If undetermined: request permissions
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

  // Status is 'undetermined'
  const { status: newStatus } = await Notifications.requestPermissionsAsync();
  return newStatus === 'granted';
}

/**
 * Process notification answer: validate, update FSRS, update stats, schedule next.
 *
 * Handles both MC button answers (via mcMapping) and text input answers.
 * Enforces 1-minute response window — expired responses break streak.
 */
async function processNotificationAnswer(response: Notifications.NotificationResponse): Promise<void> {
  const { actionIdentifier, userText } = response;
  const data = response.notification.request.content.data as unknown as NotificationData;

  console.log('[Notifications] Processing answer:', {
    actionIdentifier,
    userText,
    cardId: data.cardId,
    deliveryTime: data.deliveryTime,
  });

  // 1-minute window check
  const elapsed = Date.now() - data.deliveryTime;
  if (elapsed > 60000) {
    console.log('[Notifications] Response expired (', elapsed, 'ms) - breaking streak');
    await handleSwipeAway(); // Breaks streak, pauses until next day
    return;
  }

  // Load card from content bundle
  let card: ClozeCard | null = null;
  for (const chapter of CHAPTERS) {
    const found = chapter.cards.find((c) => c.id === data.cardId);
    if (found) {
      card = found;
      break;
    }
  }

  if (!card) {
    console.error('[Notifications] Card not found:', data.cardId);
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
  // Handle default action (tapped notification body)
  else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    console.log('[Notifications] User tapped notification - opening app to challenge');
    // Open app to home screen (user will start challenge manually)
    // Schedule next notification since user engaged
    await scheduleNextNotification();
    await updateWidgetData();
    return;
  }

  // Update FSRS state
  const existingState = loadCardState(card.id);
  const cardState = existingState ?? createNewCardState(card.id);
  const updatedState = scheduleReview(cardState, isCorrect);
  saveCardState(card.id, updatedState);

  // Update stats (1 card session from 'notification' source)
  updateStatsAfterSession(isCorrect ? 1 : 0, 1, 'notification');

  // Send feedback notification and schedule next
  if (isCorrect) {
    // Correct: show feedback + schedule next
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '',
        body: `✓ ${card.germanHint}`,
        data: {},
      },
      trigger: null, // Immediate
    });
    await scheduleNextNotification();
  } else {
    // Incorrect: show correct answer + translation, then next card
    const feedbackBody = `✗ ${data.correctAnswer} — ${card.sentenceTranslation}`;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '',
        body: feedbackBody,
        data: {},
      },
      trigger: null, // Immediate
    });
    // Schedule next card immediately (wrong answer doesn't break flow)
    await scheduleNextNotification();
  }

  // Refresh widget with next card
  await updateWidgetData();
}

/**
 * Set up notification infrastructure:
 * - Register notification categories
 * - Initialize scheduler
 * - Request permissions
 * - Start screen unlock detection
 * - Register response listener
 *
 * @returns Cleanup function to remove listeners
 */
export function setupNotifications(): () => void {
  if (Platform.OS === 'web') {
    return () => {}; // No-op cleanup
  }

  // Register categories
  registerNotificationCategories().catch((err) => {
    console.error('[Notifications] Failed to register categories:', err);
  });

  // Initialize scheduler
  initScheduler();

  // Request permissions and start unlock detection
  requestNotificationPermissions().then((granted) => {
    if (granted) {
      console.log('[Notifications] Permissions granted - starting unlock detection');
      // Start screen unlock detection -> triggers scheduleNextNotification
      startScreenUnlockDetection(() => {
        scheduleNextNotification().catch((err) => {
          console.error('[Notifications] Failed to schedule notification:', err);
        });
      });

      // Schedule first notification immediately if cards are due
      scheduleNextNotification().catch((err) => {
        console.error('[Notifications] Failed to schedule initial notification:', err);
      });
    } else {
      console.log('[Notifications] Permissions not granted - notifications disabled');
    }
  }).catch((err) => {
    console.error('[Notifications] Failed to request permissions:', err);
  });

  // Register response listener
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Notifications] Response received:', response);
    processNotificationAnswer(response).catch((err) => {
      console.error('[Notifications] Failed to process answer:', err);
    });
  });

  // Return cleanup function
  return () => {
    subscription.remove();
    stopScreenUnlockDetection();
  };
}
