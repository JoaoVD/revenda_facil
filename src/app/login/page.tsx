import { Leaf } from 'lucide-react';
import { authConfigured } from '@/modules/auth/server';
import { LoginForm } from '@/components/auth-forms';
export const dynamic = 'force-dynamic';
export default async function Login() {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={18} strokeWidth={1.8} />
          </span>
          Revenda Fácil
        </div>
        <div>
          <h1>Pedidos, estoque e recebimentos da sua revenda.</h1>
          <p>Funciona no celular, mesmo sem internet.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <h2>Vamos começar?</h2>
          <p>Entre na sua conta.</p>
          <LoginForm configured={authConfigured()} />
        </div>
      </section>
    </main>
  );
}
