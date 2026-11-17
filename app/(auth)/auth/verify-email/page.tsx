import type { Metadata } from 'next';
import { VerifyEmailForm } from './_components/VerifyEmailForm';

export const metadata: Metadata = {
  title: 'Verify your email — SellSnap',
  description: 'Enter the 6-digit code we sent to verify your SellSnap email address.',
};

type Props = {
  searchParams: Promise<{ email?: string; devCode?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email, devCode } = await searchParams;

  return <VerifyEmailForm initialEmail={email ?? ''} initialDevCode={devCode} />;
}
