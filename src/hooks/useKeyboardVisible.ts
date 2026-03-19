import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Returns keyboard visibility state and height.
 *
 * On web, listens to the VisualViewport API. On native, uses Keyboard events.
 * The height is the pixel height of the keyboard (0 when hidden).
 */
export function useKeyboardVisible(): boolean {
  const { visible } = useKeyboard();
  return visible;
}

export function useKeyboard(): { visible: boolean; height: number } {
  const [state, setState] = useState({ visible: false, height: 0 });

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = (window as any).visualViewport;
      if (!vv) return;

      const onResize = () => {
        const ratio = vv.height / window.innerHeight;
        const isVisible = ratio < 0.85;
        setState({
          visible: isVisible,
          height: isVisible ? window.innerHeight - vv.height : 0,
        });
      };
      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) =>
      setState({ visible: true, height: e.endCoordinates.height }),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setState({ visible: false, height: 0 }),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return state;
}
