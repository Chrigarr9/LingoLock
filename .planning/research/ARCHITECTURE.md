# Architecture Research

**Domain:** React Native + iOS Screen Time API Vocabulary Learning App
**Researched:** 2026-03-01
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Native (JavaScript)                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Screens │  │   State  │  │  Hooks   │  │Components│        │
│  │          │  │(Zustand) │  │          │  │          │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │              │             │              │
├───────┴─────────────┴──────────────┴─────────────┴──────────────┤
│                    JSI Bridge (Synchronous)                      │
├──────────────────────────────────────────────────────────────────┤
│                      Native iOS Layer (Swift)                    │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐     │
│  │ Screen Time API │  │   Storage    │  │ Spaced Rep.    │     │
│  │   TurboModule   │  │  TurboModule │  │  TurboModule   │     │
│  │ (FamilyControls,│  │    (MMKV)    │  │  (Algorithm)   │     │
│  │ ManagedSettings)│  └──────────────┘  └────────────────┘     │
│  └────────┬────────┘                                            │
│           │                                                      │
│           v                                                      │
│  ┌────────────────────────────────┐                             │
│  │  App Groups Shared Container   │  (Data Sharing)             │
│  └────────────────────────────────┘                             │
│           │                                                      │
│           v                                                      │
│  ┌────────────────────────────────┐                             │
│  │ DeviceActivityMonitor Extension │  (Separate Process)        │
│  │  - intervalDidStart             │  Memory Limit: 5 MB        │
│  │  - intervalDidEnd               │  No Network Access         │
│  │  - eventDidReachThreshold       │  No Main App Communication │
│  └─────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **React Native UI Layer** | User-facing screens, vocabulary challenges, statistics display | React components with Zustand for state |
| **JSI/TurboModules Bridge** | Synchronous communication between JS and native code | React Native New Architecture (mandatory in 2026) |
| **Screen Time TurboModule** | Request permissions, configure app blocking, set up timers | Swift native module using FamilyControls + ManagedSettings |
| **Storage TurboModule** | Persist vocabulary decks, learning progress, statistics | MMKV wrapper (30x faster than AsyncStorage) |
| **Spaced Repetition Engine** | Calculate next review time, schedule cards | JS or native implementation of FSRS/SM-2 algorithm |
| **DeviceActivityMonitor Extension** | Trigger interruptions at configured intervals | Swift App Extension (isolated process, 5 MB limit) |
| **App Groups Container** | Share configuration between main app and extension | UserDefaults with suite name for App Group |

## Recommended Project Structure

```
vokabeltrainer/
├── src/
│   ├── screens/               # Feature-based screen components
│   │   ├── home/
│   │   ├── vocabulary-challenge/
│   │   ├── deck-management/
│   │   ├── settings/
│   │   └── statistics/
│   ├── components/            # Reusable UI components
│   │   ├── ui/               # Generic components (buttons, cards)
│   │   └── vocabulary/       # Domain-specific components
│   ├── modules/              # Native TurboModules (Swift)
│   │   ├── screen-time/      # Screen Time API integration
│   │   ├── storage/          # MMKV wrapper
│   │   └── apkg-parser/      # Anki file parser (optional native)
│   ├── services/             # Business logic layer
│   │   ├── spaced-repetition/ # Algorithm implementation
│   │   ├── deck-importer/    # .apkg file handling
│   │   ├── progress-tracker/ # Learning statistics
│   │   └── app-blocker/      # Screen Time configuration
│   ├── state/                # Zustand stores
│   │   ├── vocabulary.ts     # Current deck, active cards
│   │   ├── progress.ts       # User learning progress
│   │   ├── settings.ts       # App configuration
│   │   └── blocker.ts        # Screen Time state
│   ├── hooks/                # Custom React hooks
│   │   ├── use-spaced-repetition.ts
│   │   ├── use-deck-import.ts
│   │   └── use-app-blocker.ts
│   ├── types/                # TypeScript definitions
│   │   ├── vocabulary.ts
│   │   ├── apkg.ts
│   │   └── screen-time.ts
│   ├── utils/                # Helper functions
│   │   ├── apkg-parser.ts    # Parse .apkg SQLite format
│   │   └── date-helpers.ts
│   └── assets/               # Static files
│       ├── fonts/
│       └── images/
├── ios/
│   ├── VokabeltrainerExtension/  # DeviceActivityMonitor extension
│   │   ├── DeviceActivityMonitor.swift
│   │   └── Info.plist
│   └── Modules/              # TurboModule implementations
│       ├── ScreenTimeModule.swift
│       └── StorageModule.swift
├── android/                  # Out of scope for V1
└── app.json                  # Expo configuration
```

### Structure Rationale

- **Feature-based screens/**: Each screen folder contains all related components, making features self-contained
- **modules/**: Native code organized by capability, maps to TurboModule architecture
- **services/**: Business logic separated from UI, testable independently
- **state/**: Domain-based Zustand stores prevent monolithic state management
- **DeviceActivityMonitor extension**: Separate Xcode target, isolated process with strict limitations

## Architectural Patterns

### Pattern 1: TurboModule Bridge for Native APIs

**What:** React Native New Architecture uses TurboModules for synchronous native module access. As of 2026, this is mandatory (legacy bridge removed).

**When to use:** Any native iOS API access (Screen Time, file system, device features)

**Trade-offs:**
- Pros: Synchronous calls, no Promise overhead, better performance, type-safe with Codegen
- Cons: More complex setup than legacy bridge, requires TypeScript specs, Xcode configuration

**Example:**
```typescript
// src/modules/screen-time/NativeScreenTime.ts (TypeScript spec)
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  requestAuthorization(): Promise<boolean>;
  setBlockedApps(appTokens: string[]): Promise<void>;
  setTimerInterval(intervalMinutes: number): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ScreenTimeModule');
```

```swift
// ios/Modules/ScreenTimeModule.swift
import FamilyControls
import ManagedSettings

@objc(ScreenTimeModule)
class ScreenTimeModule: NSObject, RCTTurboModule {
  static func moduleName() -> String! {
    return "ScreenTimeModule"
  }

  @objc
  func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        resolve(true)
      } catch {
        reject("AUTH_ERROR", error.localizedDescription, error)
      }
    }
  }
}
```

### Pattern 2: App Groups for Extension Communication

**What:** iOS App Extensions run in separate processes and cannot directly communicate with the main app. App Groups provide a shared container for data exchange via UserDefaults or shared files.

**When to use:** Passing configuration from main app to DeviceActivityMonitor extension

**Trade-offs:**
- Pros: Apple's recommended approach, simple for config data, works across processes
- Cons: Limited to basic data types, not suitable for large datasets, one-way communication only

**Example:**
```swift
// Main app: Save blocked apps configuration
let sharedDefaults = UserDefaults(suiteName: "group.com.vokabeltrainer.shared")!
let blockedAppsData = try JSONEncoder().encode(selectedApps)
sharedDefaults.set(blockedAppsData, forKey: "blockedApps")

// DeviceActivityMonitor extension: Read configuration
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) async {
    let sharedDefaults = UserDefaults(suiteName: "group.com.vokabeltrainer.shared")!
    guard let data = sharedDefaults.data(forKey: "blockedApps"),
          let blockedApps = try? JSONDecoder().decode([String].self, from: data) else {
      return
    }
    // Apply blocking settings
    let store = ManagedSettingsStore()
    store.shield.applications = Set(blockedApps)
  }
}
```

### Pattern 3: MMKV for High-Performance Local Storage

**What:** MMKV is a key-value storage solution ~30x faster than AsyncStorage, using mmap and protobuf for efficiency. Supports encryption and multi-process access.

**When to use:** Vocabulary decks, learning progress, statistics, app settings

**Trade-offs:**
- Pros: Very fast synchronous reads/writes, encryption built-in, multi-process support, small bundle size
- Cons: Key-value only (not relational), requires native module setup

**Example:**
```typescript
// src/services/storage/vocabulary-storage.ts
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({
  id: 'vocabulary-storage',
  encryptionKey: 'your-encryption-key' // Optional
});

export const vocabularyStorage = {
  saveDeck: (deckId: string, deck: VocabularyDeck) => {
    storage.set(`deck:${deckId}`, JSON.stringify(deck));
  },

  getDeck: (deckId: string): VocabularyDeck | null => {
    const data = storage.getString(`deck:${deckId}`);
    return data ? JSON.parse(data) : null;
  },

  saveProgress: (cardId: string, progress: CardProgress) => {
    storage.set(`progress:${cardId}`, JSON.stringify(progress));
  }
};
```

### Pattern 4: Zustand for Client State Management

**What:** Lightweight state management library (~1KB) using hooks and subscriptions. The default choice for React Native apps in 2026 (40% adoption, replacing Redux for most use cases).

**When to use:** Global UI state, current challenge state, app configuration

**Trade-offs:**
- Pros: Minimal boilerplate, hook-based API, no Context Provider wrapper, selective re-renders
- Cons: Less structure than Redux (which can be good or bad), fewer dev tools

**Example:**
```typescript
// src/state/vocabulary.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'vocabulary-state' });

// Zustand + MMKV persistence adapter
const mmkvStorage = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
};

interface VocabularyState {
  currentDeck: VocabularyDeck | null;
  activeCard: Card | null;
  setDeck: (deck: VocabularyDeck) => void;
  nextCard: () => void;
}

export const useVocabularyStore = create<VocabularyState>()(
  persist(
    (set, get) => ({
      currentDeck: null,
      activeCard: null,
      setDeck: (deck) => set({ currentDeck: deck, activeCard: deck.cards[0] }),
      nextCard: () => {
        const { currentDeck, activeCard } = get();
        if (!currentDeck || !activeCard) return;
        const currentIndex = currentDeck.cards.findIndex(c => c.id === activeCard.id);
        const nextCard = currentDeck.cards[currentIndex + 1] ?? null;
        set({ activeCard: nextCard });
      },
    }),
    {
      name: 'vocabulary-storage',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
```

### Pattern 5: FSRS Spaced Repetition Algorithm

**What:** Free Spaced Repetition Scheduler (FSRS) is the modern successor to SM-2 (Anki's default since 23.10). Runs entirely locally, uses a three-component memory model.

**When to use:** Calculating when to show vocabulary cards next

**Trade-offs:**
- Pros: More accurate than SM-2, local-only (no server needed), actively maintained
- Cons: More complex than simple SM-2, requires understanding of stability/difficulty/retrievability

**Example:**
```typescript
// src/services/spaced-repetition/fsrs.ts
import { fsrs, Rating, Card, RecordLog } from 'ts-fsrs';

const f = fsrs();

interface ReviewResult {
  card: Card;
  nextReviewDate: Date;
}

export const spacedRepetitionService = {
  scheduleCard(card: Card, rating: Rating): ReviewResult {
    const now = new Date();
    const scheduling_cards = f.repeat(card, now);

    // Rating: Again=1, Hard=2, Good=3, Easy=4
    const { card: updatedCard, log } = scheduling_cards[rating];

    return {
      card: updatedCard,
      nextReviewDate: updatedCard.due,
    };
  },

  getNextCard(cards: Card[]): Card | null {
    const now = new Date();
    const dueCards = cards.filter(card => card.due <= now);

    if (dueCards.length === 0) return null;

    // Sort by retrievability (cards most likely to be forgotten first)
    return dueCards.sort((a, b) => a.stability - b.stability)[0];
  }
};
```

## Data Flow

### Request Flow: Vocabulary Challenge

```
User opens blocked app
    ↓
iOS detects app launch (DeviceActivityMonitor)
    ↓
Extension reads App Group config (UserDefaults)
    ↓
Extension triggers ManagedSettings shield
    ↓
Shield displays (system UI) → User taps "Continue to App"
    ↓
Main app launches via URL scheme
    ↓
React Native component mounts → triggers useVocabularyStore
    ↓
Store reads from MMKV → SpacedRepetitionService.getNextCard()
    ↓
Card displayed to user → User answers
    ↓
Answer evaluated → Store updates → MMKV persists
    ↓
If correct: ScreenTimeModule.allowApp() → User proceeds
If incorrect: Show explanation → Retry after 60s
```

### Data Flow: Timer-Based Interruption

```
User actively using allowed app
    ↓
DeviceActivityMonitor.eventDidReachThreshold (3-5 min timer)
    ↓
Extension applies shield via ManagedSettings
    ↓
User sees system shield → taps "Continue"
    ↓
Main app launches → Same vocabulary challenge flow as above
```

### State Management Flow

```
[MMKV Storage] (Persistent)
    ↓ (load on app start)
[Zustand Stores] (In-memory state)
    ↓ (subscribe)
[React Components] ←→ [User Actions]
    ↓ (state changes)
[MMKV Storage] (persist automatically via middleware)
```

### Key Data Flows

1. **Deck Import Flow:** User selects .apkg file → Native file picker → JS reads file → Parse SQLite (collection.anki2) → Extract cards → Save to MMKV → Update Zustand store

2. **Progress Tracking Flow:** User answers card → SpacedRepetitionService calculates next review → MMKV persists card state → Statistics screen reads aggregated progress from MMKV

3. **App Blocking Configuration:** User configures blocked apps in settings → ScreenTimeModule saves to App Group UserDefaults → DeviceActivityMonitor reads on next launch

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-10k cards | Current architecture sufficient; MMKV handles this easily |
| 10k-100k cards | Consider card pagination in UI; MMKV still performant; index by deck ID |
| 100k+ cards | Consider SQLite for relational queries; implement lazy loading; background processing for statistics |

### Scaling Priorities

1. **First bottleneck:** MMKV key-value storage becomes unwieldy with complex queries
   - **Fix:** Migrate to SQLite (Expo SQLite) for relational data while keeping MMKV for simple settings
   - **When:** >50k cards or complex filtering/search requirements

2. **Second bottleneck:** Spaced repetition calculations on large datasets block UI
   - **Fix:** Move FSRS calculations to native module or Web Worker
   - **When:** Noticeable lag (>100ms) when selecting next card

## Anti-Patterns

### Anti-Pattern 1: Trying to Communicate Directly with DeviceActivityMonitor Extension

**What people do:** Attempt to use NotificationCenter, network requests, or shared databases to send data from extension to main app

**Why it's wrong:** Extensions run in isolated processes with strict limitations - no network access, no notification APIs, memory limited to 5 MB. These attempts silently fail.

**Do this instead:**
- Use App Groups with UserDefaults for one-way config (main app → extension)
- Accept that extension cannot notify main app
- Design around extension isolation - extension only applies shield, main app handles all vocabulary logic

### Anti-Pattern 2: Using AsyncStorage Instead of MMKV

**What people do:** Continue using React Native's default AsyncStorage for vocabulary data

**Why it's wrong:** AsyncStorage is ~30x slower than MMKV, async-only (forces Promise handling everywhere), and limited to string values (requires JSON.stringify/parse for objects)

**Do this instead:**
- Use MMKV for all local storage (decks, progress, settings)
- MMKV supports synchronous reads (better UX, simpler code)
- Use MMKV's multi-process support to share data with extensions if needed

### Anti-Pattern 3: Implementing Custom Spaced Repetition from Scratch

**What people do:** Build naive "review after 1 day, 3 days, 7 days" algorithms

**Why it's wrong:** Spaced repetition is a solved problem with decades of research. SM-2 and FSRS are scientifically validated, account for difficulty and retrievability, and adapt to user performance.

**Do this instead:**
- Use FSRS library (ts-fsrs) or SM-2 implementation
- Anki's .apkg files already contain scheduling metadata - preserve it
- Focus on UX and blocking mechanics, not reinventing algorithms

### Anti-Pattern 4: Loading Entire .apkg Database on Every Launch

**What people do:** Parse collection.anki2 SQLite file on app startup to populate cards

**Why it's wrong:** .apkg files can be 100+ MB with media. Parsing SQLite on every launch is slow and wastes battery.

**Do this instead:**
- Import .apkg once → extract to MMKV/SQLite storage
- Store parsed card data in app's local database
- Only re-import if user adds new deck

### Anti-Pattern 5: Using Background Tasks for Timer-Based Interruptions

**What people do:** Attempt to use React Native background tasks (BackgroundTask.registerTaskAsync) for 3-5 minute vocabulary interruptions

**Why it's wrong:** iOS background tasks have minimum 15-minute intervals and unpredictable execution timing controlled by the OS. They're designed for periodic sync, not precise timers.

**Do this instead:**
- Use DeviceActivityMonitor with eventDidReachThreshold for timer-based interruptions
- DeviceActivity is designed for screen time management and fires reliably
- Set threshold to desired interval (3-5 minutes of app usage)

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **iOS Screen Time API** | TurboModule → FamilyControls/ManagedSettings/DeviceActivity | Requires $99/year Apple Developer account + entitlements |
| **File System (.apkg import)** | React Native DocumentPicker + SQLite parser | .apkg = ZIP containing collection.anki2 SQLite + media files |
| **Local Database** | MMKV for key-value, optionally Expo SQLite for relational | MMKV sufficient for V1; SQLite if >10k cards |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **React Native ↔ Native Modules** | JSI/TurboModule (synchronous) | New Architecture mandatory in 2026; legacy bridge removed |
| **Main App ↔ DeviceActivityMonitor** | App Groups (UserDefaults) | One-way only: main app writes config, extension reads |
| **UI Components ↔ State** | Zustand hooks (useVocabularyStore) | Subscription-based, selective re-renders |
| **State ↔ Storage** | Zustand middleware → MMKV | Automatic persistence via zustand/middleware |
| **Services ↔ Storage** | Direct MMKV calls | Services layer abstracts storage implementation |

## Build Order Dependencies

Recommended implementation sequence based on architectural dependencies:

### Phase 1: Foundation (no dependencies)
1. **MMKV Storage TurboModule** - All data persistence depends on this
2. **Basic Zustand stores** - UI state management foundation
3. **Basic UI components** - Buttons, cards, input fields

### Phase 2: Core Data Layer (depends on Phase 1)
4. **.apkg parser service** - Depends on storage for saving imported decks
5. **Spaced repetition service** - Depends on storage for card state
6. **Vocabulary data models** - TypeScript types for decks/cards

### Phase 3: Native iOS Integration (depends on Phase 1-2)
7. **Screen Time TurboModule** - Blocking logic depends on deck data existing
8. **App Groups setup** - Required before extension can work
9. **DeviceActivityMonitor extension** - Final piece, depends on everything else

### Phase 4: User-Facing Features (depends on Phase 1-3)
10. **Deck import screen** - Depends on parser and storage
11. **Vocabulary challenge UI** - Depends on spaced repetition and Screen Time
12. **Settings screen** - Depends on Screen Time module for app picker
13. **Statistics screen** - Depends on progress tracking in storage

## Known iOS 26 Issues

### DeviceActivityMonitor Bugs
- **eventDidReachThreshold firing immediately:** On iOS 26 beta, this event sometimes triggers on schedule start instead of waiting for threshold
  - **Mitigation:** Check event timestamp against schedule start time, ignore if <1 minute difference

- **App picker crashes:** iOS Screen Time app picker crashes when searching for apps
  - **Mitigation:** Provide manual token entry as fallback; report to Apple via Feedback Assistant

### Memory Pressure
- **5 MB limit in extension:** DeviceActivityMonitor crashes (Jetsam) if memory exceeds 5 MB
  - **Mitigation:** Keep extension logic minimal; no heavy data processing; use shared UserDefaults sparingly

## Sources

### React Native Architecture
- [React Native's New Architecture - Expo Documentation](https://docs.expo.dev/guides/new-architecture/)
- [TurboModules Documentation](https://github.com/reactwg/react-native-new-architecture/blob/main/docs/turbo-modules.md)
- [Communication between native and React Native](https://reactnative.dev/docs/communication-ios)
- [Bridgeless Mode Introduction](https://github.com/reactwg/react-native-new-architecture/discussions/154)

### iOS Screen Time API
- [Screen Time Technology Frameworks - Apple Developer](https://developer.apple.com/documentation/screentimeapidocumentation)
- [DeviceActivityMonitor - Apple Developer](https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor)
- [Monitoring App Usage using the Screen Time Framework](https://crunchybagel.com/monitoring-app-usage-using-the-screen-time-api/)
- [Screen Time API Tutorial](https://medium.com/ios-nest/screen-time-api-d1110751d2ce)

### iOS App Extensions
- [App Extension Programming Guide - Apple](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html)
- [iOS App Extensions: Data Sharing](https://dmtopolog.com/ios-app-extensions-data-sharing/)

### Storage & State Management
- [react-native-mmkv GitHub](https://github.com/mrousavy/react-native-mmkv)
- [Local-first architecture with Expo](https://docs.expo.dev/guides/local-first/)
- [React Native 2026: Mastering Offline-First Architecture](https://javascript.plainenglish.io/react-native-2026-mastering-offline-first-architecture-ad9df4cb61ae)
- [State Management in 2026: Redux vs Zustand vs Context API](https://medium.com/@abdurrehman1/state-management-in-2026-redux-vs-zustand-vs-context-api-ad5760bfab0b)
- [Zustand GitHub](https://github.com/pmndrs/zustand)

### Spaced Repetition
- [Open Spaced Repetition - GitHub](https://github.com/open-spaced-repetition)
- [What spaced repetition algorithm does Anki use?](https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html)
- [FSRS Technical Principles](https://www.oreateai.com/blog/technical-principles-and-application-prospects-of-the-free-spaced-repetition-scheduler-fsrs/36ee752bd462235d0d5b903059bc8684)

### Anki File Format
- [anki-apkg-parser GitHub](https://github.com/74Genesis/anki-apkg-parser)
- [Processing Anki's .apkg files](https://github.com/SergioFacchini/anki-cards-web-browser/blob/master/documentation/Processing%20Anki's%20.apkg%20files.md)
- [APKG File Format Documentation](https://docs.fileformat.com/web/apkg/)

### Background Tasks
- [BackgroundTask - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Run React Native Background Tasks 2026](https://dev.to/eira-wexford/run-react-native-background-tasks-2026-for-optimal-performance-d26)
- [react-native-background-fetch](https://github.com/transistorsoft/react-native-background-fetch)

### Project Structure
- [Expo App Folder Structure Best Practices](https://expo.dev/blog/expo-app-folder-structure-best-practices)
- [React Native Project Structure Guide](https://www.tricentis.com/learn/react-native-project-structure)
- [4 Folder Structures to Organize React Project](https://reboot.studio/blog/folder-structures-to-organize-react-project)

---
*Architecture research for: Vokabeltrainer - React Native + iOS Screen Time API Vocabulary Learning App*
*Researched: 2026-03-01*
