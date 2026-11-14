import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoRefreshOptions {
  /** Polling interval in milliseconds. */
  intervalMs: number;
  /** When false no timer is scheduled (e.g. the drawer is closed). */
  enabled?: boolean;
  /** Run the fetcher immediately on mount / when enabled becomes true. */
  immediate?: boolean;
}

interface UseAutoRefreshResult {
  paused: boolean;
  togglePaused: () => void;
  lastUpdatedAt: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Shared polling helper for realtime consoles, task centres and monitors.
 *
 * Guarantees that the user can pause automatic refresh, that hidden browser tabs
 * stop polling, and that a slow request is never overlapped by the next tick.
 */
export function useAutoRefresh(
  fetcher: () => void | Promise<void>,
  { intervalMs, enabled = true, immediate = true }: UseAutoRefreshOptions,
): UseAutoRefreshResult {
  const [paused, setPaused] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) {
      return;
    }
    fetchingRef.current = true;
    try {
      await fetcherRef.current();
      if (mountedRef.current) {
        setLastUpdatedAt(new Date());
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((previous) => !previous);
  }, []);

  useEffect(() => {
    if (!enabled || paused) {
      return undefined;
    }

    if (immediate) {
      void refresh();
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, immediate, intervalMs, paused, refresh]);

  return { paused, togglePaused, lastUpdatedAt, refresh };
}
