create table if not exists admin_access_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade
);
alter table admin_access_sessions enable row level security;
revoke all on admin_access_sessions from public, anon, authenticated;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    join admin_access_sessions a on a.user_id = p.id
    join auth.sessions s on s.id = a.session_id and s.user_id = p.id
    where p.id = auth.uid() and p.active and p.role in ('admin', 'operator')
      and s.id::text = auth.jwt()->>'session_id'
  )
$$;

create or replace function admin_session_active() returns boolean
language sql stable security definer set search_path = public as $$ select is_admin() $$;
revoke execute on function admin_session_active() from public, anon;
grant execute on function admin_session_active() to authenticated;

create or replace function grant_admin_session(p_user uuid, p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from auth.sessions s join profiles p on p.id = s.user_id
    where s.id = p_session and s.user_id = p_user and p.active and p.role in ('admin', 'operator')
  ) then raise exception 'Sessão da equipe inválida'; end if;
  insert into admin_access_sessions(session_id, user_id) values (p_session, p_user)
  on conflict (session_id) do update set user_id = excluded.user_id;
  insert into audit_logs(actor_id, action, table_name, record_id)
  values (p_user, 'admin_unlock', 'admin_access_sessions', p_user::text);
end $$;
revoke execute on function grant_admin_session(uuid, uuid) from public, anon, authenticated;
grant execute on function grant_admin_session(uuid, uuid) to service_role;
