import { useCallback, useEffect } from 'react';

export const PAGE_ACTIVATED_EVENT = 'firefly:page-activated';

interface PageActivatedDetail {
  path: string;
}

/**
 * Runs `onActivate` whenever the user switches back to this page tab.
 *
 * The layout keeps visited pages mounted (keep-alive), so a page that only
 * fetches on mount would otherwise show stale data after tab switches.
 */
export function usePageActivation(onActivate: () => void): void {
  const callback = useCallback(onActivate, [onActivate]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PageActivatedDetail>).detail;
      if (!detail?.path) {
        return;
      }
      if (detail.path === window.location.pathname) {
        callback();
      }
    };
    window.addEventListener(PAGE_ACTIVATED_EVENT, handler);
    return () => window.removeEventListener(PAGE_ACTIVATED_EVENT, handler);
  }, [callback]);
}
