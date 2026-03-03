import { Stack, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';
import { lightTheme, darkTheme } from '../src/theme';

export default function RootLayout() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

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

  return (
    <PaperProvider theme={theme}>
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
      </Stack>
    </PaperProvider>
  );
}
