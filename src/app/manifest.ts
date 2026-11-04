import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Revenda Fácil',
    short_name: 'Revenda Fácil',
    lang: 'pt-BR',
    start_url: '/meu-dia',
    display: 'standalone',
    background_color: '#FAF9F5',
    theme_color: '#214B38',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
