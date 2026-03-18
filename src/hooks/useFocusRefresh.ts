import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Returns a `focusKey` that increments every time the screen gains focus.
 * Use as a dependency in useMemo to re-derive data when returning to a screen.
 */
export function useFocusRefresh(): number {
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(useCallback(() => { setFocusKey(k => k + 1); }, []));
  return focusKey;
}
