'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  ShoppingCart,
  Wallet,
  Users,
  Plus,
  Menu,
  X,
  Package,
  Tags,
  ShoppingBag,
  Receipt,
  Landmark,
  FileText,
  ChartNoAxesCombined,
  LayoutGrid,
  Settings,
  LogOut,
  Leaf,
} from 'lucide-react';
import { logoutAction } from '@/app/actions';
import { lockLocalAccount } from '@/modules/sync/local-store';
import { SyncStatus } from '@/components/sync-status';

type NavLink = readonly [href: string, label: string, Icon: typeof Package];

/** Atalhos do dia a dia: ficam na barra de baixo no celular. */
const dailyLinks: readonly NavLink[] = [
  ['/', 'Hoje', CalendarCheck],
  ['/receber', 'Receber', Wallet],
  ['/clientes', 'Clientes', Users],
];
/** No computador aparece no menu lateral; no celular está dentro de Hoje. */
const ordersLink: NavLink = ['/pedidos', 'Pedidos', ShoppingCart];
/** Demais telas: menu lateral no computador, folha "Mais" no celular. */
const otherLinks: readonly NavLink[] = [
  ['/estoque', 'Estoque', Package],
  ['/produtos', 'Produtos', Tags],
  ['/compras', 'Compras', ShoppingBag],
  ['/vendas', 'Vendas', Receipt],
  ['/financeiro', 'Financeiro', Landmark],
  ['/notas-fiscais', 'Notas fiscais', FileText],
  ['/relatorios', 'Relatórios', ChartNoAxesCombined],
  ['/dashboard', 'Resumo', LayoutGrid],
  ['/configuracoes', 'Configurações', Settings],
];

function isActive(path: string, href: string) {
  if (href === '/') return path === '/' || path === '/meu-dia';
  if (href === '/pedidos')
    return path === '/pedidos' || /^\/pedidos\/(?!novo$)/.test(path);
  return path === href || path.startsWith(`${href}/`);
}

export function Navigation({
  name,
  owner,
  userId,
  organizationId,
}: {
  name: string;
  owner: string;
  userId: string;
  organizationId: string;
}) {
  const path = usePathname(),
    [open, setOpen] = useState(false),
    closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);
  const item = ([href, label, Icon]: NavLink, className = '') => (
    <Link
      prefetch={false}
      key={href}
      href={href}
      className={className || undefined}
      onClick={() => setOpen(false)}
      aria-current={isActive(path, href) ? 'page' : undefined}
    >
      <Icon size={19} />
      {label}
    </Link>
  );
  return (
    <>
      <header className="topbar">
        <Link prefetch={false} href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={18} strokeWidth={1.8} />
          </span>
          Revenda Fácil
        </Link>
        <SyncStatus userId={userId} organizationId={organizationId} />
        <div className="profile">
          <span className="avatar" aria-hidden="true">
            {owner.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{owner}</strong>
            <small>{name}</small>
          </div>
        </div>
      </header>
      <aside
        className={open ? 'sidebar is-open' : 'sidebar'}
        aria-label="Menu"
        {...(open ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        <div className="sheet-head">
          <div>
            <strong>{owner}</strong>
            <small>{name}</small>
          </div>
          <button
            type="button"
            className="icon-btn sheet-close"
            ref={closeButton}
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <Link
          prefetch={false}
          href="/pedidos/novo"
          className="button sidebar-new"
        >
          <Plus size={18} />
          Novo pedido
        </Link>
        <nav aria-label="Navegação principal">
          {dailyLinks.map((link) => item(link, 'nav-daily'))}
          {item(ordersLink, 'nav-daily')}
          <hr />
          {otherLinks.map((link) => item(link))}
        </nav>
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
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}
      <nav className="bottom-nav" aria-label="Atalhos">
        {item(dailyLinks[0])}
        {item(dailyLinks[1])}
        <Link
          prefetch={false}
          href="/pedidos/novo"
          className="bottom-new"
          aria-current={path === '/pedidos/novo' ? 'page' : undefined}
        >
          <span>
            <Plus size={24} strokeWidth={2.4} />
          </span>
          Pedido
        </Link>
        {item(dailyLinks[2])}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-current={
            [ordersLink, ...otherLinks].some(([href]) => isActive(path, href))
              ? 'page'
              : undefined
          }
        >
          <Menu size={21} />
          Mais
        </button>
      </nav>
    </>
  );
}
