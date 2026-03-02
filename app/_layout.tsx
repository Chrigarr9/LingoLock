import { Stack } from 'expo-router';
import { useDeepLink } from '../src/hooks/useDeepLink';
import { ChallengeParams } from '../src/types/vocabulary';

export default function RootLayout() {
  const handleDeepLink = (params: ChallengeParams) => {
    console.log('[App] Deep link received:', params);
    // TODO (Plan 04): Navigate to challenge screen with params
  };

  useDeepLink(handleDeepLink);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'LingoLock' }} />
    </Stack>
  );
}
