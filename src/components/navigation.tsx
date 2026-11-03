'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tags,
  ShoppingBag,
  Users,
  Wallet,
  FileText,
  ChartNoAxesCombined,
  Settings,
  Leaf,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { logoutAction } from '@/app/actions';
import { lockLocalAccount } from '@/modules/sync/local-store';
const links = [
  ['/dashboard', 'Dashboard', LayoutDashboard],
  ['/pedidos', 'Pedidos e vendas', ShoppingCart],
  ['/estoque', 'Estoque', Package],
  ['/produtos', 'Produtos', Tags],
  ['/compras', 'Compras', ShoppingBag],
  ['/clientes', 'Clientes', Users],
  ['/financeiro', 'Financeiro', Wallet],
  ['/notas-fiscais', 'Notas Fiscais', FileText],
  ['/relatorios', 'Relatórios', ChartNoAxesCombined],
  ['/configuracoes', 'Configurações', Settings],
] as const;
const secondaryLinks = [
  ['/meu-dia', 'Meu dia', LayoutDashboard],
  ['/receber', 'Valores a receber', Wallet],
] as const;
const mobileLinks = [
  ['/meu-dia', 'Início', LayoutDashboard],
  ['/pedidos', 'Pedidos', ShoppingCart],
  ['/receber', 'Receber', Wallet],
] as const;
export function Navigation({ name, owner }: { name: string; owner: string }) {
  const pathname = usePathname(),
    path = pathname === '/' ? '/dashboard' : pathname,
    [open, setOpen] = useState(false);
  return (
    <>
      <header className="topbar">
        <button
          className="mobile-menu icon-btn"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Leaf size={29} strokeWidth={1.5} />
          </span>
          <strong>
            Revenda Fácil<span>GESTÃO COM LEVEZA</span>
          </strong>
        </Link>
        <div className="topbar-note">Um cuidado a mais com o seu negócio.</div>
        <div className="profile">
          <span className="avatar">{owner.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{owner}</strong>
            <small>{name}</small>
          </div>
        </div>
      </header>
      <aside className={open ? 'sidebar is-open' : 'sidebar'}>
        <nav aria-label="Navegação principal">
          <span className="nav-section-label">Sua rotina</span>
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={path === href ? 'page' : undefined}
              className={path === href ? 'active' : ''}
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
          <details
            key={path}
            className="ux-nav-group"
            open={secondaryLinks.some(
              ([href]) => path === href || path.startsWith(`${href}/`),
            )}
          >
            <summary>Outros atalhos</summary>
            {secondaryLinks.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={path === href ? 'page' : undefined}
                className={path === href ? 'active' : ''}
              >
                <Icon size={20} />
                {label}
              </Link>
            ))}
          </details>
        </nav>
        <div className="nav-context">
          <Leaf size={18} />
          <span>Seu negócio, bem cuidado.</span>
        </div>
        <form
          action={async () => {
            await lockLocalAccount();
            await logoutAction();
          }}
        >
          <button className="logout">
            <LogOut size={16} />
            Sair da conta
          </button>
        </form>
      </aside>
      {open && (
        <button
          className="menu-backdrop"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <nav className="bottom-nav" aria-label="Atalhos">
        {mobileLinks.map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? 'page' : undefined}
          >
            <Icon size={21} />
            {label}
          </Link>
        ))}
        <button onClick={() => setOpen(true)}>
          <Menu size={21} />
          Mais
        </button>
      </nav>
    </>
  );
}
