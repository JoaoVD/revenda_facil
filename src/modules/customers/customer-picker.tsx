'use client';
import { Field } from '@/components/ui';
export function CustomerPicker({
  customers,
  name,
  selectedId,
  phone,
  forceNew,
  onName,
  onSelect,
  onPhone,
  onForceNew,
}: {
  customers: { id: string; name: string; phone?: string | null }[];
  name: string;
  selectedId: string;
  phone: string;
  forceNew: boolean;
  onName: (value: string) => void;
  onSelect: (id: string, name: string) => void;
  onPhone: (value: string) => void;
  onForceNew: () => void;
}) {
  const matches =
    name.trim().length >= 2
      ? customers
          .filter((c) =>
            c.name
              .toLocaleLowerCase('pt-BR')
              .includes(name.trim().toLocaleLowerCase('pt-BR')),
          )
          .slice(0, 8)
      : [];
  return (
    <div className="stack customer-picker">
      <Field
        label="Cliente"
        value={name}
        maxLength={120}
        autoComplete="off"
        placeholder="Digite o nome ou busque um cliente"
        onChange={(e) => onName(e.target.value)}
      />
      {!selectedId && !forceNew && matches.length > 0 && (
        <div className="stack" role="group" aria-label="Clientes encontrados">
          {matches.map((c) => (
            <button
              type="button"
              className="small-button"
              key={c.id}
              onClick={() => onSelect(c.id, c.name)}
            >
              Selecionar {c.name}
              {c.phone ? ` · ${c.phone}` : ''}
            </button>
          ))}
          <button className="text-link" type="button" onClick={onForceNew}>
            É outra pessoa: criar cliente com este nome
          </button>
        </div>
      )}
      {selectedId ? (
        <p className="hint">
          Cliente existente selecionado. Para trocar, altere o nome acima.
        </p>
      ) : (
        name.trim() && (
          <>
            <p className="hint">
              {!forceNew && matches.length
                ? 'Escolha o cadastro correto ou confirme que é outra pessoa.'
                : 'Este cliente será cadastrado junto com o pedido, sem sair desta tela.'}
            </p>
            <Field
              label="Telefone do novo cliente (opcional)"
              type="tel"
              value={phone}
              maxLength={20}
              onChange={(e) => onPhone(e.target.value)}
            />
          </>
        )
      )}
      {!name.trim() && (
        <p className="hint">
          Pode deixar em branco para venda imediata totalmente paga.
        </p>
      )}
    </div>
  );
}
