import React from 'react';
import { ScrollView, View, Text, StyleSheet, useColorScheme, SafeAreaView, Button } from 'react-native';
import { useRouter } from 'expo-router';
import { TutorialStep } from '../src/components/TutorialStep';

export default function TutorialScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleComplete = () => {
    router.back();
  };

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: isDark ? '#000000' : '#ffffff' }
    ]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[
            styles.headerTitle,
            { color: isDark ? '#ffffff' : '#000000' }
          ]}>
            Setting Up LingoLock
          </Text>
          <Text style={[
            styles.headerSubtitle,
            { color: isDark ? 'rgba(235, 235, 245, 0.6)' : 'rgba(60, 60, 67, 0.6)' }
          ]}>
            Configure iOS Shortcuts to trigger vocabulary challenges automatically
          </Text>
        </View>

        {/* Device Unlock Automation */}
        <View style={styles.section}>
          <Text style={[
            styles.sectionTitle,
            { color: isDark ? '#ffffff' : '#000000' }
          ]}>
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

        {/* App-Open Automation */}
        <View style={styles.section}>
          <Text style={[
            styles.sectionTitle,
            { color: isDark ? '#ffffff' : '#000000' }
          ]}>
            2. App-Open Automation (Optional)
          </Text>

          <Text style={[
            styles.sectionDescription,
            { color: isDark ? 'rgba(235, 235, 245, 0.6)' : 'rgba(60, 60, 67, 0.6)' }
          ]}>
            Repeat the same steps, but in Step 3, select "When I open an app" and choose which app to trigger LingoLock (e.g., Instagram, Twitter).
            {'\n\n'}
            Use URL:
            {'\n\n'}
            lingolock://challenge?source=[AppName]&count=3&type=app_open
            {'\n\n'}
            Replace [AppName] with the app name (e.g., Instagram).
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Button title="Got It!" onPress={handleComplete} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'System',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    fontFamily: 'System',
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(60, 60, 67, 0.12)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'System',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionDescription: {
    fontSize: 15,
    fontFamily: 'System',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
});
