import React from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { DashboardSidebar } from './_components/DashboardSidebar';
import styles from './layout.module.css';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/auth');
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { onboardedAt: true, emailVerified: true },
  });

  if (!user) {
    redirect('/auth');
  }

  if (!user.emailVerified) {
    redirect(`/auth/verify-email?email=${encodeURIComponent(session.user.email)}`);
  }

  if (!user.onboardedAt) {
    redirect('/onboarding');
  }

  return (
    <div className={styles.container}>
      <DashboardSidebar
        businessName={session.user.businessName}
        userName={session.user.name}
      />

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
