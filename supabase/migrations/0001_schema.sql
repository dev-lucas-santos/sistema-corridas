-- Esquema inicial. Valores monetários em centavos (integer/bigint). Datas em timestamptz.
create extension if not exists pg_trgm;

create type user_role as enum ('admin', 'operator', 'driver');
create type ride_status as enum ('pending', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled');
create type assignment_status as enum ('sent', 'accepted', 'declined', 'expired', 'cancelled');
create type driver_availability as enum ('online', 'busy', 'offline');
create type payout_type as enum ('percent', 'fixed');
create type ride_source as enum ('manual', 'ai_paste', 'whatsapp', 'email', 'recurring');
create type payment_status as enum ('pending', 'partial', 'paid');
create type closing_period as enum ('weekly', 'biweekly', 'monthly');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===== profiles (1:1 com auth.users) =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role user_role not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();

-- Novo usuário: cria perfil. O papel nunca vem do cliente: padrão 'operator'; o admin altera depois.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'operator');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Helpers de papel (security definer evita recursão de RLS)
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','operator') from profiles where id = auth.uid() and active), false)
$$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and active), false)
$$;

-- ===== clients =====
create table clients (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  cnpj text,
  contact_name text,
  email text,
  phone text,
  payment_terms text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_cnpj_uq on clients (cnpj) where cnpj is not null;
create index clients_name_trgm on clients using gin (legal_name gin_trgm_ops);
create trigger trg_clients_updated before update on clients for each row execute function set_updated_at();

-- ===== drivers =====
create table drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  cpf text,
  cnh_number text,
  cnh_expires_on date,
  vehicle_plate text,
  vehicle_model text,
  availability driver_availability not null default 'offline',
  weekly_schedule jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drivers_availability_idx on drivers (availability) where active;
create index drivers_name_trgm on drivers using gin (full_name gin_trgm_ops);
create trigger trg_drivers_updated before update on drivers for each row execute function set_updated_at();

-- Dados financeiros sensíveis separados: operador NÃO lê (RLS abaixo).
create table driver_payout_settings (
  driver_id uuid primary key references drivers(id) on delete cascade,
  pix_key text,
  payout_type payout_type not null default 'percent',
  payout_percent_bp integer not null default 7000 check (payout_percent_bp between 0 and 10000), -- 7000 = 70%
  payout_fixed_cents bigint not null default 0 check (payout_fixed_cents >= 0),
  updated_at timestamptz not null default now()
);
create trigger trg_dps_updated before update on driver_payout_settings for each row execute function set_updated_at();

-- ===== recurring rules =====
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  driver_id uuid references drivers(id),
  passenger_name text not null,
  passenger_phone text,
  origin text not null,
  destination text not null,
  weekdays smallint[] not null check (array_length(weekdays,1) > 0), -- 0=domingo..6=sábado
  pickup_time time not null,
  price_cents bigint not null check (price_cents >= 0),
  driver_payout_cents bigint not null check (driver_payout_cents >= 0),
  notes text,
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  last_generated_on date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_recurring_updated before update on recurring_rules for each row execute function set_updated_at();

-- ===== rides =====
create table rides (
  id uuid primary key default gen_random_uuid(),
  code bigint generated always as identity,
  client_id uuid references clients(id),
  driver_id uuid references drivers(id),
  recurring_rule_id uuid references recurring_rules(id),
  passenger_name text not null,
  passenger_phone text,
  origin text not null,
  destination text not null,
  scheduled_at timestamptz not null,
  price_cents bigint not null default 0 check (price_cents >= 0),
  driver_payout_cents bigint not null default 0 check (driver_payout_cents >= 0),
  status ride_status not null default 'pending',
  source ride_source not null default 'manual',
  source_raw_message text,
  notes text,
  started_at timestamptz,
  finished_at timestamptz,
  cancelled_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rides_scheduled_at_idx on rides (scheduled_at desc);
create index rides_status_idx on rides (status, scheduled_at);
create index rides_driver_idx on rides (driver_id, scheduled_at);
create index rides_client_idx on rides (client_id, scheduled_at);
create index rides_passenger_trgm on rides using gin (passenger_name gin_trgm_ops);
create index rides_phone_idx on rides (passenger_phone);
create unique index rides_recurring_uq on rides (recurring_rule_id, scheduled_at) where recurring_rule_id is not null;
create trigger trg_rides_updated before update on rides for each row execute function set_updated_at();

create table ride_status_history (
  id bigint generated always as identity primary key,
  ride_id uuid not null references rides(id) on delete cascade,
  from_status ride_status,
  to_status ride_status not null,
  changed_by uuid references profiles(id),
  note text,
  changed_at timestamptz not null default now()
);
create index rsh_ride_idx on ride_status_history (ride_id, changed_at);

create table ride_assignments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id) on delete cascade,
  driver_id uuid not null references drivers(id),
  status assignment_status not null default 'sent',
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  decline_reason text,
  assigned_by uuid references profiles(id)
);
create index ra_ride_idx on ride_assignments (ride_id);
create index ra_driver_idx on ride_assignments (driver_id, status);
create unique index ra_one_open_per_ride on ride_assignments (ride_id) where status in ('sent','accepted');

-- ===== financeiro (usado na fase 3; já criado para não refazer o banco) =====
create table payment_closings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  period closing_period not null,
  period_start date not null,
  period_end date not null,
  rides_total_cents bigint not null default 0,
  adjustments_total_cents bigint not null default 0,
  net_cents bigint not null default 0,
  status payment_status not null default 'pending',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index pc_driver_idx on payment_closings (driver_id, period_start);

create table payments (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid references payment_closings(id),
  driver_id uuid not null references drivers(id),
  ride_id uuid references rides(id),
  amount_cents bigint not null,
  paid_cents bigint not null default 0,
  status payment_status not null default 'pending',
  paid_at timestamptz,
  receipt_path text,
  created_at timestamptz not null default now()
);
create index payments_driver_idx on payments (driver_id, status);
create unique index payments_ride_uq on payments (ride_id) where ride_id is not null;

create table adjustments (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid references payment_closings(id) on delete cascade,
  driver_id uuid not null references drivers(id),
  amount_cents bigint not null, -- negativo = desconto
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ===== notificações e push =====
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ===== settings =====
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into settings (key, value) values ('driver_response_timeout_minutes', '10');

-- ===== audit_logs =====
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_table_idx on audit_logs (table_name, record_id);
create index audit_created_idx on audit_logs (created_at desc);

-- ===== Triggers: auditoria =====
create or replace function audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  if tg_op = 'DELETE' then rid := to_jsonb(old)->>'id'; else rid := to_jsonb(new)->>'id'; end if;
  insert into audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, rid,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return null;
end $$;

create trigger audit_rides after insert or update or delete on rides for each row execute function audit_trigger();
create trigger audit_clients after insert or update or delete on clients for each row execute function audit_trigger();
create trigger audit_drivers after insert or update or delete on drivers for each row execute function audit_trigger();
create trigger audit_dps after insert or update or delete on driver_payout_settings for each row execute function audit_trigger();
create trigger audit_profiles after update or delete on profiles for each row execute function audit_trigger();
create trigger audit_payments after insert or update or delete on payments for each row execute function audit_trigger();
create trigger audit_closings after insert or update or delete on payment_closings for each row execute function audit_trigger();
create trigger audit_adjustments after insert or update or delete on adjustments for each row execute function audit_trigger();
create trigger audit_assignments after insert or update on ride_assignments for each row execute function audit_trigger();

-- ===== Triggers: histórico de status =====
-- BEFORE UPDATE: preenche started_at/finished_at.
create or replace function ride_status_timestamps() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then new.started_at = now(); end if;
    if new.status = 'completed' and new.finished_at is null then new.finished_at = now(); end if;
  end if;
  return new;
end $$;
create trigger trg_rides_status_ts before update on rides for each row execute function ride_status_timestamps();

-- AFTER INSERT/UPDATE: grava o histórico (a FK exige que a corrida já exista).
create or replace function log_ride_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into ride_status_history (ride_id, from_status, to_status, changed_by) values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into ride_status_history (ride_id, from_status, to_status, changed_by, note) values (new.id, old.status, new.status, auth.uid(), new.cancelled_reason);
  end if;
  return null;
end $$;
create trigger trg_rides_status_log after insert or update on rides for each row execute function log_ride_status();

-- ===== RPCs (lógica atômica) =====

-- Conflito de horário: corridas do motorista dentro da janela (padrão ±90 min).
create or replace function driver_conflicts(p_driver uuid, p_at timestamptz, p_exclude uuid default null, p_window_minutes int default 90)
returns table (id uuid, code bigint, passenger_name text, scheduled_at timestamptz)
language sql stable security invoker as $$
  select r.id, r.code, r.passenger_name, r.scheduled_at from rides r
  where r.driver_id = p_driver
    and r.status in ('pending','scheduled','confirmed','in_progress')
    and (p_exclude is null or r.id <> p_exclude)
    and r.scheduled_at > p_at - make_interval(mins => p_window_minutes)
    and r.scheduled_at < p_at + make_interval(mins => p_window_minutes)
$$;

-- Base atribui motorista: cria assignment 'sent', define rides.driver_id e notifica.
create or replace function assign_ride(p_ride uuid, p_driver uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid; v_code bigint;
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  update ride_assignments set status = 'cancelled', responded_at = now()
    where ride_id = p_ride and status in ('sent','accepted');
  insert into ride_assignments (ride_id, driver_id, assigned_by) values (p_ride, p_driver, auth.uid()) returning id into v_id;
  update rides set driver_id = p_driver,
    status = case when status in ('pending','scheduled','confirmed') then 'scheduled' else status end
    where id = p_ride and status not in ('completed','cancelled') returning code into v_code;
  if v_code is null then raise exception 'Corrida não pode ser atribuída'; end if;
  select profile_id into v_user from drivers where id = p_driver;
  if v_user is not null then
    insert into notifications (user_id, title, body, url)
    values (v_user, 'Nova corrida #' || v_code, 'Toque para ver e responder.', '/motorista/corridas/' || p_ride);
  end if;
  return v_id;
end $$;

-- Motorista aceita ou recusa.
create or replace function respond_assignment(p_assignment uuid, p_accept boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a ride_assignments; v_driver uuid;
begin
  select id into v_driver from drivers where profile_id = auth.uid();
  select * into a from ride_assignments where id = p_assignment for update;
  if a.id is null or a.driver_id is distinct from v_driver then raise exception 'Corrida não encontrada'; end if;
  if a.status <> 'sent' then raise exception 'Esta corrida já foi respondida'; end if;
  if p_accept then
    update ride_assignments set status='accepted', responded_at=now() where id = a.id;
    update rides set status='confirmed' where id = a.ride_id and status in ('pending','scheduled');
  else
    if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Informe o motivo da recusa'; end if;
    update ride_assignments set status='declined', responded_at=now(), decline_reason=p_reason where id = a.id;
    update rides set driver_id = null, status='pending' where id = a.ride_id and status in ('pending','scheduled','confirmed');
  end if;
end $$;

-- Motorista inicia/finaliza (somente transições válidas).
create or replace function driver_set_ride_status(p_ride uuid, p_to ride_status) returns void
language plpgsql security definer set search_path = public as $$
declare r rides; v_driver uuid;
begin
  select id into v_driver from drivers where profile_id = auth.uid();
  select * into r from rides where id = p_ride for update;
  if r.id is null or r.driver_id is distinct from v_driver then raise exception 'Corrida não encontrada'; end if;
  if not ((r.status = 'confirmed' and p_to = 'in_progress') or (r.status = 'in_progress' and p_to = 'completed')) then
    raise exception 'Transição inválida: % -> %', r.status, p_to;
  end if;
  update rides set status = p_to where id = p_ride;
end $$;

-- Mudança de status pela base (valida transições; cancelamento exige motivo).
create or replace function staff_set_ride_status(p_ride uuid, p_to ride_status, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r rides;
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  select * into r from rides where id = p_ride for update;
  if r.id is null then raise exception 'Corrida não encontrada'; end if;
  if r.status in ('completed','cancelled') then raise exception 'Corrida já encerrada'; end if;
  if p_to = 'cancelled' then
    if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Informe o motivo do cancelamento'; end if;
    update ride_assignments set status='cancelled', responded_at=now() where ride_id = p_ride and status in ('sent','accepted');
    update rides set status='cancelled', cancelled_reason=p_reason where id = p_ride;
  else
    if p_to in ('in_progress','completed','confirmed') and r.driver_id is null then raise exception 'Atribua um motorista primeiro'; end if;
    update rides set status = p_to where id = p_ride;
  end if;
end $$;

-- Gera corridas de regras recorrentes para os próximos p_days dias (idempotente via índice único).
create or replace function generate_recurring_rides(p_days int default 7) returns int
language plpgsql security definer set search_path = public as $$
declare rule recurring_rules; d date; ts timestamptz; n int := 0; c int;
begin
  for rule in select * from recurring_rules where active loop
    for d in select generate_series(greatest(current_date, rule.starts_on), current_date + p_days, '1 day')::date loop
      continue when rule.ends_on is not null and d > rule.ends_on;
      continue when not (extract(dow from d)::smallint = any(rule.weekdays));
      ts := (d + rule.pickup_time) at time zone 'America/Sao_Paulo';
      insert into rides (client_id, driver_id, recurring_rule_id, passenger_name, passenger_phone, origin, destination,
                         scheduled_at, price_cents, driver_payout_cents, status, source, notes, created_by)
      values (rule.client_id, rule.driver_id, rule.id, rule.passenger_name, rule.passenger_phone, rule.origin, rule.destination,
              ts, rule.price_cents, rule.driver_payout_cents, case when rule.driver_id is null then 'pending'::ride_status else 'scheduled'::ride_status end,
              'recurring', rule.notes, rule.created_by)
      on conflict do nothing;
      get diagnostics c = row_count; n := n + c;
    end loop;
    update recurring_rules set last_generated_on = current_date where id = rule.id;
  end loop;
  return n;
end $$;
revoke all on function generate_recurring_rides(int) from public, anon, authenticated;

-- Indicadores do painel em uma única consulta agregada (fuso America/Sao_Paulo)
create or replace function dashboard_stats() returns jsonb
language sql stable security invoker as $$
  with b as (
    select (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as day_start,
           (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as month_start
  )
  select jsonb_build_object(
    'today_by_status', coalesce((select jsonb_object_agg(status, n) from (
        select r.status, count(*) n from rides r, b where r.scheduled_at >= b.day_start and r.scheduled_at < b.day_start + interval '1 day' group by r.status) t), '{}'::jsonb),
    'drivers_online', (select count(*) from drivers where active and availability = 'online'),
    'drivers_busy', (select count(*) from drivers where active and availability = 'busy'),
    'revenue_day', (select coalesce(sum(r.price_cents),0) from rides r, b where r.status = 'completed' and r.finished_at >= b.day_start),
    'revenue_month', (select coalesce(sum(r.price_cents),0) from rides r, b where r.status = 'completed' and r.finished_at >= b.month_start),
    'payout_month', (select coalesce(sum(r.driver_payout_cents),0) from rides r, b where r.status = 'completed' and r.finished_at >= b.month_start),
    'pending_no_driver', (select count(*) from rides where status = 'pending' and driver_id is null and scheduled_at >= now() - interval '1 day')
  )
$$;

-- Sugestão de repasse sem expor a taxa do motorista ao operador (mesma regra de src/lib/finance/payout.ts)
create or replace function suggest_payout(p_driver uuid, p_price_cents bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select case when not is_staff() then null
    when s.payout_type = 'fixed' then least(s.payout_fixed_cents, p_price_cents)
    else floor(p_price_cents * s.payout_percent_bp / 10000.0)::bigint end
  from driver_payout_settings s where s.driver_id = p_driver
$$;
revoke execute on function suggest_payout from public, anon;
grant execute on function suggest_payout to authenticated;

-- Busca global
create or replace function global_search(q text) returns table (kind text, id uuid, title text, subtitle text)
language sql stable security invoker as $$
  (select 'ride'::text, r.id, r.passenger_name, coalesce(r.passenger_phone,'') || ' · ' || r.origin from rides r
    where r.passenger_name ilike '%'||q||'%' or r.passenger_phone ilike '%'||q||'%' order by r.scheduled_at desc limit 8)
  union all
  (select 'client', c.id, c.legal_name, coalesce(c.cnpj,'') from clients c where c.legal_name ilike '%'||q||'%' or c.cnpj ilike '%'||q||'%' limit 5)
  union all
  (select 'driver', d.id, d.full_name, coalesce(d.vehicle_plate,'') from drivers d where d.full_name ilike '%'||q||'%' or d.phone ilike '%'||q||'%' limit 5)
$$;

-- ===== RLS =====
alter table profiles enable row level security;
alter table clients enable row level security;
alter table drivers enable row level security;
alter table driver_payout_settings enable row level security;
alter table recurring_rules enable row level security;
alter table rides enable row level security;
alter table ride_status_history enable row level security;
alter table ride_assignments enable row level security;
alter table payment_closings enable row level security;
alter table payments enable row level security;
alter table adjustments enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;
alter table settings enable row level security;
alter table audit_logs enable row level security;

create or replace function my_driver_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from drivers where profile_id = auth.uid()
$$;

create policy profiles_self_read on profiles for select using (id = auth.uid() or is_staff());
create policy profiles_admin_write on profiles for update using (is_admin()) with check (is_admin());

create policy clients_staff_all on clients for all using (is_staff()) with check (is_staff());

-- Motoristas: equipe lê; só admin escreve (PIX e repasse são sensíveis); motorista lê o próprio cadastro.
create policy drivers_read on drivers for select using (is_staff() or profile_id = auth.uid());
create policy drivers_admin_write on drivers for all using (is_admin()) with check (is_admin());
create policy dps_admin_all on driver_payout_settings for all using (is_admin()) with check (is_admin());
create policy dps_driver_read on driver_payout_settings for select using (driver_id = my_driver_id());

create or replace function set_driver_availability(p_driver uuid, p_value driver_availability) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_staff() or p_driver = my_driver_id()) then raise exception 'Sem permissão'; end if;
  update drivers set availability = p_value where id = p_driver;
end $$;

create policy rr_staff_all on recurring_rules for all using (is_staff()) with check (is_staff());

-- Corridas: equipe tudo; motorista lê só as suas (escrita via RPCs).
create policy rides_staff_all on rides for all using (is_staff()) with check (is_staff());
create policy rides_driver_read on rides for select using (driver_id = my_driver_id());

create policy rsh_staff_read on ride_status_history for select using (is_staff());
create policy rsh_driver_read on ride_status_history for select using (
  exists (select 1 from rides r where r.id = ride_id and r.driver_id = my_driver_id()));

create policy ra_staff_read on ride_assignments for select using (is_staff());
create policy ra_driver_read on ride_assignments for select using (driver_id = my_driver_id());

-- Financeiro: admin tudo; motorista lê o próprio; operador sem acesso.
create policy pc_admin_all on payment_closings for all using (is_admin()) with check (is_admin());
create policy pc_driver_read on payment_closings for select using (driver_id = my_driver_id());
create policy pay_admin_all on payments for all using (is_admin()) with check (is_admin());
create policy pay_driver_read on payments for select using (driver_id = my_driver_id());
create policy adj_admin_all on adjustments for all using (is_admin()) with check (is_admin());
create policy adj_driver_read on adjustments for select using (driver_id = my_driver_id());

create policy notif_own on notifications for select using (user_id = auth.uid());
create policy notif_own_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy settings_read on settings for select using (is_staff());
create policy settings_admin_write on settings for all using (is_admin()) with check (is_admin());

create policy audit_admin_read on audit_logs for select using (is_admin());

revoke execute on function assign_ride, respond_assignment, driver_set_ride_status, staff_set_ride_status, set_driver_availability from public, anon;
grant execute on function assign_ride, respond_assignment, driver_set_ride_status, staff_set_ride_status, set_driver_availability to authenticated;

-- Realtime apenas onde necessário
alter publication supabase_realtime add table rides;
alter publication supabase_realtime add table drivers;
alter publication supabase_realtime add table ride_assignments;
