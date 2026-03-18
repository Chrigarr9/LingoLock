import React, { Component, useCallback, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform, View, useColorScheme, Text, StyleSheet } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';
import { lightTheme, darkTheme } from '../src/theme';

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
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    }
  }, []);

  const handleDeepLink = useCallback((params: ChallengeParams) => {
    console.log('[App] Deep link received:', params);
    router.push({
      pathname: '/challenge',
      params: {
        source: params.source,
        count: params.count.toString(),
        type: params.type,
      },
    });
  }, [router]);

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
