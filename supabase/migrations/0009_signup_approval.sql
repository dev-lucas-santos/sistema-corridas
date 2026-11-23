-- Cadastro pela tela de login: novos usuários nascem inativos e só entram após aprovação do admin.
-- (O papel e o status nunca vêm do cliente.)
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role, active)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120), new.email, 'operator', false);
  return new;
end $$;

-- Impede que o admin desative ou rebaixe a si mesmo sem querer (evita ficar sem nenhum admin)
create or replace function protect_self_profile() returns trigger language plpgsql as $$
begin
  if new.id = auth.uid() and (new.active is distinct from old.active or new.role is distinct from old.role) then
    raise exception 'Você não pode alterar o próprio papel ou status.';
  end if;
  return new;
end $$;
create trigger trg_profiles_protect_self before update on profiles for each row execute function protect_self_profile();
