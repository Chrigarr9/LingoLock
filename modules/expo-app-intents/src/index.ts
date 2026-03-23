import { requireNativeModule, Platform } from 'expo-modules-core';

let ExpoAppIntents: any = null;
try {
  if (Platform.OS === 'ios') {
    ExpoAppIntents = requireNativeModule('ExpoAppIntents');
  }
} catch {
  // Native module not available (Expo Go, dev client without prebuild, etc.)
}

/**
 * Read and clear the pending automation source app name.
 * Returns the app name (e.g. "Instagram") if an App Intent automation
 * just triggered, or null if no automation is pending.
 *
 * Call this on app foreground — the value is consumed (cleared) on read.
 * Returns null on non-iOS platforms or when native module is unavailable.
 */
export function consumeAutomationSource(): string | null {
  if (!ExpoAppIntents) return null;
  return ExpoAppIntents.consumeAutomationSource() ?? null;
}
