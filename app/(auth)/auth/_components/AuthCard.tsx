import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import styles from './AuthCard.module.css';

export type AuthCardProps = {
  title: string;
  subtitle?: string;
  /** Rendered above the title, inside the card. */
  banner?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Shared shell for every screen in the auth flow: sign in, sign up, forgot
 * password and reset password. Keeps the brand header identical everywhere.
 */
export function AuthCard({ title, subtitle, banner, children, className }: AuthCardProps) {
  return (
    <div className={styles.wrapper}>
      <Card
        className={cn(styles.card, styles.cardNoShadow, styles.cardPlain, className)}
        variant="elevated"
      >
        {banner}

        <div className={styles.header}>
          <Link href="/" className={styles.brand}>
            SellSnap
          </Link>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>

        {children}
      </Card>
    </div>
  );
}
