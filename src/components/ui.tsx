import { Children, cloneElement, isValidElement } from 'react';
import type {
  ReactElement,
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn('card', className)}>{children}</section>;
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={props['aria-label'] || label} {...props}>
        {children}
      </select>
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
type CellProps = { children?: ReactNode; 'data-label'?: string };
/** Repete o cabeçalho em cada célula (data-label) para o celular mostrar linhas legíveis. */
function labelRow(row: ReactNode, headers: string[]): ReactNode {
  if (!isValidElement<CellProps>(row) || row.type !== 'tr') return row;
  let index = 0;
  return cloneElement(
    row,
    undefined,
    Children.map(row.props.children, (cell) => {
      if (!isValidElement<CellProps>(cell) || cell.type !== 'td') return cell;
      const label = headers[index++];
      return label
        ? cloneElement(cell as ReactElement<CellProps>, { 'data-label': label })
        : cell;
    }),
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{Children.map(children, (row) => labelRow(row, headers))}</tbody>
      </table>
    </div>
  );
}
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Escolha única com botões grandes de toque (rádios nativos estilizados).
 * Substitui listas suspensas quando há poucas opções.
 */
export function ChoiceGroup<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: readonly (readonly [value: T, label: string])[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend>{label}</legend>
      <div>
        {options.map(([option, text]) => (
          <label key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
