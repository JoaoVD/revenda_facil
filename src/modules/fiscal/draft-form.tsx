'use client';
import { useState } from 'react';
import Link from 'next/link';
import { OperationForm } from '@/components/operation-form';
import { Field, Select } from '@/components/ui';
import {
  composeFiscalDraft,
  fiscalDraftIssues,
  type DraftFields,
} from './draft';

export function FiscalDraftForm({
  documentId,
  templates,
}: {
  documentId: string;
  templates: Record<'55' | '65', string>;
}) {
  const [model, setModel] = useState<'55' | '65'>('65');
  const [card, setCard] = useState(false);
  const template = JSON.parse(templates[model]);
  const issues = fiscalDraftIssues(template);
  return (
    <details>
      <summary>Preparar nota de teste</summary>
      <p className="hint">
        Focus NFe · homologação, sem valor fiscal. A preparação não transmite a
        nota. Operação interna, venda normal e sem frete.
      </p>
      <Select
        label="Modelo fiscal"
        value={model}
        onChange={(event) => {
          setModel(event.target.value as '55' | '65');
          setCard(false);
        }}
      >
        <option value="65">NFC-e · consumidor · 65</option>
        <option value="55">NF-e · 55</option>
      </Select>
      <p>
        Destinatário:{' '}
        {template.infNFe.dest?.xNome ||
          (model === '65'
            ? 'Consumidor sem identificação'
            : 'Cadastro pendente')}
        . Valor fiscal: R$ {template.infNFe.total.ICMSTot.vNF}.
      </p>
      <ul>
        {(
          template.infNFe.det as Array<{
            nItem: number;
            prod: { xProd: string; qCom: number; vProd: string; vDesc: string };
          }>
        ).map((item) => (
          <li key={item.nItem}>
            {item.prod.xProd} · {item.prod.qCom} unidade(s) · R${' '}
            {item.prod.vProd} · desconto R$ {item.prod.vDesc}
          </li>
        ))}
      </ul>
      {issues.length ? (
        <div className="notice" role="status">
          <strong>Resolva estas pendências para preparar</strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <Link href="/configuracoes#fiscal">Abrir cadastros fiscais</Link>
        </div>
      ) : (
        <OperationForm
          key={model}
          operation="fiscal-prepare"
          button="Validar e preparar prévia"
          reset={false}
          transform={(data) => {
            const fields = Object.fromEntries(data) as DraftFields;
            fields.dhEmi = new Date(fields.dhEmi).toISOString();
            return {
              documentId,
              model,
              payload: JSON.stringify(composeFiscalDraft(template, fields)),
            };
          }}
        >
          <div className="form-grid">
            <Field
              label="Natureza da operação (confirme com o contador)"
              name="natOp"
              required
              maxLength={120}
            />
            <Field
              label="Série fiscal"
              name="serie"
              type="number"
              min={1}
              max={999}
              step={1}
              required
            />
            <Field
              label="Número fiscal reservado para o teste"
              name="nNF"
              type="number"
              min={1}
              max={999999999}
              step={1}
              required
            />
            <Field
              label="Emissão (horário local deste computador)"
              name="dhEmi"
              type="datetime-local"
              required
            />
            <Select
              label="Destino da operação"
              name="idDest"
              required
              defaultValue=""
            >
              <option value="">Selecione</option>
              <option value="1">Interna · mesmo estado</option>
            </Select>
            <Select
              label="Consumidor final"
              name="indFinal"
              required
              defaultValue=""
            >
              <option value="">Selecione</option>
              <option value="1">Sim</option>
              {model === '55' && <option value="0">Não</option>}
            </Select>
            <Select
              label="Presença do comprador"
              name="indPres"
              required
              defaultValue=""
            >
              <option value="">Selecione</option>
              <option value="1">Presencial</option>
              {model === '55' && <option value="2">Internet</option>}
              {model === '55' && <option value="3">Telefone</option>}
              <option value="4">Entrega em domicílio (NFC-e)</option>
              {model === '55' && (
                <option value="5">Presencial fora do estabelecimento</option>
              )}
              {model === '55' && (
                <option value="9">Outra operação não presencial</option>
              )}
              {model === '55' && <option value="0">Não se aplica</option>}
            </Select>
            <Select
              label="Forma fiscal de pagamento"
              name="tPag"
              required
              defaultValue=""
              onChange={(event) =>
                setCard(['03', '04'].includes(event.target.value))
              }
            >
              <option value="">Selecione</option>
              <option value="01">Dinheiro</option>
              <option value="02">Cheque</option>
              <option value="03">Cartão de crédito</option>
              <option value="04">Cartão de débito</option>
              <option value="15">Boleto bancário</option>
              <option value="16">Depósito bancário</option>
              <option value="17">PIX</option>
              <option value="18">
                Transferência bancária / carteira digital
              </option>
              <option value="05">Crédito da loja</option>
            </Select>
            <Select
              label="Condição fiscal de pagamento"
              name="indPag"
              required
              defaultValue=""
            >
              <option value="">Selecione</option>
              <option value="0">À vista</option>
              <option value="1">A prazo</option>
            </Select>
          </div>
          {card && (
            <Select
              label="Integração do cartão"
              name="tpIntegra"
              required
              defaultValue=""
            >
              <option value="">Confirme a operação</option>
              <option value="2">
                Não integrado · equipamento independente
              </option>
            </Select>
          )}
          <p className="hint">
            O pagamento fiscal representa o valor total da venda, inclusive a
            prazo. Os recebimentos financeiros não são alterados. Cartão
            integrado, tributos cobrados, frete e operações interestaduais
            exigem revisão técnica.
          </p>
        </OperationForm>
      )}
      <details>
        <summary>Avançado · estrutura dos cadastros</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(template, null, 2)}
        </pre>
      </details>
    </details>
  );
}
