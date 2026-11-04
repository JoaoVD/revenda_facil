import { z } from 'zod';

// Não transformar inscrições em URLs arbitrárias de saída do backend (SSRF).
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.pathname !== '/' || Boolean(url.search)) &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname.endsWith('.push.apple.com') ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}
export const pushEndpoint = z
  .string()
  .max(2048)
  .refine(allowedPushEndpoint, 'Serviço de notificações não suportado.');
const encodedKey = (bytes: number) =>
  z
    .string()
    .max(128)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/)
    .refine(
      (value) => Buffer.from(value, 'base64url').length === bytes,
      'Chave de inscrição inválida.',
    );
export const pushKeys = z.object({
  p256dh: encodedKey(65),
  auth: encodedKey(16),
});
export const pushSubscriptionInput = z.object({
  endpoint: pushEndpoint,
  keys: pushKeys,
});
