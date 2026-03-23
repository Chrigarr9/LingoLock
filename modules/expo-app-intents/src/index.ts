import { requireNativeModule, Platform } from 'expo-modules-core';

const ExpoAppIntents = Platform.OS === 'ios'
  ? requireNativeModule('ExpoAppIntents')
  : null;

/**
 * Read and clear the pending automation source app name.
 * Returns the app name (e.g. "Instagram") if an App Intent automation
 * just triggered, or null if no automation is pending.
 *
 * Call this on app foreground — the value is consumed (cleared) on read.
 * Returns null on non-iOS platforms.
 */
export function consumeAutomationSource(): string | null {
  if (!ExpoAppIntents) return null;
  return ExpoAppIntents.consumeAutomationSource() ?? null;
}
