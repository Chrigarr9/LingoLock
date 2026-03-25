# Keychain Backup — Design Spec

## Problem

LingoLock stores all user progress (FSRS card states, stats, preferences) in MMKV, which lives in the app sandbox. Deleting and reinstalling the app wipes all progress. There is no server backend.

## Solution

Automatically back up FSRS card states and deck metadata to iOS Keychain once daily. Keychain data persists across app reinstalls. On fresh install, detect existing backup and prompt the user to restore.

## Scope

### What gets backed up
- All FSRS card states from `cardStorage` (builtin + imported deck progress)
- Imported deck registry (`ImportedDeckMeta[]` — id, name, cardCount, importedAt, sizeBytes)
- Active bundle ID and enabled bundles list

### What does NOT get backed up
- Imported deck content (filesystem media — too large, user re-imports)
- User preferences (audio speed, notification settings — cheap to re-set)
- Stats (streak, totals — derived from card states if needed, not critical)

## Backup Format

```json
{
  "v": 1,
  "ts": "2026-03-25T14:00:00.000Z",
  "cards": {
    "es-de-buenos-aires:gato-ch01-s03": {
      "cardId": "es-de-buenos-aires:gato-ch01-s03",
      "due": "2026-03-26T00:00:00.000Z",
      "stability": 12.5,
      "difficulty": 0.3,
      "elapsed_days": 5,
      "scheduled_days": 7,
      "learning_steps": 0,
      "reps": 4,
      "lapses": 0,
      "state": 2,
      "last_review": "2026-03-25T10:00:00.000Z"
    }
  },
  "importedDecks": [
    { "id": "spanish-slang-abc123", "name": "Spanish Slang", "cardCount": 200, "importedAt": "2026-03-20T12:00:00.000Z", "sizeBytes": 1048576 }
  ],
  "activeBundle": "es-de-buenos-aires",
  "enabledBundles": ["es-de-buenos-aires"]
}
```

The JSON is gzip-compressed then base64-encoded before writing to Keychain via `react-native-keychain`. Expected size: ~60-80 KB for ~1,600 cards (JSON ~570 KB → gzip ~80% reduction → base64 ~30% expansion ≈ 80-100 KB final). The iOS Keychain has no practical per-item size limit for this data range.

### Version Migration

The `"v"` field enables forward-compatible changes. Strategy:
- The app always writes the current version (currently `1`)
- On restore, if `v` is less than current, apply migrations sequentially (v1→v2→v3...)
- If `v` is greater than current (downgrade), refuse to restore and show "Please update the app to restore this backup"
- Each migration is a pure function: `(BackupV1) => BackupV2`

## Backup Trigger

- Checked on app foreground (AppState change to "active")
- Runs if `lastBackupTs` in `statsStorage` is >24 hours ago or has never been set
- Also runs if `cardStorage` has entries but no backup exists yet (first-time setup)
- Runs asynchronously — does not block the UI

## Restore Flow

1. App starts → check `cardStorage.getAllKeys().length === 0` AND no `restore_dismissed` flag in `statsStorage`
2. If both true, attempt to read backup from Keychain
3. If backup found, show `RestorePrompt` modal before main navigation:

```
┌─────────────────────────────────┐
│        Welcome back!            │
│                                 │
│ We found your previous progress │
│ (saved Mar 25, 2026)            │
│                                 │
│ • 1,247 cards reviewed          │
│ • Imported decks: Spanish Slang │
│                                 │
│  [Restore Progress]             │
│  [Start Fresh]                  │
└─────────────────────────────────┘
```

4. **Restore:** Decompress → write card states to `cardStorage`, bundle config to `statsStorage`. If backup references imported decks not on device, surface them in settings as "re-import these".
5. **Start Fresh:** Set `restore_dismissed` flag in `statsStorage` so prompt doesn't reappear. Backup data is preserved in Keychain (non-destructive — user can factory-reset MMKV later and still restore).

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `cardStorage` not empty + backup exists | Normal app update — skip restore prompt, backup continues normally |
| Backup corrupted (decompress/parse fails) | Log error, treat as no backup, user starts fresh |
| Keychain write fails | Log error, skip backup silently, retry next foreground |
| Backup references imported decks not on device | Restore card states anyway (orphaned until re-import), show "re-import" hint in settings |
| User taps "Start Fresh" | Set `restore_dismissed` flag, keep backup in Keychain |
| Multiple builtin decks in future | All card states are keyed by `bundleId:cardId` — naturally namespaced |
| Backup version > current app version | Show "Please update the app to restore this backup" |
| Called on Android | No-op — `react-native-keychain` supports Android Keystore but feature is iOS-only for now. Guard with `Platform.OS` check. |

## New Dependencies

- `react-native-keychain` — direct Keychain access without expo-secure-store's 2048-byte limit. Widely used (4M+ weekly npm downloads), supports iOS Keychain and Android Keystore.
- `pako` — gzip compression/decompression (small, well-maintained, no native code). Already a transitive dependency; added as direct dep.

## New Files

### `src/services/backupService.ts`

```typescript
// Public API:
createBackup(): Promise<void>
  // Reads all card states + imported deck registry + bundle config
  // → JSON.stringify → pako.gzip → base64 encode
  // → Keychain.setGenericPassword('lingolock', payload, { service: 'lingolock.backup' })

checkForBackup(): Promise<BackupMeta | null>
  // Reads from Keychain → base64 decode → pako.ungzip → JSON.parse
  // Returns { ts, cardCount, importedDeckNames } or null
  // Applies version migration if needed

restoreFromBackup(): Promise<{ restoredCards: number; missingDecks: ImportedDeckMeta[] }>
  // Full restore: writes card states to cardStorage, bundle config to statsStorage
  // Returns count + list of imported decks that need re-importing

deleteBackup(): Promise<void>
  // Removes lingolock.backup from Keychain

shouldBackup(): boolean
  // Checks lastBackupTs in statsStorage — true if >24h ago or never set

shouldPromptRestore(): boolean
  // Returns true if cardStorage is empty AND restore_dismissed flag is not set
```

### `src/components/RestorePrompt.tsx`

- Full-screen modal component
- Receives `BackupMeta` as prop
- Two buttons: "Restore Progress" (calls `restoreFromBackup`) and "Start Fresh" (sets dismiss flag)
- Styled to match existing glass-surface MD3 theme

## Changes to Existing Files

| File | Change |
|------|--------|
| `app/_layout.tsx` | On mount: if `shouldPromptRestore()`, call `checkForBackup()`. If backup found, show `RestorePrompt`. On foreground (AppState "active"): call `shouldBackup()` → `createBackup()`. |
| `src/services/storage.ts` | Add `getCardCount(): number` — returns `cardStorage.getAllKeys().length`. Add `restore_dismissed` flag getter/setter. |

### Note on AppState listener placement

`app/_layout.tsx` is chosen over `app/index.tsx` because backup should run regardless of which screen is active, and the restore prompt must appear before any navigation. The foreground listener in `_layout.tsx` is independent of any existing screen-level foreground handlers.

## Keychain Configuration

- **Service name:** `lingolock.backup` (isolates from other Keychain items)
- **Accessibility:** `AFTER_FIRST_UNLOCK` (default) — backup can run after device reboot once user unlocks, which is fine since it triggers on app foreground
- **No biometric/passcode protection** — this is progress data, not secrets

## Files NOT Changed

- `fsrs.ts`, `cardSelector.ts`, `statsService.ts`, `widgetService.ts` — backup is a pure side-channel, no coupling to core logic

## Future Extensions (not in scope now)

- **iCloud KVS sync** — layer on `NSUbiquitousKeyValueStore` for cross-device restore
- **Android support** — `react-native-keychain` already supports Android Keystore; remove `Platform.OS` guard
- **Preferences backup** — add user prefs to the backup blob if users request it
- **Downloaded deck registry** — same pattern as imported decks, include in backup metadata
