# Operação e sincronização

## Regras comerciais

O servidor resolve a organização pela Membership autenticada no Supabase. Cliente/dispositivo não escolhe a organização autorizada. Contratos são validados no servidor; dinheiro usa Decimal e transações Serializable, com auditoria e idempotência.

`Sale.status`: CONFIRMED/CANCELLED. Atendimento: PENDING/COMPLETED e IMMEDIATE/DELIVERY/PICKUP. Confirmação de entrega/retirada reserva estoque, sem baixar físico; conclusão integral reduz físico e reserva uma única vez. Disponível = físico − reservado. O banco impede saldos negativos e reservas excessivas. Não há entrega parcial. Venda imediata executa os passos em uma operação.

Pagamento não altera estoque; entrega não registra pagamento. Parcelas são o acordo, e Pix/dinheiro/cartão são os meios de cada recebimento. Parcelas podem variar em valor e ter data opcional. A soma deve coincidir com o saldo após a entrada. Recebimentos cobrem as parcelas na ordem exibida, com confirmação da distribuição. Sem vencimento não há atraso. Não existe alocação entre várias compras na mesma ação.

Cancelar pedido sem entrega e sem dinheiro recebido libera reserva. O fluxo de devolução comercial após entrega preserva movimentos compensatórios e custo histórico; recebido ou fiscal não resolvido bloqueia cancelamento. Destinação financeira e reembolso ainda não têm fluxo implementado.

Lucro presumido gerencial = valor líquido das vendas concluídas no período − custo histórico congelado na confirmação − despesas vinculadas, com reversão no mês do cancelamento. Pedido reservado não reconhece resultado. Adiantamento entra no caixa, mas não antecipa resultado comercial. Parcelas previstas não são caixa; compra não paga não é saída. O indicador não representa regime tributário nem apuração contábil. Vendas legadas mantêm completedAt=createdAt, sem nova baixa.

## Preparação offline

Entre online, aguarde a consulta real ao servidor e o registro do service worker; abra `/operacao` online para conferir a cópia preparada. Prefira build de produção e HTTPS. Persistência do navegador é solicitada quando suportada, sem garantia de backup. Não existe modo offline a ativar.

Após preparação, a estrutura reduzida permite consultar produtos/clientes/pedidos copiados, criar cliente mínimo e pedido, capturar entrega/retirada integral e recebimento. Compras, ajustes, configurações e fiscal exigem servidor. Detalhes completos de endereço, parcelas e histórico permanecem na interface online.

Cache Storage contém apenas `/operacao`, HTML público sem dados pessoais, e bundles imutáveis `/_next/static/*`. APIs, Server Actions, RSC e HTML autenticado não são cacheados. IndexedDB guarda os dados operacionais mínimos e a fila em partições por usuário e organização.

Comando e registro provisório são gravados na mesma transação IndexedDB antes de mostrar sucesso local. Sair/bloquear apaga apenas a partição ativa da sessão, preservando a fila. Geração local impede que outras abas ou preparações em voo desfaçam esse bloqueio. A ação **Liberar cópia local nesta sessão**, em tela autenticada, consulta novamente a identidade. O bloqueio não é criptografia nem protege contra quem controla o perfil do navegador.

## Protocolo

Contrato 1: UUID estável, usuário/organização, tipo, dependências, payload e horário capturado. Servidor valida identidade e persiste `SyncCommand` antes de aplicar. `capturedAt` é do dispositivo; `receivedAt` e aplicação usam o servidor.

Estados: PENDING, WAITING, APPLIED, ATTENTION. Resultado é persistido; mesmo ID com outro conteúdo é recusado. Aplicação comercial e gravação do resultado usam transações separadas: o intervalo é recuperado pela idempotência de vendas/pagamentos, ID estável de cliente e entrega única. Tipos novos precisam garantir essa propriedade.

O cliente confirma APPLIED apenas com resposta válida para o mesmo ID. Mantém registros, atualiza snapshots e usa lease IndexedDB de 30 segundos para coordenar abas; o servidor tem lease de 60 segundos. Falhas temporárias usam atraso exponencial até cinco minutos, sem transformar indisponibilidade em rejeição permanente após um número fixo de tentativas. Respostas WAITING/PENDING zeram a contagem de falhas de transporte. Cada reenvio conserva ID e intenção; o servidor recupera o resultado idempotente mesmo quando a operação foi aplicada e a confirmação falhou. Sessão expirada não apaga a fila. Sincroniza ao abrir, retomar, reconectar e periodicamente com a aplicação aberta. Não há garantia com aplicação fechada.

A chave local protege o contrato completo (conta, tipo, dependências, horário capturado e payload), sem incluir os metadados mutáveis da fila. As antigas pausas geradas especificamente pelo limite de transporte são recuperadas automaticamente, tanto no aparelho quanto no servidor; conflitos comerciais ATTENTION continuam exigindo revisão e nunca são reabertos por essa recuperação.

Reserva local é provisória. Falta de estoque, preço alterado ou recebimento acima do saldo resultam em conferência, sem aplicar estoque/dinheiro indevidos. Fatos dependentes são preservados em WAITING no servidor, mesmo quando a reserva anterior falhou. Mais mostra mensagens e IDs. Não apague registros para esconder conflitos.

**Pendências:** resolução assistida e compensações autorizadas não têm interface; exigem revisão técnica dos registros capturados. Consultar novamente não reabre uma rejeição permanente. Atualização usa snapshots de até 2.000 produtos, 2.000 clientes e 500 pedidos recentes, incluindo inativações. Não há feed incremental, cursor, tombstones ou paginação completa offline. Não há exportação/importação de emergência da fila.

## Lembretes e push

Configurações permitem primeiro/último/dia específico, hora em America/Sao_Paulo, todos os saldos ou apenas vencidos e ativação. Dia inexistente usa o último do mês. Um aviso persistido por organização/mês evita duplicação. Saldos atuais são revistos antes de exibir; resolvidos deixam de alertar. Revisar/adicionar adiamento de 24 horas não quita dívida.

Agendador externo chama `POST /api/reminders/run` com `Authorization: Bearer <REMINDER_SCHEDULER_SECRET>`. Sem segredo ou par VAPID válido, retorna 503. O endpoint cria avisos/jobs únicos e processa até cinco envios por rodada, com `pushTransport: WEB_PUSH`. Execute a cada minuto no servidor; o navegador não precisa estar aberto.

Configurações oferece inscrição/permissão por aparelho, envio de teste e desativação. O transporte Web Push usa VAPID, prazo de retenção de 24 horas e timeout de socket de 10 segundos. Há leases, retentativas, supressão de saldos resolvidos e remoção de inscrições 404/410. Teste tem intervalo mínimo de um minuto por inscrição. Nenhuma permissão é solicitada ao abrir. O service worker usa textos fixos, sem nomes/valores, e abre `/receber` (ou `/configuracoes` no teste), exigindo autenticação no aplicativo. WhatsApp apenas prepara conversa para revisão. Detalhes e limites: [Web Push](NOTIFICACOES_WEB_PUSH.md).

## Backup e segurança

PostgreSQL é a fonte consolidada e precisa de backup consistente com restauração verificada. O arquivo fiscal privado precisa de volume persistente e backup próprios. Credenciais não devem estar em variáveis públicas, logs, cache ou notificações.

IndexedDB não é backup: limpeza do navegador, modo privado, quotas e perda do aparelho podem eliminar ações não sincronizadas. Antes de limpar dados, atualizar ou trocar perfil, confira a fila na conta original e aguarde confirmação do servidor. Mantenha bloqueio de tela e proteja o perfil do navegador.

Dados antigos em `.local` e `backups` foram preservados na limpeza do código. Não há migração automática das contas/banco desktop para Supabase; qualquer importação exige procedimento separado, conferência e backup. Não reutilize o executável legado para operar o SaaS.
