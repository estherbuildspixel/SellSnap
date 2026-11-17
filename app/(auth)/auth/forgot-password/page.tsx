import type { Metadata } from 'next';
import { ForgotPasswordForm } from './_components/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Forgot your password — SellSnap',
  description: 'Request a link to choose a new SellSnap account password.',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
