-- Fase 3: financeiro (lançamento automático, fechamentos, ajustes, conferência de pagamentos)

alter table payment_closings
  add column paid_cents bigint not null default 0,
  add column paid_at timestamptz,
  add constraint pc_period_ok check (period_end >= period_start),
  add constraint pc_paid_ok check (paid_cents >= 0);

create table closing_payments (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references payment_closings(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null default now(),
  receipt_path text,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index cp_closing_idx on closing_payments (closing_id);
create index payments_closing_idx on payments (closing_id);
create index pc_status_idx on payment_closings (status, period_start desc);

create trigger audit_closing_payments after insert or update or delete on closing_payments for each row execute function audit_trigger();
alter table closing_payments enable row level security;
create policy cp_admin_all on closing_payments for all using (is_admin()) with check (is_admin());
create policy cp_driver_read on closing_payments for select
  using (exists (select 1 from payment_closings c where c.id = closing_id and c.driver_id = my_driver_id()));

-- Lança automaticamente o valor a pagar ao motorista quando a corrida é finalizada
create or replace function ride_payment_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and new.driver_id is not null then
    insert into payments (driver_id, ride_id, amount_cents)
    values (new.driver_id, new.id, coalesce(new.driver_payout_cents, 0))
    on conflict (ride_id) where ride_id is not null
    do update set amount_cents = excluded.amount_cents, driver_id = excluded.driver_id
      where payments.closing_id is null and payments.status = 'pending';
  elsif tg_op = 'UPDATE' and old.status = 'completed' and new.status <> 'completed' then
    delete from payments where ride_id = new.id and closing_id is null and status = 'pending';
  end if;
  return new;
end $$;
create trigger rides_payment_sync after insert or update of status, driver_payout_cents, driver_id on rides
  for each row execute function ride_payment_sync();

-- Corridas já finalizadas antes da fase 3
insert into payments (driver_id, ride_id, amount_cents)
select driver_id, id, coalesce(driver_payout_cents, 0) from rides
where status = 'completed' and driver_id is not null
on conflict do nothing;

-- ===== funções =====
create or replace function period_bounds(p_start date, p_end date) returns tstzrange
language sql immutable as $$
  select tstzrange((p_start::timestamp) at time zone 'America/Sao_Paulo',
                   ((p_end + 1)::timestamp) at time zone 'America/Sao_Paulo', '[)')
$$;

create or replace function closing_preview(p_driver uuid, p_start date, p_end date)
returns table (rides int, total_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  return query
    select count(*)::int, coalesce(sum(p.amount_cents), 0)::bigint
    from payments p join rides r on r.id = p.ride_id
    where p.driver_id = p_driver and p.closing_id is null
      and coalesce(r.finished_at, r.scheduled_at) <@ period_bounds(p_start, p_end);
end $$;

create or replace function recalc_closing(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_rides bigint; v_adj bigint; v_paid bigint; v_net bigint;
begin
  select coalesce(sum(amount_cents), 0) into v_rides from payments where closing_id = p_id;
  select coalesce(sum(amount_cents), 0) into v_adj from adjustments where closing_id = p_id;
  select coalesce(sum(amount_cents), 0) into v_paid from closing_payments where closing_id = p_id;
  v_net := v_rides + v_adj;
  update payment_closings set
    rides_total_cents = v_rides, adjustments_total_cents = v_adj, net_cents = v_net, paid_cents = v_paid,
    status = case when v_net > 0 and v_paid >= v_net then 'paid'::payment_status
                  when v_paid > 0 then 'partial'::payment_status
                  else 'pending'::payment_status end
  where id = p_id;
  update payments set
    status = case when (select status from payment_closings where id = p_id) = 'paid' then 'paid'::payment_status else 'pending'::payment_status end,
    paid_cents = case when (select status from payment_closings where id = p_id) = 'paid' then amount_cents else 0 end,
    paid_at = case when (select status from payment_closings where id = p_id) = 'paid' then (select paid_at from payment_closings where id = p_id) else null end
  where closing_id = p_id;
end $$;
revoke all on function recalc_closing from public, anon, authenticated;

create or replace function create_closing(p_driver uuid, p_period closing_period, p_start date, p_end date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  if p_end < p_start then raise exception 'Período inválido'; end if;
  insert into payment_closings (driver_id, period, period_start, period_end, created_by)
  values (p_driver, p_period, p_start, p_end, auth.uid()) returning id into v_id;
  update payments p set closing_id = v_id
  from rides r
  where r.id = p.ride_id and p.driver_id = p_driver and p.closing_id is null
    and coalesce(r.finished_at, r.scheduled_at) <@ period_bounds(p_start, p_end);
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nenhuma corrida finalizada sem fechamento neste período'; end if;
  perform recalc_closing(v_id);
  return v_id;
end $$;

create or replace function add_adjustment(p_closing uuid, p_amount bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; c payment_closings;
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  if p_amount = 0 then raise exception 'Informe um valor diferente de zero'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Informe a justificativa'; end if;
  select * into c from payment_closings where id = p_closing for update;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  if c.status = 'paid' then raise exception 'Fechamento já pago'; end if;
  if c.net_cents + p_amount < c.paid_cents then raise exception 'O total ficaria abaixo do valor já pago'; end if;
  insert into adjustments (closing_id, driver_id, amount_cents, reason, created_by)
  values (p_closing, c.driver_id, p_amount, trim(p_reason), auth.uid()) returning id into v_id;
  perform recalc_closing(p_closing);
  return v_id;
end $$;

create or replace function delete_adjustment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a adjustments; c payment_closings;
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  select * into a from adjustments where id = p_id;
  if not found then return; end if;
  select * into c from payment_closings where id = a.closing_id for update;
  if c.net_cents - a.amount_cents < c.paid_cents then raise exception 'O total ficaria abaixo do valor já pago'; end if;
  delete from adjustments where id = p_id;
  perform recalc_closing(a.closing_id);
end $$;

create or replace function register_closing_payment(p_closing uuid, p_amount bigint, p_paid_at timestamptz, p_receipt text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c payment_closings; v_id uuid;
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  select * into c from payment_closings where id = p_closing for update;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  if p_amount <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_amount > c.net_cents - c.paid_cents then raise exception 'Valor maior que o saldo a pagar'; end if;
  insert into closing_payments (closing_id, amount_cents, paid_at, receipt_path, note, created_by)
  values (p_closing, p_amount, coalesce(p_paid_at, now()), nullif(p_receipt, ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  update payment_closings set paid_at = coalesce(p_paid_at, now()) where id = p_closing;
  perform recalc_closing(p_closing);
  return v_id;
end $$;

create or replace function delete_closing(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  if exists (select 1 from closing_payments where closing_id = p_id) then
    raise exception 'Há pagamentos registrados neste fechamento';
  end if;
  update payments set closing_id = null, status = 'pending', paid_cents = 0, paid_at = null where closing_id = p_id;
  delete from adjustments where closing_id = p_id;
  delete from payment_closings where id = p_id;
end $$;

-- Faturamento por cliente no período (admin)
create or replace function client_billing(p_start date, p_end date)
returns table (client_id uuid, legal_name text, rides int, total_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Sem permissão'; end if;
  return query
    select c.id, c.legal_name, count(r.id)::int, coalesce(sum(r.price_cents), 0)::bigint
    from clients c join rides r on r.client_id = c.id
    where r.status = 'completed' and coalesce(r.finished_at, r.scheduled_at) <@ period_bounds(p_start, p_end)
    group by c.id, c.legal_name order by 4 desc;
end $$;

revoke execute on function closing_preview, create_closing, add_adjustment, delete_adjustment, register_closing_payment, delete_closing, client_billing from public, anon;
grant execute on function closing_preview, create_closing, add_adjustment, delete_adjustment, register_closing_payment, delete_closing, client_billing to authenticated;

-- Painel: inclui o valor em aberto a pagar (0 para quem não é admin, por causa da RLS)
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
    'pending_no_driver', (select count(*) from rides where status = 'pending' and driver_id is null and scheduled_at >= now() - interval '1 day'),
    'payable_cents', (select coalesce(sum(amount_cents), 0) from payments where closing_id is null)
                   + (select coalesce(sum(net_cents - paid_cents), 0) from payment_closings where status <> 'paid')
  )
$$;
