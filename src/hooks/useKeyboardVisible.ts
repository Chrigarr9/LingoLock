import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Returns true while the software keyboard is visible.
 *
 * On web, listens to the VisualViewport API (resize events shrink the
 * visual viewport when the on-screen keyboard appears). Falls back to
 * always-false on browsers without VisualViewport support.
 *
 * On native, uses RN Keyboard events (keyboardDidShow / keyboardDidHide).
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = (window as any).visualViewport;
      if (!vv) return;

      // When the keyboard opens on mobile web, the visual viewport height
      // shrinks significantly (>15% is a safe threshold to avoid false
      // positives from address-bar hide/show).
      const onResize = () => {
        const ratio = vv.height / window.innerHeight;
        setVisible(ratio < 0.85);
      };
      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
    }

    // Native (iOS / Android)
    // On iOS, use `will` variants for earlier response (before animation completes).
    // Android doesn't support `will` variants, so keep `did`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}
