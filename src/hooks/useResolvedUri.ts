/**
 * useResolvedUri — Native implementation (passthrough).
 *
 * On native, card.image and card.audio are already file:// URIs
 * that React Native can use directly. No resolution needed.
 */

export function useResolvedUri(uri: string | undefined): string | undefined {
  return uri;
}
