/**
 * useResolvedUri — Web implementation.
 *
 * Detects idb:// URIs (stored during .apkg import) and resolves them
 * to blob: URLs by fetching the Blob from IndexedDB. Revokes the
 * blob URL on unmount to prevent memory leaks.
 *
 * Non-idb:// URIs (http://, data:, etc.) are passed through unchanged.
 */
import { useState, useEffect } from 'react';
import { getMediaBlobUrl } from '../services/importedDeckStore';

const IDB_PREFIX = 'idb://';

function parseIdbUri(uri: string): { deckId: string; filename: string } | null {
  if (!uri.startsWith(IDB_PREFIX)) return null;
  const rest = uri.slice(IDB_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;
  return { deckId: rest.slice(0, slashIdx), filename: rest.slice(slashIdx + 1) };
}

export function useResolvedUri(uri: string | undefined): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() => {
    if (!uri || uri.startsWith(IDB_PREFIX)) return undefined;
    return uri;
  });

  useEffect(() => {
    if (!uri) {
      setResolved(undefined);
      return;
    }

    const parsed = parseIdbUri(uri);
    if (!parsed) {
      setResolved(uri);
      return;
    }

    let revoke: string | undefined;

    getMediaBlobUrl(parsed.deckId, parsed.filename).then((blobUrl) => {
      if (blobUrl) {
        revoke = blobUrl;
        setResolved(blobUrl);
      }
    });

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [uri]);

  return resolved;
}
