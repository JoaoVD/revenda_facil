'use client';
import { useState } from 'react';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import type { ProductOption } from '@/modules/products/contracts';
export function PurchaseForm({ products }: { products: ProductOption[] }) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <OperationForm
      operation="purchase"
      button="Confirmar entrada no estoque"
      transform={(data) => ({
        idempotencyKey: key,
        supplier: data.get('supplier'),
        date: data.get('date'),
        recipientDocument: data.get('recipientDocument'),
        accessKey: data.get('accessKey'),
        items: [
          {
            productId: data.get('productId'),
            quantity: data.get('quantity'),
            unitCost: data.get('unitCost'),
          },
        ],
      })}
      onSuccess={() => setKey(crypto.randomUUID())}
    >
      <Field
        label="Fornecedor"
        name="supplier"
        required
        minLength={2}
        maxLength={120}
      />
      <Field
        label="Data da compra"
        type="date"
        name="date"
        defaultValue={new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Sao_Paulo',
        }).format(new Date())}
        required
      />
      <Select label="Produto" name="productId" required>
        <option value="">Selecione um produto</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.sku}
          </option>
        ))}
      </Select>
      <div className="form-grid">
        <Field
          label="Quantidade"
          name="quantity"
          type="number"
          min="1"
          step="1"
          required
        />
        <Field
          label="Custo por unidade (R$)"
          name="unitCost"
          type="number"
          min="0"
          step="0.01"
          required
        />
      </div>
      <details>
        <summary>Documento fiscal (opcional)</summary>
        <div className="stack">
          <Field
            label="CPF/CNPJ do destinatário (somente números)"
            name="recipientDocument"
            inputMode="numeric"
            maxLength={14}
          />
          <Field
            label="Chave de acesso"
            name="accessKey"
            inputMode="numeric"
            pattern="[0-9]{44}"
          />
          <p className="hint">
            Documento em CPF ou outro CNPJ exige revisão. A entrada será
            bloqueada quando o destinatário divergir da empresa.
          </p>
        </div>
      </details>
      <div className="notice">
        A compra adiciona estoque. O pagamento é registrado separadamente no
        Financeiro.
      </div>
    </OperationForm>
  );
}
