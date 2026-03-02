---
phase: 1-shortcuts-integration
plan: 07
type: execute
wave: 4
depends_on: [1-03, 1-04, 1-06]
files_modified:
  - app/tutorial.tsx
  - app/index.tsx
  - app/_layout.tsx
  - src/components/TutorialStep.tsx
  - assets/tutorial/shortcuts-setup-1.png
  - assets/tutorial/shortcuts-setup-2.png
  - assets/tutorial/shortcuts-setup-3.png
  - assets/tutorial/shortcuts-setup-4.png
autonomous: false

must_haves:
  truths:
    - "User sees tutorial on first app launch"
    - "Tutorial is skippable (user can dismiss and explore app)"
    - "Tutorial is always accessible from home screen"
    - "Tutorial explains both unlock and app-open automation setup"
    - "Tutorial provides step-by-step instructions with screenshots"
  artifacts:
    - path: "app/tutorial.tsx"
      provides: "Tutorial screen route"
      min_lines: 150
      contains: "TutorialStep"
    - path: "src/components/TutorialStep.tsx"
      provides: "Reusable tutorial step component"
      exports: ["TutorialStep"]
      min_lines: 50
    - path: "app/index.tsx"
      provides: "Tutorial link on home screen"
      contains: "tutorial"
    - path: "assets/tutorial/"
      provides: "Tutorial screenshot images"
      min_files: 4
  key_links:
    - from: "app/index.tsx"
      to: "app/tutorial.tsx"
      via: "Navigation link to tutorial"
      pattern: "router\\.push.*tutorial"
    - from: "app/tutorial.tsx"
      to: "src/components/TutorialStep.tsx"
      via: "Render tutorial steps"
      pattern: "import.*TutorialStep"
---

<objective>
Create tutorial screen explaining iOS Shortcuts automation setup for device unlock and app-open triggers.

Purpose: Users need clear instructions to set up the two Shortcuts automations that make LingoLock work. Without this tutorial, users won't know how to configure the integrations that trigger vocabulary challenges.

Output: Multi-step tutorial accessible on first launch and from home screen, with screenshots showing Shortcuts configuration.
</objective>

<execution_context>
@/home/ubuntu/.claude/get-shit-done/workflows/execute-plan.md
@/home/ubuntu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/ubuntu/Projects/vokabeltrainer/.planning/PROJECT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/ROADMAP.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/STATE.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-CONTEXT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-RESEARCH.md
@/home/ubuntu/Projects/vokabeltrainer/app/index.tsx
@/home/ubuntu/Projects/vokabeltrainer/app/_layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Create placeholder tutorial screenshots</name>
  <files>assets/tutorial/shortcuts-setup-1.png, assets/tutorial/shortcuts-setup-2.png, assets/tutorial/shortcuts-setup-3.png, assets/tutorial/shortcuts-setup-4.png</files>
  <action>
Create placeholder images for tutorial screenshots.

Create directory: `assets/tutorial/`

Create 4 placeholder images (can be simple colored rectangles with text for now - real screenshots will be added during human verification):

1. `shortcuts-setup-1.png`: "Step 1: Open Shortcuts app" (800x600px placeholder)
2. `shortcuts-setup-2.png`: "Step 2: Create Automation" (800x600px placeholder)
3. `shortcuts-setup-3.png`: "Step 3: Configure Trigger" (800x600px placeholder)
4. `shortcuts-setup-4.png`: "Step 4: Add Open URL Action" (800x600px placeholder)

Use a simple script to generate placeholder PNGs:
```bash
mkdir -p assets/tutorial
# Create simple placeholder images using ImageMagick or similar
# For now, create empty files as markers - real screenshots will be added manually
touch assets/tutorial/shortcuts-setup-1.png
touch assets/tutorial/shortcuts-setup-2.png
touch assets/tutorial/shortcuts-setup-3.png
touch assets/tutorial/shortcuts-setup-4.png
```

These will be replaced with actual iOS screenshots during the checkpoint verification task.

Note: Real screenshots require running iOS Shortcuts app, which can only be done on physical device or simulator during testing.
  </action>
  <verify>
Run: `ls assets/tutorial/` to verify 4 .png files exist
Check: Directory structure created
  </verify>
  <done>
assets/tutorial/ directory exists with 4 placeholder .png files
  </done>
</task>

<task type="auto">
  <name>Create TutorialStep component</name>
  <files>src/components/TutorialStep.tsx</files>
  <action>
Create reusable component for displaying tutorial steps with image and text.

Create file: `src/components/TutorialStep.tsx`

Implementation:
```typescript
import React from 'react';
import { View, Text, Image, StyleSheet, useColorScheme, ImageSourcePropType } from 'react-native';

interface TutorialStepProps {
  stepNumber: number;
  title: string;
  description: string;
  image: ImageSourcePropType;
}

export function TutorialStep({ stepNumber, title, description, image }: TutorialStepProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container}>
      {/* Step number */}
      <View style={[
        styles.stepBadge,
        { backgroundColor: isDark ? '#0a84ff' : '#007aff' }
      ]}>
        <Text style={styles.stepNumber}>{stepNumber}</Text>
      </View>

      {/* Title */}
      <Text style={[
        styles.title,
        { color: isDark ? '#ffffff' : '#000000' }
      ]}>
        {title}
      </Text>

      {/* Screenshot */}
      <View style={styles.imageContainer}>
        <Image
          source={image}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      {/* Description */}
      <Text style={[
        styles.description,
        { color: isDark ? 'rgba(235, 235, 245, 0.6)' : 'rgba(60, 60, 67, 0.6)' }
      ]}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'System',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: 'System',
    textAlign: 'center',
    marginBottom: 20,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  description: {
    fontSize: 15,
    fontFamily: 'System',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});
```

Clean, iOS-native design with step numbers, screenshots, and descriptions.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify component compiles
Check: Component receives stepNumber, title, description, image props
Check: Component uses iOS-native styling and colors
Check: Component adapts to dark mode
  </verify>
  <done>
src/components/TutorialStep.tsx exists with iOS-native tutorial step component
  </done>
</task>

<task type="auto">
  <name>Create tutorial screen with Shortcuts instructions</name>
  <files>app/tutorial.tsx</files>
  <action>
Create tutorial screen explaining how to set up both Shortcuts automations.

Create file: `app/tutorial.tsx`

User requirements from CONTEXT.md:
- Both automations in one tutorial (unlock + app-open)
- Step-by-step with screenshots
- Clear, concise instructions

Implementation:
```typescript
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
```

Includes both automations in one tutorial as requested. Shows unlock automation with full steps, app-open automation with brief variation instructions.
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify screen compiles
Check: Screen imports and uses TutorialStep component
Check: Screen includes both unlock and app-open automation instructions
Check: Screen shows URL scheme examples with correct format
Check: Screen has "Got It!" button to exit tutorial
  </verify>
  <done>
app/tutorial.tsx exists with complete Shortcuts setup tutorial covering both automations
  </done>
</task>

<task type="auto">
  <name>Add tutorial link to home screen and register route</name>
  <files>app/index.tsx, app/_layout.tsx</files>
  <action>
Update home screen to include tutorial button and register tutorial route in navigation.

Modify `app/index.tsx`:
```typescript
import { View, Text, StyleSheet, Button } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LingoLock 🔒</Text>
      <Text style={styles.subtitle}>Vocabulary learning, integrated into your day</Text>
      <Text style={styles.status}>Phase 1: Shortcuts Integration</Text>

      <View style={styles.buttonContainer}>
        <Button
          title="Setup Tutorial"
          onPress={() => router.push('/tutorial')}
        />
      </View>

      <Text style={styles.hint}>
        Configure iOS Shortcuts to trigger vocabulary challenges when unlocking your device or opening apps.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  status: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 32,
  },
  buttonContainer: {
    marginVertical: 20,
  },
  hint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 40,
  },
});
```

Modify `app/_layout.tsx` to register tutorial route:
```typescript
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
    <Stack.Screen
      name="tutorial"
      options={{
        presentation: 'modal',
        title: 'Setup Tutorial'
      }}
    />
  </Stack>
);
```

Tutorial is always accessible from home screen (per user requirement).
  </action>
  <verify>
Run: `npx tsc --noEmit` to verify files compile
Check: Home screen has "Setup Tutorial" button
Check: Button navigates to /tutorial
Check: Layout registers "tutorial" screen as modal
  </verify>
  <done>
app/index.tsx has tutorial button, app/_layout.tsx registers tutorial route as modal
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Tutorial screen with step-by-step Shortcuts setup instructions, accessible from home screen.
  </what-built>
  <how-to-verify>
1. Build and run development build:
   ```
   npx expo run:ios
   ```

2. Test tutorial access from home screen:
   - [ ] Home screen shows "Setup Tutorial" button
   - Press button
   - [ ] Tutorial screen opens as modal
   - [ ] Tutorial shows title "Setting Up LingoLock"

3. Review tutorial content:
   - [ ] Section 1: Device Unlock Automation (4 steps with images)
   - [ ] Section 2: App-Open Automation (variation instructions)
   - [ ] URL scheme examples shown: lingolock://challenge?source=...
   - [ ] Instructions mention "Ask Before Running" should be disabled

4. Test tutorial navigation:
   - [ ] Can scroll through all steps
   - [ ] "Got It!" button at bottom
   - Press "Got It!" button
   - [ ] Returns to home screen

5. Test dark mode:
   - Toggle dark mode in Settings
   - Open tutorial
   - [ ] Background changes to black
   - [ ] Text adapts to dark mode
   - [ ] Step badges remain visible (iOS blue)

6. **IMPORTANT - Add real screenshots:**
   - Open iOS Shortcuts app on device/simulator
   - Create a test automation following tutorial steps
   - Take screenshots at each step
   - Replace placeholder images in assets/tutorial/ with actual screenshots:
     - shortcuts-setup-1.png: Shortcuts app main screen
     - shortcuts-setup-2.png: Automation creation screen
     - shortcuts-setup-3.png: "When I unlock my iPhone" selection
     - shortcuts-setup-4.png: Open URL action configuration
   - Rebuild app and verify screenshots display correctly

7. Test deep link integration:
   - After following tutorial steps, trigger actual Shortcut automation
   - [ ] Shortcut opens LingoLock challenge screen
   - [ ] Challenge screen works as expected

Expected: Clear, easy-to-follow tutorial that enables users to set up Shortcuts automations successfully.
  </how-to-verify>
  <resume-signal>
Type "approved" if tutorial is clear and functional, or describe issues (unclear instructions, missing steps, layout problems, screenshot quality).

Note: Real screenshots must be added during this verification step - placeholder images are insufficient for user testing.
  </resume-signal>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. Tutorial step component: `cat src/components/TutorialStep.tsx` exports TutorialStep
2. Tutorial screen: `cat app/tutorial.tsx` exports tutorial with Shortcuts instructions
3. Home screen integration: `cat app/index.tsx` includes tutorial button
4. Route registration: `cat app/_layout.tsx` includes tutorial route
5. TypeScript compilation: `npx tsc --noEmit` passes
6. Tutorial screenshots: `ls assets/tutorial/` shows 4 .png files
7. Functional verification (human checkpoint): Tutorial clarity, screenshot quality, navigation

**Human verification required** - Tutorial clarity and real screenshot replacement.
</verification>

<success_criteria>
- Tutorial screen explains both device unlock and app-open automations
- Step-by-step instructions with screenshots (4 steps for unlock, variation for app-open)
- Tutorial accessible from home screen via "Setup Tutorial" button
- Tutorial is skippable (modal presentation with close button)
- URL scheme examples clearly shown (lingolock://challenge?source=...)
- Tutorial mentions disabling "Ask Before Running" for automations
- Dark mode support for tutorial screen
- Real iOS Shortcuts screenshots replace placeholders
</success_criteria>

<output>
After completion, create `.planning/phases/1-shortcuts-integration/1-07-SUMMARY.md`
</output>
