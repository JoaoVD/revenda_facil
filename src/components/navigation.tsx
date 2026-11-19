'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
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

type Tone =
  | 'orange'
  | 'red'
  | 'blue'
  | 'green'
  | 'pink'
  | 'teal'
  | 'indigo'
  | 'purple'
  | 'gray';
type NavLink = readonly [
  href: string,
  label: string,
  Icon: typeof Package,
  tone: Tone,
  group?: string,
];

/** Atalhos do dia a dia: ficam na barra de baixo no celular. */
const dailyLinks: readonly NavLink[] = [
  ['/', 'Hoje', CalendarCheck, 'orange'],
  ['/receber', 'Receber', Wallet, 'green'],
  ['/clientes', 'Clientes', Users, 'blue'],
];
/** No computador aparece no menu lateral; no celular está dentro de Hoje. */
const ordersLink: NavLink = ['/pedidos', 'Pedidos', ShoppingCart, 'teal'];
/** Demais telas: menu lateral no computador, folha "Mais" no celular. */
const otherLinks: readonly NavLink[] = [
  ['/estoque', 'Estoque', Package, 'indigo', 'Loja'],
  ['/produtos', 'Produtos', Tags, 'pink'],
  ['/compras', 'Compras', ShoppingBag, 'red'],
  ['/vendas', 'Vendas', Receipt, 'teal'],
  ['/financeiro', 'Financeiro', Landmark, 'green', 'Gestão'],
  ['/notas-fiscais', 'Notas fiscais', FileText, 'blue'],
  ['/relatorios', 'Relatórios', ChartNoAxesCombined, 'purple'],
  ['/dashboard', 'Resumo', LayoutGrid, 'orange'],
  ['/configuracoes', 'Configurações', Settings, 'gray'],
];

const allLinks = [...dailyLinks, ordersLink, ...otherLinks];

/** Título da tela atual, mostrado na barra superior. */
function titleFor(path: string) {
  if (path === '/pedidos/novo') return 'Novo pedido';
  const link = allLinks.find(([href]) => isActive(path, href));
  return link?.[1] ?? 'Revenda Fácil';
}

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
  /** `tab`: ícone simples da barra de abas; senão, quadradinho colorido do menu. */
  const item = (
    [href, label, Icon, tone]: NavLink,
    { className, tab = false }: { className?: string; tab?: boolean } = {},
  ) => (
    <Link
      prefetch={false}
      key={href}
      href={href}
      className={className}
      onClick={() => setOpen(false)}
      aria-current={isActive(path, href) ? 'page' : undefined}
    >
      {tab ? (
        <Icon size={22} aria-hidden="true" />
      ) : (
        <span className={`tile t-${tone}`} aria-hidden="true">
          <Icon size={15} strokeWidth={2.2} />
        </span>
      )}
      {label}
    </Link>
  );
  return (
    <>
      <header className="topbar">
        <Link prefetch={false} href="/" className="brand topbar-brand">
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={17} strokeWidth={2} />
          </span>
          Revenda Fácil
        </Link>
        <span className="crumb">{titleFor(path)}</span>
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
        <Link prefetch={false} href="/" className="app-id">
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={18} strokeWidth={2} />
          </span>
          <span>
            <b>Revenda Fácil</b>
            <small>{name}</small>
          </span>
        </Link>
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
          {dailyLinks.map((link) => item(link, { className: 'nav-daily' }))}
          {item(ordersLink, { className: 'nav-daily' })}
          {otherLinks.map((link) => (
            <Fragment key={link[0]}>
              {link[4] && <span className="nav-group">{link[4]}</span>}
              {item(link)}
            </Fragment>
          ))}
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
        {item(dailyLinks[0], { tab: true })}
        {item(dailyLinks[1], { tab: true })}
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
        {item(dailyLinks[2], { tab: true })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-current={
            allLinks
              .slice(dailyLinks.length)
              .some(([href]) => isActive(path, href))
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
