import { headers } from 'next/headers';

/**
 * Celular pelo Client Hint (Chrome/Edge no Android) ou pelo user agent
 * (iPhone, Android com "Mobile"). Tablets e computadores contam como tela grande.
 * Serve só para evitar consultas que o celular não mostra; o layout continua
 * decidido pelo CSS.
 */
export function isPhone(userAgent: string | null, chMobile: string | null) {
  if (chMobile === '?1') return true;
  if (chMobile === '?0') return false;
  return /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(userAgent || '');
}

export async function isPhoneRequest() {
  const list = await headers();
  return isPhone(list.get('user-agent'), list.get('sec-ch-ua-mobile'));
}
