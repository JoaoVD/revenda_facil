import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Revenda Fácil | Gestão com leveza',
  description: 'Estoque, vendas e dinheiro da sua revenda, em um só lugar.',
  appleWebApp: {
    capable: true,
    title: 'Revenda Fácil',
    statusBarStyle: 'default',
  },
  icons: { apple: '/apple-touch-icon.png' },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
