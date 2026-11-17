import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { OnboardingSteps } from './_components/OnboardingSteps';

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) { redirect('/auth'); }

  return <OnboardingSteps name={session.user.name} />;
}
