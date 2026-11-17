'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 5000;
const MAX_REFRESHES = 24;

/**
 * Re-renders the server component while the order is pending so the page picks
 * up the webhook settlement. This performs no writes and does not verify the
 * payment; the webhook remains the only settlement path in production.
 */
export function PaymentStatusRefresher() {
  const router = useRouter();

  useEffect(() => {
    let refreshes = 0;

    const id = setInterval(() => {
      refreshes += 1;

      if (refreshes > MAX_REFRESHES) {
        clearInterval(id);
        return;
      }

      router.refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [router]);

  return null;
}
