import type { Metadata } from 'next';
import { findValidResetToken } from '@/lib/password-reset';
import { ResetPasswordForm } from './_components/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Choose a new password — SellSnap',
  description: 'Set a new password for your SellSnap account.',
};

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;

  // Check the link before showing the form, so an expired link never looks
  // like a broken one. The token itself is the credential.
  const record = token ? await findValidResetToken(token) : null;

  return <ResetPasswordForm token={token ?? ''} tokenIsValid={Boolean(record)} />;
}
