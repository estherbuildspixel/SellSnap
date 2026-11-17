import Link from 'next/link';
import { MdErrorOutline } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import styles from './FallbackPage.module.css';

type FallbackPageProps = {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  alert?: boolean;
};

export function FallbackPage({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
  alert = false,
}: FallbackPageProps) {
  return (
    <main className={styles.page}>
      <div className={styles.card} role={alert ? 'alert' : undefined}>
        <MdErrorOutline className={styles.icon} size={40} aria-hidden="true" />
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          {onRetry && (
            <Button variant="primary" size="lg" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          <Link href="/" className={styles.homeLink}>
            Go to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
