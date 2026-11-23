# Sistema de Gestão de Corridas — Fase 1

Next.js 16 + TypeScript + Tailwind + Supabase.

## Configuração

1. Crie um projeto em https://supabase.com.
2. No **SQL Editor**, execute em ordem: `supabase/migrations/0001_schema.sql` e `supabase/migrations/0002_cron.sql`. O `0002` precisa da extensão pg_cron, que é ativada em Database > Extensions.
3. Em **Authentication > Users**, crie três usuários (marque "Auto confirm"):
   - `admin@base.test`
   - `operador@base.test`
   - `motorista@base.test`
4. Execute `supabase/seed.sql`. Ele promove os papéis e cria clientes, motoristas e corridas de exemplo.
5. Copie `.env.example` para `.env.local` e preencha a URL e a anon key do projeto.
6. Rode:

```
npm install
npm run dev
npm test
```

## Checklist de teste

- Entrar como admin: painel com indicadores, clientes, motoristas e corridas.
- Criar uma corrida em `/corridas/nova`: o repasse é sugerido e há aviso de conflito de horário.
- Atribuir um motorista, aceitar/iniciar/finalizar e ver o histórico de status.
- Entrar como operador: não vê PIX nem taxa de repasse dos motoristas.
- Entrar como motorista: vê somente as próprias corridas.
- Busca global no topo e corridas recorrentes em `/recorrentes`.

## Fase 2 — App do motorista (PWA), push e tempo real

1. Execute `supabase/migrations/0003_realtime_push.sql` no SQL Editor.
2. Gere as chaves de push: `npx web-push generate-vapid-keys`. Preencha no `.env.local`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `SUPABASE_SERVICE_ROLE_KEY` (Project Settings > API; nunca publique essa chave).
3. Reinicie o `npm run dev`. Push exige HTTPS (`localhost` funciona; no celular use a URL da Vercel).

### Checklist
- Motorista, no celular: abra `/motorista`, toque em "Ativar notificações" e instale o app ("Adicionar à tela inicial").
- Operador/admin: atribua uma corrida ao motorista; chega a notificação e o card "Nova corrida" aparece sozinho.
- Motorista aceita/recusa (com motivo)/inicia/finaliza; o painel da base muda sem recarregar.
- Botões de ligar, WhatsApp, Google Maps e Waze no card da corrida confirmada.
- Deixe uma corrida enviada sem resposta por mais de 10 min (`settings.driver_response_timeout_minutes`): aparece o alerta amarelo no topo do painel.

## Fase 3 — Financeiro

Execute no SQL Editor, em ordem: `supabase/migrations/0004_finance.sql` e `supabase/migrations/0005_storage.sql` (bucket privado `receipts` para comprovantes).

Como testar (logado como admin):
1. Em **Financeiro > Novo fechamento**, escolha motorista, período (semanal/quinzenal/mensal) e data inicial; confira o resumo e crie o fechamento.
2. Abra o fechamento: lance um desconto e um acréscimo (a justificativa é obrigatória).
3. Registre um pagamento parcial com comprovante: o status vira "Parcial". Pague o saldo: vira "Pago".
4. **Faturamento por cliente**: escolha o período e clique no cliente para ver as corridas a cobrar.
5. Entre como motorista, abra **Meu financeiro** e veja só os seus fechamentos.
6. Entre como operador: o menu Financeiro não aparece e o acesso é bloqueado.
7. Finalize uma corrida: o repasse é lançado automaticamente.

O bucket de comprovantes (0005) só pode ser testado no Supabase real.

## Fase 4 — Relatórios, exportação e Google Sheets

Execute no SQL Editor: `supabase/migrations/0006_reports.sql` (relatórios, fila `jobs`, envio agendado e fila do Sheets).

### Configuração (variáveis de ambiente na Vercel / `.env.local`)
- `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` (qualquer texto longo e aleatório). O `vercel.json` chama `/api/cron/tick` a cada 5 minutos; a Vercel envia o `CRON_SECRET` automaticamente. No plano Hobby o cron só roda 1x por dia: use o plano Pro ou chame a URL de outro agendador com o cabeçalho `Authorization: Bearer <CRON_SECRET>`.
- **E-mail** (Resend): `RESEND_API_KEY` e `EMAIL_FROM` (domínio verificado).
- **Google Sheets**: crie uma conta de serviço no Google Cloud, ative a API Google Sheets, compartilhe a planilha com o e-mail da conta (editor) e preencha `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (a chave inteira, com `\n`) e `GOOGLE_SHEETS_ID` (o trecho da URL entre `/d/` e `/edit`).

### Como testar (admin, menu **Relatórios**)
1. Alterne Diário / Semanal / Mensal e a data de referência: veja realizadas, canceladas, faturado, repasse e margem, por dia, motorista e cliente.
2. **Exportar planilha**: baixe .xlsx (abas Consolidado, Por dia, uma por motorista e uma por cliente) ou CSV (abre direto no Excel pt-BR).
3. **Envio automático**: agende um relatório e clique em "enviar agora". O e-mail com o .xlsx chega após o próximo ciclo do cron.
4. **Google Sheets**: finalize uma corrida; em até 5 minutos surge uma linha nas abas Consolidado, do motorista e do cliente. Use "Sincronizar" para enviar corridas antigas (não duplica as já enviadas).
5. Operador: o menu Relatórios não aparece e o banco bloqueia as consultas.

Tarefas em segundo plano ficam na tabela `jobs` (até 5 tentativas com espera crescente; `status = 'failed'` indica problema de credencial).

## Fase 5 — Leitura de mensagens por IA, WhatsApp Business e e-mail

Rode a migração `0007_inbound.sql`.

### Configuração
- **IA**: `OPENAI_API_KEY` (opcional `OPENAI_MODEL`, `OPENAI_BASE_URL`). Sem a chave, o sistema segue funcionando com cadastro manual.
- **WhatsApp**: no Meta for Developers, produto WhatsApp, Configuração do webhook: URL `https://SEU-DOMINIO/api/webhooks/whatsapp`, token de verificação = `WHATSAPP_VERIFY_TOKEN`, assine o campo `messages`. Coloque o App Secret em `WHATSAPP_APP_SECRET` (as chamadas são validadas por assinatura HMAC).
- **E-mail**: configure o inbound do provedor (ex.: Postmark Inbound) para fazer POST em `https://SEU-DOMINIO/api/webhooks/email` com o cabeçalho `Authorization: Bearer <EMAIL_WEBHOOK_SECRET>` (ou `?secret=`). Aceita o JSON do Postmark (`MessageID`, `From`, `Subject`, `TextBody`) ou `{ id, from, subject, text }`. Para IMAP, use um pequeno serviço que repasse cada e-mail a esse endereço.
- Os webhooks têm limite de requisições por IP, limite de tamanho e deduplicação por ID da mensagem. A leitura por IA roda na fila (o cron da Fase 4).

### Como testar
1. **Nova corrida → Colar mensagem**: cole um pedido, clique em *Preencher com IA*, revise e salve. A corrida fica com origem "ai_paste" e guarda a mensagem original.
2. **Webhook de e-mail** (sem provedor): `curl -X POST https://SEU-DOMINIO/api/webhooks/email -H "Authorization: Bearer SEGREDO" -H "content-type: application/json" -d '{"id":"t1","from":"rh@empresa.com","subject":"Corrida","text":"Amanhã 8h, Ana Souza, Av. Paulista 1000 para Aeroporto de Guarulhos. R$ 150"}'`.
3. Menu **Entrada**: a mensagem aparece (após o próximo ciclo do cron) com os dados lidos. *Criar corrida* abre o formulário preenchido; ao salvar, a mensagem vira "Corrida criada". *Ignorar* descarta.
4. Motorista não acessa a Entrada; o banco bloqueia a leitura.

## Fase 6 — Endurecimento

Rode a migração `0008_hardening.sql`.

## Cadastro liberado
Rode `0009` e depois `0010_signup_open.sql`: quem cria conta na aba "Criar cadastro" já entra direto como operador, sem aprovação. O admin continua podendo desativar usuários em `/usuarios`.
Rode a migração `0009_signup_approval.sql`. A aba "Criar cadastro" na tela de login cria o usuário inativo; o admin aprova (e define o papel operador/admin) em `/usuarios`. O login valida e-mail, senha e se o perfil está ativo. Usuários criados manualmente nascem inativos: ative-os em `/usuarios` ou via SQL (o primeiro admin precisa ser via SQL).

- **Configurações** (admin): prazo de resposta do motorista (1 a 240 min). A alteração é auditada.
- **Auditoria** (admin): quem fez o quê e quando, com filtro por tabela e paginação; mostra os campos alterados.
- **Cache do painel**: os números do painel ficam em cache por 30 segundos (por perfil). O RLS continua valendo.
- **Rate limiting**: login (10 por 5 min por IP), recuperação de senha (5 por 10 min) e webhooks. Exige `SUPABASE_SERVICE_ROLE_KEY`; sem ela o limite fica desativado.
- **Sentry**: preencha `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN` para registrar erros do servidor e do navegador.
- **Cabeçalhos de segurança** em todas as páginas (nosniff, frame deny, HSTS, referrer).
- **Backup diário**: `.github/workflows/backup.yml` gera um `pg_dump` às 03:00 (Brasília) e guarda por 30 dias. Crie o secret `BACKUP_DATABASE_URL` (string de conexão do Supabase) no GitHub. Ative também o backup nativo do Supabase (plano Pro).

### Como testar
1. Admin: Configurações → altere o prazo e salve; veja o registro em Auditoria.
2. Faça 11 logins errados seguidos: aparece "Muitas tentativas".
3. Operador: Auditoria e Configurações não aparecem no menu e o acesso direto redireciona.
