import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { BusinessError } from '@/lib/errors';
import type { Actor } from '@/modules/shared/contracts';
import { validCnpj } from '@/modules/organizations/validation';

const text = z.string().trim().min(1).max(120);
const addressFields = {
  xLgr: text,
  nro: text,
  xBairro: text,
  cMun: z.string().regex(/^\d{7}$/),
  xMun: text,
  CEP: z.string().regex(/^\d{8}$/),
  UF: z.enum([
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
  ]),
};
export const fiscalEmitterInput = z.strictObject({
  xNome: text,
  IE: z.string().regex(/^\d{2,14}$/),
  ...addressFields,
  UF: z.literal('SP'),
  cMun: z.string().regex(/^35\d{5}$/),
  confirmCRT4: z.union([z.literal('on'), z.literal(true)]),
});

function safeTaxKeys(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(
    ([key, child]) =>
      !/secret|password|senha|token|credential|certificad|client.?id|csc|__proto__|constructor|prototype/i.test(
        key,
      ) && safeTaxKeys(child),
  );
}
const taxGroup = z
  .record(z.string(), z.record(z.string(), z.json()))
  .refine((v) => Object.keys(v).length === 1);
const icms = taxGroup.refine(
  (v) =>
    Object.values(v).every(
      (group) =>
        typeof group.orig === 'number' &&
        Number.isInteger(group.orig) &&
        group.orig >= 0 &&
        group.orig <= 8 &&
        ((typeof group.CST === 'string' && /^\d{2}$/.test(group.CST)) ||
          (typeof group.CSOSN === 'string' && /^\d{3}$/.test(group.CSOSN))),
    ),
  'Informe origem e CST/CSOSN confirmados pelo contador.',
);
const contribution = taxGroup.refine(
  (v) =>
    Object.values(v).every(
      (group) => typeof group.CST === 'string' && /^\d{2}$/.test(group.CST),
    ),
  'Informe o CST confirmado pelo contador.',
);
const taxes = z
  .object({ ICMS: icms, PIS: contribution, COFINS: contribution })
  .catchall(z.json())
  .refine(safeTaxKeys, 'Credenciais não pertencem ao cadastro fiscal.');
const taxJson = z
  .string()
  .trim()
  .min(2)
  .max(30000)
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe um JSON tributário válido.',
      });
      return z.NEVER;
    }
  })
  .pipe(taxes);
export const fiscalProductInput = z
  .strictObject({
    productId: z.uuid(),
    NCM: z.string().regex(/^\d{8}$/),
    CFOP: z.string().regex(/^[12567]\d{3}$/),
    uCom: z.string().trim().min(1).max(6),
    uTrib: z.string().trim().min(1).max(6),
    imposto: taxJson,
  })
  .refine(
    (v) => v.uCom === v.uTrib,
    'Nesta etapa, unidade comercial e tributável devem ser iguais (quantidade 1:1).',
  );

function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(value[length])) return false;
  }
  return true;
}
export const fiscalCustomerInput = z
  .strictObject({
    customerId: z.uuid(),
    document: z
      .string()
      .trim()
      .refine(
        (v) => validCpf(v) || validCnpj(v),
        'CPF ou CNPJ inválido; informe somente números.',
      ),
    xNome: text,
    indIEDest: z.enum(['1', '2', '9']),
    IE: z
      .string()
      .regex(/^(\d{2,14})?$/)
      .default(''),
    ...addressFields,
  })
  .refine(
    (v) => v.indIEDest !== '1' || Boolean(v.IE),
    'IE obrigatória para contribuinte.',
  );

function address(
  data:
    z.infer<typeof fiscalEmitterInput> | z.infer<typeof fiscalCustomerInput>,
) {
  const { xLgr, nro, xBairro, cMun, xMun, CEP, UF } = data;
  return { xLgr, nro, xBairro, cMun, xMun, CEP, UF };
}
function requireOrganization(actor: Actor) {
  z.uuid().parse(actor.organizationId);
}
export async function saveFiscalEmitter(actor: Actor, raw: unknown) {
  requireOrganization(actor);
  const data = fiscalEmitterInput.parse(raw);
  const { db } = await import('@/lib/db');
  const emitter = {
    xNome: data.xNome,
    IE: data.IE,
    CRT: 4,
    enderEmit: address(data),
  };
  await db.fiscalSettings.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, emitter },
    update: { emitter },
  });
}
export async function saveFiscalProduct(actor: Actor, raw: unknown) {
  requireOrganization(actor);
  const { productId, ...fiscalData } = fiscalProductInput.parse(raw);
  const { db } = await import('@/lib/db');
  const changed = await db.product.updateMany({
    where: { id: productId, organizationId: actor.organizationId },
    data: {
      ncm: fiscalData.NCM,
      fiscalData: fiscalData as Prisma.InputJsonObject,
    },
  });
  if (!changed.count)
    throw new BusinessError('Produto não encontrado nesta organização.');
}
export async function saveFiscalCustomer(actor: Actor, raw: unknown) {
  requireOrganization(actor);
  const data = fiscalCustomerInput.parse(raw);
  const { db } = await import('@/lib/db');
  const fiscalAddress = {
    document: data.document,
    xNome: data.xNome,
    indIEDest: Number(data.indIEDest),
    ...(data.IE ? { IE: data.IE } : {}),
    enderDest: address(data),
  };
  const changed = await db.customer.updateMany({
    where: { id: data.customerId, organizationId: actor.organizationId },
    data: { fiscalAddress },
  });
  if (!changed.count)
    throw new BusinessError('Cliente não encontrado nesta organização.');
}
