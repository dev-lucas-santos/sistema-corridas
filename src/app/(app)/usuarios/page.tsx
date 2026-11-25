import { UserAccessForm } from "@/components/user-access-form";
import { PageHeader } from "@/components/common";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export default async function Usuarios() {
  const me = await requireAdmin();
  const { data, error } = await (await createClient()).from("profiles")
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
        <UserAccessForm id={u.id} role={u.role} active={u.active} />
      )}
    </li>
  );

  return (
    <>
      <PageHeader title="Usuários" />
      {error && <p role="alert" className="card mb-4 text-red-600">Não foi possível carregar os usuários.</p>}
      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Contas inativas ou aguardando aprovação ({pending.length})</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {pending.map(row)}
          {!error && !pending.length && <li className="py-2 text-slate-500">Nenhuma conta inativa.</li>}
        </ul>
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Usuários ativos</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(row)}</ul>
      </section>
    </>
  );
}
