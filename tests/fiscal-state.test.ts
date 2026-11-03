import { expect, test } from 'vitest';
import { remoteFiscalState } from '../src/modules/fiscal/state';
test('recebimento ou retorno incompleto nunca significa autorização', () => {
  expect(remoteFiscalState({ status: 'pendente' })).toBe('PROCESSING');
  expect(remoteFiscalState({ status: 'autorizado' })).toBe('UNKNOWN');
  expect(remoteFiscalState({ status: 'qualquer' })).toBe('UNKNOWN');
  expect(
    remoteFiscalState({
      status: 'autorizado',
      chave: '1'.repeat(44),
      autorizacao: { numero_protocolo: '1'.repeat(15) },
    }),
  ).toBe('AUTHORIZED');
  expect(remoteFiscalState({ status: 'cancelado' })).toBe('CANCELLED');
  expect(remoteFiscalState({ status: 'denegado' })).toBe('UNKNOWN');
});
