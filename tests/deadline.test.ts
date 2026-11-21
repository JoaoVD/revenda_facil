import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DeadlineError,
  communicationMessage,
  withDeadline,
} from '@/lib/deadline';

afterEach(() => vi.useRealTimers());

describe('withDeadline', () => {
  it('devolve a resposta quando o servidor responde a tempo', async () => {
    await expect(withDeadline(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
  it('para de esperar um servidor que não responde', async () => {
    vi.useFakeTimers();
    const waiting = withDeadline(new Promise(() => {}), 45_000);
    vi.advanceTimersByTime(45_000);
    await expect(waiting).rejects.toBeInstanceOf(DeadlineError);
  });
  it('mantém o erro original da chamada', async () => {
    await expect(
      withDeadline(Promise.reject(new TypeError('Failed to fetch'))),
    ).rejects.toThrow('Failed to fetch');
  });
  it('explica o que fazer conforme a operação pode ou não ser repetida', () => {
    expect(communicationMessage(new DeadlineError(), true)).toContain(
      'não será duplicada',
    );
    expect(communicationMessage(new TypeError('x'))).toContain(
      'confira se a operação foi registrada',
    );
  });
});
