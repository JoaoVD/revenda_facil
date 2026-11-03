import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="onboarding card">
      <h1>Página não encontrada</h1>
      <Link href="/">Voltar para o início</Link>
    </main>
  );
}
