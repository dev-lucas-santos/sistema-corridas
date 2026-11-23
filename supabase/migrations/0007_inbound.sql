-- Fase 5: caixa de entrada (WhatsApp / e-mail), extração por IA e rate limiting das rotas públicas.

alter table jobs drop constraint jobs_type_check;
alter table jobs add constraint jobs_type_check check (type in ('sheets_ride', 'report_email', 'inbound_extract'));

create table inbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'email')),
  external_id text not null,
  sender text,
  sender_name text,
  subject text,
  body text not null,
  status text not null default 'received' check (status in ('received', 'ready', 'failed', 'processed', 'ignored')),
  extracted jsonb,
  ride_id uuid references rides(id) on delete set null,
  received_at timestamptz not null default now(),
  handled_by uuid references profiles(id),
  unique (channel, external_id)
);
create index inbound_status_idx on inbound_messages (status, received_at desc);
alter table inbound_messages enable row level security;
-- Inserção só pelo servidor (service role, webhooks). Equipe lê e atualiza o status.
create policy inbound_staff_read on inbound_messages for select using (is_staff());
create policy inbound_staff_update on inbound_messages for update using (is_staff()) with check (is_staff());

create trigger audit_inbound after update on inbound_messages for each row execute function audit_trigger();

-- Rate limiting por janela fixa (chamado só pelo servidor)
create table rate_limits (
  key text not null,
  bucket bigint not null,
  hits int not null default 0,
  primary key (key, bucket)
);
alter table rate_limits enable row level security;

create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare b bigint := floor(extract(epoch from now()) / p_window_seconds); n int;
begin
  if random() < 0.01 then delete from rate_limits where bucket < b - 100; end if;
  insert into rate_limits (key, bucket, hits) values (p_key, b, 1)
  on conflict (key, bucket) do update set hits = rate_limits.hits + 1
  returning hits into n;
  return n <= p_limit;
end $$;
revoke execute on function rate_limit_hit from public, anon, authenticated;
grant execute on function rate_limit_hit to service_role;
