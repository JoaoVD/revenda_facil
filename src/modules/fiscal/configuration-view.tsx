import { db } from '@/lib/db';
import { Card } from '@/components/ui';
import type { Actor } from '@/modules/shared/contracts';
import {
  FiscalEmitterForm,
  FiscalProductForm,
  FiscalCustomerForm,
} from './configuration-forms';

function profile(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export async function FiscalConfiguration({ actor }: { actor: Actor }) {
  const [settings, products, customers] = await Promise.all([
    db.fiscalSettings.findUnique({
      where: { organizationId: actor.organizationId },
      select: { emitter: true },
    }),
    db.product.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, fiscalData: true },
    }),
    db.customer.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, fiscalAddress: true },
    }),
  ]);
  return (
    <Card>
      <h2>Fiscal · Focus NFe</h2>
      <p role="status">
        {process.env.FOCUS_NFE_TOKEN &&
        (process.env.FOCUS_NFE_ENVIRONMENT || 'homologacao') === 'homologacao'
          ? 'Credencial de homologação configurada no servidor. O aceite remoto ainda deve ser verificado pelo responsável.'
          : 'Integração pendente: configure o token de homologação Focus NFe no servidor.'}{' '}
        Produção bloqueada.
      </p>
      <p className="hint">
        Configure empresa, certificado, credenciamento e CSC aplicável no
        provedor com o responsável fiscal. Não informe senhas, certificado ou
        token nestes cadastros.
      </p>
      <p>
        Preencha os dados com o responsável fiscal. Salvar o cadastro não
        transmite documentos nem libera produção.
      </p>
      <details>
        <summary>Emitente — MEI de São Paulo</summary>
        <FiscalEmitterForm value={profile(settings?.emitter)} />
      </details>
      <details>
        <summary>Produtos — classificação e tributação</summary>
        <FiscalProductForm
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            profile: profile(p.fiscalData),
          }))}
        />
        <p className="table-note">
          Exibindo até 200 produtos em ordem alfabética.
        </p>
      </details>
      <details>
        <summary>Destinatário — identificação e endereço</summary>
        <FiscalCustomerForm
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            profile: profile(c.fiscalAddress),
          }))}
        />
        <p className="table-note">
          Exibindo até 200 clientes em ordem alfabética.
        </p>
      </details>
    </Card>
  );
}
