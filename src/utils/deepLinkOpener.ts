/**
 * Deep link opener utility for returning to source apps
 * Opens external app deep links after challenge completion
 */

import * as Linking from 'expo-linking';

/**
 * Common app URL schemes for popular apps
 * Maps app display names to their URL schemes
 */
const APP_SCHEMES: Record<string, string> = {
  'Instagram': 'instagram://',
  'Twitter': 'twitter://',
  'X': 'twitter://',
  'Facebook': 'fb://',
  'TikTok': 'tiktok://',
  'YouTube': 'youtube://',
  'Reddit': 'reddit://',
  'LinkedIn': 'linkedin://',
  'WhatsApp': 'whatsapp://',
  'Telegram': 'telegram://',
  'Discord': 'discord://',
  'Snapchat': 'snapchat://',
  'Pinterest': 'pinterest://',
  'Spotify': 'spotify://',
  'Netflix': 'netflix://',
  'Gmail': 'googlegmail://',
  'Chrome': 'googlechrome://',
  'Safari': 'x-safari-https://',
  'Maps': 'maps://',
  'Photos': 'photos-redirect://',
  'Messages': 'sms://',
  'Mail': 'message://',
  'Notes': 'mobilenotes://',
  'Calendar': 'calshow://',
  'Reminders': 'x-apple-reminder://',
  'Settings': 'app-settings://',
};

/**
 * Result of attempting to open a deep link
 */
export interface DeepLinkOpenResult {
  /** Whether the deep link was successfully opened */
  success: boolean;

  /** Error message if opening failed */
  error?: string;

  /** The URL that was attempted */
  attemptedUrl?: string;
}

/**
 * Attempts to open a deep link to the source app
 * @param appName - Display name of the app to open (e.g., "Instagram")
 * @returns Result indicating success or failure with details
 */
export async function openSourceApp(appName: string): Promise<DeepLinkOpenResult> {
  try {
    // Look up the URL scheme for this app
    const scheme = APP_SCHEMES[appName];

    if (!scheme) {
      console.warn(`[DeepLinkOpener] No URL scheme found for app: ${appName}`);
      return {
        success: false,
        error: `Unknown app: ${appName}. Cannot determine URL scheme.`,
      };
    }

    // Check if the URL can be opened (app is installed)
    const canOpen = await Linking.canOpenURL(scheme);

    if (!canOpen) {
      console.warn(`[DeepLinkOpener] Cannot open URL scheme: ${scheme} (app not installed?)`);
      return {
        success: false,
        error: `${appName} is not installed or cannot be opened.`,
        attemptedUrl: scheme,
      };
    }

    // Attempt to open the app
    await Linking.openURL(scheme);
    console.log(`[DeepLinkOpener] Successfully opened: ${scheme}`);

    return {
      success: true,
      attemptedUrl: scheme,
    };
  } catch (error) {
    console.error('[DeepLinkOpener] Failed to open deep link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Checks if a deep link can be opened (app is installed)
 * @param appName - Display name of the app to check
 * @returns True if the app can be opened, false otherwise
 */
export async function canOpenApp(appName: string): Promise<boolean> {
  const scheme = APP_SCHEMES[appName];
  if (!scheme) {
    return false;
  }

  try {
    return await Linking.canOpenURL(scheme);
  } catch (error) {
    console.error('[DeepLinkOpener] Failed to check if app can be opened:', error);
    return false;
  }
}

/**
 * Gets the list of all supported app names
 * @returns Array of app display names that have known URL schemes
 */
export function getSupportedApps(): string[] {
  return Object.keys(APP_SCHEMES);
}
