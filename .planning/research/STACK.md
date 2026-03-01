# Technology Stack Research

**Project:** Vokabeltrainer - iOS Vocabulary Learning App with Screen Time Integration
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Expo SDK | 55.0.x (stable) | Development platform | Industry standard for React Native development in 2026. Enables iOS builds without Mac via EAS Build. SDK 55 includes React Native 0.83, React 19.2, and defaults to New Architecture with 75% smaller OTA updates via Hermes bytecode diffing. |
| React Native | 0.83+ | Cross-platform framework | Latest stable version included with Expo SDK 55. New Architecture is now default, providing better performance and JSI support required for native modules. |
| TypeScript | 5.4+ | Type safety | 78% adoption in React projects (State of JS 2025). Provides compile-time error checking, intelligent autocomplete, and self-documenting code. Required for Jest 30+ compatibility. |
| Expo Router | v7 (beta/stable) | File-based navigation | Built on React Navigation, provides native platform-optimized navigation. V7 adds new UI components like `<Toolbar />`, `<Stack.Toolbar />`, and improved navigation patterns. Superior to manual React Navigation setup. |

**Confidence:** HIGH - All versions verified from official Expo changelog and documentation.

### iOS Native Module Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Expo Modules API | SDK 55 | Native module bridge | Official Expo approach for creating Swift/Kotlin native modules. Simpler than raw React Native turbo modules, auto-generates TypeScript bindings, handles type conversion. |
| react-native-device-activity | Latest | Screen Time API wrapper | Community library providing React Native bindings for FamilyControls, ManagedSettings, and DeviceActivity frameworks. Actively maintained with Expo support. |
| EAS Build | Latest | Cloud build service | Compiles iOS .ipa files without Mac. Handles code signing, provisioning profiles, and native dependencies. Required for custom native modules with Expo. |

**Critical Requirements:**
- **Apple Entitlement Required:** Must apply for `com.apple.developer.family-controls` entitlement from Apple before development. This is a manual approval process that can take weeks.
- **iOS Deployment Target:** 15.1+ required for Screen Time APIs
- **Bundle Identifiers:** Need Family Controls capability for 4 bundle IDs per app
- **Development Build:** Cannot use Expo Go with custom native code - must create development build

**Confidence:** MEDIUM-HIGH - react-native-device-activity verified via GitHub, Apple entitlement requirement confirmed from official forums. Version numbers are "latest" pending npm verification.

### Local Storage & Offline-First

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-native-mmkv | 4.1.x | Fast key-value storage | 30x faster than AsyncStorage. Synchronous API, encryption support, works with New Architecture/JSI. ~1KB bundle size. Use for user preferences, app state, settings. |
| WatermelonDB | Latest | Relational database | Best choice for structured vocabulary data with relationships. Lazy loading, <1ms queries on 10K+ records, fully observable (auto re-renders on data change), separate thread for database operations. Superior to Realm for React Native in 2026. |
| anki-apkg-parser | Latest | Anki deck parser | Node.js library for parsing .apkg files. Extracts notes, cards, media, models. Uses SQLite under the hood, allows custom queries. |

**Architecture Pattern:**
- MMKV for: User settings, theme, current session state, temporary caches
- WatermelonDB for: Vocabulary cards, learning progress, spaced repetition schedules, deck metadata
- Separate sync logic layer between storage and UI

**Alternatives Considered:**
- **Realm:** Previously popular but WatermelonDB has better React Native integration, observable patterns, and performance on large datasets in 2026
- **AsyncStorage:** Too slow for frequent reads/writes, no encryption, no synchronous API
- **SQLite (raw):** WatermelonDB provides better abstractions and observable patterns

**Confidence:** HIGH - Performance benchmarks verified from multiple sources. WatermelonDB vs Realm comparison based on 2026 articles.

### State Management & Data Fetching

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Zustand | Latest (~3KB) | Global state management | 2026 default for React Native. Minimal boilerplate (vs Redux ~15KB), no providers/context, works with persistence, fine-grained performance. Use for: app-wide settings, authentication state, UI state. |
| TanStack Query | v5 (latest) | Server state & offline | Best solution for offline-first in 2026. Built-in persistence via `PersistQueryClientProvider`, paused mutations resume on reconnect, integrates with MMKV persister. Use for: syncing vocabulary data (if backend exists), managing network state. |

**When to use what:**
- Zustand: Client-side state that doesn't come from server (UI state, user preferences, current card index)
- TanStack Query: Any data that could sync with server (vocabulary progress, if adding backend later)
- WatermelonDB: Source of truth for vocabulary data, learning schedules
- MMKV: Persistence layer for Zustand stores and TanStack Query cache

**Alternatives Considered:**
- **Redux Toolkit:** Too much boilerplate for this app size. Better for large teams with strict patterns. Zustand provides same performance with 1/5 the code.
- **Context API alone:** Causes unnecessary re-renders, no built-in persistence

**Confidence:** HIGH - Zustand vs Redux comparison from multiple 2026 sources showing Zustand as default recommendation.

### Spaced Repetition Algorithm

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Custom SM-2 Implementation | N/A | Spaced repetition | SuperMemo SM-2 algorithm is proven, well-documented, and simple to implement in TypeScript. Use existing open-source JavaScript implementations as reference (many available on GitHub). Anki uses SM-2 variant. |

**Implementation Approach:**
- Store card difficulty, ease factor, interval, next review date in WatermelonDB
- Algorithm runs client-side (pure function: card metadata + user response → updated schedule)
- No external library needed - SM-2 is ~50 lines of code

**Confidence:** MEDIUM - SM-2 is standard algorithm but requires custom implementation. Multiple reference implementations exist.

### UI & Styling

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|----------|
| NativeWind | v4 (latest) | Utility-first styling | Brings Tailwind CSS to React Native. Compiles ahead-of-time (no runtime cost). Industry standard in 2026 for React Native styling. Works with Expo. |
| Gluestack UI v3 | Latest | Component library | Modular, unstyled accessible components that work with NativeWind. Launched 2025 with unbundled structure. Alternative: React Native Reusables (shadcn/ui for RN). |

**Styling Strategy:**
- NativeWind for all layout and utility styling
- Gluestack for accessible base components (buttons, inputs, modals)
- Custom components for vocabulary card UI and Screen Time shield UI

**Alternatives Considered:**
- **React Native Paper:** Material Design doesn't fit iOS-native aesthetic
- **Tamagui:** More complex setup, overkill for this app
- **Bare React Native StyleSheet:** NativeWind provides better DX with Tailwind patterns

**Confidence:** HIGH - NativeWind verified as 2026 standard. Gluestack v3 confirmed from official sources.

### Forms & Validation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React Hook Form | 7.x (latest) | Form state management | Minimal re-renders, works seamlessly with React Native via Controller wrapper. Actively maintained (last update Feb 2026). No dependencies, small bundle size. |
| Zod | Latest | Schema validation | TypeScript-first validation. Integrates with React Hook Form via @hookform/resolvers. Type inference from schemas. More modern than Yup in 2026. |

**Use Cases:**
- Settings forms (select apps to block, configure timer intervals)
- Deck import configuration
- User preferences

**Confidence:** HIGH - React Hook Form official docs confirm React Native support. Zod integration verified.

### Testing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Jest | 30.x | Unit testing | Ships default with React Native. Jest 30 (mid-2025) improved TypeScript 5.4+ support and performance. Industry standard. |
| React Native Testing Library | Latest | Component testing | Callstack official library. Tests components like users interact with them. Better than Enzyme (deprecated). |
| @testing-library/react-hooks | Latest | Hook testing | For testing custom hooks (spaced repetition logic, storage hooks) in isolation. |

**Testing Strategy:**
- Unit tests: Spaced repetition algorithm, data transformations, utility functions
- Component tests: Vocabulary card rendering, form validation, navigation flows
- Integration tests: Storage layer, Anki parser
- E2E: Manual testing on TestFlight (Screen Time APIs require real device)

**Note:** E2E tools like Detox or Maestro are overkill for MVP. Focus on unit + component coverage.

**Confidence:** HIGH - Jest 30 and RNTL verified from official sources and 2026 testing guides.

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| EAS CLI | Latest | Build & deploy | Required for building iOS .ipa without Mac. Handles credentials, provisioning. |
| Expo Dev Client | SDK 55 | Development runtime | Custom dev build with native code. Replaces Expo Go when using Screen Time APIs. |
| TypeScript ESLint | Latest | Linting | Static analysis for TypeScript code quality. |
| Prettier | Latest | Code formatting | Consistent formatting across team. |

**Confidence:** HIGH - All are standard Expo workflow tools.

## Installation

```bash
# Initialize Expo project with SDK 55
npx create-expo-app vokabeltrainer -t default@55

cd vokabeltrainer

# Core dependencies
npm install zustand react-hook-form @hookform/resolvers zod

# Storage
npm install react-native-mmkv @nozbe/watermelondb @nozbe/with-observables
npm install anki-apkg-parser

# Data fetching (if adding backend later)
npm install @tanstack/react-query

# UI & Styling
npm install nativewind tailwindcss gluestack-ui

# iOS Screen Time API
npm install react-native-device-activity

# Navigation (included in Expo SDK 55)
# expo-router v7 is bundled

# Dev dependencies
npm install -D @types/react @types/react-native
npm install -D @testing-library/react-native @testing-library/react-hooks
npm install -D prettier eslint-config-prettier

# Setup NativeWind
npx tailwindcss init

# Setup WatermelonDB (requires native setup)
npx @nozbe/watermelondb init

# Prebuild for native modules (generates iOS/Android folders)
npx expo prebuild --platform ios
```

**Post-Install Steps:**
1. Configure `app.json` with Apple Team ID and App Group ID
2. Apply for Family Controls entitlement from Apple Developer portal
3. Add Family Controls capability to all 4 bundle identifiers in Xcode
4. Create EAS Build profile in `eas.json`
5. Configure WatermelonDB schema for vocabulary data model
6. Setup NativeWind in `tailwind.config.js`

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Development Platform | Expo + EAS | Bare React Native CLI | Expo provides EAS Build (no Mac needed), easier config plugins, faster iteration. Native CLI requires Mac for iOS builds. |
| Database | WatermelonDB | Realm | Realm has larger bundle size, less idiomatic React integration. WatermelonDB has better observables, lazy loading, and performance on large datasets in 2026. |
| State Management | Zustand | Redux Toolkit | Redux requires 3x more boilerplate, larger bundle size (15KB vs 3KB). Zustand is 2026 default for small-to-medium apps. |
| Styling | NativeWind | Tamagui | Tamagui is more complex with compiler requirements. NativeWind is simpler, standard Tailwind patterns, better Expo integration. |
| Storage (key-value) | MMKV | AsyncStorage | AsyncStorage is 30x slower, no encryption, async-only API. MMKV is 2026 standard. |
| Forms | React Hook Form + Zod | Formik + Yup | Formik has more re-renders, Yup is older. React Hook Form + Zod is 2026 standard with better TypeScript support. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| AsyncStorage | 30x slower than MMKV, no encryption, async-only API causes complexity | react-native-mmkv |
| Expo Go (for this project) | Cannot use custom native code (Screen Time APIs) | Expo Dev Client with development build |
| Realm (2026) | Larger bundle, less idiomatic React patterns, performance issues with large datasets | WatermelonDB |
| Class Components | Deprecated pattern, slower than functional components, no hooks | Functional components with hooks |
| Redux Toolkit (for this app size) | Excessive boilerplate for single-developer vocabulary app | Zustand |
| Enzyme | Deprecated, not maintained, doesn't work with modern React | React Native Testing Library |
| React Native CLI init | Requires Mac for iOS builds, manual native config | Expo with EAS Build |

## Stack Patterns by Constraint

**If developing on Ubuntu (no Mac):**
- ✅ Use Expo + EAS Build (cloud iOS builds)
- ✅ Use Expo Dev Client for testing native modules
- ❌ Cannot use React Native CLI without Mac
- ⚠️ Must use EAS Build credits or paid plan for unlimited builds

**If using Screen Time APIs:**
- ✅ Must create development build (not Expo Go)
- ✅ Must apply for Family Controls entitlement BEFORE starting
- ✅ Must test on real iOS 15.1+ device
- ❌ Cannot test Screen Time features in iOS Simulator
- ⚠️ Entitlement approval can take 2+ weeks

**If offline-first is critical:**
- ✅ Use WatermelonDB for structured data
- ✅ Use MMKV for settings/state
- ✅ Use TanStack Query with persister if adding sync later
- ✅ Use Zustand with MMKV storage for state persistence
- ⚠️ Design data model upfront (WatermelonDB schema migrations are complex)

**If importing Anki decks:**
- ✅ Use anki-apkg-parser for parsing
- ✅ Transform Anki data model to WatermelonDB schema
- ⚠️ Anki uses SQLite - ensure data transformation is tested
- ⚠️ Handle media files from .apkg separately

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Expo SDK 55 | React Native 0.83, React 19.2 | New Architecture is default, cannot disable |
| react-native-mmkv 4.x | React Native 0.74+ | Requires New Architecture/TurboModules |
| WatermelonDB latest | Expo SDK 55 | Requires `expo prebuild` and native setup |
| Expo Router v7 | Expo SDK 55 | Bundled with SDK, uses React Navigation v6 under hood |
| Jest 30 | TypeScript 5.4+ | Update TypeScript if using older version |
| react-native-device-activity | iOS 15.1+ | Requires Family Controls entitlement |
| TypeScript 5.4+ | Jest 30, Expo SDK 55 | Required for latest tooling |

## Critical Path for Development Setup

1. **Week -2 to 0: Apply for Apple Family Controls Entitlement**
   - Cannot proceed with Screen Time features without this
   - Approval takes 1-3 weeks typically

2. **Day 1: Initialize Expo Project**
   ```bash
   npx create-expo-app@latest vokabeltrainer -t default@55
   ```

3. **Day 1-2: Install and Configure Core Stack**
   - Install dependencies listed above
   - Configure `app.json` with Apple Team ID, App Group
   - Setup NativeWind, WatermelonDB
   - Create development build: `eas build --profile development --platform ios`

4. **Day 2-3: Native Module Integration**
   - Install react-native-device-activity
   - Add Family Controls capability (once entitlement approved)
   - Test native module on real device

5. **Day 3+: Build Features**
   - Implement data model in WatermelonDB
   - Build vocabulary card UI
   - Implement spaced repetition algorithm
   - Integrate Screen Time blocking logic

## Sources

**Expo & React Native:**
- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55) - Official release notes (HIGH confidence)
- [Expo SDK 54 Beta Changelog](https://expo.dev/changelog/sdk-54-beta) - Build performance improvements (HIGH confidence)
- [What's New in Expo SDK 55](https://medium.com/@onix_react/whats-new-in-expo-sdk-55-6eac1553cee8) - Feature overview (MEDIUM confidence)
- [React Native Versions Overview](https://reactnative.dev/docs/releases) - Official version timeline (HIGH confidence)
- [Expo Native Module Tutorial](https://docs.expo.dev/modules/native-module-tutorial/) - Official Expo Modules API guide (HIGH confidence)
- [Add Custom Native Code - Expo](https://docs.expo.dev/workflow/customizing/) - Native code integration (HIGH confidence)

**iOS Screen Time API:**
- [react-native-device-activity GitHub](https://github.com/kingstinct/react-native-device-activity) - Official library repo (MEDIUM-HIGH confidence)
- [Developer's Guide to Apple's Screen Time APIs](https://medium.com/@juliusbrussee/a-developers-guide-to-apple-s-screen-time-apis-familycontrols-managedsettings-deviceactivity-e660147367d7) - Implementation guide (MEDIUM confidence)
- [Apple Developer Forums - Screen Time](https://developer.apple.com/forums/tags/screen-time) - Official discussions (HIGH confidence)

**Storage & Offline-First:**
- [React Native Offline First 2026](https://javascript.plainenglish.io/react-native-2026-mastering-offline-first-architecture-ad9df4cb61ae) - Architecture patterns (MEDIUM confidence)
- [Best React Native Database Comparison](https://www.algosoft.co/blogs/top-11-local-databases-for-react-native-app-development-in-2026/) - WatermelonDB vs Realm vs others (MEDIUM confidence)
- [react-native-mmkv GitHub](https://github.com/mrousavy/react-native-mmkv) - Official repo with benchmarks (HIGH confidence)
- [anki-apkg-parser GitHub](https://github.com/74Genesis/anki-apkg-parser) - Anki deck parser (MEDIUM confidence)

**State Management:**
- [State Management in 2026: Redux vs Zustand](https://medium.com/@abdurrehman1/state-management-in-2026-redux-vs-zustand-vs-context-api-ad5760bfab0b) - Comparison (MEDIUM confidence)
- [Zustand vs Redux Toolkit 2026](https://medium.com/@sangramkumarp530/zustand-vs-redux-toolkit-which-should-you-use-in-2026-903304495e84) - Detailed comparison (MEDIUM confidence)
- [TanStack Query with React Native Offline](https://dev.to/fedorish/react-native-offline-first-with-tanstack-query-1pe5) - Implementation guide (MEDIUM confidence)

**UI & Styling:**
- [Best React Native UI Libraries 2026](https://blog.logrocket.com/best-react-native-ui-component-libraries/) - Library comparison (MEDIUM confidence)
- [NativeWind GitHub](https://github.com/nativewind/nativewind) - Official repo (HIGH confidence)
- [Gluestack UI](https://gluestack.io/) - Official site (HIGH confidence)

**Testing:**
- [Testing in 2026: Jest & React Testing Library](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies) - Modern testing strategy (MEDIUM confidence)
- [React Native Testing Library GitHub](https://github.com/callstack/react-native-testing-library) - Official repo (HIGH confidence)
- [Unit Testing with Jest - Expo](https://docs.expo.dev/develop/unit-testing/) - Official Expo guide (HIGH confidence)

**Navigation & Forms:**
- [Expo Router Introduction](https://docs.expo.dev/router/introduction/) - Official docs (HIGH confidence)
- [React Hook Form](https://react-hook-form.com/) - Official docs (HIGH confidence)
- [React Hook Form GitHub](https://github.com/react-hook-form/react-hook-form) - Official repo, last updated Feb 2026 (HIGH confidence)

**TypeScript:**
- [TypeScript with React Best Practices 2026](https://medium.com/@mernstackdevbykevin/typescript-with-react-best-practices-2026-78ce4546210b) - Best practices (MEDIUM confidence)
- [Using TypeScript with React Native](https://reactnative.dev/docs/typescript) - Official guide (HIGH confidence)

---
*Stack research for: Vokabeltrainer - iOS Vocabulary Learning App*
*Researched: 2026-03-01*
*Researcher: GSD Project Researcher Agent*
