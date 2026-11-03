import { requireActor } from '@/modules/auth/server';
import { Navigation } from '@/components/navigation';
import { SyncStatus } from '@/components/sync-status';
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
      />
      <main className="workspace" id="main">
        <SyncStatus
          userId={actor.userId}
          organizationId={actor.organizationId}
        />
        <ReminderBanner organizationId={actor.organizationId} />
        {children}
        <footer className="page-footer">
          Revenda Fácil <span>Um passo de cada vez. Tudo sob controle.</span>
        </footer>
      </main>
    </>
  );
}
