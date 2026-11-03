export class BusinessError extends Error {}
export function publicError(error: unknown): string {
  if (error instanceof BusinessError) return error.message;
  if (error instanceof Error && error.name === 'ZodError')
    return 'Confira os campos informados e tente novamente.';
  console.error('operation_failed', {
    type: error instanceof Error ? error.name : 'unknown',
  });
  return 'Não foi possível concluir. Tente novamente; se persistir, contate o suporte.';
}
