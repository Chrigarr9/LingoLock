import { Platform, Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';

// Configure foreground notification handler at module top-level
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
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
 * Set up notification infrastructure:
 * - Register notification categories
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

  // Register response listener
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Notifications] Response received:', response);
    // TODO: Plan 03 will wire this to answer processing
  });

  // Return cleanup function
  return () => {
    subscription.remove();
  };
}
