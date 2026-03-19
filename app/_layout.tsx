import React, { Component, useCallback, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform, View, useColorScheme, Text, StyleSheet } from 'react-native';
import { IconButton, PaperProvider } from 'react-native-paper';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { DeepLinkParams } from '../src/utils/deepLinkHandler';
import { lightTheme, darkTheme } from '../src/theme';
import { setupNotifications } from '../src/services/notificationService';
import { processWidgetAnswer, processSpellAction, processWidgetReveal, processWidgetRate, updateWidgetData } from '../src/services/widgetService';
import { ActiveBundleProvider } from '../src/content/activeBundleProvider';

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

    // Native: Setup notifications
    let cleanupNotifications: (() => void) | undefined;
    if (Platform.OS !== 'web') {
      cleanupNotifications = setupNotifications();
    }

    return () => {
      cleanupNotifications?.();
    };
  }, []);

  const handleDeepLink = useCallback((deepLink: DeepLinkParams) => {
    console.log('[App] Deep link received:', deepLink);

    if (deepLink.type === 'challenge') {
      router.push({
        pathname: '/challenge',
        params: {
          source: deepLink.params.source,
          count: deepLink.params.count.toString(),
          type: deepLink.params.type,
        },
      });
    } else if (deepLink.type === 'widget-answer') {
      const { cardId, choice } = deepLink.params;
      console.log('[App] Processing widget answer:', { cardId, choice });

      try {
        const result = processWidgetAnswer(cardId, choice);
        console.log('[App] Widget answer processed:', result);
        updateWidgetData();
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
      } catch (error) {
        console.error('[App] Failed to process widget rate:', error);
      }
    }
  }, [router]);

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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="challenge"
        options={{
          presentation: 'fullScreenModal',
          headerShown: false,
          animation: 'fade',
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
        options={{ title: 'Vocabulary' }}
      />
      <Stack.Screen
        name="stats"
        options={{ title: 'Progress' }}
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
      <PaperProvider theme={theme}>
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
    </AppErrorBoundary>
  );
}
