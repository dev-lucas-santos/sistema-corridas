-- Cadastro liberado: novos usuários já nascem ativos (papel operador). O papel nunca vem do cliente.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role, active)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120), new.email, 'operator', true);
  return new;
end $$;

-- Libera quem já estava aguardando aprovação
update profiles set active = true where active = false and role <> 'driver';
