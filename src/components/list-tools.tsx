import Link from 'next/link';
import type { ReactNode } from 'react';

/** Parâmetros de busca já normalizados para texto. */
export type ListParams = Record<string, string | undefined>;
export type Option = readonly [value: string, label: string];

/** Monta um endereço preservando filtros; mudar filtro volta para a página 1. */
export function hrefWith(
  base: string,
  params: ListParams,
  changes: ListParams,
) {
  const next: ListParams = { ...params, ...changes };
  if (!('page' in changes)) delete next.page;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(next))
    if (value) search.set(key, value);
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}

/** Valor permitido de um filtro ou o padrão. */
export const pick = (
  value: string | undefined,
  options: readonly Option[],
  fallback = '',
) => (options.some(([v]) => v === value) ? value! : fallback);

export const PAGE_SIZE = 12;

/** Paginação em memória, para listas já filtradas no servidor. */
export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / size)),
    current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    pageCount,
    total: items.length,
  };
}

/**
 * Busca (formulário GET, funciona sem JavaScript) e grupos de filtros em
 * chips. Os demais filtros ativos são mantidos ao buscar.
 */
export function FilterBar({
  base,
  params,
  search,
  groups = [],
  extra,
  extraNames = [],
  activeCount,
}: {
  base: string;
  params: ListParams;
  search?: string;
  groups?: { name: string; label: string; options: readonly Option[] }[];
  /** Campos adicionais do formulário (ex.: mês) e seus nomes. */
  extra?: ReactNode;
  extraNames?: string[];
  activeCount?: number;
}) {
  const keep = Object.entries(params).filter(
    ([key, value]) =>
      value && key !== 'q' && key !== 'page' && !extraNames.includes(key),
  );
  const active =
    activeCount ??
    Object.entries(params).filter(([key, value]) => value && key !== 'page')
      .length;
  const chipGroup = (group: {
    name: string;
    label: string;
    options: readonly Option[];
  }) => {
    const current = params[group.name] || '';
    return (
      <nav key={group.name} className="filter-group" aria-label={group.label}>
        <span aria-hidden="true">{group.label}</span>
        <div className="chips">
          {group.options.map(([value, label]) => (
            <Link
              key={value || 'all'}
              prefetch={false}
              href={hrefWith(base, params, { [group.name]: value })}
              aria-current={current === value ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    );
  };
  return (
    <div className="filter-bar">
      {(search || extra) && (
        <form className="filter-search" role="search" action={base}>
          {keep.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          {search && (
            <input
              aria-label={search}
              placeholder={search}
              type="search"
              name="q"
              defaultValue={params.q}
            />
          )}
          {extra}
          <button className="small-button">Buscar</button>
        </form>
      )}
      {groups.slice(0, 1).map(chipGroup)}
      {groups.length > 1 && (
        <details
          className="filter-more"
          open={groups.slice(1).some((g) => params[g.name]) || undefined}
        >
          <summary>
            Mais filtros
            {(() => {
              const count = groups
                .slice(1)
                .filter((g) => params[g.name]).length;
              return count ? ` (${count} ativo${count > 1 ? 's' : ''})` : '';
            })()}
          </summary>
          <div>{groups.slice(1).map(chipGroup)}</div>
        </details>
      )}
      {active > 0 && (
        <Link prefetch={false} className="filter-clear" href={base}>
          Limpar filtros
        </Link>
      )}
    </div>
  );
}

/** Números de resumo; com href, o bloco aplica o filtro correspondente. */
export function StatTiles({
  items,
}: {
  items: {
    label: string;
    value: ReactNode;
    hint?: string;
    href?: string;
    tone?: 'ok' | 'warn' | 'danger';
    active?: boolean;
  }[];
}) {
  return (
    <div className="stat-tiles">
      {items.map((item) => {
        const body = (
          <>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            {item.hint && <span>{item.hint}</span>}
          </>
        );
        return item.href ? (
          <Link
            key={item.label}
            prefetch={false}
            href={item.href}
            className="stat-tile"
            data-tone={item.tone}
            aria-current={item.active ? 'page' : undefined}
          >
            {body}
          </Link>
        ) : (
          <div key={item.label} className="stat-tile" data-tone={item.tone}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Card de item com título, valor de destaque, fatos e rodapé. */
export function ItemCard({
  title,
  subtitle,
  value,
  valueHint,
  tag,
  tone,
  facts = [],
  href,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  valueHint?: ReactNode;
  tag?: ReactNode;
  tone?: 'ok' | 'warn' | 'danger' | 'muted' | 'in' | 'out';
  facts?: (readonly [label: string, value: ReactNode])[];
  href?: string;
  children?: ReactNode;
}) {
  return (
    <article className="item-card" data-tone={tone}>
      <header>
        <div>
          <h3>
            {href ? (
              <Link prefetch={false} href={href}>
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {value !== undefined && (
          <div className="item-value">
            <strong>{value}</strong>
            {valueHint && <small>{valueHint}</small>}
          </div>
        )}
      </header>
      {tag && <div className="item-tag">{tag}</div>}
      {facts.length > 0 && (
        <dl className="item-facts">
          {facts.map(([label, fact]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{fact}</dd>
            </div>
          ))}
        </dl>
      )}
      {children && <footer>{children}</footer>}
    </article>
  );
}

/** Paginação com total; desabilita avançar na última página. */
export function Pager({
  base,
  params,
  page,
  pageCount,
  total,
  noun,
}: {
  base: string;
  params: ListParams;
  page: number;
  pageCount: number;
  total: number;
  noun: readonly [singular: string, plural: string];
}) {
  if (!total) return null;
  return (
    <nav className="pagination" aria-label="Páginas">
      <Link
        prefetch={false}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        aria-label="Página anterior"
        href={hrefWith(base, params, { page: String(Math.max(1, page - 1)) })}
      >
        ‹
      </Link>
      <span>
        Página {page} de {pageCount} · {total} {total === 1 ? noun[0] : noun[1]}
      </span>
      <Link
        prefetch={false}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : undefined}
        aria-label="Próxima página"
        href={hrefWith(base, params, {
          page: String(Math.min(pageCount, page + 1)),
        })}
      >
        ›
      </Link>
    </nav>
  );
}

/** Lê os parâmetros da URL como texto simples. */
export function normalizeParams(
  raw: Record<string, string | string[] | undefined>,
): ListParams {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      (Array.isArray(value) ? value[0] : value)?.slice(0, 120),
    ]),
  );
}
