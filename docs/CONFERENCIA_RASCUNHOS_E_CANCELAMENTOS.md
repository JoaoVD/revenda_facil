# Conferência, rascunhos e alterações de pedidos

## Conferir fatos offline

Abra **Conferir pendências** no status de sincronização. A lista pertence ao usuário autenticado e à sua organização; IDs de outra conta não autorizam acesso. A operação exige internet.

- Estoque insuficiente: confira/reposicione mercadorias e tente novamente mantendo quantidades e valores capturados.
- Preço alterado: confirme explicitamente o total atual e os valores das parcelas com a cliente. O dinheiro já recebido não é reduzido nem transformado em desconto.
- Entrega com versão antiga: leia o pedido atual e confirme que o atendimento físico corresponde à versão atualizada.
- Recebimento contra pedido sem saldo: pode destinar o valor inteiro a outro pedido do mesmo cliente, com saldo suficiente. Não permite transferência entre clientes nem alteração de recebimento já aplicado.
- Cliente com mesmo identificador e dados diferentes: pode preservar o cadastro atual sem sobrescrevê-lo.
- Dependência ausente: sincronize o aparelho de origem. Dependência em conflito deve ser resolvida primeiro.

Cada decisão tem chave própria, versão e motivo. `SyncCommand.payload` e seu hash permanecem originais; `resolvedPayload` guarda a intenção autorizada, e `SyncResolution` mantém todas as decisões anteriores. O servidor revalida estoque, preço, saldo, organização e versão ao aplicar. Uma nova mudança pode exigir nova conferência. Entregas/recebimentos dependentes continuam preservados.

Na próxima sincronização, confirmações de decisões feitas no computador chegam ao aparelho. A projeção local utiliza a intenção conferida sem apagar a captura original. A resposta inclui até 500 comandos recentes; uma fila antiga fora dessa janela pode exigir reenvio/recuperação assistida. Sincronização incremental completa continua pendente.

## Rascunho automático

Ao abrir Novo pedido, o sistema prepara um rascunho IndexedDB separado por usuário/organização. Aguarde **Rascunho salvo neste aparelho** antes de fechar. Produtos, cliente, atendimento, etapa, valores e parcelas incompletas são recuperados ao reabrir no mesmo navegador.

É um rascunho local: não reserva estoque, não entra no financeiro e não aparece automaticamente em outro aparelho. Limpeza do navegador, modo privado, perda do aparelho ou armazenamento recusado podem removê-lo. Há aviso de saída enquanto a gravação está pendente, mas encerramento abrupto do sistema pode interromper a última gravação. Alterações simultâneas em duas abas não se sobrescrevem silenciosamente; reabra para carregar a versão atual.

Antes do primeiro envio, a chave do pedido e o payload são gravados. Se a resposta se perder, os campos ficam protegidos e **Tentar confirmar o mesmo pedido** reenvia a mesma intenção/chave, inclusive após recarregar. **Conferir envio antes de revisar** procura o pedido ou a fila local antes de liberar os campos. A chave é preservada para impedir duplicidade. O rascunho é removido somente após confirmação do servidor ou gravação atômica na fila local. Descartar é permitido somente antes do envio, com confirmação.

## Editar pedido pendente

No detalhe, use **Editar pedido pendente**. Somente pedidos confirmados ainda não entregues/retirados podem ser editados, online. Ajusta reservas, cliente sem recebimentos, atendimento, itens, desconto e acordo. Itens que permanecem mantêm preço e custo históricos; itens acrescentados usam valores atuais. O novo total nunca pode ser menor que o líquido recebido. Parcelas do novo plano representam somente o saldo restante; o plano anterior permanece preservado.

A versão e a chave protegem concorrência/reenvios. `OrderChange.before` guarda o estado anterior com itens, valores, pagamentos e parcelas; o detalhe mostra versões preservadas. Documento fiscal em andamento e fatos offline pendentes conhecidos pelo servidor bloqueiam alterações. Não há edição arbitrária de vendas concluídas.

## Cancelar e registrar reembolso

- Sem recebimento: cancelamento libera reservas ou registra retorno de mercadorias já entregues. Para repor estoque entregue, exige confirmação do retorno físico integral.
- Com recebimento: devolva efetivamente o dinheiro e depois registre **reembolso e cancelamento integral** no detalhe. O registro exige valor igual ao líquido recebido, meio e motivo. Se já houve entrega, exige retorno físico integral.
- A transação registra pagamento `OUT` vinculado à venda, preserva os `IN`, compensa estoque/reservas e cancela. A mesma chave não cria outro reembolso. Não realiza Pix, estorno de cartão ou transação bancária.
- A situação fiscal precisa permitir o cancelamento comercial. Não cancela documento na SEFAZ automaticamente.

O caixa registra o reembolso na data efetiva do lançamento; o lucro gerencial reverte a margem no mês do cancelamento. Pedido reservado ainda não entregue nunca reconheceu essa margem. Pedidos cancelados não geram novos recebíveis/lembretes.

**Limites:** somente cancelamento integral com devolução integral; não há devolução parcial, troca, crédito em carteira nem edição offline. Informações ainda exclusivamente em outro aparelho são desconhecidas do servidor: sincronize todos os aparelhos antes de alterar/cancelar um pedido. Nenhum sistema desconectado pode garantir reserva global entre aparelhos sem reconciliação.
