# Keychain Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically back up FSRS card states to iOS Keychain daily, and restore on reinstall with user prompt.

**Architecture:** New `backupService.ts` handles gzip-compress → base64 → Keychain write/read via `react-native-keychain`. A `RestorePrompt` modal gates app entry on fresh install. Backup triggers on app foreground if >24h since last backup. No changes to core FSRS/card logic.

**Tech Stack:** react-native-keychain, pako (gzip), React Native Platform API, existing MMKV storage layer

**Spec:** `docs/superpowers/specs/2026-03-25-keychain-backup-design.md`

**Important runtime notes:**
- **No `Buffer` in Hermes** — React Native's JS engine doesn't have Node's `Buffer`. Use `btoa`/`atob` with Uint8Array helpers instead. Tests pass with `Buffer` (Jest runs Node) but the app crashes on device.
- **`pako.gzip()` returns `Uint8Array`** — must convert to binary string before `btoa()`.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/services/backupService.ts` (create) | Backup/restore logic: serialize, compress, Keychain read/write, version migration |
| `src/services/backupService.test.ts` (create) | Unit tests for backup service |
| `src/components/RestorePrompt.tsx` (create) | Modal UI for restore-on-reinstall prompt |
| `src/services/storage.ts` (modify) | Add `getCardCount()` and `restore_dismissed` flag helpers |
| `app/_layout.tsx` (modify) | Wire up restore check on mount + backup trigger on foreground |
| `__mocks__/react-native-keychain.js` (create) | Jest mock for react-native-keychain |
| `__mocks__/react-native.js` (modify) | Add `AppState` mock |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-native-keychain and pako**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx expo install react-native-keychain && npm install pako && npm install --save-dev @types/pako
```

- [ ] **Step 2: Verify installation**

```bash
cd /mnt/Shared/Code/projects/LingoLock && node -e "require('react-native-keychain'); require('pako'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add react-native-keychain and pako for backup"
```

---

### Task 2: Add storage helpers, Jest mocks, and base64 utility

**Files:**
- Modify: `src/services/storage.ts` (add before `clearAllData`)
- Create: `__mocks__/react-native-keychain.js`
- Modify: `__mocks__/react-native.js`
- Modify: `jest.config.js`

- [ ] **Step 1: Add storage helpers to storage.ts**

Add before the `clearAllData` function in `src/services/storage.ts`:

```typescript
// ---------------------------------------------------------------------------
// Backup helpers
// ---------------------------------------------------------------------------

const RESTORE_DISMISSED_KEY = 'restore_dismissed';
const LAST_BACKUP_TS_KEY = 'last_backup_ts';

/**
 * Return the number of card states currently stored.
 * Used by backup service to detect fresh installs.
 */
export function getCardCount(): number {
  return cardStorage.getAllKeys().length;
}

/**
 * Check if the user dismissed the restore prompt (chose "Start Fresh").
 */
export function isRestoreDismissed(): boolean {
  return statsStorage.getBoolean(RESTORE_DISMISSED_KEY) ?? false;
}

/**
 * Mark the restore prompt as dismissed so it doesn't reappear.
 */
export function setRestoreDismissed(): void {
  statsStorage.set(RESTORE_DISMISSED_KEY, true);
}

/**
 * Get the timestamp of the last successful backup.
 * Returns undefined if no backup has been made.
 */
export function getLastBackupTs(): number | undefined {
  return statsStorage.getNumber(LAST_BACKUP_TS_KEY) ?? undefined;
}

/**
 * Record the timestamp of a successful backup.
 */
export function setLastBackupTs(ts: number): void {
  statsStorage.set(LAST_BACKUP_TS_KEY, ts);
}
```

- [ ] **Step 2: Create Jest mock for react-native-keychain**

Create `__mocks__/react-native-keychain.js`. This is the sole Keychain mock — tests use `jest.fn()` via `moduleNameMapper`, no inline `jest.mock()` override.

```javascript
// Mock for react-native-keychain — in-memory Keychain for Jest tests

let stored = null;

const mock = {
  setGenericPassword: jest.fn(async (username, password, options) => {
    stored = { username, password, service: options?.service };
    return true;
  }),
  getGenericPassword: jest.fn(async (options) => {
    if (stored && stored.service === options?.service) {
      return { username: stored.username, password: stored.password };
    }
    return false;
  }),
  resetGenericPassword: jest.fn(async (options) => {
    if (stored && stored.service === options?.service) {
      stored = null;
    }
    return true;
  }),
  ACCESSIBLE: {
    AFTER_FIRST_UNLOCK: 'AfterFirstUnlock',
  },
  // Reset in-memory state between tests
  __reset: () => {
    stored = null;
    mock.setGenericPassword.mockClear();
    mock.getGenericPassword.mockClear();
    mock.resetGenericPassword.mockClear();
  },
};

module.exports = mock;
```

- [ ] **Step 3: Update react-native mock to include AppState**

Update `__mocks__/react-native.js`:

```javascript
// Minimal React Native mock for Jest tests
module.exports = {
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
};
```

- [ ] **Step 4: Add react-native-keychain to Jest moduleNameMapper**

In `jest.config.js`, add to `moduleNameMapper`:

```javascript
'^react-native-keychain$': '<rootDir>/__mocks__/react-native-keychain.js',
```

- [ ] **Step 5: Run existing tests to check nothing is broken**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx jest --verbose
```

Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/storage.ts __mocks__/react-native-keychain.js __mocks__/react-native.js jest.config.js
git commit -m "feat: add storage helpers and mocks for keychain backup"
```

---

### Task 3: Implement backupService core — createBackup and shouldBackup

**Files:**
- Create: `src/services/backupService.ts`
- Create: `src/services/backupService.test.ts`

- [ ] **Step 1: Write failing tests for shouldBackup and createBackup**

Create `src/services/backupService.test.ts`:

```typescript
/**
 * Tests for backupService
 *
 * Uses file-level mocks via __mocks__/ directory and moduleNameMapper (jest.config.js).
 * Do NOT add inline jest.mock('react-native-keychain') — it would override the
 * file mock and break __reset() and the stateful in-memory Keychain.
 */

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

jest.mock('./storage', () => {
  const store = new Map<string, string>();
  return {
    cardStorage: {
      getAllKeys: () => Array.from(store.keys()),
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => store.set(key, value),
      clearAll: () => store.clear(),
    },
    statsStorage: {
      getString: jest.fn(),
      getNumber: jest.fn(),
      getBoolean: jest.fn(),
      set: jest.fn(),
    },
    // Storage helper mocks — backupService imports these
    getCardCount: jest.fn(() => store.size),
    getLastBackupTs: jest.fn().mockReturnValue(undefined),
    setLastBackupTs: jest.fn(),
    isRestoreDismissed: jest.fn().mockReturnValue(false),
    setRestoreDismissed: jest.fn(),
    loadActiveBundle: jest.fn().mockReturnValue('es-de-buenos-aires'),
    loadEnabledBundles: jest.fn().mockReturnValue(['es-de-buenos-aires']),
    saveActiveBundle: jest.fn(),
    saveEnabledBundles: jest.fn(),
  };
});

jest.mock('./importedDeckStore', () => ({
  getImportedDecks: jest.fn().mockReturnValue([]),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// react-native-keychain is mocked via __mocks__/react-native-keychain.js + moduleNameMapper

import * as Keychain from 'react-native-keychain';
import pako from 'pako';

import {
  shouldBackup,
  createBackup,
  BACKUP_SERVICE_NAME,
} from './backupService';
import { cardStorage, getLastBackupTs, setLastBackupTs } from './storage';

const mockKeychain = Keychain as any;
const mockGetLastBackupTs = getLastBackupTs as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shouldBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cardStorage as any).clearAll();
  });

  test('returns true when no backup has ever been made and cards exist', () => {
    cardStorage.set('es-de-buenos-aires:w1', JSON.stringify({ cardId: 'es-de-buenos-aires:w1', state: 2 }));
    mockGetLastBackupTs.mockReturnValue(undefined);
    expect(shouldBackup()).toBe(true);
  });

  test('returns false when backup was made less than 24h ago', () => {
    cardStorage.set('es-de-buenos-aires:w1', '{}');
    mockGetLastBackupTs.mockReturnValue(Date.now() - 1000 * 60 * 60); // 1 hour ago
    expect(shouldBackup()).toBe(false);
  });

  test('returns true when backup was made more than 24h ago', () => {
    cardStorage.set('es-de-buenos-aires:w1', '{}');
    mockGetLastBackupTs.mockReturnValue(Date.now() - 1000 * 60 * 60 * 25); // 25 hours ago
    expect(shouldBackup()).toBe(true);
  });

  test('returns false when no cards exist', () => {
    mockGetLastBackupTs.mockReturnValue(undefined);
    expect(shouldBackup()).toBe(false);
  });
});

describe('createBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cardStorage as any).clearAll();
    mockKeychain.__reset();
  });

  test('writes compressed card states to Keychain', async () => {
    const card1 = { cardId: 'es-de-buenos-aires:w1', due: '2026-03-26', stability: 10, difficulty: 0.3, elapsed_days: 5, scheduled_days: 7, reps: 4, lapses: 0, state: 2 };
    cardStorage.set('es-de-buenos-aires:w1', JSON.stringify(card1));

    await createBackup();

    expect(mockKeychain.setGenericPassword).toHaveBeenCalledTimes(1);
    const [username, password, options] = mockKeychain.setGenericPassword.mock.calls[0];
    expect(username).toBe('lingolock');
    expect(options).toEqual(expect.objectContaining({ service: BACKUP_SERVICE_NAME }));

    // Verify payload is valid: base64 → gunzip → JSON
    const compressed = Buffer.from(password, 'base64');
    const json = JSON.parse(pako.ungzip(compressed, { to: 'string' }));
    expect(json.v).toBe(1);
    expect(json.cards['es-de-buenos-aires:w1']).toEqual(card1);
    expect(json.activeBundle).toBe('es-de-buenos-aires');
    expect(json.enabledBundles).toEqual(['es-de-buenos-aires']);
  });

  test('records lastBackupTs after successful backup', async () => {
    cardStorage.set('es-de-buenos-aires:w1', '{}');
    await createBackup();
    expect(setLastBackupTs).toHaveBeenCalledWith(expect.any(Number));
  });

  test('does not throw when Keychain write fails', async () => {
    cardStorage.set('es-de-buenos-aires:w1', '{}');
    mockKeychain.setGenericPassword.mockRejectedValueOnce(new Error('Keychain full'));
    await expect(createBackup()).resolves.not.toThrow();
  });
});
```

Note: Tests use `Buffer.from()` for assertion decoding — this is fine because tests run in Node. The production code must NOT use `Buffer`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx jest src/services/backupService.test.ts --verbose
```

Expected: FAIL — `Cannot find module './backupService'`

- [ ] **Step 3: Implement backupService.ts — shouldBackup and createBackup**

Create `src/services/backupService.ts`:

```typescript
/**
 * Keychain backup service for LingoLock
 *
 * Backs up FSRS card states + deck metadata to iOS Keychain daily.
 * Keychain data persists across app uninstall/reinstall.
 * Uses react-native-keychain (no size limit) + pako gzip compression.
 *
 * IMPORTANT: Do NOT use Node's `Buffer` — it doesn't exist in Hermes (RN JS engine).
 * Use btoa/atob + Uint8Array helpers for base64 encoding.
 */
import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import pako from 'pako';

import {
  cardStorage,
  getCardCount,
  getLastBackupTs,
  setLastBackupTs,
  isRestoreDismissed,
  loadActiveBundle,
  loadEnabledBundles,
  saveActiveBundle,
  saveEnabledBundles,
  setRestoreDismissed,
} from './storage';
import { getImportedDecks } from './importedDeckStore';
import type { CardState } from '../types/vocabulary';
import type { ImportedDeckMeta } from '../types/simpleCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BACKUP_SERVICE_NAME = 'lingolock.backup';
const BACKUP_VERSION = 1;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupPayload {
  v: number;
  ts: string;
  cards: Record<string, CardState>;
  importedDecks: ImportedDeckMeta[];
  activeBundle: string;
  enabledBundles: string[];
}

export interface BackupMeta {
  ts: string;
  cardCount: number;
  importedDecks: ImportedDeckMeta[];
}

// ---------------------------------------------------------------------------
// Base64 helpers — Hermes-safe (no Buffer)
// ---------------------------------------------------------------------------

/** Encode Uint8Array to base64 string. Chunks to avoid stack overflow on large payloads. */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** Decode base64 string to Uint8Array. */
function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// shouldBackup — synchronous check
// ---------------------------------------------------------------------------

/**
 * Returns true if a backup should be created:
 * - There are cards to back up
 * - Last backup was >24h ago (or never made)
 * - Platform is iOS
 */
export function shouldBackup(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (getCardCount() === 0) return false;

  const lastTs = getLastBackupTs();
  if (lastTs === undefined) return true;
  return Date.now() - lastTs > TWENTY_FOUR_HOURS_MS;
}

// ---------------------------------------------------------------------------
// createBackup — async, fire-and-forget safe
// ---------------------------------------------------------------------------

/**
 * Serialize all card states + metadata → gzip → base64 → Keychain.
 * Silently catches errors (backup is best-effort).
 */
export async function createBackup(): Promise<void> {
  try {
    if (Platform.OS !== 'ios') return;

    // Collect all card states from MMKV
    const keys = cardStorage.getAllKeys();
    const cards: Record<string, CardState> = {};
    for (const key of keys) {
      const raw = cardStorage.getString(key);
      if (raw) {
        try {
          cards[key] = JSON.parse(raw) as CardState;
        } catch {
          // Skip corrupted entries
        }
      }
    }

    const payload: BackupPayload = {
      v: BACKUP_VERSION,
      ts: new Date().toISOString(),
      cards,
      importedDecks: getImportedDecks(),
      activeBundle: loadActiveBundle(),
      enabledBundles: loadEnabledBundles(),
    };

    const json = JSON.stringify(payload);
    const compressed = pako.gzip(json);
    const base64 = uint8ToBase64(compressed);

    await Keychain.setGenericPassword('lingolock', base64, {
      service: BACKUP_SERVICE_NAME,
    });

    setLastBackupTs(Date.now());
    console.log(`[Backup] Saved ${keys.length} card states (${base64.length} bytes compressed)`);
  } catch (error) {
    console.error('[Backup] Failed to create backup:', error);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx jest src/services/backupService.test.ts --verbose
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/backupService.ts src/services/backupService.test.ts
git commit -m "feat: implement shouldBackup and createBackup for keychain backup"
```

---

### Task 4: Implement checkForBackup, restoreFromBackup, deleteBackup

**Files:**
- Modify: `src/services/backupService.ts`
- Modify: `src/services/backupService.test.ts`

- [ ] **Step 1: Write failing tests for checkForBackup, restoreFromBackup, shouldPromptRestore, deleteBackup**

Add to the bottom of `backupService.test.ts` (update the import line to include the new exports):

```typescript
// Update the import at the top of the file to include:
import {
  shouldBackup,
  createBackup,
  checkForBackup,
  restoreFromBackup,
  deleteBackup,
  shouldPromptRestore,
  dismissRestore,
  BACKUP_SERVICE_NAME,
} from './backupService';
import { cardStorage, getLastBackupTs, setLastBackupTs, isRestoreDismissed, setRestoreDismissed } from './storage';

const mockIsRestoreDismissed = isRestoreDismissed as jest.Mock;

// --- Add these test suites ---

describe('shouldPromptRestore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cardStorage as any).clearAll();
  });

  test('returns true when no cards and not dismissed', () => {
    mockIsRestoreDismissed.mockReturnValue(false);
    expect(shouldPromptRestore()).toBe(true);
  });

  test('returns false when cards exist', () => {
    cardStorage.set('card1', '{}');
    mockIsRestoreDismissed.mockReturnValue(false);
    expect(shouldPromptRestore()).toBe(false);
  });

  test('returns false when dismissed', () => {
    mockIsRestoreDismissed.mockReturnValue(true);
    expect(shouldPromptRestore()).toBe(false);
  });
});

describe('checkForBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cardStorage as any).clearAll();
    mockKeychain.__reset();
  });

  test('returns null when no backup exists', async () => {
    const result = await checkForBackup();
    expect(result).toBeNull();
  });

  test('returns metadata when backup exists', async () => {
    // Create a backup first
    const card1 = { cardId: 'es-de-buenos-aires:w1', due: '2026-03-26', stability: 10, difficulty: 0.3, elapsed_days: 5, scheduled_days: 7, reps: 4, lapses: 0, state: 2 };
    cardStorage.set('es-de-buenos-aires:w1', JSON.stringify(card1));
    await createBackup();

    // Clear card storage to simulate reinstall
    (cardStorage as any).clearAll();

    const result = await checkForBackup();
    expect(result).not.toBeNull();
    expect(result!.cardCount).toBe(1);
    expect(result!.ts).toBeDefined();
    expect(result!.importedDecks).toEqual([]);
  });

  test('returns null when backup is corrupted', async () => {
    // Manually set corrupted data in the mock Keychain
    mockKeychain.setGenericPassword('lingolock', 'not-valid-base64-gzip', { service: BACKUP_SERVICE_NAME });
    // Wait for mock to settle
    await new Promise(r => setTimeout(r, 0));

    const result = await checkForBackup();
    expect(result).toBeNull();
  });
});

describe('restoreFromBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cardStorage as any).clearAll();
    mockKeychain.__reset();
  });

  test('restores card states to MMKV', async () => {
    const card1 = { cardId: 'es-de-buenos-aires:w1', due: '2026-03-26', stability: 10, difficulty: 0.3, elapsed_days: 5, scheduled_days: 7, reps: 4, lapses: 0, state: 2 };
    cardStorage.set('es-de-buenos-aires:w1', JSON.stringify(card1));
    await createBackup();

    // Clear to simulate reinstall
    (cardStorage as any).clearAll();
    expect(cardStorage.getAllKeys().length).toBe(0);

    const result = await restoreFromBackup();
    expect(result).not.toBeNull();
    expect(result!.restoredCards).toBe(1);
    expect(cardStorage.getAllKeys().length).toBe(1);

    const restored = JSON.parse(cardStorage.getString('es-de-buenos-aires:w1')!);
    expect(restored.stability).toBe(10);
  });

  test('returns missingDecks for imported decks not on device', async () => {
    const { getImportedDecks } = require('./importedDeckStore');
    const deckMeta = { id: 'test-deck', name: 'Test Deck', cardCount: 50, importedAt: '2026-03-20', sizeBytes: 1024 };
    (getImportedDecks as jest.Mock).mockReturnValue([deckMeta]);

    cardStorage.set('es-de-buenos-aires:w1', '{"cardId":"es-de-buenos-aires:w1","state":0}');
    await createBackup();

    // Simulate reinstall: clear cards, imported decks gone
    (cardStorage as any).clearAll();
    (getImportedDecks as jest.Mock).mockReturnValue([]);

    const result = await restoreFromBackup();
    expect(result!.missingDecks).toEqual([deckMeta]);
  });

  test('returns null when no backup exists', async () => {
    const result = await restoreFromBackup();
    expect(result).toBeNull();
  });
});

describe('deleteBackup', () => {
  beforeEach(() => {
    mockKeychain.__reset();
  });

  test('calls resetGenericPassword with correct service', async () => {
    await deleteBackup();
    expect(mockKeychain.resetGenericPassword).toHaveBeenCalledWith({
      service: BACKUP_SERVICE_NAME,
    });
  });
});

describe('dismissRestore', () => {
  test('calls setRestoreDismissed', () => {
    dismissRestore();
    expect(setRestoreDismissed).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx jest src/services/backupService.test.ts --verbose
```

Expected: FAIL — functions not exported

- [ ] **Step 3: Add checkForBackup, restoreFromBackup, deleteBackup, shouldPromptRestore, dismissRestore to backupService.ts**

Append to `src/services/backupService.ts`:

```typescript
// ---------------------------------------------------------------------------
// shouldPromptRestore — synchronous check
// ---------------------------------------------------------------------------

/**
 * Returns true if the app should check for a backup to restore:
 * - No cards in storage (fresh install or data wiped)
 * - User hasn't dismissed the restore prompt
 */
export function shouldPromptRestore(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (getCardCount() > 0) return false;
  return !isRestoreDismissed();
}

// ---------------------------------------------------------------------------
// checkForBackup — reads and validates, does not restore
// ---------------------------------------------------------------------------

/**
 * Check if a backup exists in Keychain.
 * Returns metadata for display in the restore prompt, or null.
 */
export async function checkForBackup(): Promise<BackupMeta | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: BACKUP_SERVICE_NAME,
    });
    if (!result) return null;

    const payload = decodePayload(result.password);
    if (!payload) return null;

    // Version check: refuse if backup is from a newer app version
    if (payload.v > BACKUP_VERSION) {
      console.warn(`[Backup] Backup version ${payload.v} is newer than current ${BACKUP_VERSION}`);
      return null;
    }

    return {
      ts: payload.ts,
      cardCount: Object.keys(payload.cards).length,
      importedDecks: payload.importedDecks ?? [],
    };
  } catch (error) {
    console.error('[Backup] Failed to check for backup:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// restoreFromBackup — writes card states back to MMKV
// ---------------------------------------------------------------------------

/**
 * Restore card states and bundle config from Keychain backup.
 * Returns restore summary, or null if no backup exists.
 */
export async function restoreFromBackup(): Promise<{
  restoredCards: number;
  missingDecks: ImportedDeckMeta[];
} | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: BACKUP_SERVICE_NAME,
    });
    if (!result) return null;

    const payload = decodePayload(result.password);
    if (!payload) return null;

    // Write card states to MMKV
    let restoredCards = 0;
    for (const [key, state] of Object.entries(payload.cards)) {
      cardStorage.set(key, JSON.stringify(state));
      restoredCards++;
    }

    // Restore bundle config
    if (payload.activeBundle) {
      saveActiveBundle(payload.activeBundle);
    }
    if (payload.enabledBundles?.length) {
      saveEnabledBundles(payload.enabledBundles);
    }

    // Determine which imported decks are missing on device
    const currentDecks = getImportedDecks();
    const currentDeckIds = new Set(currentDecks.map(d => d.id));
    const missingDecks = (payload.importedDecks ?? []).filter(
      d => !currentDeckIds.has(d.id)
    );

    console.log(`[Backup] Restored ${restoredCards} card states, ${missingDecks.length} imported decks missing`);
    return { restoredCards, missingDecks };
  } catch (error) {
    console.error('[Backup] Failed to restore from backup:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// deleteBackup
// ---------------------------------------------------------------------------

/**
 * Remove the backup from Keychain.
 */
export async function deleteBackup(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: BACKUP_SERVICE_NAME });
  } catch (error) {
    console.error('[Backup] Failed to delete backup:', error);
  }
}

// ---------------------------------------------------------------------------
// dismissRestore — marks prompt as dismissed
// ---------------------------------------------------------------------------

/**
 * Mark the restore prompt as dismissed. Called when user taps "Start Fresh".
 * Backup data is preserved in Keychain (non-destructive).
 */
export function dismissRestore(): void {
  setRestoreDismissed();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Decode a base64 + gzip payload string into a BackupPayload.
 * Returns null if decoding fails (corrupted data).
 */
function decodePayload(base64: string): BackupPayload | null {
  try {
    const compressed = base64ToUint8(base64);
    const json = pako.ungzip(compressed, { to: 'string' });
    return JSON.parse(json) as BackupPayload;
  } catch {
    console.error('[Backup] Failed to decode backup payload');
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx jest src/services/backupService.test.ts --verbose
```

Expected: All tests PASS

- [ ] **Step 5: Run all existing tests to check for regressions**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx jest --verbose
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/backupService.ts src/services/backupService.test.ts
git commit -m "feat: implement checkForBackup, restoreFromBackup, deleteBackup"
```

---

### Task 5: Create RestorePrompt component

**Files:**
- Create: `src/components/RestorePrompt.tsx`

- [ ] **Step 1: Create RestorePrompt modal component**

Create `src/components/RestorePrompt.tsx`:

```tsx
/**
 * RestorePrompt — shown on fresh install when a Keychain backup is found.
 * User can restore progress or start fresh.
 */
import React, { useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';

import type { BackupMeta } from '../services/backupService';

interface Props {
  visible: boolean;
  meta: BackupMeta;
  onRestore: () => Promise<void>;
  onStartFresh: () => void;
}

export function RestorePrompt({ visible, meta, onRestore, onStartFresh }: Props) {
  const theme = useTheme();
  const [restoring, setRestoring] = useState(false);

  const formattedDate = new Date(meta.ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await onRestore();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
            Welcome back!
          </Text>

          <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
            We found your previous progress (saved {formattedDate}).
          </Text>

          <View style={styles.stats}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {'\u2022'} {meta.cardCount} cards reviewed
            </Text>
            {meta.importedDecks.length > 0 && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {'\u2022'} Imported decks: {meta.importedDecks.map(d => d.name).join(', ')}
              </Text>
            )}
          </View>

          <Button
            mode="contained"
            onPress={handleRestore}
            loading={restoring}
            disabled={restoring}
            style={styles.button}
          >
            Restore Progress
          </Button>

          <Button
            mode="text"
            onPress={onStartFresh}
            disabled={restoring}
            style={styles.button}
          >
            Start Fresh
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    elevation: 4,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    textAlign: 'center',
    marginBottom: 16,
  },
  stats: {
    marginBottom: 24,
    gap: 4,
  },
  button: {
    marginBottom: 8,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RestorePrompt.tsx
git commit -m "feat: add RestorePrompt modal component"
```

---

### Task 6: Wire up backup and restore in _layout.tsx

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add imports**

Add to the import block in `app/_layout.tsx`:

```typescript
import { AppState, type AppStateStatus } from 'react-native';
```

Update the existing `react-native` import to include `AppState` and `AppStateStatus` (merge with existing Platform/View/etc imports).

Add new imports:

```typescript
import { shouldPromptRestore, checkForBackup, restoreFromBackup, dismissRestore, shouldBackup, createBackup } from '../src/services/backupService';
import { RestorePrompt } from '../src/components/RestorePrompt';
import type { BackupMeta } from '../src/services/backupService';
```

Add `useState` to the React import (already has `useCallback`, `useEffect`).

- [ ] **Step 2: Add backup/restore state and effects**

Inside `RootLayout`, before the `useDeepLink` call, add:

```typescript
  // ---------------------------------------------------------------------------
  // Keychain backup — restore on fresh install, daily backup on foreground
  // ---------------------------------------------------------------------------
  const [backupMeta, setBackupMeta] = useState<BackupMeta | null>(null);
  const [showRestore, setShowRestore] = useState(false);

  // Check for backup on mount (fresh install detection)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!shouldPromptRestore()) return;

    checkForBackup().then((meta) => {
      if (meta) {
        setBackupMeta(meta);
        setShowRestore(true);
      }
    });
  }, []);

  // Backup trigger on app foreground
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && shouldBackup()) {
        createBackup();
      }
    });
    return () => sub.remove();
  }, []);

  const handleRestore = useCallback(async () => {
    await restoreFromBackup();
    setShowRestore(false);
  }, []);

  const handleStartFresh = useCallback(() => {
    dismissRestore();
    setShowRestore(false);
  }, []);
```

- [ ] **Step 3: Add RestorePrompt to the render tree**

Inside the `PaperProvider`, just before `{content}` (or the web wrapper), add:

```tsx
{showRestore && backupMeta && (
  <RestorePrompt
    visible={showRestore}
    meta={backupMeta}
    onRestore={handleRestore}
    onStartFresh={handleStartFresh}
  />
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors related to backup code (existing errors are ok)

- [ ] **Step 5: Run all tests to check for regressions**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx jest --verbose
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: wire up keychain backup and restore in app layout"
```

---

### Task 7: Rebuild iOS and manual test

**Files:** None (runtime verification)

- [ ] **Step 1: Install pods for react-native-keychain**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx expo prebuild --platform ios --clean
```

- [ ] **Step 2: Build and run on simulator**

```bash
cd /mnt/Shared/Code/projects/LingoLock && npx expo run:ios
```

- [ ] **Step 3: Manual test — create backup**

1. Open app, complete at least one review session
2. Background the app, then foreground it
3. Check console logs for `[Backup] Saved X card states`

- [ ] **Step 4: Manual test — restore on reinstall**

1. Delete the app from simulator
2. Re-run `npx expo run:ios`
3. On launch, verify the "Welcome back!" modal appears with correct card count
4. Tap "Restore Progress"
5. Verify cards are restored (home screen shows correct stats)

- [ ] **Step 5: Manual test — start fresh**

1. Delete the app again
2. Re-run `npx expo run:ios`
3. Tap "Start Fresh"
4. Verify the prompt does not reappear on next launch

- [ ] **Step 6: Commit any fixes needed**

```bash
git add -A && git commit -m "fix: adjust backup flow after manual testing"
```
