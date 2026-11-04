# Cliente diretamente no pedido

O campo Cliente aceita texto e sugere cadastros existentes. Se não houver correspondência, basta escrever o nome (mínimo dois caracteres) e continuar; telefone é opcional. O cadastro só é criado ao confirmar o pedido. Não é necessário abrir Clientes antes da venda.

Nomes encontrados precisam de seleção explícita ou da opção "É outra pessoa". Não há união automática por nome; homônimos podem ter cadastros independentes. Sugestões mostram telefone quando disponível. Nome/telefone não são usados como credenciais ou prova de identidade.

A criação do cliente, reserva/baixa, itens e recebimentos é atômica. Falha comercial reverte também o cliente recém-criado. UUID estável no rascunho e idempotência do pedido impedem repetir o cliente após cliques ou resposta perdida. Um UUID existente de outra organização, inativo ou com dados diferentes não é reutilizado nem sobrescrito.

Offline: o nome faz parte do próprio comando ORDER, preservado antes do envio, e aparece na projeção local. Pedidos posteriores que usam esse cadastro provisório dependem do pedido que o criou. Recebimentos e entregas continuam dependentes do pedido. O servidor valida tudo novamente ao sincronizar; conflito não equivale a cadastro/venda concluídos.

Nome, telefone e identificador provisório são restaurados pelo rascunho; rascunhos antigos continuam compatíveis. Venda imediata inteiramente paga pode continuar sem cliente. Entrega, retirada e valores a receber exigem um cliente existente ou o nome para criação rápida. Dados fiscais adicionais continuam sendo exigidos pelo módulo fiscal quando aplicável.

Não há alterações no esquema do banco, migrations novas, cobrança automática ou envio de mensagens aos clientes.
