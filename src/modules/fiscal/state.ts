import { createHash } from 'node:crypto';
export function fiscalPayloadHash(payload: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, canonical(child)]),
      );
    return value;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
}

export function remoteFiscalState(data: {
  status: string;
  chave?: string | null;
  autorizacao?: { numero_protocolo?: string | null } | null;
}) {
  switch (data.status) {
    case 'autorizado':
      return typeof data.chave === 'string' &&
        /^\d{44}$/.test(data.chave) &&
        typeof data.autorizacao?.numero_protocolo === 'string' &&
        /^\d{15,17}$/.test(data.autorizacao.numero_protocolo)
        ? 'AUTHORIZED'
        : 'UNKNOWN';
    case 'cancelado':
      return 'CANCELLED';
    case 'rejeitado':
      return 'REJECTED';
    case 'denegado':
      return 'UNKNOWN'; // Exige revisão específica; não libera correção/reemissão.
    case 'pendente':
    case 'processando':
      return 'PROCESSING';
    default:
      return 'UNKNOWN';
  }
}
