'use client';

import { useRef, useState } from 'react';
import { Barcode, FileUp } from 'lucide-react';
import { CameraScanButton } from '@/components/camera-scanner';
import { Field, Select } from '@/components/ui';
import { brl, D } from '@/lib/money';
import {
  MAX_XML_BYTES,
  type InvoiceDraft,
  type InvoiceSelection,
} from './invoice-contracts';
import { describeNfeKey, extractNfeKey } from './nfe-key';
import {
  checkPurchaseInvoiceKey,
  loadPurchaseInvoice,
  registerPurchaseInvoice,
  searchPurchaseProducts,
} from './invoice-actions';

type LoadedInvoice = {
  draft: InvoiceDraft;
  xml: string;
  expectedKey?: string;
  idempotencyKey: string;
};
const NEW = 'new';

export function PurchaseInvoiceForm({
  focusEnabled,
}: {
  focusEnabled: boolean;
}) {
  const [accessKey, setAccessKey] = useState('');
  /** Chave lida no DANFE, aguardando o XML (sem Focus). */
  const [scannedKey, setScannedKey] = useState<string>();
  const [loaded, setLoaded] = useState<LoadedInvoice>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await work();
    } catch {
      setMessage({
        ok: false,
        text: 'Não foi possível concluir. Confira o arquivo ou a conexão e tente novamente.',
      });
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function load(source: 'xml' | 'key', value: string) {
    const result = await loadPurchaseInvoice(source, value, scannedKey);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    setLoaded({
      ...result,
      ...(source === 'key' || scannedKey
        ? { expectedKey: result.draft.accessKey }
        : {}),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  /** Leitor USB, câmera ou digitação: identifica a nota pela chave. */
  function identifyKey(text: string) {
    const key = extractNfeKey(text);
    if (!key) {
      setMessage({
        ok: false,
        text: 'Não reconheci a chave da NF-e. Confira os 44 dígitos do DANFE.',
      });
      return;
    }
    setAccessKey(key);
    void run(async () => {
      if (focusEnabled) return load('key', key);
      const check = await checkPurchaseInvoiceKey(key);
      if (!check.ok) {
        setMessage({ ok: false, text: check.message ?? '' });
        return;
      }
      setScannedKey(key);
    });
  }

  const details = scannedKey && describeNfeKey(scannedKey);

  return (
    <div className="stack">
      {!loaded ? (
        <>
          {!details ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                identifyKey(accessKey);
              }}
            >
              <Field
                label="Chave da nota (código de barras do DANFE)"
                inputMode="numeric"
                autoComplete="off"
                maxLength={300}
                value={accessKey}
                onChange={(event) => {
                  const value = event.target.value;
                  setAccessKey(value);
                  // Leitores sem Enter no final: a chave completa já basta.
                  if (!busy && extractNfeKey(value)) identifyKey(value);
                }}
                placeholder="Passe no leitor ou digite os 44 dígitos"
              />
              <div className="ux-actions">
                <button
                  type="submit"
                  className="button"
                  disabled={busy || !extractNfeKey(accessKey)}
                >
                  <Barcode size={18} aria-hidden />
                  {focusEnabled ? 'Buscar nota' : 'Identificar nota'}
                </button>
                <CameraScanButton
                  kind="invoice"
                  title="Ler código da nota"
                  accept={(value) => extractNfeKey(value) !== null}
                  onDetected={identifyKey}
                />
              </div>
              {!focusEnabled && (
                <p className="hint">
                  O código identifica a nota; os produtos vêm do XML, que o
                  fornecedor envia por e-mail ou deixa no portal. Nenhum serviço
                  externo é usado.
                </p>
              )}
            </form>
          ) : (
            <div className="notice">
              <strong>Nota identificada</strong>
              <p>
                NF-e nº {details.number}, série {details.series}, emitida em{' '}
                {details.issued} ({details.state})
                <br />
                Fornecedor: CNPJ {details.supplierDocument}
              </p>
              <p className="hint wrap-anywhere">{scannedKey}</p>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={() => {
                  setScannedKey(undefined);
                  setAccessKey('');
                  setMessage(undefined);
                }}
              >
                Ler outra nota
              </button>
            </div>
          )}
          <label className="field">
            <span>
              <FileUp size={17} aria-hidden className="inline mr-2" />
              {details
                ? 'Agora importe o XML desta nota'
                : 'Importar XML da NF-e'}
            </span>
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file)
                  void run(async () => {
                    if (file.size > MAX_XML_BYTES) {
                      setMessage({
                        ok: false,
                        text: 'Selecione um XML de até 250 KB.',
                      });
                      return;
                    }
                    const bytes = await file.arrayBuffer();
                    const header = new TextDecoder().decode(
                      bytes.slice(0, 200),
                    );
                    const encoding =
                      /encoding=["'](ISO-8859-1|windows-1252)["']/i.test(header)
                        ? 'windows-1252'
                        : 'utf-8';
                    const xml = new TextDecoder(encoding, {
                      fatal: true,
                    }).decode(bytes);
                    await load('xml', xml);
                  });
              }}
            />
          </label>
          {busy && (
            <p role="status" className="hint">
              Lendo a nota…
            </p>
          )}
        </>
      ) : (
        <InvoiceReview
          invoice={loaded.draft}
          busy={busy}
          onBack={() => {
            setLoaded(undefined);
            setMessage(undefined);
          }}
          onConfirm={(items) =>
            void run(async () => {
              const result = await registerPurchaseInvoice({
                xml: loaded.xml,
                expectedKey: loaded.expectedKey,
                idempotencyKey: loaded.idempotencyKey,
                items,
              });
              setMessage({ ok: result.ok, text: result.message });
              if (result.ok) {
                setLoaded(undefined);
                setAccessKey('');
                setScannedKey(undefined);
              }
            })
          }
        />
      )}
      {message && (
        <p role="status" className={message.ok ? 'success' : 'error'}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function InvoiceReview({
  invoice,
  busy,
  onBack,
  onConfirm,
}: {
  invoice: InvoiceDraft;
  busy: boolean;
  onBack: () => void;
  onConfirm: (items: InvoiceSelection[]) => void;
}) {
  const [products, setProducts] = useState(invoice.products);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [matches, setMatches] = useState(
    invoice.items.map((item) => item.matchedProductId),
  );
  const [conversions, setConversions] = useState(
    invoice.items.map((item) => item.unitsPerPackage?.toString() ?? ''),
  );

  async function searchCatalog() {
    if (searching || !search.trim()) return;
    setSearching(true);
    try {
      const results = await searchPurchaseProducts(search);
      setProducts((current) => [
        ...new Map(
          [...results, ...current].map((product) => [product.id, product]),
        ).values(),
      ]);
      setSearchMessage(
        results.length
          ? 'Produtos encontrados adicionados às listas de vínculo.'
          : 'Nenhum produto encontrado.',
      );
    } catch {
      setSearchMessage('Não foi possível buscar no catálogo.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onConfirm(
          invoice.items.map((item, index) => ({
            line: item.line,
            unitsPerPackage: Number(conversions[index]),
            product:
              matches[index] === NEW
                ? {
                    kind: 'new',
                    name: String(data.get('name-' + item.line)),
                    salePrice: String(data.get('price-' + item.line)),
                  }
                : { kind: 'existing', id: matches[index] },
          })),
        );
      }}
    >
      <div className="notice">
        <strong>{invoice.supplier}</strong>
        <p>
          {invoice.date.split('-').reverse().join('/')} · {invoice.items.length}{' '}
          itens · {brl(invoice.total)}
        </p>
        <p className="hint wrap-anywhere">{invoice.accessKey}</p>
      </div>
      <p className="hint">
        Confira os produtos, a mercadoria recebida e as unidades por embalagem.
        O pagamento fica para o Financeiro.
      </p>
      {invoice.allocations && (
        <p className="hint">
          A diferença entre os custos das linhas e o total da nota foi rateada
          entre os itens.
        </p>
      )}
      <details className="ux-optional">
        <summary>Buscar outro produto no catálogo</summary>
        <div className="stack">
          <Field
            label="Nome, SKU ou código de barras"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void searchCatalog();
              }
            }}
          />
          <button
            type="button"
            className="small-button"
            disabled={searching || !search.trim()}
            onClick={() => void searchCatalog()}
          >
            {searching ? 'Buscando…' : 'Buscar produto'}
          </button>
          {searchMessage && (
            <p role="status" className="hint">
              {searchMessage}
            </p>
          )}
        </div>
      </details>
      {invoice.items.map((item, index) => {
        const units = /^\d+$/.test(conversions[index])
          ? D(item.quantity).mul(conversions[index])
          : null;
        return (
          <fieldset
            key={item.line}
            className="stack rounded-lg border p-3 min-w-0"
          >
            <legend className="font-semibold">
              {item.line}. {item.name}
            </legend>
            <p className="hint">
              Na nota, {item.quantity} {item.unit} · {brl(item.lineCost)} ·
              Código {item.barcode || item.code}
            </p>
            {item.needsReview && (
              <p className="hint">
                Confira o vínculo. O catálogo contém um código ambíguo, inativo
                ou diferente do vínculo salvo.
              </p>
            )}
            <div className="form-grid">
              <Select
                label="Produto no estoque"
                required
                value={matches[index]}
                onChange={(event) => {
                  const value = event.target.value;
                  setMatches((current) =>
                    current.map((id, i) => (i === index ? value : id)),
                  );
                }}
              >
                <option value="">Selecione o produto</option>
                <option value={NEW}>Cadastrar como novo</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.sku}
                  </option>
                ))}
              </Select>
              <Field
                label={'Unidades de estoque por ' + item.unit}
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                value={conversions[index]}
                onChange={(event) => {
                  const value = event.target.value;
                  setConversions((current) =>
                    current.map((conversion, i) =>
                      i === index ? value : conversion,
                    ),
                  );
                }}
              />
            </div>
            <p className="hint">
              {units?.gt(0)
                ? 'Entrada de ' +
                  units.toString() +
                  ' un. · ' +
                  brl(D(item.lineCost).div(units)) +
                  ' por un.'
                : 'Informe a conversão para ver a entrada no estoque.'}
            </p>
            {matches[index] === NEW && (
              <div className="stack">
                <strong>Cadastro com os dados da nota</strong>
                <Field
                  label="Nome do produto"
                  name={'name-' + item.line}
                  defaultValue={item.name}
                  required
                  minLength={2}
                  maxLength={120}
                />
                <dl className="item-facts">
                  <div>
                    <dt>Quantidade que entra</dt>
                    <dd>{units?.gt(0) ? units.toString() + ' un.' : '—'}</dd>
                  </div>
                  <div>
                    <dt>Custo por unidade</dt>
                    <dd>
                      {units?.gt(0) ? brl(D(item.lineCost).div(units)) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Custo total na nota</dt>
                    <dd>{brl(item.lineCost)}</dd>
                  </div>
                </dl>
                <Field
                  label="Preço de revenda (R$), opcional"
                  name={'price-' + item.line}
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                />
                <p className="hint">
                  Pode deixar em branco e definir depois em Produtos → Editar.
                  Sem preço, o produto não aparece nas vendas e pedidos.
                </p>
              </div>
            )}
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Confirmando…' : 'Confirmar entrada no estoque'}
        </button>
        <button
          type="button"
          className="small-button"
          disabled={busy}
          onClick={onBack}
        >
          Voltar
        </button>
      </div>
    </form>
  );
}
