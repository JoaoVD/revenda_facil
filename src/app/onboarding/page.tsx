import { redirect } from 'next/navigation';
import { requireUser } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { OnboardingForm } from '@/components/auth-forms';
export const dynamic = 'force-dynamic';
export default async function Onboarding() {
  const user = await requireUser();
  if (await db.membership.findUnique({ where: { userId: user.id } }))
    redirect('/');
  return (
    <main className="onboarding card">
      <h1>Vamos conhecer sua revenda</h1>
      <p>Você poderá atualizar estes dados depois.</p>
      <OnboardingForm />
    </main>
  );
}
