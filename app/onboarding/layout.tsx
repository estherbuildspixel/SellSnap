import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import styles from './onboarding.module.css';

export const dynamic = 'force-dynamic';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) { redirect('/auth'); }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { onboardedAt: true },
  });

  if (user?.onboardedAt) { redirect('/dashboard'); }

  return (
    <div className={styles.wrapper}>
      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandText}>SellSnap</span>
            </Link>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
