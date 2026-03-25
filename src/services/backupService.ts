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

export async function createBackup(): Promise<void> {
  try {
    if (Platform.OS !== 'ios') return;

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
