import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, getGlassStyle } from '../src/theme';
import { TutorialStep } from '../src/components/TutorialStep';

export default function TutorialScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const glassStyle = getGlassStyle(theme);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          LingoLock uses iOS Shortcuts to show vocabulary cards before you open your favorite apps. Set up an automation once, and it works automatically.
        </Text>

        <View style={[styles.section, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            Setup
          </Text>

          <TutorialStep
            stepNumber={1}
            title="Open the Shortcuts App"
            description="Find the Shortcuts app on your home screen (it comes pre-installed on all iPhones)."
            image={require('../assets/tutorial/shortcuts-setup-1.png')}
          />
          <TutorialStep
            stepNumber={2}
            title="Go to Automation"
            description='Tap the "Automation" tab at the bottom of the screen, then tap the "+" button in the top right to create a new automation.'
            image={require('../assets/tutorial/shortcuts-setup-2.png')}
          />
          <TutorialStep
            stepNumber={3}
            title='Choose "App" Trigger'
            description='Select "App" from the list. Pick the app you want to practice before (e.g. Instagram). Choose "Is Opened" and set "Run Immediately".'
          />
          <TutorialStep
            stepNumber={4}
            title="Add LingoLock Action"
            description='Tap "New Blank Automation", then tap "Add Action". Search for "LingoLock" in the search bar.'
          />
          <TutorialStep
            stepNumber={5}
            title='Select "Start Practice"'
            description='Tap "Start Practice in LingoLock". In the action, tap "App" and select the same app you chose as the trigger (e.g. Instagram).'
          />
          <TutorialStep
            stepNumber={6}
            title="Done!"
            description="Tap Done. Now every time you open that app, LingoLock will show vocabulary cards first. After answering enough cards, a button will appear to continue to your app."
          />
        </View>

        <View style={[styles.section, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            Optional: Practice Cooldown
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18, marginBottom: 8 }}
          >
            Want to practice once and then freely use all your apps for a while? Add a cooldown timer so LingoLock only interrupts you when your cooldown expires.
          </Text>

          <TutorialStep
            stepNumber={1}
            title="Edit Your Automation"
            description='Open the Shortcuts app, go to "Automation", and tap the automation you created above to edit it.'
          />
          <TutorialStep
            stepNumber={2}
            title='Add "Practice Needed" Check'
            description='Tap "Add Action" at the top, before "Start Practice". Search for "LingoLock" and select "Practice Needed". Tap the default time to change the cooldown duration (e.g. 5 minutes).'
          />
          <TutorialStep
            stepNumber={3}
            title='Move "Start Practice" Inside the If'
            description='The automation should now look like this: "If Practice Needed is Yes → Start Practice". This means: only practice when the cooldown has expired.'
          />
          <TutorialStep
            stepNumber={4}
            title="How It Works"
            description="After completing your practice cards, all your automated apps are unlocked for the cooldown duration. Practice once, then freely open Instagram, TikTok, YouTube — no interruptions until the timer runs out."
          />
        </View>

        <Button
          mode="contained"
          onPress={() => router.back()}
          style={styles.doneButton}
          contentStyle={styles.doneButtonContent}
          labelStyle={styles.doneButtonLabel}
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 10,
    flexGrow: 1,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flex: 1,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  doneButton: {
    borderRadius: 20,
  },
  doneButtonContent: {
    paddingVertical: 8,
  },
  doneButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
});
