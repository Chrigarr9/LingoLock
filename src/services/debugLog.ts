/**
 * In-app debug log ring buffer — captures recent console output so the user
 * can read it on-device via DebugLogOverlay, without needing Xcode console
 * access. Designed for preview-build debugging of Screen Time / deep-link
 * flows where TestFlight users can't easily attach a Mac.
 *
 * Persisted to MMKV so logs survive cold launches. Critical for Screen Time
 * debugging: when the shield routes the user into the app via deep link, the
 * launch IS the event we want logs for — an in-memory ring buffer dies before
 * the user can read it. The user explicitly reported "debug log is deleted
 * every time" — that was the in-memory implementation.
 */

import { createMMKV } from 'react-native-mmkv';

const MAX_ENTRIES = 300;
const LOG_STORAGE_KEY = 'entries';

export interface LogEntry {
  ts: number;
  tag: string;
  message: string;
}

const logStorage = createMMKV({ id: 'lingolock.debugLog' });

function loadPersistedEntries(): LogEntry[] {
  const raw = logStorage.getString(LOG_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    logStorage.set(LOG_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // MMKV write failed — non-fatal, just lose this update
  }
}

const entries: LogEntry[] = loadPersistedEntries();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

/**
 * Append a log entry tagged with a category. Mirrors to console.log so the
 * entry also shows up in native device logs if Xcode is attached. Persists
 * to MMKV so the entry survives cold launches.
 */
export function logDebug(tag: string, ...args: unknown[]): void {
  entries.push({ ts: Date.now(), tag, message: format(args) });
  if (entries.length > MAX_ENTRIES) entries.shift();
  persist();
  notify();
  // eslint-disable-next-line no-console
  console.log(`[${tag}]`, ...args);
}

export function getLogEntries(): LogEntry[] {
  return entries.slice();
}

export function subscribeLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function clearLog(): void {
  entries.length = 0;
  persist();
  notify();
}

// --- Overlay open/close coordination -----------------------------------
// The DebugLogOverlay is mounted once at the root layout; any screen can
// request that it be shown by calling `openDebugLog()`. A single listener
// (the root layout) subscribes and toggles its modal state.
const openListeners = new Set<() => void>();

export function openDebugLog(): void {
  for (const fn of openListeners) fn();
}

export function subscribeOpenDebugLog(fn: () => void): () => void {
  openListeners.add(fn);
  return () => {
    openListeners.delete(fn);
  };
}
