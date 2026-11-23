import Link from "next/link";
import { PageHeader, Pagination } from "@/components/common";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 30;
const ACTION: Record<string, string> = { insert: "Criou", update: "Alterou", delete: "Excluiu" };
const TABLES: Record<string, string> = {
  rides: "Corridas", clients: "Clientes", drivers: "Motoristas", payments: "Pagamentos", payment_closings: "Fechamentos",
  adjustments: "Ajustes", profiles: "Usuários", settings: "Configurações", driver_payout_settings: "Repasse", inbound_messages: "Entrada",
};

const CHANGED_IGNORE = new Set(["updated_at"]);
function changedKeys(o: Record<string, unknown> | null, n: Record<string, unknown> | null) {
  if (!o || !n) return "";
  return Object.keys(n).filter((k) => !CHANGED_IGNORE.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])).join(", ");
}

export default async function Auditoria({ searchParams }: PageProps<"/auditoria">) {
  await requireAdmin();
  const sp = await searchParams;
  const table = typeof sp.t === "string" && sp.t in TABLES ? sp.t : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("id, actor_id, action, table_name, record_id, old_data, new_data, created_at", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (table) q = q.eq("table_name", table);
  const { data, count } = await q;
  const ids = [...new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <PageHeader title="Auditoria">
        <Link href="/auditoria" className={!table ? "btn-primary" : "btn-secondary"}>Tudo</Link>
        {Object.entries(TABLES).map(([k, l]) => <Link key={k} href={`/auditoria?t=${k}`} className={table === k ? "btn-primary" : "btn-secondary"}>{l}</Link>)}
      </PageHeader>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left">
          <thead><tr><th className="th">Quando</th><th className="th">Quem</th><th className="th">Ação</th><th className="th">Onde</th><th className="th">Campos alterados</th></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                <td className="td">{r.actor_id ? names.get(r.actor_id) ?? "—" : "Sistema"}</td>
                <td className="td">{ACTION[r.action] ?? r.action}</td>
                <td className="td">{TABLES[r.table_name] ?? r.table_name}</td>
                <td className="td text-sm text-slate-500">{changedKeys(r.old_data, r.new_data)}</td>
              </tr>
            ))}
            {!data?.length && <tr><td className="td text-slate-500" colSpan={5}>Nenhum registro.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/auditoria" params={{ t: table || undefined }} />
    </>
  );
}
