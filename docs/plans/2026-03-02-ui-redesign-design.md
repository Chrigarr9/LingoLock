# LingoLock UI Redesign Design

**Date:** 2026-03-02
**Status:** Approved

## Summary

Redesign LingoLock from bare-bones StyleSheet to a polished, iOS-native UI using React Native Paper with a custom iOS theme. The current skeleton (3 screens, raw components, hard-coded colors) becomes a cohesive dashboard-driven app that feels like a built-in Apple app.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual mood | Clean & Minimal iOS | Matches PROJECT.md "minimalistisches & modernes Design", feels native/trustworthy |
| Home screen | Dashboard with stats | Scales naturally as Phase 2-5 features arrive, shows value immediately |
| UI library | React Native Paper | Pre-built components, theming, fast to build. Customized to feel iOS-native |
| Card interaction | Reveal-in-place | Simple, fast, no animation complexity. Answer appears below question on same card |
| Progress indicator | Dots/pips | Subtle iOS-style page indicator at bottom of challenge screen |
| Implementation | Paper + custom iOS theme (Approach A) | Use Paper as backbone, customize globally to iOS system colors, disable ripple |

## Theme & Design Tokens

React Native Paper custom theme with iOS system colors.

### Light Theme

```
primary:          #007AFF  (iOS system blue)
background:       #FFFFFF
surfaceVariant:   #F2F2F7  (iOS grouped background)
onSurface:        #000000  (primary label)
onSurfaceVariant: #8E8E93  (secondary label)
outline:          rgba(60,60,67,0.12) (iOS separator)
success:          #34C759  (iOS system green)
error:            #FF3B30  (iOS system red)
```

### Dark Theme

```
primary:          #0A84FF
background:       #000000
surfaceVariant:   #1C1C1E
onSurface:        #FFFFFF
onSurfaceVariant: #8E8E93
outline:          rgba(235,235,245,0.12)
success:          #30D158
error:            #FF453A
```

### Global Overrides

- Typography: System font (SF Pro on iOS, Roboto on Android)
- Roundness: 12 (Paper's global border-radius)
- Ripple: disabled globally (iOS doesn't use ripple effects)

## Screen Designs

### Home Screen (Dashboard)

```
+-----------------------------------+
| (SafeArea)                        |
|                                   |
|  LingoLock                    [G] |  <- title left, settings gear right
|                                   |
|  +-----------------------------+  |
|  |  [fire] 0-day streak       |  |  <- Surface card, stats
|  |  [===============---] 0%   |  |     (zeros = placeholder for Phase 1)
|  |  0 cards due today         |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  |      Start Practice         |  |  <- Paper Button (contained, primary)
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  |  Today       0/0           |  |  <- Stats surface
|  |  Success     --            |  |
|  |  Total       25 cards      |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  |  [book] Setup Tutorial  >  |  |  <- Paper List.Item with chevron
|  |  [books] Manage Decks   >  |  |
|  +-----------------------------+  |
|                                   |
+-----------------------------------+
```

- Stats show zero-state now, populate as Phase 2 features land
- "Start Practice" navigates to /challenge with default params
- Settings gear placeholder for Phase 5

### Challenge Screen (Fullscreen Modal)

```
+-----------------------------------+
| (SafeArea)                        |
|                              [X]  |  <- Emergency close, subtle
|                                   |
|  +-----------------------------+  |
|  |                             |  |  <- Paper Card
|  |       Guten Morgen          |  |     Question: 34pt centered
|  |                             |  |
|  |       ───────────           |  |  <- Divider (after answer only)
|  |       Good morning   [chk] |  |  <- Answer: green/red
|  |                             |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | Type your answer            |  |  <- Paper TextInput (outlined)
|  +-----------------------------+  |
|  +-----------------------------+  |
|  |       Check Answer          |  |  <- Paper Button (contained)
|  +-----------------------------+  |
|                                   |
|           * o o                   |  <- ProgressDots component
|        card 1 of 3               |
|                                   |
+-----------------------------------+
```

After completion:

```
|  +-----------------------------+  |
|  |    Challenge Complete       |  |
|  |    [chk] 2/3 correct       |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  |  Continue to Instagram      |  |  <- Paper Button (contained, blue)
|  +-----------------------------+  |
```

### Tutorial Screen (Modal)

```
+-----------------------------------+
|  Setting Up LingoLock        [X]  |  <- Paper Appbar.Header
+-----------+-----------------------+
|                                   |
|  Configure iOS Shortcuts to       |
|  trigger vocabulary challenges    |
|                                   |
|  +- 1. Device Unlock ----------+  |
|  |                             |  |  <- Section: Paper Surface
|  |  (1) Open Shortcuts App     |  |     Steps: Paper List.Item
|  |  (2) Create Automation      |  |     Step number as avatar
|  |  (3) Select trigger         |  |
|  |  (4) Add URL action         |  |
|  |                             |  |
|  +-----------------------------+  |
|                                   |
|  +- 2. App-Open (Optional) ---+  |
|  |  Same steps, choose         |  |
|  |  "When I open an app"       |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  |         Got It!             |  |  <- Paper Button (contained)
|  +-----------------------------+  |
|                                   |
+-----------------------------------+
```

## Component Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `ProgressDots` | Pip indicator for challenge card progress |
| `StatsCard` | Dashboard stats surface (streak, progress bar, cards due) |
| `StatRow` | Key-value stat line for dashboard |

### Redesigned Components

| Component | Change |
|-----------|--------|
| `VocabularyCard` | Wrap with Paper Card, use theme colors, add Divider between question/answer |
| `AnswerInput` | Replace raw TextInput/Button with Paper TextInput (outlined) + Button (contained) |
| `ContinueButton` | Replace custom TouchableOpacity with Paper Button (contained) |
| `TutorialStep` | Replace custom layout with Paper List.Item + step number avatar |

### New Files

```
src/
  theme/
    index.ts            <- Paper theme (light + dark), design tokens, custom colors
  components/
    ProgressDots.tsx     <- NEW
    StatsCard.tsx        <- NEW
    StatRow.tsx          <- NEW
```

## Key Technical Decisions

1. **Centralized theming**: All `isDark ?` ternaries replaced with Paper's `useTheme()` hook
2. **PaperProvider at root**: `_layout.tsx` wraps app in `PaperProvider` with custom theme
3. **Ripple disabled globally**: Set `Settings.rippleEffectEnabled = false` for iOS feel
4. **Custom colors extended**: Paper theme extended with `success` and custom properties
5. **No new fonts**: System font only (SF Pro / Roboto) — matches iOS native feel

## What Stays the Same

- All existing logic: deep linking, answer validation, navigation, data
- File structure: app/ routes, src/ components/utils/hooks/types/data
- Expo Router navigation structure
- Dark mode support (now centralized instead of scattered)

## Dependencies

- `react-native-paper` (new)
- `react-native-vector-icons` (peer dep of Paper, for icons)

---
*Design approved: 2026-03-02*
