import { Suspense } from 'react';
import { requireActor } from '@/modules/auth/server';
import { Navigation } from '@/components/navigation';
import { ReminderBanner } from '@/modules/reminders/banner';
export const dynamic = 'force-dynamic';
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireActor();
  return (
    <>
      <a href="#main" className="skip-link">
        Pular para o conteúdo
      </a>
      <Navigation
        name={actor.organization.name}
        owner={actor.organization.ownerName}
        userId={actor.userId}
        organizationId={actor.organizationId}
      />
      <main className="workspace" id="main">
        <Suspense fallback={null}>
          <ReminderBanner organizationId={actor.organizationId} />
        </Suspense>
        {children}
      </main>
    </>
  );
}
