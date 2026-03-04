/**
 * Hook to handle PWA install prompt (web only).
 *
 * Captures the browser's `beforeinstallprompt` event and exposes a trigger
 * function. Chrome/Edge fire this event when the app meets PWA install
 * criteria (valid manifest + service worker + HTTPS).
 *
 * Returns `null` when:
 *   - Not running on web
 *   - App is already installed (standalone mode)
 *   - Browser hasn't fired the event yet (e.g., Safari — no support)
 */
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Already installed as standalone PWA — no need to prompt
    if (window.matchMedia?.('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault(); // Suppress browser's mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null); // Hide banner after install
    }
  };

  return deferredPrompt ? install : null;
}
