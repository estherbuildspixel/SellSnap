import React from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/shared/PageHeader';
import { SettingsForm } from './_components/SettingsForm';
import { PasswordChangeForm } from './_components/PasswordChangeForm';
import styles from './settings.module.css';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/auth');

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true, businessName: true, email: true, pendingEmail: true },
  });

  if (!user) redirect('/auth');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Settings"
        description="Manage your account and business details."
      />
      <SettingsForm initialValues={user} />
      <PasswordChangeForm />
    </div>
  );
}
