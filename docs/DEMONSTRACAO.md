# Conta de apresentação

O comando `npm run demo:seed` prepara dados persistidos no PostgreSQL do `.env`, em uma organização exclusiva para apresentação. Não existe senha pública, bypass do login ou emissão fiscal simulada. O acesso usa Supabase Auth normal.

## Preparar a conta

Use um e-mail que você controle, diferente da conta da revendedora. A conta não pode ter concluído o cadastro inicial de uma revenda: um usuário pertence a uma organização nesta versão. O comando recusa vínculos existentes e nunca move a conta nem apaga dados reais.

No computador em que o projeto já está configurado, atualize o código e execute:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run demo:seed -- --create-account
```

Informe o e-mail exclusivo e uma senha exclusiva de pelo menos 12 caracteres. A senha fica oculta no terminal e não é gravada no código. O Supabase precisa permitir cadastro de usuários. Se a confirmação por e-mail estiver habilitada, confirme pelo link recebido e depois execute:

```powershell
npm.cmd run demo:seed
```

Use o mesmo e-mail e senha. Não preencha a configuração inicial da empresa pelo navegador antes deste comando. Se a conta já existe no Supabase e ainda não possui organização, execute diretamente `demo:seed`, sem `--create-account`.

As variáveis `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` devem apontar para o mesmo ambiente usado pelo sistema publicado. `APP_URL` deve ser o endereço desse sistema; autorize `${APP_URL}/login` nos redirects do Supabase. A chave administrativa/service role não é necessária. Não envie senhas ou chaves por chat. O comando usa `.env.local` antes de `.env`, preservando variáveis já exportadas no terminal.

Para execução não interativa, `DEMO_EMAIL` e `DEMO_PASSWORD` podem ser fornecidos pelo ambiente seguro do processo. Não coloque a senha na linha de comando, não faça commit dela e não compartilhe a conta com terceiros.

## Conteúdo inicial

| Conteúdo                              | Quantidade / situação                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| Produtos                              | 24, com marcas, categorias, custo e preço ilustrativos       |
| Clientes                              | 16 pessoas fictícias, identificadas com `(demo)`             |
| Compras                               | 4: duas quitadas, uma parcialmente paga e uma não paga       |
| Vendas concluídas                     | 24, com dinheiro, Pix, cartão, fiado e recebimentos parciais |
| Pedidos pendentes                     | 12: seis entregas e seis retiradas                           |
| Cancelamentos                         | 1 venda com devolução e movimentos compensatórios            |
| Despesas pagas                        | 4                                                            |
| Lançamentos de pagamento/recebimento  | 37                                                           |
| Estoque físico inicial após operações | 232 unidades                                                 |
| Estoque reservado                     | 28 unidades                                                  |
| Estoque disponível                    | 204 unidades                                                 |

Há descontos, parcelas vencidas e futuras, três recebimentos de parcelas, produtos abaixo do mínimo e histórico auditável. Os dados são criados pelas mesmas regras de negócio das operações reais; saldos não são preenchidos arbitrariamente. O Dashboard consulta esse banco, sem números fixos de apresentação.

Datas de operação são ancoradas no momento da primeira execução, no fuso de São Paulo, com movimentos dentro do mês da preparação. Para apresentar em outro mês, selecione esse mês no Dashboard. Repetir o comando não muda a data nem repõe produtos vendidos durante a apresentação. Uma execução interrompida pode ser retomada com a mesma conta; operações possuem chaves estáveis. O cenário só é marcado como pronto após concluir todas as operações.

A organização se chama **DEMONSTRAÇÃO — Revenda Fácil** e usa um identificador `DEMO-…` deliberadamente não fiscal no campo de identificação da empresa. Não é CNPJ válido e não deve ser substituído pelo CNPJ real da revendedora. Não configure emissão fiscal nessa conta. Documentos permanecem pendentes; nenhum XML, chave de acesso ou autorização da SEFAZ é inventado. Não há configuração fiscal, assinaturas push ou preferências de lembretes criadas pelo comando. Não ative cobranças ou notificações reais com esses clientes fictícios.

## Roteiro de apresentação

1. Entre no endereço publicado com a conta demo e apresente o resumo financeiro do mês da preparação.
2. Abra pedidos para mostrar entregas, retiradas e os valores recebidos separadamente.
3. Em contas a receber, mostre parcelas vencidas e futuras. Registre um recebimento e veja o saldo diminuir.
4. Crie um pedido com um produto, informando o nome do cliente diretamente. Confirme a reserva e depois a entrega.
5. Veja o histórico e a redução do estoque. Mostre que uma compra sem pagamento não reduz o caixa.
6. No celular, apresente o atendimento e a fila de sincronização. Prepare o dispositivo online antes de demonstrar perda de conexão.

Depois de concluída a preparação, os dados podem ser usados normalmente e suas alterações são preservadas nas próximas execuções. Para uma nova apresentação zerada, crie outra conta exclusiva; não há comando destrutivo de reset. O acesso só estará efetivamente criado e alimentado quando os comandos forem executados com sucesso contra o ambiente correto.
