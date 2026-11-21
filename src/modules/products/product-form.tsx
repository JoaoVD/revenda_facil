'use client';
import { useRef } from 'react';
import { CameraScanButton } from '@/components/camera-scanner';
import { OperationForm } from '@/components/operation-form';
import { Field } from '@/components/ui';
/** Dados atuais do produto para a edição (valores já como texto). */
export type EditableProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  category: string;
  description: string;
  referenceCost: string;
  salePrice: string;
  minimumStock: number;
  active: boolean;
};

/** Cadastro novo ou, com `product`, edição do cadastro existente. */
export function ProductForm({
  initialBarcode = '',
  product,
}: { initialBarcode?: string; product?: EditableProduct } = {}) {
  const editing = Boolean(product);
  const barcodeArea = useRef<HTMLDivElement>(null);
  function fillSku(barcode: HTMLInputElement) {
    const sku = barcode.form?.querySelector<HTMLInputElement>('[name="sku"]');
    if (sku && !sku.value.trim()) sku.value = barcode.value.trim();
  }
  /** Código lido pela câmera: preenche como se viesse do leitor USB. */
  function applyScanned(value: string) {
    const input =
      barcodeArea.current?.querySelector<HTMLInputElement>('[name="barcode"]');
    if (!input) return;
    input.value = value.trim().slice(0, 30);
    fillSku(input);
    input.form?.querySelector<HTMLInputElement>('[name="name"]')?.focus();
  }
  return (
    <OperationForm
      operation={editing ? 'product-edit' : 'product'}
      button={editing ? 'Salvar alterações' : 'Cadastrar produto'}
      reset={!editing}
      // Edição salva: fecha a janela; a lista já volta atualizada do servidor.
      onSuccess={
        editing
          ? () => barcodeArea.current?.closest('dialog')?.close()
          : undefined
      }
    >
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="stack" ref={barcodeArea}>
        <Field
          label="Código de barras (opcional)"
          name="barcode"
          defaultValue={product?.barcode ?? initialBarcode}
          maxLength={30}
          placeholder="Passe o produto no leitor ou digite o código"
          onBlur={(event) => fillSku(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            fillSku(event.currentTarget);
            event.currentTarget.form
              ?.querySelector<HTMLInputElement>('[name="name"]')
              ?.focus();
          }}
        />
        <CameraScanButton
          kind="product"
          label="Ler código com a câmera"
          title="Ler código do produto"
          onDetected={applyScanned}
        />
      </div>
      <Field
        label="Nome do produto"
        name="name"
        defaultValue={product?.name}
        placeholder="Ex.: Perfume floral 100 ml"
        required
        minLength={2}
        maxLength={120}
      />
      <div className="form-grid">
        <Field
          label="Código interno (SKU)"
          name="sku"
          defaultValue={product?.sku ?? initialBarcode}
          required
          maxLength={50}
        />
        <Field
          label="Custo de referência (R$)"
          name="referenceCost"
          defaultValue={product?.referenceCost}
          type="number"
          min="0"
          step="0.01"
          required
        />
        <Field
          label="Preço de venda (R$)"
          name="salePrice"
          defaultValue={
            product && Number(product.salePrice) > 0
              ? product.salePrice
              : undefined
          }
          type="number"
          min="0.01"
          step="0.01"
          required
        />
        <Field
          label="Estoque mínimo desejado"
          name="minimumStock"
          type="number"
          min="0"
          step="1"
          defaultValue={String(product?.minimumStock ?? 0)}
          required
        />
      </div>
      <details className="ux-optional">
        <summary>Marca, categoria e outros dados (opcional)</summary>
        <div className="stack">
          {' '}
          <Field
            label="Marca"
            name="brand"
            defaultValue={product?.brand}
            placeholder="Ex.: Natura"
            maxLength={80}
          />
          <Field
            label="Categoria"
            name="category"
            defaultValue={product?.category}
            placeholder="Ex.: Perfumes"
            maxLength={80}
          />
          <Field
            label="Descrição (opcional)"
            name="description"
            defaultValue={product?.description}
            maxLength={500}
          />
        </div>
      </details>
      {product ? (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              name="active"
              defaultChecked={product.active}
            />
            Produto ativo (aparece nas vendas e pedidos)
          </label>
          <p className="hint">
            O estoque não muda aqui: ele vem das compras, vendas e ajustes.
          </p>
        </>
      ) : (
        <p className="hint">
          O cadastro começa sem estoque. Registre uma compra para adicionar
          unidades.
        </p>
      )}
    </OperationForm>
  );
}
