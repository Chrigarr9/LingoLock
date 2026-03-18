# Bundle Configuration System — Design Spec

## Problem

The app hardcodes Spanish-German content throughout: greetings in `app/index.tsx`, motivational text in `challenge.tsx`, Spanish character set in `widgetService.ts`, search placeholders, pipeline paths, and more. This prevents supporting additional language pairs without duplicating code.

## Solution

Introduce a `BundleConfig` interface that encapsulates all language-pair-specific data. Each bundle provides its config alongside card data. The app reads all language-specific values from the active bundle's config at runtime.

Ship with one baked-in bundle (Spanish-German) for now. The architecture supports adding downloadable bundles later without rearchitecting.

## BundleConfig Interface

```typescript
interface BundleConfig {
  // Identity
  id: string;                        // "es-de-buenos-aires"
  nativeLanguage: string;            // "Deutsch"
  targetLanguage: string;            // "Español"
  displayLabel: string;              // "Deutsch → Español"

  // Greetings (target language, time-based)
  greetings: {
    morning: string;                 // "Buenos días"      (hours 0-11)
    afternoon: string;               // "Buenas tardes"    (hours 12-19)
    evening: string;                 // "Buenas noches"    (hours 20-23)
  };

  // Motivational messages (target language flavor)
  motivational: {
    perfect: string;                 // "¡Perfecto! Every answer correct."
    great: string;                   // "¡Muy bien! Great session."
    good: string;                    // "¡Bien! Keep practising."
    encouragement: string;           // "Every mistake is a lesson. ¡Ánimo!"
  };

  // Character set for widget spell mode (full alphabet including special chars)
  spellCharacters: string[];         // ['a','b',...,'ñ','á','é','í','ó','ú']

  // Search placeholder for vocabulary screen
  searchPlaceholder: string;         // "Search Spanish or German..."
}
```

The UI language (English) stays fixed. Only content and language-pair-specific elements come from the bundle. The `answerValidation.ts` stays unchanged — its accent/diacritic normalization is Unicode-based and works for any language.

## File Structure

```
src/content/
  bundles/
    es-de-buenos-aires/
      config.ts         ← BundleConfig for Spanish-German
      chapters.ts       ← card data (renamed from current bundle.ts)
      assets.ts         ← cardImages + cardAudios maps (re-exported)
      index.ts          ← re-exports { config, CHAPTERS, cardImages, cardAudios }
    index.ts            ← AVAILABLE_BUNDLES, getBundle(), getBundleForCard(), getAllEnabledChapters()
  activeBundleProvider.tsx  ← React context + useActiveBundle() hook
```

### activeBundleProvider.tsx

- Wraps the app in `_layout.tsx`
- Provides the current active bundle via React context
- `useActiveBundle()` hook returns `{ config: BundleConfig, chapters: ChapterData[], cardImages, cardAudios }`
- Active bundle ID stored in MMKV (`statsStorage`, key `activeBundle`)
- Defaults to `es-de-buenos-aires` if not set

### bundles/index.ts

- `AVAILABLE_BUNDLES: BundleConfig[]` — all baked-in bundle configs
- `getBundle(bundleId: string)` — returns config + chapters + assets for a bundle
- `getBundleForCard(namespacedCardId: string)` — extracts bundle ID from card ID prefix (splits on first `:`), returns its config + chapters + assets
- `getCardById(namespacedCardId: string)` — finds a card across all bundles by extracting the bundle ID, then searching that bundle's chapters. Returns the card + its bundle config.
- `getAllEnabledChapters()` — reads `enabledBundles` from MMKV, returns combined chapters from all enabled bundles. Used by widgets, notifications, and streak calculation.

## Card ID Namespacing

Card IDs become `{bundleId}:{originalCardId}` — e.g. `"es-de-buenos-aires:gato-ch01-s03"`.

- FSRS states in MMKV keyed by this namespaced ID
- Guarantees no collisions across bundles
- `build-content.ts` bakes the bundle ID prefix into card IDs at build time
- Bundle ID extracted by splitting on the first `:`

### Migration for Existing Users

On first launch after upgrade, a one-time migration runs:

1. Read all existing MMKV card state keys (un-namespaced, e.g. `"gato-ch01-s03"`)
2. For each key, prefix with the default bundle ID: `"es-de-buenos-aires:gato-ch01-s03"`
3. Write the new key, delete the old key
4. Set a migration flag (`bundleMigrationDone: true`) to prevent re-running

This preserves all existing FSRS progress. The migration runs in `activeBundleProvider.tsx` initialization, before any card access.

## Bundle States

Each bundle has one of three states:

| State | Practice | Notifications/Widgets | Streak obligation |
|-------|----------|----------------------|-------------------|
| **Active** | Yes (selected for in-app sessions) | Yes | Yes |
| **Enabled** | No (tap to switch) | Yes | Yes |
| **Disabled** | No | No | No |

- Only one bundle can be **active** at a time
- Multiple bundles can be **enabled** simultaneously
- Active bundle is always implicitly enabled (cannot be active but disabled)
- Disabling a bundle removes its cards from streak obligation

### MMKV Storage

- `activeBundle: string` — the bundle ID for in-app practice sessions
- `enabledBundles: string` — JSON-serialized `string[]` of bundle IDs that count for notifications, widgets, and streak
- `bundleMigrationDone: boolean` — flag to prevent re-running card ID migration

## Scope by Feature

| Feature | Scope | Details |
|---------|-------|---------|
| Practice sessions | **Active bundle only** | User explicitly switches context via picker |
| Chapter progress | **Per-bundle** | Different stories, different progress |
| Vocabulary screen | **Active bundle only** | Shows cards from active bundle, search placeholder from config |
| Home screen "Cards due" | **Active bundle only** | Shows due count for the active bundle |
| Notifications | **All enabled bundles** | Keep all languages fresh |
| Widgets | **All enabled bundles** | Any due card from enabled bundles can appear |
| Streak | **Global across enabled** | Must complete all due cards across all enabled bundles |
| Stats (total correct/answered) | **Global** | Overall engagement metric |

### Cross-bundle card selection (widgets & notifications)

- `getWidgetCardData()` and notification scheduler call `getAllEnabledChapters()` to scan due cards across all enabled bundles
- The card's bundle ID is extracted from the namespaced card ID via `getBundleForCard()`
- Widget/notification adapts to the card's bundle config (e.g. correct `spellCharacters` for spell mode)
- Card lookup in `processWidgetAnswer()` and `processSpellAction()` uses `getCardById(namespacedCardId)` which routes to the correct bundle's chapters

### Service behavior with bundles

- **`cardSelector.ts` / `buildSession()`**: Takes active bundle's chapters as input (passed from the challenge screen via `useActiveBundle()`). Only builds sessions from the active bundle's cards.
- **`statsService.ts` / `getCardsDueCount()`**: Takes a chapters array as parameter. The home screen passes active bundle chapters; widgets/notifications pass `getAllEnabledChapters()`.
- **`statsService.ts` / `getChapterMastery()`**: Scoped to the active bundle — takes active bundle's chapters as input.
- **`notificationService.ts`**: Card lookup uses `getCardById()` for response handling. Notification scheduling uses `getAllEnabledChapters()`.

## Bundle Picker UI

### Home Screen (top left)

- Current "SPANISH" badge becomes tappable, shows `config.displayLabel` (e.g. "Deutsch → Español")
- Tapping opens a bottom sheet with:
  - List of bundles, each showing display label + due count badge (e.g. "12 due")
  - Active bundle has a checkmark
  - Tapping a different bundle sets it as active
  - Disabled "Download more bundles" row at the bottom (greyed out, placeholder for future)
- Home screen picker only switches the active bundle — it does NOT control the enabled/disabled state (that lives in Settings)

### Settings Screen

- "Language Pairs" section showing all bundles with full management:

```
Language Pairs
┌──────────────────────────────────────┐
│ Deutsch → Español          12 due   │
│ ● Active    [Enabled ✓]             │
├──────────────────────────────────────┤
│ English → Français          8 due   │
│ ○ Inactive  [Enabled ✓]             │
├──────────────────────────────────────┤
│ Deutsch → Italiano          0 due   │
│ ○ Inactive  [Disabled ○]            │
├──────────────────────────────────────┤
│ ＋ Download more (coming soon)      │
└──────────────────────────────────────┘
```

- Tapping the row sets it as **active** (for practice)
- The toggle controls **enabled/disabled** (for notifications, widgets, streak)
- Active bundle is always implicitly enabled

## build-content.ts Changes

The build script is updated to:

1. **Accept bundle ID from config**: Reads `deck_id` from the pipeline YAML config (already exists as `es-de-buenos-aires`)
2. **Output to bundle directory**: Writes to `src/content/bundles/<bundleId>/chapters.ts` instead of `src/content/bundle.ts`
3. **Namespace card IDs**: Prefixes every card ID with `<bundleId>:` during generation
4. **Generate assets.ts**: Writes `cardImages` and `cardAudios` maps with bundle-relative `require()` paths into `src/content/bundles/<bundleId>/assets.ts`
5. **Generate config.ts**: Writes the `BundleConfig` object from pipeline config values
6. **CLI usage**: `npx ts-node scripts/build-content.ts --config configs/spanish_buenos_aires.yaml` (reads bundle ID, language names, etc. from the YAML)

## Files to Change

| File | Change |
|------|--------|
| `src/content/bundle.ts` | Split into `bundles/es-de-buenos-aires/{config,chapters,assets,index}.ts` |
| `scripts/build-content.ts` | Output to bundle directory, prefix card IDs, generate config.ts + assets.ts |
| `app/index.tsx` | Replace `getSpanishGreeting()` + hardcoded "SPANISH" with `useActiveBundle()` |
| `app/challenge.tsx` | Motivational messages from `config.motivational` |
| `app/vocabulary.tsx` | Search placeholder from `config.searchPlaceholder`; cards from active bundle |
| `app/vocabulary/[id].tsx` | Card lookup via `getCardById()`; images/audio from bundle assets |
| `app/stats.tsx` | Chapter mastery scoped to active bundle via `useActiveBundle()` |
| `app/_layout.tsx` | Wrap app in `ActiveBundleProvider` |
| `app/settings.tsx` | Add Language Pairs section with enable/disable toggles |
| `src/services/widgetService.ts` | `SPANISH_CHARS` → bundle's `spellCharacters`; scan enabled bundles via `getAllEnabledChapters()` |
| `src/services/notificationService.ts` | Card lookup via `getCardById()`; scan enabled bundles |
| `src/services/notificationScheduler.ts` | Scan enabled bundles for due cards via `getAllEnabledChapters()` |
| `src/services/cardSelector.ts` | `buildSession()` takes chapters parameter instead of importing `CHAPTERS` |
| `src/services/statsService.ts` | `getCardsDueCount()` and `getChapterMastery()` take chapters parameter |
| `src/components/ClozeCard.tsx` | Images/audio from bundle assets via `getBundleForCard()` |
| `src/services/storage.ts` | Add `loadActiveBundle()`, `saveActiveBundle()`, `loadEnabledBundles()`, `saveEnabledBundles()` |
| `src/services/fsrs.ts` | No change — works with any card ID format |
| `src/utils/answerValidation.ts` | No change — Unicode-based, language-agnostic |

## Out of Scope

- Downloadable bundles (future — placeholder UI only)
- Full i18n / UI language switching (UI stays English)
- Per-bundle stats breakdown (stats stay global for now)
- Bundle-specific theming/colors
