-- Conversas são separadas por envio, inclusive quando a corrida troca de motorista.
create or replace function my_driver_id() returns uuid
language sql stable security definer set search_path = public as $$
  select d.id from drivers d join profiles p on p.id = d.profile_id
  where p.id = auth.uid() and p.role = 'driver' and p.active and d.active
$$;

create or replace function set_driver_availability(p_driver uuid, p_value driver_availability) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_staff() or coalesce(p_driver = my_driver_id(), false)) then raise exception 'Sem permissão'; end if;
  update drivers set availability = p_value where id = p_driver;
end $$;

create or replace function respond_assignment(p_assignment uuid, p_accept boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a ride_assignments; v_driver uuid;
begin
  v_driver := my_driver_id();
  if v_driver is null then raise exception 'Sem permissão'; end if;
  select * into a from ride_assignments where id = p_assignment for update;
  if a.id is null or a.driver_id is distinct from v_driver then raise exception 'Corrida não encontrada'; end if;
  if a.status <> 'sent' then raise exception 'Esta corrida já foi respondida'; end if;
  if p_accept then
    update ride_assignments set status = 'accepted', responded_at = now() where id = a.id;
    update rides set status = 'confirmed' where id = a.ride_id and status in ('pending', 'scheduled');
  else
    if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Informe o motivo da recusa'; end if;
    update ride_assignments set status = 'declined', responded_at = now(), decline_reason = p_reason where id = a.id;
    update rides set driver_id = null, status = 'pending' where id = a.ride_id and status in ('pending', 'scheduled', 'confirmed');
  end if;
end $$;

create or replace function driver_set_ride_status(p_ride uuid, p_to ride_status) returns void
language plpgsql security definer set search_path = public as $$
declare r rides; v_driver uuid;
begin
  v_driver := my_driver_id();
  if v_driver is null then raise exception 'Sem permissão'; end if;
  select * into r from rides where id = p_ride for update;
  if r.id is null or r.driver_id is distinct from v_driver then raise exception 'Corrida não encontrada'; end if;
  if not ((r.status = 'confirmed' and p_to = 'in_progress') or (r.status = 'in_progress' and p_to = 'completed')) then
    raise exception 'Transição inválida: % -> %', r.status, p_to;
  end if;
  update rides set status = p_to where id = p_ride;
end $$;

create table ride_messages (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references ride_assignments(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index ride_messages_assignment_idx on ride_messages (assignment_id, created_at, id);
alter table ride_messages enable row level security;
revoke all on ride_messages from public, anon, authenticated;
grant select on ride_messages to authenticated;
grant insert (assignment_id, sender_id, body) on ride_messages to authenticated;
grant usage, select on sequence ride_messages_id_seq to authenticated;

create policy ride_messages_read on ride_messages for select to authenticated using (
  is_staff() or exists (
    select 1 from ride_assignments a
    join drivers d on d.id = a.driver_id
    join profiles p on p.id = d.profile_id
    where a.id = assignment_id and p.id = auth.uid()
      and p.role = 'driver' and p.active and d.active
  )
);
create policy ride_messages_insert on ride_messages for insert to authenticated with check (
  sender_id = auth.uid() and (
    is_staff() or exists (
      select 1 from ride_assignments a
      join drivers d on d.id = a.driver_id
      join profiles p on p.id = d.profile_id
      where a.id = assignment_id and p.id = auth.uid()
        and p.role = 'driver' and p.active and d.active
    )
  )
);

create view ride_message_threads with (security_invoker = true) as
select distinct on (m.assignment_id)
  m.assignment_id, a.ride_id, r.code, r.passenger_name, d.full_name as driver_name,
  m.body, m.created_at
from ride_messages m
join ride_assignments a on a.id = m.assignment_id
join rides r on r.id = a.ride_id
join drivers d on d.id = a.driver_id
order by m.assignment_id, m.created_at desc, m.id desc;
grant select on ride_message_threads to authenticated;

alter publication supabase_realtime add table ride_messages;

-- A troca de papel e o vínculo são feitos na mesma transação.
create or replace function link_driver_profile(p_driver uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d drivers;
  p profiles;
begin
  if not is_admin() then raise exception 'Somente administradores podem vincular motoristas'; end if;
  select * into d from drivers where id = p_driver for update;
  if d.id is null or not d.active then raise exception 'Motorista não encontrado ou inativo'; end if;
  if d.profile_id is not null then raise exception 'Este motorista já possui um acesso'; end if;
  select * into p from profiles where id = p_profile for update;
  if p.id is null or p.role = 'admin' or p.id = auth.uid() then
    raise exception 'Conta não encontrada ou não pode ser vinculada';
  end if;
  if exists (select 1 from drivers where profile_id = p.id) then
    raise exception 'Esta conta já está vinculada a outro motorista';
  end if;
  update profiles set role = 'driver', active = true where id = p.id;
  update drivers set profile_id = p.id where id = d.id;
end $$;
revoke execute on function link_driver_profile(uuid, uuid) from public, anon;
grant execute on function link_driver_profile(uuid, uuid) to authenticated;
