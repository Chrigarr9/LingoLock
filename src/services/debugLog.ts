/**
 * In-app debug log ring buffer — captures recent console output so the user
 * can read it on-device via DebugLogOverlay, without needing Xcode console
 * access. Designed for preview-build debugging of Screen Time / deep-link
 * flows where TestFlight users can't easily attach a Mac.
 */

const MAX_ENTRIES = 300;

export interface LogEntry {
  ts: number;
  tag: string;
  message: string;
}

const entries: LogEntry[] = [];
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
 * entry also shows up in native device logs if Xcode is attached.
 */
export function logDebug(tag: string, ...args: unknown[]): void {
  entries.push({ ts: Date.now(), tag, message: format(args) });
  if (entries.length > MAX_ENTRIES) entries.shift();
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
