# LingoLock — iOS Testing Guide

How to get LingoLock running on your iPhone (and your friends' iPhones) for testing.

---

## Prerequisites

### What You Need

| Item | Cost | Notes |
|------|------|-------|
| **Apple Developer Account** | $99/year | Required for device builds. Enroll at [developer.apple.com](https://developer.apple.com/programs/) |
| **Expo Account** | Free | Sign up at [expo.dev](https://expo.dev) |
| **EAS CLI** | Free | `npm install -g eas-cli` |
| **iPhone** | — | iOS 17+ recommended (widgets require iOS 17) |
| **Mac** | NOT required | EAS Build runs in the cloud — no Xcode needed on your machine |

### One-Time Setup

```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Log in to your Expo account
eas login

# 3. Link your project (run from the LingoLock directory)
eas init
```

---

## Step 1: Create `eas.json`

Create this file in the project root:

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "resourceClass": "m-medium"
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "",
        "appleTeamId": ""
      }
    }
  }
}
```

**Three profiles explained:**
- **`development`** — Dev build with hot reload. This is what you'll use day-to-day.
- **`preview`** — Release-like build for internal testers (no dev tools, but still ad hoc distribution, not App Store).
- **`production`** — For App Store / TestFlight submission later.

---

## Step 2: Register Test Devices

Every iPhone that will run the app needs its UDID registered with your Apple Developer account. EAS makes this painless:

```bash
eas device:create
```

This generates a **registration URL**. Send it to each tester:
1. They open the URL on their iPhone (Safari)
2. They install a small provisioning profile (Settings will prompt)
3. Their device UDID is automatically registered

You can also share the URL as a QR code. Repeat for each friend's device.

> **Limit:** Apple allows max 100 devices per year on ad hoc provisioning.

---

## Step 3: Build the Content Bundle

Before building the iOS app, make sure the vocabulary content is bundled:

```bash
npm run build:content
```

This runs `scripts/build-content.ts` which generates `src/content/bundle.ts` from the pipeline output. The audio files in `assets/audio/cards/` are already committed.

---

## Step 4: Create the Development Build

```bash
eas build --platform ios --profile development
```

**First time, EAS will ask:**
1. **"What would you like your iOS bundle identifier to be?"** — Press Enter to accept `com.lingolock.app` (already in app.json)
2. **"Do you want to log in to your Apple account?"** — Yes. Enter your Apple ID credentials
3. **"Generate a new Apple Distribution Certificate?"** — Yes
4. **"Select devices for ad hoc build"** — Select all registered devices
5. **"iOS app only uses standard/exempt encryption?"** — Yes (our app doesn't use custom encryption)

The build runs in Expo's cloud (~10-15 min). No Mac needed.

When done, you'll get:
- A **QR code** in the terminal
- An **install URL** (also visible at [expo.dev/accounts/.../builds](https://expo.dev))

---

## Step 5: Install on iPhone

1. **On the test iPhone**, open the install URL or scan the QR code in Safari
2. Tap "Install" when prompted
3. Go to **Settings → General → VPN & Device Management** → Trust the developer certificate
4. LingoLock appears in your app library

---

## Step 6: Connect for Hot Reload

Once the dev build is installed on the phone:

```bash
# On your development machine, start the Metro bundler
npx expo start --dev-client
```

This shows a QR code. On the iPhone:
1. Open the **LingoLock** app (it shows the Expo dev client launcher)
2. Scan the QR code or enter the URL manually
3. The app loads with **hot reload** — code changes appear instantly

> **Requirement:** Your phone and development machine must be on the **same WiFi network** (or use `--tunnel` if they're not).

```bash
# If different networks (e.g., tester is remote):
npx expo start --dev-client --tunnel
```

---

## Adding New Testers

When a new friend wants to test:

```bash
# 1. Register their device
eas device:create
# Send them the URL to open on their iPhone

# 2. Rebuild with updated provisioning profile
eas build --platform ios --profile development
# OR re-sign the existing build (faster, no full rebuild):
eas build:resign
```

The new build/re-signed IPA will include their device. Share the install link.

---

## Testing Shortcuts Integration

Once the app is installed on a physical iPhone:

### Unlock Automation
1. Open **Shortcuts** app
2. Tap **Automation** tab → **+**
3. Select **"When I unlock my iPhone"**
4. Add action **"Open URL"**
5. Enter: `lingolock://challenge?source=Unlock&count=3&type=unlock`
6. **Disable "Ask Before Running"**
7. Tap Done

### App-Open Automation (e.g., Instagram)
1. Same steps, but select **"When I open [App]"** → choose the app
2. URL: `lingolock://challenge?source=Instagram&count=3&type=app_open`

After completing 3 vocabulary cards, the app deep-links back to Instagram (or shows "return to home screen" for unlock type).

---

## Testing Notifications

Notifications are configured but need device testing:

1. Open LingoLock → **Settings**
2. Enable **Vocabulary Notifications**
3. Grant notification permission when prompted
4. Set interval (3/5/10 min)
5. Lock your phone and wait for notifications to appear

**Known gaps to test:**
- Can you answer MC questions directly from the notification?
- Does text input work without opening the app?
- Do notifications stop when you're in a practice session?

---

## Testing the Widget

1. Long-press your Home Screen → tap **+** (top left)
2. Search for **"LingoLock"** or **"LingoLock Practice"**
3. Add the widget (Small, Medium, or Lock Screen rectangular)
4. The widget shows the current due vocabulary card
5. Tap MC answer buttons directly on the widget

---

## Sharing a Preview Build (No Dev Tools)

For testers who just want to use the app (no hot reload):

```bash
eas build --platform ios --profile preview
```

This builds a release-optimized version without the dev client UI. Faster startup, no Metro connection needed. Still distributed via ad hoc (same device registration required).

---

## Later: TestFlight (Up to 10,000 Testers)

When you're ready for wider testing without the 100-device limit:

```bash
# 1. Build for production
eas build --platform ios --profile production

# 2. Submit to App Store Connect
eas submit --platform ios

# 3. In App Store Connect, add testers to TestFlight
```

TestFlight advantages:
- No device UDID registration needed
- Up to 10,000 external testers
- Testers install via TestFlight app (simple invite link)
- Apple reviews the build before external distribution (~1 day)

---

## Later: App Store Submission

When ready for public release:

1. Fill in `eas.json` submit config (`ascAppId`, `appleTeamId`)
2. Create the app listing in [App Store Connect](https://appstoreconnect.apple.com)
3. Prepare screenshots, description, keywords, privacy policy
4. ```bash
   eas build --platform ios --profile production
   eas submit --platform ios
   ```
5. Submit for App Review in App Store Connect

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Untrusted Developer" on iPhone | Settings → General → VPN & Device Management → Trust |
| Dev client can't connect to Metro | Same WiFi network, or use `--tunnel` |
| Build fails on native modules | Run `npx expo-doctor` to check compatibility |
| New device can't install | Re-register with `eas device:create`, then rebuild or `eas build:resign` |
| "No development builds available" | The dev build must be installed before `npx expo start --dev-client` works |
| Widget not appearing | iOS 17+ required. Restart phone after install. |
| Notifications not working | Check Settings → LingoLock → Notifications are enabled |

---

## Quick Reference

```bash
# Day-to-day development
npx expo start --dev-client          # Start Metro, connect phone

# Register a new tester's device
eas device:create                     # Generates registration URL

# Build for testing (with dev tools)
eas build --platform ios --profile development

# Build for testing (without dev tools)
eas build --platform ios --profile preview

# Re-sign build for new device (no full rebuild)
eas build:resign

# Build + submit for TestFlight
eas build --platform ios --profile production
eas submit --platform ios

# Rebuild content bundle
npm run build:content
```
