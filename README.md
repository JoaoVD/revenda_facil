# Revenda Fácil

SaaS para revendedoras: produtos, compras, estoque, pedidos, clientes, recebimentos e acompanhamento fiscal. Monólito modular com Next.js App Router, React, TypeScript strict, Prisma/PostgreSQL, Supabase Auth e Tailwind.

Computador e celular utilizam a mesma organização no servidor. O offline usa IndexedDB e fila de comandos no navegador; não existe instalação desktop, autenticação própria em arquivos ou banco embarcado de produção.

## Instalação

Recomendado: Node.js 24 LTS e PostgreSQL 17. Configure um projeto Supabase Auth. Para um PostgreSQL de desenvolvimento, `compose.yaml` é opcional.

```powershell
npm ci
# Copie .env.example para .env e configure PostgreSQL/Supabase/APP_URL.
npm run db:generate
npm run db:migrate
npm run dev
```

Produção:

```powershell
npm run build
npm start
```

No PowerShell, use `npm.cmd` se o wrapper `npm.ps1` estiver bloqueado. Não use `prisma db push`: migrations incluem constraints SQL que protegem dinheiro e estoque. Aplique migrations após backup consistente.

Supabase: habilite e-mail/senha e confirmação de e-mail; configure Site URL e redirects para `${APP_URL}/login`. As tabelas comerciais são acessadas pelo backend Prisma. Não exponha essas tabelas pela Data API sem política de isolamento adequada. Nunca use service role no frontend. Um usuário tem uma Membership nesta versão; organização é resolvida no servidor.

## Operação

- `/`: Dashboard no computador e Meu dia no celular. `/dashboard`: resumo em ambos.
- `/pedidos`, `/pedidos/novo`, `/pedidos/[id]`: catálogo, atendimento, pagamento e histórico.
- `/receber`: saldos em aberto, vencidos e sem data.
- `/operacao`: cópia e fila persistentes do aparelho, também usadas no fallback offline.
- Produtos, compras, estoque, clientes, financeiro, fiscal, relatórios e configurações permanecem na navegação.

Estoque físico, reservado e disponível são separados. Confirmação reserva; entrega/retirada baixa uma vez; recebimento não movimenta estoque. Dinheiro usa Decimal e `numeric`, com validação, transações e idempotência. Vendas antigas foram migradas como concluídas sem novas baixas.

Leia o [guia de operação e sincronização](docs/OPERACAO_E_SINCRONIZACAO.md) para regras, preparação offline, conflitos, segurança e backup. A configuração fiscal está em [Focus NFe](COMO_CONFIGURAR_FOCUS.md); produção fiscal permanece bloqueada.

## Verificação

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run test:embedded
npm run test:ux
npm run test:orders:browser
npm run build
npm run test:e2e
```

`test:embedded` aplica migrations em PGlite descartável e verifica serviços reais. PGlite é uma ferramenta de teste, não o banco de execução do SaaS. Não comprova concorrência PostgreSQL com conexões independentes.

Os testes de recuperação offline do Vitest usam IndexedDB emulado (`fake-indexeddb`) e HTTP simulado. Cobrem indisponibilidade prolongada, resposta perdida, idempotência local, confirmação inválida, coordenação entre abas e distinção entre falha temporária e conflito comercial. Não substituem testes em navegador físico. A fila retoma automaticamente falhas temporárias com intervalos progressivos; pausas antigas por limite de transporte são recuperadas sem reabrir rejeições comerciais.

Para integração PostgreSQL, use banco descartável migrado e `TEST_DATABASE_URL`. Para a corrida entre conexões independentes, defina também `TEST_POSTGRES_CONCURRENCY=1`. Nunca aponte testes para o banco comercial. O workflow `.github/workflows/quality.yml` utiliza PostgreSQL 17.

Testes de componentes usam Chrome instalado (`UX_BROWSER_CHANNEL=chrome` por padrão) e fronteiras HTTP simuladas. Playwright E2E usa o SaaS real. Os testes autenticados exigem conta e organização de teste, `E2E_EMAIL`, `E2E_PASSWORD` e `E2E_ALLOW_WRITES=true`. O fluxo offline adicional exige `E2E_PRODUCT_ID`, `E2E_PRODUCT_NAME` e `E2E_CUSTOMER_ID`: produto ativo a R$ 100, pelo menos dez unidades livres e cliente da organização. Testes rodam em série, criam dados identificados como TEST/E2E e exigem ambiente descartável. Não há bypass de autenticação para testes.

## Limitações atuais

Snapshots locais são limitados; sincronização incremental e resolução assistida de conflitos não estão concluídas. Também faltam rascunhos editáveis, edição do atendimento, devolução financeira, outros meios de pagamento e alocação entre compras. Lembretes internos e integração Web Push estão implementados; envio real depende de HTTPS, chaves VAPID, agendador e inscrição autorizada no aparelho. Instalação PWA, recebimento real de push e teclado virtual físico de Android/iOS precisam de homologação. Relatórios avançados continuam em desenvolvimento.

## Notificações no celular

Em Configurações → Lembretes, salve dia/horário e ative as notificações por aparelho. Há teste de envio e desativação independente do aviso interno. No iPhone/iPad, adicione à Tela de Início e abra pelo ícone antes de ativar. Não há pedido de permissão automático ao entrar.

Leia [configuração e homologação de Web Push](docs/NOTIFICACOES_WEB_PUSH.md). A chave privada e o segredo do agendador ficam apenas no backend. `npm run push:keys` gera o par VAPID; `npm run reminders:run` executa uma rodada do agendador usando `.env`. `npm run test:push:browser` testa o componente em Chromium com permissão/PushManager/HTTP simulados.

Escopo da remoção de componentes não SaaS e verificações: [limpeza do projeto](docs/LIMPEZA_SAAS.md).
