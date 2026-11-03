import {
  acquireLease,
  releaseLease,
  activeScope,
  localCommands,
  saveSnapshot,
  updateCommand,
  type Snapshot,
  type Scope,
} from './local-store';
export async function synchronize(scope: Scope): Promise<string> {
  const holder = crypto.randomUUID();
  if (!(await acquireLease(scope, holder)))
    return 'Outra aba está sincronizando.';
  try {
    // Confirmar a conta no servidor ANTES de enviar qualquer ação.
    const response = await fetch('/api/sync', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401)
      return 'Entre novamente. As ações continuam salvas neste aparelho.';
    if (!response.ok) throw new Error('Servidor indisponível');
    const snapshot: Snapshot = await response.json();
    if (
      snapshot.userId !== scope.userId ||
      snapshot.organizationId !== scope.organizationId
    )
      return 'Conta diferente. Entre na conta original para sincronizar as ações preservadas.';
    await saveSnapshot(snapshot, false);
    const commands = (await localCommands(scope)).sort((a, b) =>
      a.capturedAt.localeCompare(b.capturedAt),
    );
    for (const command of commands) {
      if (
        command.state === 'APPLIED' ||
        command.state === 'ATTENTION' ||
        command.nextAttemptAt > Date.now()
      )
        continue;
      const active = await activeScope();
      if (
        !active ||
        active.userId !== scope.userId ||
        active.organizationId !== scope.organizationId
      )
        return 'Conta alterada. Fila preservada.';
      if (!(await acquireLease(scope, holder)))
        return 'Outra aba está sincronizando.';
      try {
        const result = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
          signal: AbortSignal.timeout(10000),
        });
        if (result.status === 401)
          return 'Sessão expirada. Entre novamente; a fila está preservada.';
        const body = await result.json();
        if (!result.ok) {
          if ([400, 403, 409, 413].includes(result.status)) {
            command.state = 'ATTENTION';
            command.message = body.message || 'Revise o comando.';
          } else throw new Error('Falha temporária');
        } else {
          if (
            body.id !== command.id ||
            !['APPLIED', 'ATTENTION', 'WAITING', 'PENDING'].includes(
              body.status,
            )
          )
            throw new Error('Confirmação inválida');
          command.state = body.status;
          command.message = body.message || undefined;
          command.resultId =
            typeof body.result?.id === 'string' ? body.result.id : undefined;
        }
        // WAITING/PENDING são respostas válidas, não falhas de transporte.
        command.attempts = 0;
        command.nextAttemptAt = Date.now() + 10000;
        await updateCommand(command);
      } catch {
        command.attempts++;
        command.nextAttemptAt =
          Date.now() +
          Math.min(300000, 2000 * 2 ** Math.min(command.attempts, 8));
        if (command.attempts >= 8) {
          command.state = 'ATTENTION';
          command.message =
            'Tentativas esgotadas. Informação preservada. Confira a conexão e solicite nova tentativa.';
        }
        await updateCommand(command);
        // Continuar permite enviar os fatos dependentes ao registro auditável.
      }
    }
    const final = await fetch('/api/sync', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (final.ok) {
      const fresh: Snapshot = await final.json();
      if (
        fresh.userId === scope.userId &&
        fresh.organizationId === scope.organizationId
      )
        await saveSnapshot(fresh, false);
    }
    const queue = await localCommands(scope),
      pending = queue.filter((c) =>
        ['PENDING', 'WAITING'].includes(c.state),
      ).length,
      attention = queue.filter((c) => c.state === 'ATTENTION').length;
    return attention
      ? `${attention} registros precisam de atenção${pending ? ` · ${pending} ações aguardando sincronização` : ''}`
      : pending
        ? `${pending} ações aguardando sincronização`
        : 'Tudo sincronizado';
  } catch {
    return 'Sem comunicação com o servidor — você pode continuar. Ações salvas neste aparelho.';
  } finally {
    await releaseLease(scope, holder);
  }
}
