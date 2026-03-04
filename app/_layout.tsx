import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform, View, useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { DeepLinkParams } from '../src/utils/deepLinkHandler';
import { lightTheme, darkTheme } from '../src/theme';
import { setupNotifications } from '../src/services/notificationService';
import { processWidgetAnswer, updateWidgetData } from '../src/services/widgetService';

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

  const handleDeepLink = (deepLink: DeepLinkParams) => {
    console.log('[App] Deep link received:', deepLink);

    if (deepLink.type === 'challenge') {
      // Navigate to challenge screen
      router.push({
        pathname: '/challenge',
        params: {
          source: deepLink.params.source,
          count: deepLink.params.count.toString(),
          type: deepLink.params.type,
        },
      });
    } else if (deepLink.type === 'widget-answer') {
      // Process widget answer without opening app
      const { cardId, choice } = deepLink.params;
      console.log('[App] Processing widget answer:', { cardId, choice });

      try {
        const result = processWidgetAnswer(cardId, choice);
        console.log('[App] Widget answer processed:', result);
        // Refresh widget with next card
        updateWidgetData();
      } catch (error) {
        console.error('[App] Failed to process widget answer:', error);
      }
    }
  };

  useDeepLink(handleDeepLink);

  const themedHeaderOptions = {
    headerStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.onSurface,
    headerShadowVisible: false,
    headerBackTitle: '',
  };

  const content = (
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
        options={{ title: 'Settings' }}
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
  );

  return (
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
  );
}
