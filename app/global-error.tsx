'use client';

import './globals.css';
import { FallbackPage } from '@/components/shared/FallbackPage';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <FallbackPage
          title="SellSnap is temporarily unavailable"
          message="An unexpected error stopped the page from loading. Try again in a moment."
          onRetry={reset}
          alert
        />
      </body>
    </html>
  );
}
