-- Os metadados só podem solicitar o papel de motorista, que não dá acesso a corridas sem vínculo.
-- Outros cadastros continuam aguardando aprovação da base.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role, active)
  values (
    new.id, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120), new.email,
    case when new.raw_user_meta_data->>'account_type' = 'driver' then 'driver'::user_role else 'operator'::user_role end,
    coalesce(new.raw_user_meta_data->>'account_type' = 'driver', false)
  );
  return new;
end $$;

create or replace function my_driver_id() returns uuid
language sql stable security definer set search_path = public as $$
  select d.id from drivers d
  join profiles p on p.id = d.profile_id
  join auth.users u on u.id = p.id
  where p.id = auth.uid() and p.role = 'driver' and p.active and d.active
    and u.email_confirmed_at is not null
$$;

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
  if not exists (select 1 from auth.users where id = p.id and email_confirmed_at is not null) then
    raise exception 'O e-mail da conta precisa ser confirmado antes do vínculo';
  end if;
  if exists (select 1 from drivers where profile_id = p.id) then
    raise exception 'Esta conta já está vinculada a outro motorista';
  end if;
  update profiles set role = 'driver', active = true where id = p.id;
  update drivers set profile_id = p.id where id = d.id;
end $$;

create or replace function driver_signup_ready() returns boolean
language sql stable set search_path = public as $$ select true $$;
revoke execute on function driver_signup_ready() from public;
grant execute on function driver_signup_ready() to anon, authenticated;
