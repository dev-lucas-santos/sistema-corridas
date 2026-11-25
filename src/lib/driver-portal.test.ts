import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const admin = "00000000-0000-0000-0000-000000000001";
const driver = "00000000-0000-0000-0000-000000000002";
const other = "00000000-0000-0000-0000-000000000003";
const inactive = "00000000-0000-0000-0000-000000000004";
const operator = "00000000-0000-0000-0000-000000000005";
const newDriver = "00000000-0000-0000-0000-000000000006";
const untrusted = "00000000-0000-0000-0000-000000000007";
const d1 = "10000000-0000-0000-0000-000000000001";
const d2 = "10000000-0000-0000-0000-000000000002";
const d3 = "10000000-0000-0000-0000-000000000003";
const d4 = "10000000-0000-0000-0000-000000000004";
const d5 = "10000000-0000-0000-0000-000000000005";
const r1 = "20000000-0000-0000-0000-000000000001";
const r2 = "20000000-0000-0000-0000-000000000002";
const a1 = "30000000-0000-0000-0000-000000000001";
const a2 = "30000000-0000-0000-0000-000000000002";
let db: PGlite;

async function actor(id: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}

describe("portal do motorista: políticas do banco", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create type user_role as enum ('admin', 'operator', 'driver');
      create type ride_status as enum ('pending', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled');
      create type assignment_status as enum ('sent', 'accepted', 'declined', 'expired', 'cancelled');
      create type driver_availability as enum ('online', 'busy', 'offline');
      create table profiles (id uuid primary key, role user_role, active boolean, full_name text, email text, phone text);
      create table drivers (id uuid primary key, profile_id uuid unique references profiles(id), active boolean, full_name text, phone text, email text, availability driver_availability default 'offline');
      create table rides (id uuid primary key, code bigint, passenger_name text, driver_id uuid, status ride_status);
      create table ride_assignments (id uuid primary key, ride_id uuid references rides(id), driver_id uuid references drivers(id), status assignment_status default 'sent', responded_at timestamptz, decline_reason text);
      create function is_staff() returns boolean language sql stable security definer as $$
        select coalesce((select active and role in ('admin','operator') from profiles where id = auth.uid()), false)
      $$;
      create function is_admin() returns boolean language sql stable security definer as $$
        select coalesce((select active and role = 'admin' from profiles where id = auth.uid()), false)
      $$;
      create function my_driver_id() returns uuid language sql stable security definer as $$
        select id from drivers where profile_id = auth.uid()
      $$;
      alter table profiles enable row level security;
      alter table drivers enable row level security;
      alter table rides enable row level security;
      alter table ride_assignments enable row level security;
      create policy profiles_read on profiles for select to authenticated using (id = auth.uid() or is_staff());
      create policy drivers_read on drivers for select to authenticated using (profile_id = auth.uid() or is_staff());
      create policy rides_read on rides for select to authenticated using (driver_id = my_driver_id() or is_staff());
      create policy assignments_read on ride_assignments for select to authenticated using (driver_id = my_driver_id() or is_staff());
      grant usage on schema public, auth to authenticated, service_role;
      grant select on profiles, drivers, rides, ride_assignments to authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", "0011_driver_portal.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", "0012_driver_signup.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", "0013_driver_phone.sql"), "utf8"));
    await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", "0015_driver_general_messages.sql"), "utf8"));
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${admin}', 'admin@example.test', now()), ('${driver}', 'driver@example.test', now()),
        ('${other}', 'other@example.test', now()), ('${inactive}', 'inactive@example.test', now()),
        ('${operator}', 'operator@example.test', now());
      insert into profiles (id, role, active, full_name, email) values
        ('${admin}', 'admin', true, 'Admin', 'admin@example.test'),
        ('${driver}', 'driver', true, 'Motorista', 'driver@example.test'),
        ('${other}', 'driver', true, 'Outro', 'other@example.test'),
        ('${inactive}', 'driver', false, 'Inativo', 'inactive@example.test'),
        ('${operator}', 'operator', true, 'Operador', 'operator@example.test');
      insert into drivers (id,profile_id,active,full_name) values
        ('${d1}', '${driver}', true, 'Motorista'), ('${d2}', '${other}', true, 'Outro'),
        ('${d3}', '${inactive}', true, 'Inativo'), ('${d4}', null, true, 'Novo'), ('${d5}', null, true, 'Outro novo');
      insert into rides values
        ('${r1}', 1, 'Pessoa', '${d1}', 'scheduled'), ('${r2}', 2, 'Pessoa', '${d2}', 'scheduled');
      insert into ride_assignments (id,ride_id,driver_id) values ('${a1}', '${r1}', '${d1}'), ('${a2}', '${r2}', '${d2}');
      create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${newDriver}', 'new@example.test', '{"account_type":"driver","full_name":"Novo"}'),
        ('${untrusted}', 'untrusted@example.test', '{"account_type":"admin"}');
      set role authenticated;
    `);
  }, 30000);

  afterAll(async () => { await db.close(); });

  it("isola conversas por motorista e impede falsificação de autor ou data", async () => {
    await actor(driver);
    await db.query("insert into ride_messages(assignment_id,sender_id,body) values ($1,$2,'Olá')", [a1, driver]);
    await expect(db.query("insert into ride_messages(assignment_id,sender_id,body) values ($1,$2,'Outro')", [a2, driver])).rejects.toThrow();
    await expect(db.query("insert into ride_messages(assignment_id,sender_id,body) values ($1,$2,'Falso')", [a1, admin])).rejects.toThrow();
    await expect(db.query("insert into ride_messages(assignment_id,sender_id,body,created_at) values ($1,$2,'Falso',now())", [a1, driver])).rejects.toThrow();
    await expect(db.query("insert into ride_messages(assignment_id,sender_id,body) values ($1,$2,'  ')", [a1, driver])).rejects.toThrow();
    await actor(other);
    expect((await db.query("select id from ride_messages")).rows).toHaveLength(0);
    await actor(operator);
    await db.query("insert into ride_messages(assignment_id,sender_id,body) values ($1,$2,'Resposta')", [a1, operator]);
    expect((await db.query("select assignment_id from ride_message_threads")).rows).toHaveLength(1);
    await actor(driver);
    expect((await db.query("select id from ride_messages")).rows).toHaveLength(2);
  });

  it("permite conversa geral com a base, isolada por motorista e também sem vínculo", async () => {
    await actor(driver);
    await db.query("insert into driver_general_messages(driver_profile_id,sender_id,body) values ($1,$1,'Olá')", [driver]);
    await expect(db.query("insert into driver_general_messages(driver_profile_id,sender_id,body) values ($1,$2,'Outro')", [other, driver])).rejects.toThrow();
    await expect(db.query("insert into driver_general_messages(driver_profile_id,sender_id,body) values ($1,$2,'Falso')", [driver, admin])).rejects.toThrow();
    await expect(db.query("insert into driver_general_messages(driver_profile_id,sender_id,body,created_at) values ($1,$1,'Falso',now())", [driver])).rejects.toThrow();
    await actor(other);
    expect((await db.query("select id from driver_general_messages")).rows).toHaveLength(0);
    await actor(inactive);
    await expect(db.query("insert into driver_general_messages(driver_profile_id,sender_id,body) values ($1,$1,'Olá')", [inactive])).rejects.toThrow();
    await actor(newDriver);
    await expect(db.query("insert into driver_general_messages(driver_profile_id,sender_id,body) values ($1,$1,'Olá')", [newDriver])).rejects.toThrow();
    await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id='${newDriver}'; set role authenticated`);
    await db.query("insert into driver_general_messages(driver_profile_id,sender_id,body) values ($1,$1,'Sem vínculo')", [newDriver]);
    await actor(operator);
    await db.query("insert into driver_general_messages(driver_profile_id,sender_id,body) values ($1,$2,'Resposta')", [driver, operator]);
    expect((await db.query("select driver_profile_id from driver_general_threads")).rows).toHaveLength(2);
    await actor(driver);
    expect((await db.query("select id from driver_general_messages")).rows).toHaveLength(2);
    await db.exec(`reset role; update auth.users set email_confirmed_at=null where id='${newDriver}'; set role authenticated`);
  });

  it("bloqueia motorista inativo e alterações na conta de outro motorista", async () => {
    await actor(driver);
    await expect(db.query("select set_driver_availability($1,'online')", [d2])).rejects.toThrow();
    await actor(inactive);
    expect((await db.query("select id from ride_messages")).rows).toHaveLength(0);
    await expect(db.query("select respond_assignment($1,true)", [a1])).rejects.toThrow();
    await expect(db.query("select set_driver_availability($1,'online')", [d3])).rejects.toThrow();
  });

  it("permite somente ao administrador vincular uma conta disponível", async () => {
    await actor(operator);
    await expect(db.query("select link_driver_profile($1,$2)", [d4, inactive])).rejects.toThrow();
    await actor(admin);
    await expect(db.query("select link_driver_profile($1,$2)", [d4, admin])).rejects.toThrow();
    await expect(db.query("select link_driver_profile($1,$2)", [d4, driver])).rejects.toThrow();
    await db.query("select link_driver_profile($1,$2)", [d4, operator]);
    expect((await db.query<{ role: string }>("select role from profiles where id=$1", [operator])).rows[0].role).toBe("driver");
    expect((await db.query<{ profile_id: string }>("select profile_id from drivers where id=$1", [d4])).rows[0].profile_id).toBe(operator);
  });

  it("cria motorista sem privilégios de equipe e exige confirmação para vincular corridas", async () => {
    await actor(admin);
    const newProfile = await db.query<{ role: string; active: boolean }>("select role, active from profiles where id=$1", [newDriver]);
    expect(newProfile.rows[0]).toEqual({ role: "driver", active: true });
    const untrustedProfile = await db.query<{ role: string; active: boolean }>("select role, active from profiles where id=$1", [untrusted]);
    expect(untrustedProfile.rows[0]).toEqual({ role: "operator", active: false });
    await expect(db.query("select link_driver_profile($1,$2)", [d5, newDriver])).rejects.toThrow("confirmado");
    await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id='${newDriver}'; set role authenticated;`);
    await actor(admin);
    await db.query("select link_driver_profile($1,$2)", [d5, newDriver]);
    await actor(newDriver);
    expect((await db.query<{ id: string }>("select my_driver_id() as id")).rows[0].id).toBe(d5);
  });

  it("restringe confirmação, limita tentativas e salva apenas o código válido uma vez", async () => {
    await actor(driver);
    await expect(db.query("select * from driver_phone_challenges")).rejects.toThrow();
    await expect(db.query("select confirm_driver_phone($1,'correto')", [driver])).rejects.toThrow();
    await db.exec("reset role; set role service_role");
    await db.query("insert into driver_phone_challenges values ($1,'+5511999999999','correto',now() + interval '10 minutes',0)", [driver]);
    expect((await db.query<{ ok: boolean }>("select confirm_driver_phone($1,'errado') as ok", [driver])).rows[0].ok).toBe(false);
    expect((await db.query<{ ok: boolean }>("select confirm_driver_phone($1,'correto') as ok", [driver])).rows[0].ok).toBe(true);
    expect((await db.query<{ ok: boolean }>("select confirm_driver_phone($1,'correto') as ok", [driver])).rows[0].ok).toBe(false);
    await db.exec("reset role; set role authenticated");
    await actor(driver);
    expect((await db.query<{ phone: string }>("select phone from drivers where id=$1", [d1])).rows[0].phone).toBe("+5511999999999");
    await db.exec("reset role; set role service_role");
    await db.query("insert into driver_phone_challenges values ($1,'+5511888888888','correto',now() + interval '10 minutes',0)", [driver]);
    for (let i = 0; i < 5; i++) await db.query("select confirm_driver_phone($1,'errado')", [driver]);
    expect((await db.query<{ ok: boolean }>("select confirm_driver_phone($1,'correto') as ok", [driver])).rows[0].ok).toBe(false);
    await db.query("update driver_phone_challenges set attempts=0, expires_at=now() - interval '1 minute' where profile_id=$1", [driver]);
    expect((await db.query<{ ok: boolean }>("select confirm_driver_phone($1,'correto') as ok", [driver])).rows[0].ok).toBe(false);
    await db.exec("reset role; set role authenticated");
  });

  it("bloqueia novas atribuições para motoristas inativos", async () => {
    await db.exec(`reset role; update drivers set active=false where id='${d1}';`);
    await expect(db.query("insert into ride_assignments(id,ride_id,driver_id) values ($1,$2,$3)", ["30000000-0000-0000-0000-000000000003", r1, d1])).rejects.toThrow("ativo");
    await db.exec("set role service_role");
    await db.query("update driver_phone_challenges set expires_at=now() + interval '10 minutes' where profile_id=$1", [driver]);
    expect((await db.query<{ ok: boolean }>("select confirm_driver_phone($1,'correto') as ok", [driver])).rows[0].ok).toBe(false);
    await db.exec("reset role");
    const newId = "00000000-0000-0000-0000-000000000008";
    const newDriverId = "10000000-0000-0000-0000-000000000006";
    await db.query("insert into auth.users values ($1,'contato@example.test',now(),'{\"account_type\":\"driver\"}')", [newId]);
    await db.query("insert into drivers(id,active,full_name) values ($1,true,'Novo')", [newDriverId]);
    await db.exec("set role service_role");
    await db.query("insert into driver_phone_challenges values ($1,'+5511999999999','correto',now() + interval '10 minutes',0)", [newId]);
    expect((await db.query<{ ok: boolean }>("select confirm_driver_phone($1,'correto') as ok", [newId])).rows[0].ok).toBe(true);
    await db.exec("set role authenticated");
    await actor(admin);
    await db.query("select link_driver_profile($1,$2)", [newDriverId, newId]);
    const linked = await db.query<{ phone: string; email: string }>("select phone,email from drivers where id=$1", [newDriverId]);
    expect(linked.rows[0]).toEqual({ phone: "+5511999999999", email: "contato@example.test" });
  });

  it("permite somente ao administrador aprovar conta de equipe pela política do banco", async () => {
    const schema = readFileSync(join(process.cwd(), "supabase", "migrations", "0001_schema.sql"), "utf8");
    const policy = schema.match(/create policy profiles_admin_write[^;]+;/)?.[0];
    if (!policy) throw new Error("Política de administração de perfis não encontrada");
    const staff = "00000000-0000-0000-0000-000000000009";
    await db.exec(`reset role; grant update on profiles to authenticated; ${policy}
      insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ('${staff}','staff@example.test',now(),'{}');
      update profiles set active=true where id='${staff}'; set role authenticated;`);
    await actor(other);
    expect((await db.query("update profiles set active=true where id=$1 and role <> 'driver' and active=false returning id", [untrusted])).rows).toHaveLength(0);
    await actor(staff);
    expect((await db.query("update profiles set active=true where id=$1 and role <> 'driver' and active=false returning id", [untrusted])).rows).toHaveLength(0);
    await actor(admin);
    expect((await db.query("update profiles set active=true where id=$1 and role <> 'driver' and active=false returning id", [untrusted])).rows).toHaveLength(1);
    expect((await db.query<{ active: boolean }>("select active from profiles where id=$1", [untrusted])).rows[0].active).toBe(true);
  });
});
