# Ajustes de celular e requisições

## Mudanças

- Formulários em uma coluna até 760px, inclusive parcelas; fonte de campos de 16px e altura mínima de 48px. Ações com área de toque de pelo menos 44px. Margens e espaços entre campos ampliados, valores financeiros empilhados em telas estreitas e rodapé respeitando a área segura.
- Opções de sincronização ficam em uma seção expansível; o estado e os erros continuam visíveis. Telas comerciais continuam disponíveis.
- Loading dentro do layout autenticado mantém a navegação acessível durante a espera. Lembretes carregam em Suspense, sem bloquear o conteúdo principal.
- Autenticação e Membership deduplicadas com React.cache somente durante a mesma renderização RSC. Não há cache persistente compartilhado entre contas; a identidade continua validada no servidor.
- Imagens/manifest/service worker públicos deixam de disparar renovação de sessão. Rotas comerciais, APIs e ações continuam protegidas.
- Links dos menus não prebuscam todas as telas automaticamente. Salvamentos já revalidam a árvore na Server Action; o refresh adicional foi removido.
- Rodada de sincronização sem envio usa um snapshot, em vez de dois. Após tentativa de envio mantém a leitura final para recuperar confirmação perdida.
- Itens, movimentos e auditoria de venda/entrega são gravados em lote. Baixas condicionais por produto continuam ordenadas e dentro da transação serializável. Sem estoque negativo, remoção de histórico ou alteração da idempotência.

## Evidência e limites

A redução é de requisições/escritas redundantes, não uma promessa de tempo de resposta. Exemplo: para N itens, o registro dos itens/movimentos/auditoria usa até três operações de lote, em vez de até 3N operações; continuam existindo as validações, baixas e demais gravações necessárias.

Testes de serviços verificam múltiplos produtos, idempotência, histórico e rollback; teste da fila vazia exige uma única consulta. A suíte de componentes verifica 320, 390, 430, 740 e 1366px, campos e overflow. HTTP e identidade são simulados na suíte de componentes. PostgreSQL convencional e concorrência são verificados no CI.

Para medir a lentidão real, verificar separadamente navegação, Server Action, autenticação e consultas. É necessário o endereço do ambiente e acesso de homologação para medir o fluxo autenticado. Não registrar cookies, tokens, dados pessoais ou parâmetros comerciais nos logs.

Na Vercel, conferir se Functions e Supabase estão na mesma região ou em regiões próximas; o host usado anteriormente pelo banco era us-east-1, mas a configuração atual deve ser confirmada. Não mudar para São Paulo somente pela localização da usuária se o banco continua nos EUA. Comparar primeira chamada após ociosidade com chamadas seguintes para identificar cold start. Conferir conexões e limites no Supabase. Desenvolvimento Next.js com npm run dev não representa o desempenho do build de produção.

Não houve alteração de região, plano, secrets ou emissão fiscal. Não houve acesso ao banco comercial nem medições de milissegundos em produção. A página inicial ainda renderiza as duas visões responsivas (Dashboard e Meu dia); otimizar a seleção dessa visão sem perder adaptação a redimensionamento é uma melhoria posterior, distinta desta entrega.
