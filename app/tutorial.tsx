import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { TutorialStep } from '../src/components/TutorialStep';

export default function TutorialScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Configure iOS Shortcuts to trigger vocabulary challenges automatically
        </Text>

        <Surface style={styles.section} elevation={1}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            1. Device Unlock Automation
          </Text>

          <TutorialStep
            stepNumber={1}
            title="Open Shortcuts App"
            description="Launch the Shortcuts app from your home screen."
            image={require('../assets/tutorial/shortcuts-setup-1.png')}
          />
          <TutorialStep
            stepNumber={2}
            title="Create New Automation"
            description='Tap "Automation" tab at bottom, then tap "+" to create new automation.'
            image={require('../assets/tutorial/shortcuts-setup-2.png')}
          />
          <TutorialStep
            stepNumber={3}
            title='Select "When I unlock my iPhone"'
            description='Choose personal automation trigger "When I unlock my iPhone".'
            image={require('../assets/tutorial/shortcuts-setup-3.png')}
          />
          <TutorialStep
            stepNumber={4}
            title="Add Open URL Action"
            description={'Add action "Open URL" and enter:\n\nlingolock://challenge?source=Unlock&count=3&type=unlock\n\nDisable "Ask Before Running" and tap Done.'}
            image={require('../assets/tutorial/shortcuts-setup-4.png')}
          />
        </Surface>

        <Surface style={styles.section} elevation={1}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            2. App-Open Automation (Optional)
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.sectionBody, { color: theme.colors.onSurfaceVariant }]}
          >
            Repeat the same steps, but in Step 3, select "When I open an app" and choose which app to trigger LingoLock (e.g., Instagram, Twitter).
            {'\n\n'}
            Use URL:{'\n'}
            lingolock://challenge?source=[AppName]&count=3&type=app_open
            {'\n\n'}
            Replace [AppName] with the app name (e.g., Instagram).
          </Text>
        </Surface>

        <Button
          mode="contained"
          onPress={() => router.back()}
          style={styles.doneButton}
          contentStyle={styles.doneButtonContent}
        >
          Got It!
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionBody: {
    lineHeight: 22,
  },
  doneButton: {
    marginTop: 8,
    marginBottom: 24,
  },
  doneButtonContent: {
    paddingVertical: 8,
  },
});
