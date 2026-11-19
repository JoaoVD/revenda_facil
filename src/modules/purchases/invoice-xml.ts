import { SaxesParser } from 'saxes';
import { z } from 'zod';
import { BusinessError } from '@/lib/errors';
import { D, money } from '@/lib/money';
import {
  gtin,
  MAX_INVOICE_ITEMS,
  MAX_XML_BYTES,
  validNfeKey,
} from './invoice-contracts';

const NFE = 'http://www.portalfiscal.inf.br/nfe';
type Element = {
  name: string;
  namespace: string;
  text: string;
  children: Element[];
  id?: string;
  line?: string;
  version?: string;
};

function xmlTree(xml: string) {
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES)
    throw new BusinessError('Selecione um XML de até 250 KB.');
  const parser = new SaxesParser({ xmlns: true });
  const stack: Element[] = [];
  let root: Element | undefined;
  let count = 0;
  parser.on('doctype', () => {
    throw new BusinessError('XML com declaração DTD não é aceito.');
  });
  parser.on('opentag', (tag) => {
    if (stack.length >= 32 || ++count > 20_000)
      throw new BusinessError('O XML da nota excede o limite de complexidade.');
    const node: Element = {
      name: tag.local,
      namespace: tag.uri,
      text: '',
      children: [],
      id: tag.attributes.Id?.value,
      line: tag.attributes.nItem?.value,
      version: tag.attributes.versao?.value,
    };
    if (stack.length) stack.at(-1)!.children.push(node);
    else root = node;
    stack.push(node);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  const append = (value: string) => {
    const node = stack.at(-1);
    if (node) node.text += value;
  };
  parser.on('text', append);
  parser.on('cdata', append);
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw new BusinessError(
      'Não foi possível ler o XML. Selecione o arquivo original da NF-e.',
    );
  }
  if (!root || root.namespace !== NFE || root.name !== 'nfeProc')
    throw new BusinessError(
      'Selecione o XML completo da NF-e com protocolo. PDF e resumo da nota não servem para importar itens.',
    );
  return root;
}

function nodes(parent: Element, name: string) {
  return parent.children.filter(
    (node) => node.namespace === NFE && node.name === name,
  );
}
function get(parent: Element, name: string, optional = false) {
  const matches = nodes(parent, name);
  if (matches.length > 1 || (!optional && !matches.length))
    throw new BusinessError('O XML tem campos fiscais ausentes ou repetidos.');
  return matches[0];
}
function required(parent: Element, name: string) {
  return get(parent, name)!;
}
function value(parent: Element, name: string, optional = false) {
  const node = get(parent, name, optional);
  if (node?.children.length || (!optional && !node?.text.trim()))
    throw new BusinessError('O XML tem campos fiscais inválidos.');
  return node?.text.trim() || '';
}
function decimal(value: string, places: number) {
  if (!new RegExp('^\\d{1,13}(\\.\\d{1,' + places + '})?$').test(value))
    throw new BusinessError('A nota contém quantidade ou valor inválido.');
  return D(value);
}

export function parsePurchaseInvoice(
  xml: string,
  organizationCnpj: string,
  expectedKey?: string,
) {
  const root = xmlTree(xml);
  const invoice = required(required(root, 'NFe'), 'infNFe');
  const header = required(invoice, 'ide');
  const accessKey = invoice.id?.startsWith('NFe') ? invoice.id.slice(3) : '';
  const protocol = required(required(root, 'protNFe'), 'infProt');
  if (
    !validNfeKey(accessKey) ||
    value(protocol, 'chNFe') !== accessKey ||
    (expectedKey && expectedKey !== accessKey)
  )
    throw new BusinessError('A chave do XML não corresponde à NF-e informada.');
  if (
    invoice.version !== '4.00' ||
    value(header, 'mod') !== '55' ||
    value(header, 'finNFe') !== '1' ||
    value(header, 'tpNF') !== '1'
  )
    throw new BusinessError(
      'Importe uma NF-e de compra normal, modelo 55. Outros documentos exigem registro manual.',
    );
  if (
    value(header, 'tpAmb') !== '1' ||
    value(protocol, 'tpAmb') !== '1' ||
    !['100', '150'].includes(value(protocol, 'cStat')) ||
    !/^\d{15,17}$/.test(value(protocol, 'nProt'))
  )
    throw new BusinessError(
      'O XML deve conter protocolo de autorização de uma NF-e de produção.',
    );

  const destination = required(invoice, 'dest');
  if (
    !/^\d{14}$/.test(organizationCnpj) ||
    value(destination, 'CNPJ', true) !== organizationCnpj ||
    value(destination, 'CPF', true)
  )
    throw new BusinessError(
      'O destinatário da nota não corresponde ao CNPJ da sua revenda.',
    );
  const issuer = required(invoice, 'emit');
  const supplierDocument = value(issuer, 'CNPJ', true) || value(issuer, 'CPF');
  const supplier = value(issuer, 'xNome');
  const date = value(header, 'dhEmi').slice(0, 10);
  if (
    !/^(\d{14}|\d{11})$/.test(supplierDocument) ||
    supplierDocument === organizationCnpj ||
    supplier.length < 2 ||
    supplier.length > 120 ||
    !z.iso.date().safeParse(date).success
  )
    throw new BusinessError(
      'Confira o fornecedor e a data de emissão da nota.',
    );
  if (
    supplierDocument.length === 14 &&
    accessKey.slice(6, 20) !== supplierDocument
  )
    throw new BusinessError('O CNPJ do fornecedor diverge da chave da NF-e.');

  const details = nodes(invoice, 'det');
  if (!details.length || details.length > MAX_INVOICE_ITEMS)
    throw new BusinessError('A importação aceita notas com 1 a 100 itens.');
  const totals = required(invoice, 'total');
  const taxTotals = required(totals, 'ICMSTot');
  const expandedTotal = value(totals, 'vNFTot', true);
  const total = decimal(expandedTotal || value(taxTotals, 'vNF'), 2);
  const items = details.map((detail, index) => {
    const item = required(detail, 'prod');
    if (
      detail.line !== String(index + 1) ||
      get(required(detail, 'imposto'), 'ISSQN', true)
    )
      throw new BusinessError(
        'A nota contém serviços ou numeração de itens incompatível com a entrada de estoque.',
      );
    const name = value(item, 'xProd');
    const code = value(item, 'cProd');
    const unit = value(item, 'uCom').toUpperCase();
    const quantity = decimal(value(item, 'qCom'), 4);
    const gross = decimal(value(item, 'vProd'), 2);
    const discount = decimal(value(item, 'vDesc', true) || '0', 2);
    const included = value(item, 'indTot');
    if (
      name.length > 120 ||
      code.length > 60 ||
      unit.length > 6 ||
      quantity.lte(0) ||
      quantity.gt(1_000_000) ||
      discount.gt(gross) ||
      !['0', '1'].includes(included) ||
      (included === '0' && !gross.isZero())
    )
      throw new BusinessError(
        'A nota contém item com quantidade, custo ou total incompatível. Confira o XML antes de registrar a compra.',
      );
    const baseCost = gross
      .minus(discount)
      .plus(decimal(value(item, 'vFrete', true) || '0', 2))
      .plus(decimal(value(item, 'vSeg', true) || '0', 2))
      .plus(decimal(value(item, 'vOutro', true) || '0', 2));
    const expandedItem = expandedTotal ? value(detail, 'vItem', true) : '';
    return {
      line: index + 1,
      name,
      code,
      unit,
      barcode: gtin(value(item, 'cEAN', true)),
      quantity,
      baseCost: expandedItem ? decimal(expandedItem, 2) : baseCost,
    };
  });
  const base = items.reduce((sum, item) => sum.plus(item.baseCost), D(0));
  if (total.gt(0) && base.isZero())
    throw new BusinessError(
      'O total da nota não pode ser distribuído entre os itens. Registre a compra manualmente.',
    );
  // Cumulative rounding reconciles every cent with the invoice, including
  // charges/taxes represented in its total but not in the commercial line value.
  let cumulative = D(0);
  let allocated = D(0);
  return {
    accessKey,
    date,
    supplier,
    supplierDocument,
    total: money(total),
    allocations: !total.eq(base),
    items: items.map(({ quantity, baseCost, ...item }) => {
      cumulative = cumulative.plus(baseCost);
      const next = base.isZero()
        ? D(0)
        : D(money(cumulative.mul(total).div(base)));
      const cost = next.minus(allocated);
      allocated = next;
      return {
        ...item,
        quantity: quantity.toString(),
        lineCost: money(cost),
      };
    }),
  };
}
