# Notificações Web Push

## O que foi implementado

Uma única aplicação web/PWA, sem lojas de aplicativos. Inscrição por usuário/organização e aparelho, ativação por clique, teste remoto, desativação, fila persistente mensal e transporte pelo protocolo Web Push com criptografia e assinatura VAPID via `web-push`.

As inscrições são armazenadas no PostgreSQL, não em memória do processo. A API resolve a organização pela sessão Supabase. Uma conta não consulta, testa, exclui ou se apropria da inscrição de outra. Endpoints externos aceitos são restritos aos serviços de Google, Apple, Mozilla e Microsoft. Não são aceitos destinos HTTP, privados ou portas arbitrárias. Há limite de dez inscrições por conta e organização e intervalo de um minuto entre testes por inscrição.

`GET /api/push` retorna apenas disponibilidade e chave pública. `POST /api/push` exige origem confiável, autenticação e JSON, com ações status/subscribe/unsubscribe/test. Nunca retorne endpoint/chaves ou corpo de erro do provedor em logs ou mensagens. Respostas privadas usam no-store.

## Configurar no servidor

1. Aplique migrations com `npm run db:migrate`, incluindo `202611040001_web_push`.
2. Publique apenas quando autorizado, com HTTPS e APP_URL correspondente à origem pública.
3. Execute `npm run push:keys` UMA vez em terminal privado. Guarde o par em seu gerenciador de secrets. Não inclua `.env` no Git e não cole a chave privada em chats.
4. Defina NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY e WEB_PUSH_SUBJECT. O contato deve ser real, por exemplo `mailto:responsavel@seudominio.com.br`. O backend valida o par e só libera inscrição quando completo. A chave pública é consultada em runtime pela API; a privada nunca vai ao navegador.
5. Defina REMINDER_SCHEDULER_SECRET forte e independente das chaves VAPID.
6. Reinicie/republique o backend após configurar as variáveis e aplique a configuração também no processo agendador.

Nenhuma chave real foi incluída no projeto. Trocar o par VAPID exige reinscrever aparelhos; inscrições com outra chave são invalidadas no envio.

## Agendamento na nuvem

O provedor deve executar a cada minuto um POST autenticado para `/api/reminders/run`. O endpoint não depende de sessão de navegador. Compare o segredo no backend com tempo constante. Nunca coloque esse segredo em query string, variável pública ou código do frontend.

Em um processo Node com ambiente configurado:

```bash
node scripts/run-reminders.mjs
```

Em desenvolvimento usando o arquivo `.env`:

```bash
npm run reminders:run
```

Em um servidor Linux persistente, um exemplo de cron é:

```cron
* * * * * cd /srv/revenda-facil && /usr/bin/node --env-file=/srv/revenda-facil/.env scripts/run-reminders.mjs
```

Adapte caminho do Node e do checkout. Em hospedagem sem processo persistente, configure o agendador do provedor ou um serviço externo para efetuar o mesmo POST. O repositório não provisiona nem contrata esse serviço. Confirme se o plano suporta periodicidade e duração; a rota declara maxDuration=60 e processa até cinco jobs por chamada. Falhas retornam HTTP não-2xx; configure alertas operacionais no agendador.

O agendamento respeita America/Sao_Paulo e a preferência salva. Dia inexistente usa o último dia do mês. Rodadas simultâneas compartilham a chave única mensal e leases dos jobs. Antes do envio, reveja saldo, revisão/adiamento e vínculo da inscrição à organização. Inscrições encerradas (404/410) são removidas; outras falhas têm retentativas limitadas na fila.

## Experiência no aparelho

Abra Configurações → Lembretes, escolha dia/horário e salve. Ative neste aparelho e aceite a permissão do sistema. No iPhone/iPad, adicione à Tela de Início, abra pelo ícone e então ative; é necessário um sistema compatível com Web Push (iOS/iPadOS 16.4+). Se a permissão estiver bloqueada, explique como liberar nas configurações do aparelho/navegador.

Enviar teste faz uma chamada REAL ao serviço push após a inscrição, mesmo sem dívidas. A resposta 202 confirma aceitação pelo provedor; não comprova que o usuário viu a notificação. Confira o aparelho. Desativar remove primeiro a inscrição do servidor e depois a do navegador. Se houver falha de conexão, tente novamente. Os avisos internos continuam independentes.

As mensagens têm texto fixo sem nomes e valores. Tocar abre a área autenticada e consulta o saldo atual. O agendamento pode rodar com o aplicativo fechado, mas depende do servidor e do serviço push. Celular sem internet recebe dentro da validade, se o serviço conseguir entregar; o prazo não é garantido e a mensagem expira após 24 horas. Modo Foco, economia de bateria e permissões podem atrasar/bloquear exibição. Dados ainda offline no celular não são conhecidos pelo agendador até sincronizar.

Há prevenção de duplicidade na fila, topic e tag de agrupamento. Não existe garantia de exatamente uma exibição: queda após o provedor aceitar e antes do banco registrar SENT pode ocasionar reenvio. Um aviso já aceito também não pode ser retirado de um aparelho offline após quitação. Por isso o conteúdo é genérico e a consulta ao abrir usa dados atuais.

## Verificação e homologação

- Vitest: contratos, validação VAPID, isolamento, origem, sessão, limitação de testes, falhas sanitizadas, expiração e textos do service worker.
- Integração: migrations e persistência; inscrição concorrente idempotente, organizações isoladas, testes concorrentes e remoção 410.
- `npm run test:push:browser`: componente em Chromium com limites HTTP, PushManager e permissão simulados. Verifica ativar/testar/desativar, permissão apenas por clique, instrução iPhone e largura desktop/mobile. Não realiza envio real.

Antes de considerar produção homologada: em HTTPS, validar em Android e iPhone reais, aceitar/negar permissão, receber teste com tela bloqueada e aplicação fechada, tocar e autenticar, executar lembrete agendado, testar desativação, dois aparelhos e inscrição expirada. Confira também o aviso no computador. Este roteiro exige ambiente publicado autorizado e credenciais; a execução local/CI não equivale à entrega real em um aparelho.

Referências oficiais: https://github.com/web-push-libs/web-push ; https://web.dev/articles/push-notifications-overview ; https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
