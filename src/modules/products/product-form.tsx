'use client';
import { OperationForm } from '@/components/operation-form';
import { Field } from '@/components/ui';
export function ProductForm() {
  return (
    <OperationForm operation="product" button="Cadastrar produto">
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
            label="Código de barras (opcional)"
            name="barcode"
            maxLength={30}
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
