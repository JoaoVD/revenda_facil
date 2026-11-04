import { createECDH } from 'node:crypto';
import webpush from 'web-push';
import { allowedPushEndpoint, pushKeys } from './push-contracts';
import type { PushSender } from './service';

export type PushConfiguration = {
  publicKey: string;
  privateKey: string;
  subject: string;
};
export function pushConfiguration(): PushConfiguration | null {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const subject = process.env.WEB_PUSH_SUBJECT || '';
  try {
    if (
      !/^[A-Za-z0-9_-]+$/.test(publicKey) ||
      !/^[A-Za-z0-9_-]+$/.test(privateKey)
    )
      return null;
    if (Buffer.from(privateKey, 'base64url').length !== 32) return null;
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (key.getPublicKey().toString('base64url') !== publicKey) return null;
    const url = new URL(subject);
    if (url.protocol === 'mailto:') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname)) return null;
    } else if (
      url.protocol !== 'https:' ||
      url.hostname === 'localhost' ||
      url.username ||
      url.password
    )
      return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}
export function createPushSender(config: PushConfiguration): PushSender {
  return async (subscription, payload) => {
    if (
      !allowedPushEndpoint(subscription.endpoint) ||
      subscription.vapidPublicKey !== config.publicKey
    )
      return { statusCode: 410 };
    const keys = pushKeys.safeParse(subscription.keys);
    if (!keys.success) return { statusCode: 410 };
    try {
      const result = await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: keys.data },
        payload,
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
          TTL: 86400,
          timeout: 10000,
          urgency: 'normal',
          topic: 'receivables-review',
        },
      );
      return { statusCode: result.statusCode };
    } catch (error) {
      // Nunca retornar corpo, endpoint, chaves ou mensagens do provedor.
      if (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
      )
        return { statusCode: error.statusCode };
      throw new Error('Serviço de notificações temporariamente indisponível.');
    }
  };
}
