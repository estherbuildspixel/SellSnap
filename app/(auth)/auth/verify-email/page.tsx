import type { Metadata } from 'next';
import { firstQueryValue } from '@/lib/utils';
import { VerifyEmailForm } from './_components/VerifyEmailForm';

export const metadata: Metadata = {
  title: 'Verify your email — SellSnap',
  description: 'Enter the 6-digit code we sent to verify your SellSnap email address.',
};

type Props = {
  searchParams: Promise<{
    email?: string | string[];
    devCode?: string | string[];
  }>;
};

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email, devCode } = await searchParams;

  return (
    <VerifyEmailForm
      initialEmail={firstQueryValue(email) ?? ''}
      initialDevCode={firstQueryValue(devCode)}
    />
  );
}
