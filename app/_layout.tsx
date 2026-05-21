import React, { Component, useCallback, useEffect, useState } from 'react';
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
import { registerBackgroundReshieldTask } from '../src/services/backgroundReshieldTask';
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
  maybeRestoreShields,
  startUnlockTimerIfArmed,
  getScreenTimeDebugState,
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
    let monitorEventSub: { remove: () => void } | undefined;
    if (Platform.OS !== 'web') {
      cleanupNotifications = setupNotifications();
      // Register background fetch so notifications keep firing even when app isn't opened
      registerBackgroundNotificationTask().catch((err) => {
        console.warn('[App] Background fetch registration failed:', err);
      });
      // Periodic re-shield check — runs at iOS's discretion (~15min+) and
      // restores blocking when DeviceActivityMonitor.intervalDidEnd dropped.
      // Always registered (matching the notification task pattern); the task
      // itself short-circuits when screen time is disabled.
      registerBackgroundReshieldTask().catch((err) => {
        console.warn('[App] Reshield task registration failed:', err);
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
          logDebug('App.mount', 'migrateFromBlockAll', { migrated });
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

        // Safety net: if the unlock window has expired (or never existed) and
        // shields are absent, re-apply the saved blocklist. Covers both the
        // build #5 inert-shield bug and the case where iOS dropped the
        // DeviceActivityMonitor.intervalDidEnd callback. No-op if the user is
        // mid-unlock or shields are already up.
        try {
          maybeRestoreShields();
        } catch (err) {
          logDebug('App.mount', 'maybeRestoreShields FAILED', String(err));
        }

        // Cold-start routing — read the pending-shield-action marker written
        // by the patched ShieldActionExtension. This is the ONLY signal we
        // route on: opening LingoLock manually (e.g. to check settings or
        // practice voluntarily) should NOT auto-bounce to /challenge even
        // while shields are active. The marker is set only when the user
        // tapped the shield's "Open LingoLock" button.
        const pending = consumePendingShieldAction();
        const blockingNow = isBlocking();
        logDebug('App.mount', 'state', {
          blocking: blockingNow,
          marker: pending ? { app: pending.app, ageMs: Date.now() - pending.ts } : null,
        });
        if (pending) {
          logDebug('App.mount', 'shield-action marker → /challenge', pending);
          router.replace({
            pathname: '/challenge',
            params: { source: 'screentime', ...(pending.app ? { app: pending.app } : {}) },
          });
        }
      }

      // Subscribe to native DeviceActivityMonitor events (intervalDidStart,
      // intervalDidEnd, etc.). This gives us:
      //   1. Visibility into whether Apple is actually firing intervalDidEnd
      //      at the 10-min mark — if the debug log shows the event, the
      //      native re-block path is working; if not, only the JS safety
      //      net + bg task carry the load.
      //   2. A defensive re-apply: when intervalDidEnd fires, we call
      //      maybeRestoreShields ourselves regardless of whether the native
      //      action succeeded. Idempotent (no-op if shields already up).
      try {
        const { onDeviceActivityMonitorEvent } = require('react-native-device-activity');
        monitorEventSub = onDeviceActivityMonitorEvent((event: { callbackName?: string; activityName?: string }) => {
          logDebug('App.DeviceActivity', 'native event', event);
          if (event.callbackName === 'intervalDidEnd') {
            (async () => {
              const { maybeRestoreShields } = await import('../src/services/screenTimeService');
              try {
                maybeRestoreShields();
              } catch (err) {
                logDebug('App.DeviceActivity', 'reshield FAILED', String(err));
              }
            })();
          }
        });
      } catch (err) {
        logDebug('App.mount', 'onDeviceActivityMonitorEvent subscribe FAILED', String(err));
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
          logDebug('App.AppState', 'background', {
            ts: lastBackgroundTime,
            screenTime: getScreenTimeDebugState(),
          });
          if (loadScreenTimeEnabled() && isScreenTimeAvailable()) {
            try {
              const started = startUnlockTimerIfArmed('app-background');
              logDebug('App.AppState', 'startUnlockTimerIfArmed', {
                started,
                screenTime: getScreenTimeDebugState(),
              });
            } catch (err) {
              logDebug('App.AppState', 'startUnlockTimerIfArmed FAILED', String(err));
            }
          }
          return;
        }
        if (state !== 'active') return;
        if (!loadScreenTimeEnabled() || !isScreenTimeAvailable()) return;

        // Safety net first — if the unlock window expired during background,
        // re-apply the blocklist before doing anything else. This is what
        // makes "10 minutes after unlock, things re-lock" work even when
        // iOS drops intervalDidEnd.
        try {
          maybeRestoreShields();
        } catch (err) {
          logDebug('App.AppState', 'maybeRestoreShields FAILED', String(err));
        }

        const dtBg = lastBackgroundTime === 0 ? -1 : Date.now() - lastBackgroundTime;
        const blockingNow = isBlocking();
        const pending = consumePendingShieldAction();
        logDebug('App.AppState', 'active', {
          dtBg,
          blocking: blockingNow,
          screenTime: getScreenTimeDebugState(),
          pendingMarker: pending ? { app: pending.app, ageMs: Date.now() - pending.ts } : null,
        });

        if (pending) {
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
      monitorEventSub?.remove();
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

  // Default to NO header at the Stack level so the index screen never flashes
  // a default "index" title during cold start while per-screen options are
  // still resolving. Screens that need a header opt in via headerShown: true.
  const themedHeaderOptions = {
    headerShown: false,
    headerStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.onSurface,
    headerShadowVisible: false,
    headerBackTitle: '',
  };

  const content = (
    <ActiveBundleProvider>
    <Stack screenOptions={themedHeaderOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="challenge"
        options={{
          // Default push/pop slide matches vocabulary→home; the previous
          // fullScreenModal+fade produced a white-flash transition the user
          // disliked. gestureEnabled stays off so a stray swipe can't
          // abandon mid-card progress.
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="deck-picker"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Decks',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
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
          headerShown: true,
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
          headerShown: true,
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
        options={{ headerShown: true, title: 'Word Detail' }}
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
