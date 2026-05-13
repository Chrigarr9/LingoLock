import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { AppState, Platform, View, useColorScheme, Text, StyleSheet, type AppStateStatus } from 'react-native';
import { IconButton, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { DeepLinkParams } from '../src/utils/deepLinkHandler';
import { lightTheme, darkTheme } from '../src/theme';
import { setupNotifications } from '../src/services/notificationService';
import { rescheduleAfterExternalAnswer } from '../src/services/notificationScheduler';
import { processWidgetAnswer, processSpellAction, processWidgetReveal, processWidgetRate, updateWidgetData } from '../src/services/widgetService';
// Import early so TaskManager.defineTask runs at module level (required by iOS)
import { registerBackgroundNotificationTask } from '../src/services/backgroundNotificationTask';
import { ActiveBundleProvider } from '../src/content/activeBundleProvider';
import {
  loadScreenTimeEnabled,
  saveScreenTimeEnabled,
  clearLegacyWhitelistJson,
} from '../src/services/storage';
import {
  isScreenTimeAvailable,
  isBlocking,
  configureShield,
  consumePendingShieldAction,
  migrateFromBlockAll,
} from '../src/services/screenTimeService';
import { shouldPromptRestore, checkForBackup, restoreFromBackup, dismissRestore, shouldBackup, createBackup } from '../src/services/backupService';
import { RestorePrompt } from '../src/components/RestorePrompt';
import { DebugLogOverlay } from '../src/components/DebugLogOverlay';
import { logDebug, subscribeOpenDebugLog } from '../src/services/debugLog';
import type { BackupMeta } from '../src/services/backupService';

// ---------------------------------------------------------------------------
// Error boundary — catches render errors and shows a recovery screen
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.body}>
            Please close and reopen the app.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#EEF3F9',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C2E4A',
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    color: '#4A6B8A',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  // Set once any path navigates to /challenge (deep-link, cold-start fallback,
  // or warm AppState fallback). Prevents the 1500ms setTimeout from clobbering
  // an already-successful deep-link navigation.
  const navigatedToChallenge = useRef(false);

  useEffect(() => {
    // Web: Register service worker
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }

    // Native: Setup notifications, widget, automation listener
    let cleanupNotifications: (() => void) | undefined;
    let cleanupWidgetListener: (() => void) | undefined;
    let screenTimeSub: ReturnType<typeof AppState.addEventListener> | undefined;
    if (Platform.OS !== 'web') {
      cleanupNotifications = setupNotifications();
      // Register background fetch so notifications keep firing even when app isn't opened
      registerBackgroundNotificationTask().catch((err) => {
        console.warn('[App] Background fetch registration failed:', err);
      });
      // Push current card data to the widget so it has content on launch
      updateWidgetData();

      // Migrate from the legacy block-all model (build #3/#4). If the device
      // still has IS_BLOCKING_ALL=true in shared UserDefaults, tear down the
      // legacy setup and turn the toggle off — the user will re-enable from
      // Settings via the new explicit-blocklist flow. Without this, the very
      // bug being fixed (block-all misses YouTube/Reddit/etc.) persists for
      // upgrade users until they manually toggle off.
      const stAvailable = isScreenTimeAvailable();
      if (stAvailable) {
        try {
          const migrated = migrateFromBlockAll();
          if (migrated) {
            saveScreenTimeEnabled(false);
            clearLegacyWhitelistJson();
            logDebug('App.mount', 'migrated from block-all → toggle reset');
          }
        } catch (err) {
          logDebug('App.mount', 'migrateFromBlockAll FAILED', String(err));
        }
      }

      // Refresh shield config from latest JS values. Extensions read from
      // UserDefaults — older app installs have stale config (e.g. the
      // {applicationName} subtitle placeholder bug from build #4).
      const stEnabled = loadScreenTimeEnabled();
      logDebug('App.mount', 'screenTime', { enabled: stEnabled, available: stAvailable });
      if (stEnabled && stAvailable) {
        try {
          configureShield();
          logDebug('App.mount', 'configureShield OK');
        } catch (err) {
          logDebug('App.mount', 'configureShield FAILED', String(err));
          console.warn('[App] configureShield on launch failed:', err);
        }

        // Cold-start routing — read the pending-shield-action marker written
        // by the patched ShieldActionExtension. This is the reliable signal
        // (the library's openUrl is broken on iOS, see screenTimeService.ts).
        // If the user tapped the shield within the last 60s, route to
        // /challenge with the app name. consumePendingShieldAction clears the
        // marker so it can't re-fire.
        const pending = consumePendingShieldAction();
        if (pending) {
          logDebug('App.mount', 'shield-action marker found → /challenge', pending);
          navigatedToChallenge.current = true;
          router.replace({
            pathname: '/challenge',
            params: { source: 'screentime', ...(pending.app ? { app: pending.app } : {}) },
          });
        } else {
          // Cold-start fallback: if no marker but isBlocking() returns true,
          // the shield was likely tapped on an older build (pre-patch) or
          // marker expired. Still route — the user opened LingoLock while
          // shields are up, so /challenge is the only sensible destination.
          // 1500ms gives CFPreferences time to sync from extension writes.
          const blockingNow = isBlocking();
          logDebug('App.mount', 'isBlocking @ t=0', blockingNow);
          setTimeout(() => {
            if (navigatedToChallenge.current) return;
            const blockingLater = isBlocking();
            logDebug('App.mount', 'isBlocking @ t=1500ms', blockingLater);
            if (blockingLater) {
              logDebug('App.mount', 'router.replace /challenge (cold-start fallback)');
              navigatedToChallenge.current = true;
              router.replace({ pathname: '/challenge', params: { source: 'screentime' } });
            }
          }, 1500);
        }
      }

      // Listen for widget button taps (target strings from expo-widgets Button)
      const { addUserInteractionListener } = require('expo-widgets');
      const widgetSub = addUserInteractionListener((event: { target?: string }) => {
        const { target } = event;
        if (!target) return;

        console.log('[App] Widget interaction:', target);
        const parts = target.split(':');
        const action = parts[0];

        try {
          if (action === 'answer' && parts.length >= 3) {
            const cardId = parts[1];
            // Choice may contain colons, so rejoin everything after cardId
            const choice = parts.slice(2).join(':');
            const result = processWidgetAnswer(cardId, choice);
            console.log('[App] Widget answer processed:', result);
            updateWidgetData();
            rescheduleAfterExternalAnswer().catch(e => console.error('[App] Reschedule failed:', e));
          } else if (action === 'spell' && parts.length >= 3) {
            const cardId = parts[1];
            const spellAction = parts[2] as 'char' | 'back' | 'submit';
            const char = parts[3]; // only present for 'char' action
            const result = processSpellAction(cardId, spellAction, char);
            if (result.submitted) {
              console.log('[App] Spell submitted:', result);
              rescheduleAfterExternalAnswer().catch(e => console.error('[App] Reschedule failed:', e));
            }
            updateWidgetData();
          } else if (action === 'reveal' && parts.length >= 2) {
            const cardId = parts[1];
            processWidgetReveal(cardId);
            updateWidgetData();
          } else if (action === 'rate' && parts.length >= 3) {
            const cardId = parts[1];
            const rating = parts[2] as '1' | '3';
            processWidgetRate(cardId, rating);
            updateWidgetData();
            rescheduleAfterExternalAnswer().catch(e => console.error('[App] Reschedule failed:', e));
          } else {
            console.warn('[App] Unknown widget target:', target);
          }
        } catch (error) {
          console.error('[App] Failed to handle widget interaction:', error);
        }
      });
      cleanupWidgetListener = () => widgetSub.remove();

      // Screen Time: when the app foregrounds, check for a pending shield-action
      // marker. The marker is the reliable signal that the user tapped the
      // shield (the library's openUrl is broken — see screenTimeService.ts).
      // Build #4 used a 2-second `wasRecentlyBackgrounded` heuristic which
      // missed the common case where the user takes longer than 2s to navigate
      // from the blocked app back to LingoLock; the marker is timing-agnostic.
      let lastBackgroundTime = 0;
      screenTimeSub = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'background') {
          lastBackgroundTime = Date.now();
          logDebug('App.AppState', 'background', { ts: lastBackgroundTime });
          return;
        }
        if (state !== 'active') return;
        if (!loadScreenTimeEnabled() || !isScreenTimeAvailable()) return;

        const dtBg = lastBackgroundTime === 0 ? -1 : Date.now() - lastBackgroundTime;
        const blockingNow = isBlocking();
        const pending = consumePendingShieldAction();
        logDebug('App.AppState', 'active', {
          dtBg,
          blocking: blockingNow,
          pendingMarker: pending ? { app: pending.app, ageMs: Date.now() - pending.ts } : null,
        });

        if (pending) {
          navigatedToChallenge.current = true;
          logDebug('App.AppState', 'shield-action marker → /challenge', pending);
          router.replace({
            pathname: '/challenge',
            params: { source: 'screentime', ...(pending.app ? { app: pending.app } : {}) },
          });
        }
      });
    }

    return () => {
      cleanupNotifications?.();
      cleanupWidgetListener?.();
      screenTimeSub?.remove();
    };
  }, []);

  const handleDeepLink = useCallback((deepLink: DeepLinkParams) => {
    console.log('[App] Deep link received:', deepLink);

    if (deepLink.type === 'widget-answer') {
      const { cardId, choice } = deepLink.params;
      console.log('[App] Processing widget answer:', { cardId, choice });

      try {
        const result = processWidgetAnswer(cardId, choice);
        console.log('[App] Widget answer processed:', result);
        updateWidgetData();
        rescheduleAfterExternalAnswer().catch(e => console.error('[App] Reschedule failed:', e));
      } catch (error) {
        console.error('[App] Failed to process widget answer:', error);
      }
    } else if (deepLink.type === 'widget-spell') {
      const { cardId, action, char } = deepLink.params;
      console.log('[App] Processing widget spell:', { cardId, action, char });

      try {
        const result = processSpellAction(cardId, action, char);
        if (result.submitted) {
          console.log('[App] Spell submitted:', result);
          rescheduleAfterExternalAnswer().catch(e => console.error('[App] Reschedule failed:', e));
        }
      } catch (error) {
        console.error('[App] Failed to process widget spell:', error);
      }
    } else if (deepLink.type === 'widget-reveal') {
      const { cardId } = deepLink.params;
      console.log('[App] Processing widget reveal:', { cardId });

      try {
        processWidgetReveal(cardId);
        updateWidgetData();
      } catch (error) {
        console.error('[App] Failed to process widget reveal:', error);
      }
    } else if (deepLink.type === 'widget-rate') {
      const { cardId, rating } = deepLink.params;
      console.log('[App] Processing widget rate:', { cardId, rating });

      try {
        processWidgetRate(cardId, rating);
        rescheduleAfterExternalAnswer().catch(e => console.error('[App] Reschedule failed:', e));
      } catch (error) {
        console.error('[App] Failed to process widget rate:', error);
      }
    } else if (deepLink.type === 'challenge') {
      logDebug('App.deepLink', 'challenge → router.replace', deepLink.params);
      navigatedToChallenge.current = true;
      router.replace({
        pathname: '/challenge',
        params: {
          source: deepLink.params.source,
          ...(deepLink.params.app ? { app: deepLink.params.app } : {}),
        },
      });
    }
  }, [router]);

  // ---------------------------------------------------------------------------
  // Keychain backup — restore on fresh install, daily backup on foreground
  // ---------------------------------------------------------------------------
  const [backupMeta, setBackupMeta] = useState<BackupMeta | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);

  // Allow any screen to open the debug overlay via openDebugLog()
  useEffect(() => {
    return subscribeOpenDebugLog(() => setShowDebugLog(true));
  }, []);

  // Check for backup on mount (fresh install detection)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!shouldPromptRestore()) return;

    checkForBackup().then((meta) => {
      if (meta) {
        setBackupMeta(meta);
        setShowRestore(true);
      }
    });
  }, []);

  // Backup trigger on app foreground
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && shouldBackup()) {
        createBackup();
      }
    });
    return () => sub.remove();
  }, []);

  const handleRestore = useCallback(async () => {
    await restoreFromBackup();
    setShowRestore(false);
  }, []);

  const handleStartFresh = useCallback(() => {
    dismissRestore();
    setShowRestore(false);
  }, []);

  useDeepLink(handleDeepLink);

  const themedHeaderOptions = {
    headerStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.onSurface,
    headerShadowVisible: false,
    headerBackTitle: '',
  };

  const content = (
    <ActiveBundleProvider>
    <Stack screenOptions={themedHeaderOptions}>
      <Stack.Screen name="index" options={{ headerShown: false, headerBackTitle: '' }} />
      <Stack.Screen
        name="challenge"
        options={{
          presentation: 'fullScreenModal',
          headerShown: false,
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="tutorial"
        options={{
          presentation: 'modal',
          title: 'Setup Tutorial',
        }}
      />
      <Stack.Screen
        name="deck-picker"
        options={{
          presentation: 'modal',
          title: 'Decks',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              size={22}
              iconColor={theme.colors.onSurface}
              onPress={() => router.back()}
              accessibilityLabel="Back"
            />
          ),
        }}
      />
      <Stack.Screen
        name="vocabulary"
        options={{
          title: 'Vocabulary',
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              size={22}
              iconColor={theme.colors.onSurface}
              onPress={() => router.back()}
              accessibilityLabel="Back"
            />
          ),
        }}
      />
      <Stack.Screen
        name="stats"
        options={{
          title: 'Progress',
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              size={22}
              iconColor={theme.colors.onSurface}
              onPress={() => router.back()}
              accessibilityLabel="Back"
            />
          ),
        }}
      />
      <Stack.Screen
        name="vocabulary/[id]"
        options={{ title: 'Word Detail' }}
      />
    </Stack>
    </ActiveBundleProvider>
  );

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
      <PaperProvider theme={theme}>
        {showRestore && backupMeta && (
          <RestorePrompt
            visible={showRestore}
            meta={backupMeta}
            onRestore={handleRestore}
            onStartFresh={handleStartFresh}
          />
        )}
        <DebugLogOverlay visible={showDebugLog} onClose={() => setShowDebugLog(false)} />
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, alignItems: 'center', backgroundColor: theme.colors.background }}>
            <View style={{ flex: 1, width: '100%', maxWidth: 480 }}>
              {content}
            </View>
          </View>
        ) : (
          content
        )}
      </PaperProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
