import { requireActor } from '@/modules/auth/server';
import { dashboard } from '@/modules/dashboard/queries';
import { DashboardView } from '@/modules/dashboard/view';
import { currentMonth } from '@/lib/money';
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string }>;
}) {
  const actor = await requireActor(),
    params = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month || '')
    ? params.month!
    : currentMonth();
  const allowed = [
    'SALE',
    'RESERVATION',
    'RESERVATION_RELEASE',
    'PURCHASE',
    'RETURN',
    'RECEIPT',
    'PAYMENT',
    'PRODUCT',
    'CUSTOMER',
    'FISCAL',
    'SETTINGS',
  ];
  const type =
    params.type && allowed.includes(params.type) ? params.type : undefined;
  const data = await dashboard(actor, month, type);
  return (
    <DashboardView
      data={data}
      month={month}
      type={type}
      owner={actor.organization.ownerName}
    />
  );
}
