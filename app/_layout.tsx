import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform, View, useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';
import { lightTheme, darkTheme } from '../src/theme';

export default function RootLayout() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }
  }, []);

  const handleDeepLink = (params: ChallengeParams) => {
    console.log('[App] Deep link received:', params);
    router.push({
      pathname: '/challenge',
      params: {
        source: params.source,
        count: params.count.toString(),
        type: params.type,
      },
    });
  };

  useDeepLink(handleDeepLink);

  const content = (
    <Stack>
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
        options={{ title: 'Settings', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="vocabulary"
        options={{ title: 'Vocabulary', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="stats"
        options={{ title: 'Progress', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="vocabulary/[id]"
        options={{ title: 'Word Detail', headerBackTitle: '' }}
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
