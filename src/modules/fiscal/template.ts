import { buildFiscalTemplate, type FiscalSale } from './payload';
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function configuredFiscalTemplate(
  sale: FiscalSale,
  cnpj: string,
  model: '55' | '65',
  configuration: {
    emitter?: unknown;
    products?: Record<string, unknown>;
    customer?: unknown;
  },
) {
  const template = buildFiscalTemplate(sale, cnpj, model);
  const info = template.infNFe as Record<string, unknown>;
  if (configuration.emitter)
    info.emit = { ...object(configuration.emitter), CNPJ: cnpj };
  const customer = object(configuration.customer);
  if (typeof customer.document === 'string') {
    const { document, ...rest } = customer;
    info.dest = {
      ...rest,
      [document.length === 11 ? 'CPF' : 'CNPJ']: document,
    };
  }
  const details = info.det as Array<{
    prod: Record<string, unknown>;
    imposto: unknown;
  }>;
  sale.items.forEach((item, index) => {
    const config = object(configuration.products?.[item.productId]);
    if (!Object.keys(config).length) return;
    const { imposto, ...product } = config;
    details[index].prod = {
      ...details[index].prod,
      ...product,
      qTrib: item.quantity,
      vUnTrib: item.unitPrice,
    };
    details[index].imposto = imposto;
  });
  return template;
}
