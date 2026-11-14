import { useCallback, useRef, useState } from 'react';

interface UsePendingActionResult {
  pending: boolean;
  run: (action: () => Promise<void> | void) => Promise<void>;
}

/**
 * Guards single-action handlers (table row buttons, Popconfirm onConfirm) against
 * double clicks while the request is in flight.
 */
export function usePendingAction(): UsePendingActionResult {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const run = useCallback(async (action: () => Promise<void> | void) => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
}
