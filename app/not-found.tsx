import { FallbackPage } from '@/components/shared/FallbackPage';

export default function NotFoundPage() {
  return (
    <FallbackPage
      title="Page not found"
      message="The page you are looking for may have moved, or the link may be incorrect."
    />
  );
}
