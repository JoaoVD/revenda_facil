'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="onboarding card">
      <h1>Não conseguimos carregar esta página</h1>
      <p>
        Confira a conexão e a configuração do banco. Seus registros não foram
        apagados.
      </p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
