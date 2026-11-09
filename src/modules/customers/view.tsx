import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import { db } from '@/lib/db';
import { brl, D } from '@/lib/money';
import { MessageCircle } from 'lucide-react';
import { Empty } from '@/components/ui';
import { CustomerForm } from '@/components/domain-forms';
import { netReceived } from '@/modules/finance/ledger';
import { whatsappLink } from '@/lib/whatsapp';
import Link from 'next/link';
export async function CustomersView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId;
  const skip = (query.page - 1) * 25;
  const customers = await db.customer.findMany({
    where: {
      organizationId,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { document: { contains: query.q } },
            ],
          }
        : {}),
    },
    include: {
      sales: { where: { status: 'CONFIRMED' }, include: { payments: true } },
    },
    orderBy: { name: 'asc' },
    take: 25,
    skip,
  });
  return (
    <div>
      <div className="list-toolbar">
        <form className="search-row" role="search">
          <input
            aria-label="Pesquisar clientes"
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="Buscar cliente"
          />
          <button className="small-button">Buscar</button>
        </form>
        <ActionDialog title="Novo cliente" trigger="+ Cliente">
          <CustomerForm />
        </ActionDialog>
      </div>
      {customers.length ? (
        <ul className="card customer-list">
          {customers.map((c) => {
            const open = c.sales.reduce(
                (s, v) =>
                  s.plus(v.total.toString()).minus(netReceived(v.payments)),
                D(0),
              ),
              digits = (c.phone || '').replace(/\D/g, ''),
              whatsapp = whatsappLink(c.phone);
            return (
              <li key={c.id}>
                <div className="customer-main">
                  <strong>{c.name}</strong>
                  <small>
                    {digits.length >= 10 ? (
                      <a href={`tel:${digits}`}>{c.phone}</a>
                    ) : (
                      c.phone
                    )}
                    {c.phone && ' · '}
                    {c.sales.length}{' '}
                    {c.sales.length === 1 ? 'compra' : 'compras'}
                  </small>
                </div>
                {open.gt(0) && (
                  <Link
                    prefetch={false}
                    className="customer-balance"
                    href={`/receber?q=${encodeURIComponent(c.name)}`}
                    aria-label={`Ver ${brl(open.toString())} a receber de ${c.name}`}
                  >
                    {brl(open.toString())}
                  </Link>
                )}
                {whatsapp && (
                  <div className="customer-contact">
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`WhatsApp de ${c.name}`}
                    >
                      <MessageCircle size={18} />
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>
          {query.q
            ? 'Nenhum cliente encontrado.'
            : 'Nenhum cliente cadastrado ainda.'}
        </Empty>
      )}
    </div>
  );
}
