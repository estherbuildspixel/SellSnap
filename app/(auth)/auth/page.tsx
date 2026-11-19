import type { Metadata } from 'next';
import { firstQueryValue } from '@/lib/utils';
import { AuthForm, type AuthMode } from './_components/AuthForm';

export const metadata: Metadata = {
  title: 'Sign in or Sign up — SellSnap',
  description:
    'Log in to your SellSnap account or create one to start selling with instant payment links.',
};

type Props = {
  searchParams: Promise<{
    mode?: string | string[];
    verified?: string | string[];
    email?: string | string[];
  }>;
};

export default async function AuthPage({ searchParams }: Props) {
  const { mode, verified, email } = await searchParams;
  const initialMode: AuthMode =
    firstQueryValue(mode) === 'signup' ? 'signup' : 'login';

  return (
    <AuthForm
      initialMode={initialMode}
      initialEmail={firstQueryValue(email) ?? ''}
      verified={firstQueryValue(verified) === '1'}
    />
  );
}
