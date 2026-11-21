'use client';
import { startTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Erro dentro do app: aparece no lugar do conteúdo, com o menu ainda
 * disponível, para a pessoa seguir para outra tela sem recarregar.
 */
export default function AppError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <section className="card" role="alert">
      <h1>Esta tela não carregou</h1>
      <p>
        Pode ser a conexão ou o servidor demorando. Seus registros não foram
        apagados. Tente de novo ou use o menu para ir a outra tela.
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
          Ir para Hoje
        </Link>
      </div>
    </section>
  );
}
