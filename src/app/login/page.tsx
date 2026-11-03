import { Leaf, Check } from 'lucide-react';
import { authConfigured } from '@/modules/auth/server';
import { LoginForm } from '@/components/auth-forms';
export const dynamic = 'force-dynamic';
export default async function Login() {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <Leaf />
          <strong>Revenda Fácil</strong>
        </div>
        <div>
          <p className="eyebrow">CUIDE DO QUE É SEU</p>
          <h1>
            Sua revenda.
            <br />
            Tudo em ordem.
          </h1>
          <p>
            Menos contas espalhadas.
            <br />
            Mais tempo para fazer seu negócio florescer.
          </p>
          <ul>
            {[
              'Estoque sempre à mão',
              'Vendas e recebimentos organizados',
              'Uma visão simples do seu dinheiro',
            ].map((x) => (
              <li key={x}>
                <Check size={18} />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <small>Feito para o dia a dia de quem revende.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <span className="badge">BEM-VINDA À SUA REVENDA</span>
          <h2>Vamos começar?</h2>
          <p>Entre para cuidar do seu negócio.</p>
          <LoginForm configured={authConfigured()} />
        </div>
      </section>
    </main>
  );
}
