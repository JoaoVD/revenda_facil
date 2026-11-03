import { z } from 'zod';
export function validCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digit = (base: string) => {
    let weight = base.length - 7,
      sum = 0;
    for (const c of base) {
      sum += Number(c) * weight--;
      if (weight < 2) weight = 9;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return (
    digit(value.slice(0, 12)) === Number(value[12]) &&
    digit(value.slice(0, 13)) === Number(value[13])
  );
}
export const organizationInput = z.object({
  ownerName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine(validCnpj, 'CNPJ inválido.'),
  state: z.literal('SP'),
  city: z.string().trim().min(2).max(100),
  phone: z.string().max(20).default(''),
  email: z.union([z.email(), z.literal('')]).default(''),
});
