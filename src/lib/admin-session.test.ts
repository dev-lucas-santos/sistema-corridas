import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const user = "00000000-0000-4000-8000-000000000001";
const driver = "00000000-0000-4000-8000-000000000002";
const admin = "00000000-0000-4000-8000-000000000003";
const session = "10000000-0000-4000-8000-000000000001";
const otherSession = "10000000-0000-4000-8000-000000000002";
const driverSession = "10000000-0000-4000-8000-000000000003";
const adminSession = "10000000-0000-4000-8000-000000000004";
let db: PGlite;

async function actor(id: string, sessionId: string) {
  await db.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'session_id',$2::text)::text, false)", [id, sessionId]);
}

describe("liberação administrativa por sessão", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.sessions (id uuid primary key, user_id uuid not null);
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create table profiles (id uuid primary key, role text not null, active boolean not null);
      create table audit_logs (actor_id uuid, action text, table_name text, record_id text);
      create table protected_data (id int primary key, value text);
      insert into profiles values ('${user}','operator',true), ('${driver}','driver',true), ('${admin}','admin',true);
      insert into auth.sessions values ('${session}','${user}'), ('${otherSession}','${user}'), ('${driverSession}','${driver}'), ('${adminSession}','${admin}');
      insert into protected_data values (1,'original');
      grant usage on schema public, auth to authenticated, service_role;
    `);
    await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", "0014_admin_session.sql"), "utf8"));
    await db.exec(`
      alter table protected_data enable row level security;
      create policy protected_admin on protected_data for update using (is_admin()) with check (is_admin());
      create policy protected_read on protected_data for select using (true);
      grant select, update on protected_data to authenticated;
      set role authenticated;
    `);
  });
  afterAll(async () => { await db.close(); });

  it("nega acesso antes da senha e impede que clientes concedam a si mesmos", async () => {
    await actor(user, session);
    expect((await db.query<{ allowed: boolean }>("select admin_session_active() as allowed")).rows[0].allowed).toBe(false);
    expect((await db.query("update protected_data set value='alterado' returning id")).rows).toHaveLength(0);
    await expect(db.query("select grant_admin_session($1,$2)", [user, session])).rejects.toThrow();
    await expect(db.query("select * from admin_access_sessions")).rejects.toThrow();
    await actor(admin, adminSession);
    expect((await db.query<{ allowed: boolean }>("select admin_session_active() as allowed")).rows[0].allowed).toBe(false);
  });

  it("autoriza apenas a sessão e a equipe ativa, e revoga ao sair", async () => {
    await db.exec("reset role; set role service_role");
    await expect(db.query("select grant_admin_session($1,$2)", [driver, driverSession])).rejects.toThrow("inválida");
    await expect(db.query("select grant_admin_session($1,$2)", [user, driverSession])).rejects.toThrow("inválida");
    await db.query("select grant_admin_session($1,$2)", [user, session]);
    await db.exec("set role authenticated");
    await actor(user, session);
    expect((await db.query("update protected_data set value='aprovado' returning id")).rows).toHaveLength(1);
    await actor(user, otherSession);
    expect((await db.query<{ allowed: boolean }>("select admin_session_active() as allowed")).rows[0].allowed).toBe(false);
    await db.exec("reset role");
    expect((await db.query<{ actor_id: string }>("select actor_id from audit_logs where action='admin_unlock'")).rows[0].actor_id).toBe(user);
    await db.query("update profiles set active=false where id=$1", [user]);
    await db.exec("set role authenticated");
    await actor(user, session);
    expect((await db.query<{ allowed: boolean }>("select admin_session_active() as allowed")).rows[0].allowed).toBe(false);
    await db.exec("reset role");
    await db.query("update profiles set active=true where id=$1", [user]);
    await db.query("delete from auth.sessions where id=$1", [session]);
    await db.exec("set role authenticated");
    await actor(user, session);
    expect((await db.query<{ allowed: boolean }>("select admin_session_active() as allowed")).rows[0].allowed).toBe(false);
  });
});
