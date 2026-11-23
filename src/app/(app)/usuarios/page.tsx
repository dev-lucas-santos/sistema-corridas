import { updateUser } from "@/app/actions/users";
import { PageHeader } from "@/components/common";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export default async function Usuarios() {
  const me = await requireAdmin();
  const { data } = await (await createClient()).from("profiles")
    .select("id, full_name, email, role, active, created_at").neq("role", "driver")
    .order("active").order("created_at", { ascending: false }).limit(200);
  const pending = data?.filter((u) => !u.active) ?? [];
  const active = data?.filter((u) => u.active) ?? [];

  const row = (u: NonNullable<typeof data>[number]) => (
    <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <div className="font-medium">{u.full_name || "(sem nome)"}</div>
        <div className="text-sm text-slate-500">{u.email} · cadastrado em {formatDateTime(u.created_at)}</div>
      </div>
      {u.id === me.id ? <span className="text-sm text-slate-500">{ROLE_LABEL[u.role]} (você)</span> : (
        <form action={updateUser} className="flex items-center gap-2">
          <input type="hidden" name="id" value={u.id} />
          <select name="role" defaultValue={u.role} className="input !w-auto" aria-label="Papel">
            <option value="operator">Operador</option>
            <option value="admin">Admin</option>
          </select>
          {u.active
            ? <button name="active" value="false" className="btn-danger">Desativar</button>
            : <button name="active" value="true" className="btn-primary">Aprovar</button>}
        </form>
      )}
    </li>
  );

  return (
    <>
      <PageHeader title="Usuários" />
      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Aguardando aprovação ({pending.length})</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {pending.map(row)}
          {!pending.length && <li className="py-2 text-slate-500">Nenhum cadastro pendente.</li>}
        </ul>
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Usuários ativos</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(row)}</ul>
      </section>
    </>
  );
}
