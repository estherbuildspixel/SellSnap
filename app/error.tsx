'use client';

import { FallbackPage } from '@/components/shared/FallbackPage';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FallbackPage
      title="Something went wrong"
      message="We could not load this page. Try again, or return to the homepage."
      onRetry={reset}
      alert
    />
  );
}
