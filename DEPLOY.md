# Implantação passo a passo

Ordem sugerida: Supabase → teste local → Vercel → integrações opcionais.

## 1. Supabase
1. Crie o projeto em https://supabase.com (região São Paulo). Guarde a senha do banco.
2. **Database > Extensions**: ative `pg_cron`, `pg_trgm` e `pg_net`, se pedidos.
3. **SQL Editor**: execute em ordem, uma por vez, cada arquivo de `supabase/migrations/`: `0001` a `0009`. Se alguma falhar, pare e corrija antes de seguir. Desde a `0009`, quem se cadastra pela aba "Criar cadastro" nasce **inativo** e o admin aprova em `/usuarios`. Usuários criados no dashboard também nascem inativos: ative o primeiro admin com `update profiles set active=true, role='admin' where email='SEU_EMAIL';`. Se "Confirm email" estiver ligado no Supabase, o usuário também precisa confirmar o e-mail.
4. **Authentication > Users**: crie `admin@base.test`, `operador@base.test` e `motorista@base.test` (marque "Auto confirm"). Depois troque por e-mails e senhas reais.
5. Execute `supabase/seed.sql` (dados de exemplo). Pule em produção real, exceto a promoção do primeiro admin.
6. **Authentication > URL Configuration**: defina Site URL com o domínio da Vercel e adicione `https://SEU-DOMINIO/auth/callback` em Redirect URLs.
7. **Project Settings > API**: copie URL, `anon key` e `service_role key` (esta é secreta, nunca vá ao navegador).
8. **Realtime**: confirme que as tabelas `rides` e `drivers` estão na publicação `supabase_realtime`. A migração `0003` já cuida disso.

## 2. Teste local
1. Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
2. Gere as chaves de push: `npx web-push generate-vapid-keys`. Preencha `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT=mailto:voce@empresa.com`.
3. `npm install`, `npm run dev`, abra http://localhost:3000 e entre como admin.

## 3. Vercel
1. Suba o código para um repositório no GitHub e importe em https://vercel.com (a pasta raiz é `app`).
2. Em **Settings > Environment Variables**, cadastre todas as variáveis do `.env.example` que você for usar. Obrigatórias: as do Supabase, VAPID e `CRON_SECRET` (texto longo e aleatório).
3. Faça o deploy. O `vercel.json` agenda `/api/cron/tick` a cada 5 minutos. O plano Hobby só permite 1 execução por dia: use o Pro, ou chame a URL de outro agendador com `Authorization: Bearer <CRON_SECRET>`.
4. Volte ao Supabase e atualize Site URL e Redirect URLs com o domínio final.
5. No celular, abra o site, entre como motorista e use "Adicionar à tela inicial" (PWA). Ative as notificações quando o app pedir.

## 4. Integrações (opcionais, em qualquer ordem)
| Recurso | Variáveis | Observação |
|---|---|---|
| E-mail de relatórios | `RESEND_API_KEY`, `EMAIL_FROM` | Verifique o domínio no Resend |
| Google Sheets | `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID` | Compartilhe a planilha com a conta de serviço |
| Leitura por IA | `OPENAI_API_KEY` | Sem ela, o cadastro é manual |
| WhatsApp Business | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Webhook: `https://SEU-DOMINIO/api/webhooks/whatsapp` |
| E-mail de entrada | `EMAIL_WEBHOOK_SECRET` | Webhook: `https://SEU-DOMINIO/api/webhooks/email` |
| Sentry | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Crie um projeto Next.js no Sentry |
| Backup | secret `BACKUP_DATABASE_URL` no GitHub | Use a string de conexão do banco (modo session) |

Detalhes de cada integração estão no [README](./README.md).

## 5. Checklist final
- [ ] Login funciona e o operador não vê Financeiro, Relatórios, Auditoria e Configurações.
- [ ] O motorista só vê as próprias corridas.
- [ ] Atribuir uma corrida gera notificação push no celular do motorista.
- [ ] O painel atualiza sozinho quando o motorista aceita.
- [ ] Finalizar uma corrida lança o repasse e aparece em Financeiro.
- [ ] O cron roda (tabela `jobs` sem itens parados em `pending`).
- [ ] Troque as senhas de exemplo e remova os usuários `@base.test`.
- [ ] Anexe um comprovante de pagamento para testar o Storage (`0005_storage.sql` ainda não foi validado em ambiente real).
