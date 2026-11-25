create or replace function can_driver_message(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (is_staff() or auth.uid() = p_profile) and exists (
    select 1 from profiles p
    join auth.users u on u.id = p.id
    where p.id = p_profile and p.role = 'driver' and p.active
      and u.email_confirmed_at is not null
      and not exists (select 1 from drivers d where d.profile_id = p.id and not d.active)
  )
$$;
revoke execute on function can_driver_message(uuid) from public, anon;
grant execute on function can_driver_message(uuid) to authenticated;

create table driver_general_messages (
  id bigint generated always as identity primary key,
  driver_profile_id uuid not null references profiles(id),
  sender_id uuid not null references profiles(id),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index driver_general_messages_thread_idx on driver_general_messages (driver_profile_id, id desc);
alter table driver_general_messages enable row level security;
revoke all on driver_general_messages from public, anon, authenticated;
grant select on driver_general_messages to authenticated;
grant insert (driver_profile_id, sender_id, body) on driver_general_messages to authenticated;
grant usage, select on sequence driver_general_messages_id_seq to authenticated;

create policy driver_general_messages_read on driver_general_messages for select to authenticated using (
  is_staff() or (driver_profile_id = auth.uid() and can_driver_message(driver_profile_id))
);
create policy driver_general_messages_insert on driver_general_messages for insert to authenticated with check (
  sender_id = auth.uid() and can_driver_message(driver_profile_id)
  and (is_staff() or driver_profile_id = auth.uid())
);

create view driver_general_threads with (security_invoker = true) as
select distinct on (m.driver_profile_id)
  m.driver_profile_id, p.full_name as driver_name, m.body, m.created_at
from driver_general_messages m
join profiles p on p.id = m.driver_profile_id
order by m.driver_profile_id, m.id desc;
grant select on driver_general_threads to authenticated;
alter publication supabase_realtime add table driver_general_messages;
