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
import { loadScreenTimeEnabled } from '../src/services/storage';
import { isScreenTimeAvailable, isBlocking, configureShield } from '../src/services/screenTimeService';
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

      // Refresh shield config (text/colors/action URL) from latest JS values.
      // Extensions read from UserDefaults — older app installs may have stale config.
      const stEnabled = loadScreenTimeEnabled();
      const stAvailable = isScreenTimeAvailable();
      logDebug('App.mount', 'screenTime', { enabled: stEnabled, available: stAvailable });
      if (stEnabled && stAvailable) {
        try {
          configureShield();
          logDebug('App.mount', 'configureShield OK');
        } catch (err) {
          logDebug('App.mount', 'configureShield FAILED', String(err));
          console.warn('[App] configureShield on launch failed:', err);
        }

        // Cold-start fallback: if the app was launched while apps are blocked,
        // route to /challenge even if the shield's deep-link URL didn't parse
        // (e.g. unfilled {applicationName} placeholder on older builds without
        // the Swift patch). The deep-link handler will still fire too — both
        // navigate to the same place so router.replace is idempotent.
        //
        // 1500ms (was 300ms) gives the native module's UserDefaults reads time
        // to sync from the shield extension's writes. iOS CFPreferences caches
        // values per-process; right after the extension fires, isShieldActive()
        // on a fresh app launch can momentarily return false.
        const blockingNow = isBlocking();
        logDebug('App.mount', 'isBlocking @ t=0', blockingNow);
        setTimeout(() => {
          if (navigatedToChallenge.current) {
            logDebug('App.mount', 'cold-start fallback skipped — already navigated');
            return;
          }
          const blockingLater = isBlocking();
          logDebug('App.mount', 'isBlocking @ t=1500ms', blockingLater);
          if (blockingLater) {
            logDebug('App.mount', 'router.replace /challenge (cold-start fallback)');
            navigatedToChallenge.current = true;
            router.replace({ pathname: '/challenge', params: { source: 'screentime' } });
          } else {
            logDebug('App.mount', 'cold-start fallback skipped — not blocking');
          }
        }, 1500);
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

      // Screen Time: detect when app opens while shields are active
      // This handles the shield button's "openApp" action
      let lastBackgroundTime = 0;
      screenTimeSub = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'background') {
          lastBackgroundTime = Date.now();
          logDebug('App.AppState', 'background', { ts: lastBackgroundTime });
        }
        if (state === 'active' && loadScreenTimeEnabled() && isScreenTimeAvailable()) {
          const dtBg = lastBackgroundTime === 0 ? -1 : Date.now() - lastBackgroundTime;
          const wasRecentlyBackgrounded = lastBackgroundTime > 0 && dtBg < 2000;
          const blockingNow = isBlocking();
          logDebug('App.AppState', 'active', {
            dtBg,
            wasRecentlyBackgrounded,
            blocking: blockingNow,
          });
          if (wasRecentlyBackgrounded && blockingNow && !navigatedToChallenge.current) {
            logDebug('App.AppState', 'router.replace /challenge (warm fallback)');
            navigatedToChallenge.current = true;
            router.replace({
              pathname: '/challenge',
              params: { source: 'screentime' },
            });
          }
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
