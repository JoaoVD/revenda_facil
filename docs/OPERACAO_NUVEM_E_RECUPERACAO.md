# Operação na nuvem e recuperação

Este guia prepara a operação. Não provisiona recursos, não publica a aplicação e não habilita emissão fiscal real.

## Antes de disponibilizar à revendedora

1. Escolher hospedagem Node compatível, domínio HTTPS, PostgreSQL gerenciado e região. Dimensionar custos e retenção com o responsável.
2. Separar homologação e produção: bancos, projeto Supabase/URLs de autenticação, variáveis e credenciais independentes. Não reutilizar dados reais em testes.
3. Configurar APP_URL, Supabase e DATABASE_URL no backend; aplicar migrations após backup. Validar login, confirmação de e-mail, configuração inicial e isolamento de organizações.
4. Gerar par VAPID uma vez e armazenar chave privada somente no backend. Configurar contato, segredo e agendador conforme NOTIFICACOES_WEB_PUSH.md. Não registrar secrets ou endpoints pessoais nos logs.
5. Executar a homologação abaixo antes de convidar a usuária. Publicação e emissão fiscal de produção dependem de autorização explícita.

## Backup e restauração reproduzíveis

Preferir backups automáticos e recuperação por ponto no tempo do PostgreSQL gerenciado. Definir RPO/RTO: sugestão inicial a validar de RPO de 24h para backup diário e RTO de 4h; não são garantias até medição no ambiente real. Guardar cópia criptografada fora do servidor, acesso restrito, retenção diária de 30 dias e revisão periódica. Incluir arquivos anexados se houver armazenamento externo; dump do PostgreSQL não inclui esses arquivos nem contas Supabase Auth, chaves VAPID ou configurações da hospedagem.

Pré-requisito dos comandos: clientes `pg_dump`, `pg_restore` e `psql` compatíveis com PostgreSQL 17. Configure variáveis sem adicioná-las ao git e sem expor senhas no histórico compartilhado:

```sh
# DATABASE_BACKUP_URL é exclusiva do processo de backup.
# Defina-a no secret manager/ambiente, apontando para o banco a copiar.
npm run backup:create -- backups/revenda-AAAA-MM-DD.dump
# Crie separadamente um banco LOCAL vazio chamado revenda_restore_ensaio.
# RESTORE_TEST_DATABASE_URL aponta somente para esse banco descartável.
npm run backup:restore-test -- backups/revenda-AAAA-MM-DD.dump
```

O backup usa formato custom, nome exclusivo, arquivo parcial e permissões restritas. Falhas não deixam um arquivo final anunciado como completo. Credenciais passam pelo ambiente dos subprocessos, não pelos argumentos ou mensagens de erro. Transfira o dump para armazenamento criptografado; o arquivo em si contém dados pessoais e não é criptografado pelo comando.

O ensaio recusa destinos remotos, nomes fora de `revenda_restore_*` e bancos não vazios; não apaga tabelas. Restaura com interrupção em erro e verifica migrations, saldos e valores financeiros. Após falha, recrie apenas o banco descartável. O CI executa ida e volta com uma fixture sintética e verifica seu conteúdo; também testa bloqueio de sobrescrita, origem e banco não vazio.

No ambiente real, mensalmente restaure uma cópia isolada, confira totais/contagens de uma referência do backup, teste leitura autenticada sem disparar push/fiscal e registre duração, responsável e resultado. Uma restauração em produção é uma operação distinta, planejada, com aplicação paralisada e aprovação do responsável; este script nunca a realiza. Não reprocesse fatos offline antes de conferir a integridade após recuperação.

## Homologação ainda necessária em ambiente autenticado

- Configure conta e fixtures descartáveis, E2E_EMAIL/E2E_PASSWORD/E2E_ALLOW_WRITES e os IDs descritos no README. Execute `npm run test:orders:e2e` contra homologação. Nunca usar a conta comercial real.
- Computador: comprar dez unidades, reservar duas, editar para três, receber parte, concluir retirada e receber saldo; conferir caixa, estoque, margem e histórico.
- Offline: preparar o aparelho online, ativar modo avião, criar pedido/cliente e registrar recebimento/entrega, fechar/reabrir, reconectar e confirmar aplicação única. Perder a resposta de um envio não pode gerar outro pedido. Conflitos exigem conferência explícita.
- Android e iPhone físicos: instalar PWA, teclado virtual, legibilidade, armazenamento persistente, troca de rede, tela bloqueada e reabertura. Receber push com aplicação fechada, tocar e abrir área autenticada; não exigir horário exato do sistema operacional.
- Lembretes: dia/horário America/Sao_Paulo, começo/fim do mês, sem saldo, saldo quitado após enfileirar, permissão negada e desativação por aparelho.
- Cancelamentos: sem entrega, com entrega física, com/sem dinheiro recebido e com documento fiscal bloqueando. Confirmar trilha e saldo líquido, sem movimentações bancárias automáticas.
- Backup: executar ensaio de cópia real isolada e medir recuperação. Validar também recuperação de anexos e acesso Supabase.

Até esta homologação, testes automatizados de navegador usam HTTP/identidade e PushManager simulados; integração de serviços usa PostgreSQL real no CI. Nenhum resultado desses testes comprova recebimento de push em dispositivo físico, credenciais válidas de produção ou recuperação da infraestrutura completa.
