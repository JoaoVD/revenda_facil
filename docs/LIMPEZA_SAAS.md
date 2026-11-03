# Inspeção e limpeza SaaS — 03/11/2026

## Critério

Remover distribuição Windows, runtime/autenticação/banco exclusivos da aplicação local, demonstrações, código sem consumidores e registros históricos redundantes. Preservar funcionalidades comerciais/fiscais, isolamento, offline do navegador, migrations, testes relevantes e documentação operacional. Esta cópia não contém metadados Git; não foi possível comparar alterações por diff e nenhum commit foi feito.

## Removido do código-fonte

- `desktop/Launcher.cs`, runtime compilado e referência ao Node; scripts de build/atalho/controle/ciclo de vida desktop; instalador `.cmd`.
- Scripts `local.ts`, `local-db.ts`, `local-application.ts`; autenticação em arquivos `src/modules/auth/local.ts`; formulário/ação/rota de migração de usuário local e `/api/local-health`.
- Página `/previa`, seus dados ilustrativos, propriedades de prévia em componentes e CSS sem uso; seed/demo e teste visual da prévia.
- Adaptador fictício Nuvem Fiscal, consumido apenas por um teste do próprio stub. Transportes Focus e histórico ACBr continuam utilizados e foram mantidos.
- Testes exclusivos de autenticação/banco/launcher local. O E2E de pedidos foi adaptado para Supabase/PostgreSQL de teste em `tests/e2e/orders-offline.spec.ts`, com credenciais, fixtures e autorização explícita de escrita.
- Planos/specs históricos em `docs/superpowers`, resumo de continuidade, guias de iniciador/modo local, levantamento fiscal e relatório anterior de desenvolvimento. Regras atuais foram consolidadas no README, guia de operação e guia Focus.
- Dependências diretas sem uso `@hookform/resolvers`, `react-hook-form` e `tsx`. `@standard-schema/utils` saiu do lockfile por ser exclusivo do resolver. `esbuild` agora é dependência de desenvolvimento explícita, pois os testes de interface o utilizam. Nenhuma versão existente foi atualizada.

## Caminho único de execução

`npm run dev` executa Next.js. `npm run build` e `npm start` preparam/iniciam produção. Autenticação utiliza somente Supabase, mesmo que uma variável antiga `APP_MODE=local` permaneça no ambiente. Organizações continuam resolvidas pela Membership no servidor. Polling fiscal de processo persistente passou a ser opt-in explícito `FISCAL_POLLING_ENABLED=true`, mantendo homologação e sem enviar notas READY.

PGlite e seu socket permanecem apenas como dependências de desenvolvimento para testes descartáveis de serviços/migrations. Não são carregados pelo runtime SaaS. Compose também é ferramenta opcional para PostgreSQL de desenvolvimento.

## Preservado

- Dados existentes em `.local`, incluindo eventual banco antigo, credenciais locais e arquivo fiscal privado; `backups`; configurações e segredos existentes.
- Todas as migrations, schema comercial/fiscal, logs e históricos de negócio no banco.
- PWA, service worker, IndexedDB, comandos pendentes, idempotência, autorização, reservas, parcelas, recebimentos e lembretes.
- Testes de dinheiro, serviços, fiscal, concorrência, autenticação Supabase e armazenamento do navegador; workflow de qualidade PostgreSQL.

A retirada do runtime desktop **não migra** suas contas/dados para Supabase. Importação seria outro procedimento, com backup e conferência. `.local/fiscal` ainda é armazenamento privado utilizado pelo fiscal e exige volume persistente no SaaS.

## Verificações

- Grafo estático de imports, exports e imports dinâmicos: nenhum arquivo de aplicação órfão em `src`.
- Busca de referências: sem consumidores de autenticação local, prévia, instalador, scripts antigos ou adaptador fictício nos arquivos mantidos.
- Regressão de autenticação: primeiro falhou ao aceitar `APP_MODE=local` como configuração; após remoção, os três testes Supabase passaram.
- `npm run build`: passou; rotas de prévia, migração local e health local não aparecem no build.
- `npm run typecheck`: passou.
- `npm run lint -- --max-warnings=0`: passou.
- `npm run test:embedded`: 181 passaram e 1 foi ignorado (PostgreSQL convencional com conexões independentes).
- `npm test`: 149 passaram e 33 foram ignorados por ausência do banco de integração/opt-in PostgreSQL.
- `npm run test:ux`: navegação, foco/modal, fiscal e login/cadastro SaaS passaram, com fronteiras de servidor simuladas.
- `npm run test:orders:browser`: persistência, recarga, contas, bloqueio, várias abas, sessão expirada, fila e wizard passaram em Chrome; HTTP simulado.
- `E2E_BASE_URL=http://127.0.0.1:3000 UX_BROWSER_CHANNEL=chrome npm run test:e2e`, contra `npm start` do build de produção: 2 passaram (acesso protegido/login em desktop e celular), 4 ignorados. Casos autenticados exigem conta/fixtures de teste; não foram apresentados como executados. O servidor iniciado para esta verificação foi encerrado depois. A tentativa anterior com servidor automático ficou presa no encerramento do ambiente e foi interrompida; uma execução sem servidor respondeu conexão recusada. A repetição com servidor de produção explícito terminou com código zero.
- `npm ci --dry-run --ignore-scripts --offline --no-audit --no-fund`: passou após ajuste do lockfile. Foi simulação, não reinstalação. Tentativas de regeneração pelo npm esbarraram num tarball opcional Tailwind ausente do cache; o lockfile foi ajustado removendo entradas não utilizadas e preservando versões/integridades existentes.
- Revisão independente somente leitura: nenhuma regressão crítica/importante identificada; CSS residual apontado foi removido.

Não houve homologação Supabase remota, publicação nem emissão fiscal real nesta limpeza.

## Resíduos que o ambiente impediu excluir

A política do ambiente rejeitou exclusões por shell, inclusive a exclusão individual de `Revenda Facil.exe`: exigiu aprovação de sandbox, mas esse tipo de aprovação está desabilitado. Não foi tentado contornar essa exigência com outro executável.

Consequentemente, o executável legado, caches `.cache`/`.npm-cache`, imagens de testes em `artifacts`, diretórios vazios e alguns arquivos gerados permanecem no disco, fora do runtime e ignorados no Git. `.next` é também o build de produção validado e `node_modules` contém a instalação utilizada nos testes, possivelmente ainda com pacotes extrínsecos ao manifesto. Uma futura instalação limpa por `npm ci` usa o manifesto/lockfile reduzidos. Não houve remoção de `.local` nem de `backups`.
