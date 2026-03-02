---
phase: 1-shortcuts-integration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - app.json
  - .gitignore
autonomous: true

must_haves:
  truths:
    - "Development build runs on iOS device or simulator"
    - "Custom URL scheme lingolock:// is registered with iOS"
    - "App can be invoked via lingolock:// deep links"
  artifacts:
    - path: "package.json"
      provides: "Expo SDK 55 dependencies"
      contains: "expo.*55"
    - path: "app.json"
      provides: "Custom URL scheme configuration"
      contains: "scheme.*lingolock"
    - path: "ios/"
      provides: "Native iOS project files"
      min_files: 5
  key_links:
    - from: "app.json"
      to: "iOS Info.plist"
      via: "Expo prebuild"
      pattern: "CFBundleURLSchemes"
    - from: "expo-dev-client"
      to: "Native build"
      via: "Development build infrastructure"
      pattern: "expo-dev-client"
---

<objective>
Upgrade project to Expo SDK 55 and configure development build infrastructure with custom URL scheme support.

Purpose: Enable testing of custom URL schemes (lingolock://) which don't work in Expo Go. SDK 55 provides React Native 0.83 with New Architecture enabled by default.

Output: Working development build that responds to lingolock:// deep links.
</objective>

<execution_context>
@/home/ubuntu/.claude/get-shit-done/workflows/execute-plan.md
@/home/ubuntu/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/ubuntu/Projects/vokabeltrainer/.planning/PROJECT.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/ROADMAP.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/STATE.md
@/home/ubuntu/Projects/vokabeltrainer/.planning/phases/1-shortcuts-integration/1-RESEARCH.md
@/home/ubuntu/Projects/vokabeltrainer/package.json
@/home/ubuntu/Projects/vokabeltrainer/app.json
</context>

<tasks>

<task type="auto">
  <name>Upgrade to Expo SDK 55</name>
  <files>package.json</files>
  <action>
Upgrade Expo SDK from 52 to 55 using official Expo upgrade command.

Run: `npx expo install expo@~55.0.0`
Run: `npx expo install --fix` (updates all Expo packages to compatible versions)

Expected changes:
- expo: ~52.0.0 → ~55.0.0
- expo-router: ~4.0.0 → ~5.0.0
- react: 18.3.1 → 19.2.x
- react-native: 0.76.5 → 0.83.x
- Peer dependencies auto-updated

Verify no breaking changes by checking Expo SDK 55 changelog for router API changes.
  </action>
  <verify>
Run: `npm list expo` to confirm expo@~55.0.0 installed
Run: `npm list react-native` to confirm react-native@0.83.x installed
  </verify>
  <done>
package.json shows expo@~55.0.0, react-native@0.83.x, react@19.2.x, all dependencies resolved without errors
  </done>
</task>

<task type="auto">
  <name>Install development build dependencies</name>
  <files>package.json</files>
  <action>
Install expo-dev-client to enable development builds (required for custom URL scheme testing).

Run: `npx expo install expo-dev-client`

This adds the development client infrastructure which allows testing native features (custom URL schemes, push notifications, native modules) without Expo Go.

Do NOT install expo-linking separately - it's bundled with Expo SDK 55.
  </action>
  <verify>
Run: `npm list expo-dev-client` to confirm installation
Check package.json contains "expo-dev-client" in dependencies
  </verify>
  <done>
expo-dev-client appears in package.json dependencies and npm list shows installed version
  </done>
</task>

<task type="auto">
  <name>Configure custom URL scheme and prebuild</name>
  <files>app.json, .gitignore</files>
  <action>
Verify custom URL scheme is configured in app.json (already present: "scheme": "lingolock").

Update .gitignore to ignore generated native directories:
```
# Native
ios/
android/
```

Run prebuild to generate native iOS project with URL scheme registered:
Run: `npx expo prebuild --clean`

This generates ios/ directory with Info.plist containing CFBundleURLSchemes configuration for lingolock://.

Note: Prebuild is required BEFORE creating development builds. It translates app.json config into native iOS/Android projects.
  </action>
  <verify>
Run: `ls ios/` to confirm native iOS directory exists
Run: `grep -r "lingolock" ios/` to confirm URL scheme is registered in native config
Check .gitignore contains ios/ and android/
  </verify>
  <done>
ios/ directory exists with Xcode project files, URL scheme "lingolock" appears in ios/ config files, .gitignore excludes native directories
  </done>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. SDK version: `npm list expo react-native react` shows 55.x, 0.83.x, 19.2.x
2. Development client: `npm list expo-dev-client` shows installed
3. Native project: `ls ios/` shows Xcode project structure
4. URL scheme: `grep -r "CFBundleURLSchemes" ios/` shows lingolock scheme
5. Clean install: `npm install` completes without errors
6. App starts: `npx expo start --dev-client` launches without crashes (may show "Waiting for dev client" until built)

**Note:** Actual device/simulator testing requires building the development build (Plan 03 will handle deep link testing after URL parsing is implemented).
</verification>

<success_criteria>
- Expo SDK 55 installed with React Native 0.83 and React 19.2
- expo-dev-client dependency installed
- Native iOS project generated via prebuild
- Custom URL scheme "lingolock" registered in iOS configuration
- .gitignore excludes generated native directories
- Project builds successfully (no dependency conflicts)
</success_criteria>

<output>
After completion, create `.planning/phases/1-shortcuts-integration/1-01-SUMMARY.md`
</output>
