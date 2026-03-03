import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import { TutorialStep } from '../src/components/TutorialStep';

export default function TutorialScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  const glassStyle = {
    backgroundColor: theme.custom.glassBackground,
    borderColor: theme.custom.glassBorder,
    ...Platform.select({
      web: { backdropFilter: `blur(${theme.custom.glassBlur}px)` } as any,
      default: {},
    }),
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <View style={styles.content}>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Configure iOS Shortcuts to trigger vocabulary challenges automatically
        </Text>

        <View style={[styles.section, glassStyle, styles.mainSection]}>
          <Text
            variant="titleSmall"
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
        </View>

        <View style={[styles.section, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            2. App-Open Automation (Optional)
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.sectionBody, { color: theme.colors.onSurfaceVariant }]}
          >
            Repeat the same steps, but select "When I open an app" and choose which app to trigger LingoLock.
            {'\n\n'}
            Use URL: lingolock://challenge?source=[AppName]&count=3&type=app_open
          </Text>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  mainSection: {
    flex: 1,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  sectionBody: {
    lineHeight: 22,
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
