alter table profiles add column whatsapp_confirmed_at timestamptz;

create table driver_phone_challenges (
  profile_id uuid primary key references profiles(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);
alter table driver_phone_challenges enable row level security;
revoke all on driver_phone_challenges from public, anon, authenticated;
grant select, insert, update, delete on driver_phone_challenges to service_role;

create or replace function confirm_driver_phone(p_profile uuid, p_hash text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c driver_phone_challenges;
begin
  select * into c from driver_phone_challenges where profile_id = p_profile for update;
  if c.profile_id is null or c.expires_at <= now() or c.attempts >= 5 then return false; end if;
  if c.code_hash <> p_hash then
    update driver_phone_challenges set attempts = attempts + 1 where profile_id = p_profile;
    return false;
  end if;
  if not exists (
    select 1 from profiles p join auth.users u on u.id = p.id
    where p.id = p_profile and p.role = 'driver' and p.active and u.email_confirmed_at is not null
      and not exists (select 1 from drivers d where d.profile_id = p.id and not d.active)
  ) then return false; end if;
  update profiles set phone = c.phone, whatsapp_confirmed_at = now() where id = p_profile;
  update drivers set phone = c.phone where profile_id = p_profile and active;
  delete from driver_phone_challenges where profile_id = p_profile;
  return true;
end $$;
revoke execute on function confirm_driver_phone(uuid, text) from public, anon, authenticated;
grant execute on function confirm_driver_phone(uuid, text) to service_role;

create or replace function copy_verified_driver_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is distinct from old.profile_id and new.profile_id is not null then
    select coalesce((select p.phone from profiles p where p.id = new.profile_id
      and p.whatsapp_confirmed_at is not null), new.phone) into new.phone;
    select coalesce(new.email, (select p.email from profiles p where p.id = new.profile_id)) into new.email;
  end if;
  return new;
end $$;
create trigger trg_copy_verified_driver_phone before update of profile_id on drivers
for each row execute function copy_verified_driver_phone();

create or replace function require_active_assignment_driver() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from drivers where id = new.driver_id and active for share;
  if not found then raise exception 'O motorista precisa estar ativo para receber corridas'; end if;
  return new;
end $$;
create trigger trg_require_active_assignment_driver before insert or update of driver_id on ride_assignments
for each row execute function require_active_assignment_driver();
