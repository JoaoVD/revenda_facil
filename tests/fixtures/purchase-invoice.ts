// Documento sintético para testes locais de importação. Não é uma NF-e real.
export const invoiceRecipient = '11222333000181';
export const invoiceBarcode = '7894900011517';
const supplier = '12345678000195';

export function invoiceFixture(sequence = 1, recipient = invoiceRecipient) {
  const base =
    '352611' +
    supplier +
    '55001' +
    String(sequence).padStart(9, '0') +
    '112345678';
  const sum = [...base]
    .reverse()
    .reduce(
      (total, digit, index) => total + Number(digit) * (2 + (index % 8)),
      0,
    );
  const digit = 11 - (sum % 11);
  const key = base + (digit >= 10 ? 0 : digit);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">' +
    '<NFe><infNFe Id="NFe' +
    key +
    '" versao="4.00">' +
    '<ide><mod>55</mod><dhEmi>2026-11-18T09:10:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb><finNFe>1</finNFe></ide>' +
    '<emit><CNPJ>' +
    supplier +
    '</CNPJ><xNome>Cosméticos &amp; Beleza</xNome></emit>' +
    '<dest><CNPJ>' +
    recipient +
    '</CNPJ></dest>' +
    '<det nItem="1"><prod><cProd>PERF-01</cProd><cEAN>' +
    invoiceBarcode +
    '</cEAN><xProd>Perfume floral 100 ml</xProd><uCom>UN</uCom><qCom>3.0000</qCom><vProd>60.00</vProd><vDesc>2.00</vDesc><indTot>1</indTot></prod><imposto/></det>' +
    '<det nItem="2"><prod><cProd>SAB-02</cProd><cEAN>SEM GTIN</cEAN><xProd>Sabonete</xProd><uCom>CX</uCom><qCom>2.0000</qCom><vProd>40.00</vProd><indTot>1</indTot></prod><imposto/></det>' +
    '<total><ICMSTot><vNF>100.01</vNF></ICMSTot></total></infNFe></NFe>' +
    '<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>' +
    key +
    '</chNFe><nProt>135260000000001</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>';
  return { key, xml };
}
