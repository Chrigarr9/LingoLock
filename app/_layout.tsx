import { Stack, useRouter } from 'expo-router';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';

export default function RootLayout() {
  const router = useRouter();

  const handleDeepLink = (params: ChallengeParams) => {
    console.log('[App] Deep link received:', params);

    // Navigate to challenge screen with params
    router.push({
      pathname: '/challenge',
      params: {
        source: params.source,
        count: params.count.toString(),
        type: params.type
      }
    });
  };

  useDeepLink(handleDeepLink);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'LingoLock' }} />
      <Stack.Screen
        name="challenge"
        options={{
          presentation: 'fullScreenModal',
          headerShown: false,
          animation: 'fade'
        }}
      />
    </Stack>
  );
}
