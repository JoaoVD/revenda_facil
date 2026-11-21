'use client';
import { useRef } from 'react';
import { CameraScanButton } from '@/components/camera-scanner';
import { OperationForm } from '@/components/operation-form';
import { Field } from '@/components/ui';
export function ProductForm({
  initialBarcode = '',
}: { initialBarcode?: string } = {}) {
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
    <OperationForm operation="product" button="Cadastrar produto">
      <div className="stack" ref={barcodeArea}>
        <Field
          label="Código de barras (opcional)"
          name="barcode"
          defaultValue={initialBarcode}
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
        placeholder="Ex.: Perfume floral 100 ml"
        required
        minLength={2}
        maxLength={120}
      />
      <div className="form-grid">
        <Field
          label="Código interno (SKU)"
          name="sku"
          defaultValue={initialBarcode}
          required
          maxLength={50}
        />
        <Field
          label="Custo de referência (R$)"
          name="referenceCost"
          type="number"
          min="0"
          step="0.01"
          required
        />
        <Field
          label="Preço de venda (R$)"
          name="salePrice"
          type="number"
          min="0"
          step="0.01"
          required
        />
        <Field
          label="Estoque mínimo desejado"
          name="minimumStock"
          type="number"
          min="0"
          step="1"
          defaultValue="0"
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
            placeholder="Ex.: Natura"
            maxLength={80}
          />
          <Field
            label="Categoria"
            name="category"
            placeholder="Ex.: Perfumes"
            maxLength={80}
          />
          <Field
            label="Descrição (opcional)"
            name="description"
            maxLength={500}
          />
        </div>
      </details>
      <p className="hint">
        O cadastro começa sem estoque. Registre uma compra para adicionar
        unidades.
      </p>
    </OperationForm>
  );
}
