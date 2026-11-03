# Fiscal — Focus NFe em homologação

Novas solicitações usam Focus NFe para NF-e (55) e NFC-e (65). Emissão de produção está bloqueada. A ausência de configuração fiscal não bloqueia pedidos, estoque ou recebimentos.

Configure no backend `FOCUS_NFE_ENVIRONMENT=homologacao` e `FOCUS_NFE_TOKEN` com o token de homologação da empresa emitente. Nunca use `NEXT_PUBLIC` para esse token. Certificado, credenciamento, CSC/ID CSC e parâmetros tributários devem ser configurados e validados pelo responsável no provedor; não envie esses segredos ao repositório.

1. Configure PostgreSQL e Supabase conforme README e aplique `npm run db:migrate`.
2. Em Configurações > Fiscal, complete emitente, produtos e destinatários.
3. Em Notas Fiscais, prepare e revise os dados. O envio exige confirmação explícita.
4. Consulte o resultado atual; situações incertas não autorizam reenvio automático.
5. Cancelamento fiscal, cancelamento comercial e devolução financeira são operações diferentes.

Em servidor Node persistente, `FISCAL_POLLING_ENABLED=true` ativa consulta periódica de solicitações já enviadas e arquivamento; não transmite notas apenas preparadas. Em ambientes sem processo persistente, a consulta manual permanece disponível e o agendamento externo requer integração operacional. Não há autorização para emissão offline.

Documentos fiscais são privados e os arquivos continuam arquivados no diretório de servidor `.local/fiscal`. Esse diretório precisa de volume persistente e backup no SaaS; não deve ser servido publicamente. Essa área não é o antigo banco embarcado. Arquivos e documentos históricos ACBr são preservados com o provedor original; por isso, o código de leitura/reconciliação legado foi mantido.

Nenhuma homologação remota, contratação ou emissão de produção foi realizada nesta limpeza.
