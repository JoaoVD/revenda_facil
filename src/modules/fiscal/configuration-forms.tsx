'use client';
import { useState } from 'react';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import {
  guidedTaxProfile,
  readGuidedTaxProfile,
  type TaxChoices,
} from './tax-profile';

type Profile = Record<string, unknown>;
type Choice = { id: string; name: string; profile: Profile | null };
const string = (value: unknown) => (typeof value === 'string' ? value : '');
const object = (value: unknown): Profile =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Profile)
    : {};
function AddressFields({
  value,
  emitter = false,
}: {
  value: Profile;
  emitter?: boolean;
}) {
  return (
    <div className="form-grid">
      <Field
        label="Logradouro"
        name="xLgr"
        defaultValue={string(value.xLgr)}
        required
        maxLength={120}
      />
      <Field
        label="Número"
        name="nro"
        defaultValue={string(value.nro)}
        required
        maxLength={120}
      />
      <Field
        label="Bairro"
        name="xBairro"
        defaultValue={string(value.xBairro)}
        required
        maxLength={120}
      />
      <Field
        label="Código IBGE do município (7 dígitos)"
        name="cMun"
        defaultValue={string(value.cMun)}
        required
        pattern="[0-9]{7}"
        inputMode="numeric"
      />
      <Field
        label="Município"
        name="xMun"
        defaultValue={string(value.xMun)}
        required
        maxLength={120}
      />
      <Field
        label="CEP (8 dígitos)"
        name="CEP"
        defaultValue={string(value.CEP)}
        required
        pattern="[0-9]{8}"
        inputMode="numeric"
      />
      {emitter ? (
        <>
          <Field label="UF do emitente" value="SP" readOnly />
          <input type="hidden" name="UF" value="SP" />
        </>
      ) : (
        <Select label="UF" name="UF" defaultValue={string(value.UF)} required>
          <option value="">Selecione</option>
          {'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'
            .split(' ')
            .map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
        </Select>
      )}
    </div>
  );
}
export function FiscalEmitterForm({ value }: { value: Profile | null }) {
  const profile = value ?? {};
  return (
    <OperationForm
      operation="fiscal-emitter"
      reset={false}
      button="Salvar emitente fiscal"
    >
      <Field
        label="Razão social fiscal"
        name="xNome"
        defaultValue={string(profile.xNome)}
        required
        maxLength={120}
      />
      <Field
        label="Inscrição estadual (somente números)"
        name="IE"
        defaultValue={string(profile.IE)}
        required
        pattern="[0-9]{2,14}"
      />
      <AddressFields value={object(profile.enderEmit)} emitter />
      <label className="field">
        <span>
          <input type="checkbox" name="confirmCRT4" required /> Confirmo com o
          responsável fiscal o enquadramento MEI, CRT 4.
        </span>
      </label>
      <p className="table-note">
        O CNPJ vem do cadastro da empresa. Certificado A1, senha e CSC são
        configurados no fluxo protegido do provedor.
      </p>
    </OperationForm>
  );
}
function TaxProfileFields({ initial }: { initial: unknown }) {
  const saved = readGuidedTaxProfile(initial);
  const [advanced, setAdvanced] = useState(Boolean(initial && !saved));
  const [choices, setChoices] = useState<TaxChoices>(
    saved || { origin: '', csosn: '', pis: '', cofins: '' },
  );
  const [json, setJson] = useState(
    initial ? JSON.stringify(initial, null, 2) : '',
  );
  const profile = guidedTaxProfile(choices);
  const select = (
    key: keyof TaxChoices,
    label: string,
    options: [string, string][],
  ) => (
    <Select
      label={label}
      value={choices[key]}
      required
      onChange={(event) =>
        setChoices({ ...choices, [key]: event.target.value })
      }
    >
      <option value="">Selecione com o responsável fiscal</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {value} · {text}
        </option>
      ))}
    </Select>
  );
  const contributions: [string, string][] = [
    ['04', 'Monofásica — revenda a alíquota zero'],
    ['05', 'Substituição tributária'],
    ['06', 'Alíquota zero'],
    ['07', 'Isenta'],
    ['08', 'Sem incidência'],
    ['09', 'Suspensão'],
  ];
  return (
    <section className="stack">
      <p className="hint">
        Escolha os códigos confirmados pelo contador. Nenhuma tributação é
        selecionada automaticamente.
      </p>
      {!advanced && (
        <>
          <div className="form-grid">
            {select('origin', 'Origem da mercadoria', [
              ['0', 'Nacional, exceto códigos específicos'],
              ['1', 'Estrangeira — importação direta'],
              ['2', 'Estrangeira — adquirida no mercado interno'],
              ['3', 'Nacional — conteúdo importado superior a 40% e até 70%'],
              ['4', 'Nacional — processos produtivos básicos'],
              ['5', 'Nacional — conteúdo importado até 40%'],
              ['6', 'Estrangeira — importação direta sem similar nacional'],
              ['7', 'Estrangeira — mercado interno sem similar nacional'],
              ['8', 'Nacional — conteúdo importado superior a 70%'],
            ])}
            {select('csosn', 'Situação tributária ICMS (CSOSN)', [
              ['102', 'Sem permissão de crédito'],
              ['300', 'Imune'],
              ['400', 'Não tributada pelo Simples Nacional'],
            ])}
            {select('pis', 'Situação tributária PIS', contributions)}
            {select('cofins', 'Situação tributária COFINS', contributions)}
          </div>
          <input
            type="hidden"
            name="imposto"
            value={JSON.stringify(profile || {})}
          />
        </>
      )}
      <details>
        <summary>Avançado · configuração tributária técnica</summary>
        <label>
          <input
            type="checkbox"
            checked={advanced}
            onChange={(event) => setAdvanced(event.target.checked)}
          />{' '}
          Usar configuração JSON revisada pelo responsável fiscal
        </label>
        {advanced && (
          <label className="field">
            <span>Objeto imposto em JSON</span>
            <textarea
              name="imposto"
              rows={10}
              maxLength={30000}
              required
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
          </label>
        )}
        <p className="hint">
          Outros perfis podem ser armazenados, mas a emissão fica bloqueada
          quando a integração ainda não suporta a operação.
        </p>
      </details>
    </section>
  );
}
export function FiscalProductForm({ products }: { products: Choice[] }) {
  const [selected, setSelected] = useState('');
  const profile = products.find((p) => p.id === selected)?.profile ?? {};
  return (
    <>
      <Select
        label="Produto para configurar"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Selecione um produto</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.profile ? ' · cadastrado' : ''}
          </option>
        ))}
      </Select>
      {selected && (
        <OperationForm
          key={selected}
          operation="fiscal-product"
          reset={false}
          button="Salvar dados fiscais do produto"
        >
          <input type="hidden" name="productId" value={selected} />
          <div className="form-grid">
            <Field
              label="NCM (8 dígitos)"
              name="NCM"
              defaultValue={string(profile.NCM)}
              required
              pattern="[0-9]{8}"
            />
            <Field
              label="CFOP (4 dígitos)"
              name="CFOP"
              defaultValue={string(profile.CFOP)}
              required
              pattern="[12567][0-9]{3}"
            />
            <Field
              label="Unidade comercial"
              name="uCom"
              defaultValue={string(profile.uCom)}
              required
              maxLength={6}
            />
            <Field
              label="Unidade tributável"
              name="uTrib"
              defaultValue={string(profile.uTrib)}
              required
              maxLength={6}
            />
          </div>
          <p className="table-note">
            As unidades devem ser iguais. A quantidade tributável será igual à
            quantidade comercial, sem conversão.
          </p>
          <TaxProfileFields initial={profile.imposto} />
        </OperationForm>
      )}
    </>
  );
}
export function FiscalCustomerForm({ customers }: { customers: Choice[] }) {
  const [selected, setSelected] = useState('');
  const customer = customers.find((c) => c.id === selected);
  const profile = customer?.profile ?? {};
  return (
    <>
      <Select
        label="Cliente para configurar (opcional)"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Selecione um cliente</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.profile ? ' · cadastrado' : ''}
          </option>
        ))}
      </Select>
      {selected && (
        <OperationForm
          key={selected}
          operation="fiscal-customer"
          reset={false}
          button="Salvar destinatário fiscal"
        >
          <input type="hidden" name="customerId" value={selected} />
          <Field
            label="CPF ou CNPJ (somente números)"
            name="document"
            defaultValue={string(profile.document)}
            required
            pattern="([0-9]{11}|[0-9]{14})"
          />
          <Field
            label="Nome / razão social fiscal"
            name="xNome"
            defaultValue={string(profile.xNome) || customer?.name}
            required
            maxLength={120}
          />
          <Select
            label="Indicador da inscrição estadual"
            name="indIEDest"
            defaultValue={profile.indIEDest ? String(profile.indIEDest) : ''}
            required
          >
            <option value="">Selecione com o responsável fiscal</option>
            <option value="1">1 — Contribuinte de ICMS</option>
            <option value="2">2 — Contribuinte isento de inscrição</option>
            <option value="9">9 — Não contribuinte</option>
          </Select>
          <Field
            label="Inscrição estadual (obrigatória para contribuinte)"
            name="IE"
            defaultValue={string(profile.IE)}
            pattern="[0-9]{2,14}"
          />
          <AddressFields value={object(profile.enderDest)} />
        </OperationForm>
      )}
    </>
  );
}
