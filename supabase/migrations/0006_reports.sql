-- Fase 4: relatórios, fila de tarefas em segundo plano, envio agendado e sincronização com Google Sheets.

-- Índice para filtrar por data de referência (finalização ou, na falta, agendamento)
create index if not exists rides_ref_time_idx on rides ((coalesce(finished_at, scheduled_at)));

-- ===== Relatórios (somente admin: contêm valores financeiros) =====
create or replace function report_totals(p_start date, p_end date)
returns table (completed int, cancelled int, revenue_cents bigint, payout_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  return query
    select (count(*) filter (where r.status = 'completed'))::int,
           (count(*) filter (where r.status = 'cancelled'))::int,
           coalesce(sum(r.price_cents) filter (where r.status = 'completed'), 0)::bigint,
           coalesce(sum(r.driver_payout_cents) filter (where r.status = 'completed'), 0)::bigint
    from rides r
    where r.status in ('completed', 'cancelled') and coalesce(r.finished_at, r.scheduled_at) <@ period_bounds(p_start, p_end);
end $$;

-- p_dim: 'driver' | 'client' | 'day'
create or replace function report_by(p_start date, p_end date, p_dim text)
returns table (key text, label text, completed int, cancelled int, revenue_cents bigint, payout_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  if p_dim not in ('driver', 'client', 'day') then raise exception 'Dimensão inválida'; end if;
  return query
    with x as (
      select r.status, r.price_cents, r.driver_payout_cents,
        case p_dim when 'driver' then coalesce(r.driver_id::text, '-')
                   when 'client' then coalesce(r.client_id::text, '-')
                   else to_char(coalesce(r.finished_at, r.scheduled_at) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') end as k,
        case p_dim when 'driver' then coalesce(d.full_name, 'Sem motorista')
                   when 'client' then coalesce(c.legal_name, 'Sem cliente')
                   else to_char(coalesce(r.finished_at, r.scheduled_at) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') end as l
      from rides r
      left join drivers d on d.id = r.driver_id
      left join clients c on c.id = r.client_id
      where r.status in ('completed', 'cancelled') and coalesce(r.finished_at, r.scheduled_at) <@ period_bounds(p_start, p_end)
    )
    select x.k, min(x.l),
           (count(*) filter (where x.status = 'completed'))::int,
           (count(*) filter (where x.status = 'cancelled'))::int,
           coalesce(sum(x.price_cents) filter (where x.status = 'completed'), 0)::bigint,
           coalesce(sum(x.driver_payout_cents) filter (where x.status = 'completed'), 0)::bigint
    from x group by x.k order by case when p_dim = 'day' then x.k end, 5 desc;
end $$;

-- ===== Fila de tarefas em segundo plano =====
create table jobs (
  id bigint generated always as identity primary key,
  type text not null check (type in ('sheets_ride', 'report_email')),
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts int not null default 0,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_queue_idx on jobs (run_at) where status in ('pending', 'running');
create unique index jobs_sheets_ride_uq on jobs ((payload->>'ride_id')) where type = 'sheets_ride' and status in ('pending', 'running');
alter table jobs enable row level security;
create policy jobs_admin_read on jobs for select using (is_admin());
create policy jobs_admin_insert on jobs for insert with check (is_admin() and type = 'report_email');

-- Reserva tarefas (skip locked evita processamento duplo entre execuções concorrentes);
-- tarefas "running" há mais de 10 minutos são consideradas abandonadas e voltam para a fila.
create or replace function claim_jobs(p_limit int default 20)
returns setof jobs language sql security definer set search_path = public as $$
  update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id in (
    select id from jobs
    where (status = 'pending' or (status = 'running' and locked_at < now() - interval '10 minutes')) and run_at <= now()
    order by run_at, id limit p_limit for update skip locked)
  returning j.*;
$$;
revoke execute on function claim_jobs from public, anon, authenticated;
grant execute on function claim_jobs to service_role;

-- ===== Google Sheets: cada corrida finalizada vira uma linha =====
create table sheets_sync (
  ride_id uuid primary key references rides(id) on delete cascade,
  synced_at timestamptz not null default now()
);
alter table sheets_sync enable row level security;
create policy sheets_sync_admin on sheets_sync for select using (is_admin());

create or replace function enqueue_sheets_ride() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into jobs (type, payload) values ('sheets_ride', jsonb_build_object('ride_id', new.id))
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger rides_enqueue_sheets after update of status on rides for each row execute function enqueue_sheets_ride();

-- Enfileira corridas finalizadas do período que ainda não foram enviadas (idempotente)
create or replace function enqueue_sheets_backfill(p_start date, p_end date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  with ins as (
    insert into jobs (type, payload)
    select 'sheets_ride', jsonb_build_object('ride_id', r.id) from rides r
    where r.status = 'completed' and coalesce(r.finished_at, r.scheduled_at) <@ period_bounds(p_start, p_end)
      and not exists (select 1 from sheets_sync s where s.ride_id = r.id)
    order by coalesce(r.finished_at, r.scheduled_at)
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- ===== Envio automático de relatórios por e-mail =====
create table report_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  send_hour int not null default 7 check (send_hour between 0 and 23),
  recipients text[] not null check (cardinality(recipients) between 1 and 20),
  active boolean not null default true,
  last_sent_on date,
  created_at timestamptz not null default now()
);
alter table report_schedules enable row level security;
create policy report_schedules_admin on report_schedules for all using (is_admin()) with check (is_admin());
create trigger audit_report_schedules after insert or update or delete on report_schedules for each row execute function audit_trigger();

revoke execute on function report_totals, report_by, enqueue_sheets_backfill from public, anon;
grant execute on function report_totals, report_by, enqueue_sheets_backfill to authenticated;
