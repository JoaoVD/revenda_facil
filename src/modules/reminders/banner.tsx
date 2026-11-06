import Link from 'next/link';
import { Bell } from 'lucide-react';
import { dueNotice } from './service';
import { NoticeActions } from './forms';
export async function ReminderBanner({
  organizationId,
}: {
  organizationId: string;
}) {
  const notice = await dueNotice(organizationId);
  if (!notice) return null;
  return (
    <aside className="reminder-banner">
      <div>
        <Bell size={23} />
        <strong>Hora de conferir os recebimentos</strong>
        <Link className="small-button" href="/receber">
          Ver valores a receber →
        </Link>
      </div>
      <details>
        <summary>Opções do lembrete</summary>
        <NoticeActions noticeId={notice.id} />
      </details>
    </aside>
  );
}
