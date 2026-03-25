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
  checkForBackup,
  restoreFromBackup,
  deleteBackup,
  shouldPromptRestore,
  dismissRestore,
  BACKUP_SERVICE_NAME,
} from './backupService';
import { cardStorage, getLastBackupTs, setLastBackupTs, isRestoreDismissed, setRestoreDismissed } from './storage';

const mockKeychain = Keychain as any;
const mockGetLastBackupTs = getLastBackupTs as jest.Mock;
const mockIsRestoreDismissed = isRestoreDismissed as jest.Mock;

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
    const card1 = { cardId: 'es-de-buenos-aires:w1', due: '2026-03-26', stability: 10, difficulty: 0.3, elapsed_days: 5, scheduled_days: 7, reps: 4, lapses: 0, state: 2 };
    cardStorage.set('es-de-buenos-aires:w1', JSON.stringify(card1));
    await createBackup();
    (cardStorage as any).clearAll();

    const result = await checkForBackup();
    expect(result).not.toBeNull();
    expect(result!.cardCount).toBe(1);
    expect(result!.ts).toBeDefined();
    expect(result!.importedDecks).toEqual([]);
  });

  test('returns null when backup is corrupted', async () => {
    // Write corrupted data directly to mock Keychain
    await mockKeychain.setGenericPassword('lingolock', 'not-valid-base64-gzip', { service: BACKUP_SERVICE_NAME });

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
