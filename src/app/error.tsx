'use client';
import { startTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Falha ao carregar: "Tentar novamente" busca de novo no servidor (não só
 * redesenha), e sempre há uma saída para o início sem recarregar o navegador.
 */
export default function ErrorPage({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <main className="onboarding card">
      <h1>Não conseguimos carregar esta página</h1>
      <p>
        Pode ser a conexão ou o servidor demorando. Seus registros não foram
        apagados.
      </p>
      <div className="ux-actions">
        <button
          className="button"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Tentar novamente
        </button>
        <Link prefetch={false} href="/" className="small-button">
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
