/** O servidor não respondeu dentro do prazo (a operação pode ter sido feita). */
export class DeadlineError extends Error {
  constructor() {
    super('Sem resposta do servidor a tempo.');
    this.name = 'DeadlineError';
  }
}

/**
 * Para de esperar uma chamada ao servidor depois de `ms`. A chamada não é
 * cancelada (Server Actions não aceitam cancelamento); a tela só deixa de
 * ficar presa em "Salvando…" e pode avisar a pessoa.
 */
export function withDeadline<T>(work: Promise<T>, ms = 45_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Mensagem para falhas de comunicação com o servidor. */
export function communicationMessage(error: unknown, retrySafe = false) {
  if (error instanceof DeadlineError)
    return retrySafe
      ? 'O servidor demorou para responder. Tente de novo: a operação não será duplicada.'
      : 'O servidor demorou para responder. Confira se a operação foi registrada antes de tentar de novo.';
  return retrySafe
    ? 'Sem conexão com o servidor. Seu preenchimento foi mantido; tente de novo sem risco de duplicar.'
    : 'Sem conexão com o servidor. Seu preenchimento foi mantido; confira se a operação foi registrada antes de tentar de novo.';
}
