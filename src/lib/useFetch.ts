"use client";

import { useEffect, useState, useCallback } from "react";

interface UseFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Minimal client-side data fetching hook -- no external deps, refetches on
 * url/deps change or manual refetch(). `loading` only reflects the very
 * first fetch for a given hook instance (data === null); subsequent
 * refetches happen silently so the UI doesn't flicker back to a spinner.
 */
export function useFetch<T>(url: string | null, deps: unknown[] = []): UseFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setError(null);
        setFetching(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setFetching(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce, ...deps]);

  return { data, loading: url !== null && fetching && data === null, error, refetch };
}
