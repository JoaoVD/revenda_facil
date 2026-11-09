/**
 * Link do WhatsApp para um telefone brasileiro. Aceita com ou sem DDI 55,
 * máscara e espaços. Retorna null quando não há número utilizável.
 */
export function whatsappLink(phone: string | null | undefined, text?: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Primeiro nome, para mensagens mais pessoais. */
export const firstName = (name: string | null | undefined) =>
  (name || '').trim().split(/\s+/)[0] || '';
