import { expect, test } from 'vitest';
import {
  guidedTaxProfile,
  readGuidedTaxProfile,
} from '@/modules/fiscal/tax-profile';
test('exige escolhas explícitas e preserva origem nacional zero sem preencher por suposição', () => {
  expect(
    guidedTaxProfile({ origin: '', csosn: '', pis: '', cofins: '' }),
  ).toBeNull();
  const fields = { origin: '0', csosn: '102', pis: '07', cofins: '07' };
  const profile = guidedTaxProfile(fields);
  expect(profile).toMatchObject({
    ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } },
  });
  expect(readGuidedTaxProfile(profile)).toEqual(fields);
  expect(readGuidedTaxProfile({ ...profile, IPI: {} })).toBeNull();
  expect(guidedTaxProfile({ ...fields, csosn: '500' })).toBeNull();
});
